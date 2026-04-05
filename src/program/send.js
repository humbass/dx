import fse from 'fs-extra'
import path from 'path'
import readline from 'readline'
import { globSync } from 'glob'
import { createReadStream, statSync } from 'fs'
import { RTCPeerSender } from '../utils/peer.js'
import { showProgress, getAllFiles, randomCode, exit } from '../utils/tools.js'
import eventBus from '../utils/events.js'

const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
const BUFFER_POLL_INTERVAL = 10

class AdaptiveBufferController {
  constructor() {
    this.min = 512 * 1024
    this.max = 8 * 1024 * 1024
    this.increaseStep = 256 * 1024
    this.decreaseFactor = 0.7
    this.windowMs = 1000
    this.cooldownMs = 1000
    this.limit = 1 * 1024 * 1024
    this.waitSamples = []
    this.highPressureCount = 0
    this.lowPressureCount = 0
    this.windowStartAt = Date.now()
    this.lastAdjustAt = 0
  }

  getLimit() {
    return this.limit
  }

  observeWait(waitMs) {
    this.waitSamples.push(waitMs)
    if (waitMs > 200) {
      this.highPressureCount += 1
      return
    }
    if (waitMs < 20) {
      this.lowPressureCount += 1
    }
  }

  maybeAdjust() {
    const now = Date.now()
    if (now - this.windowStartAt < this.windowMs) {
      return
    }

    if (now - this.lastAdjustAt < this.cooldownMs) {
      this.#resetWindow(now)
      return
    }

    const sampleCount = this.waitSamples.length
    if (sampleCount === 0) {
      this.#resetWindow(now)
      return
    }

    const sorted = [...this.waitSamples].sort((a, b) => a - b)
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
    const p95 = sorted[p95Index]

    let nextLimit = this.limit
    const highPressureThreshold = Math.max(2, Math.floor(sampleCount * 0.2))
    const lowPressureThreshold = Math.max(4, Math.floor(sampleCount * 0.7))

    if (p95 > 200 || this.highPressureCount >= highPressureThreshold) {
      nextLimit = Math.floor(this.limit * this.decreaseFactor)
    } else if (p95 < 20 && this.lowPressureCount >= lowPressureThreshold) {
      nextLimit = this.limit + this.increaseStep
    }

    nextLimit = Math.min(this.max, Math.max(this.min, nextLimit))
    if (nextLimit !== this.limit) {
      this.limit = nextLimit
      this.lastAdjustAt = now
    }

    this.#resetWindow(now)
  }

  #resetWindow(now) {
    this.waitSamples = []
    this.highPressureCount = 0
    this.lowPressureCount = 0
    this.windowStartAt = now
  }
}

async function waitForBufferLow(peer, maxBufferedAmount, timeoutMs = 30000) {
  if (!peer || !peer.isChannelOpen()) {
    throw new Error('Data channel is not open')
  }

  const startedAt = Date.now()
  while (peer.getBufferedAmount() > maxBufferedAmount) {
    if (!peer.isChannelOpen()) {
      throw new Error('Data channel closed while sending')
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for data channel drain')
    }
    await new Promise((resolve) => setTimeout(resolve, BUFFER_POLL_INTERVAL))
  }

  return Date.now() - startedAt
}

export default async function send(file, options) {
  if (!fse.existsSync(file)) {
    console.error(`Error: File or directory '${file}' does not exist`)
    exit()
  }

  let files = []
  if (fse.existsSync(file) && fse.statSync(file).isDirectory()) {
    files = getAllFiles(file)
      .map((f) => ({ path: f, relativePath: path.relative(path.dirname(file), f) }))
      .filter((f) => !/(?:^|\/)\.[^\/]+/.test(f.relativePath))
  } else {
    files = globSync(file).map((f) => ({ path: f, relativePath: path.basename(f) }))
  }

  if (files.length === 0) {
    console.error(`Error: No files found in '${file}'`)
    exit()
  }

  let code = options.code || process.env.DXcode
  if (code) {
    if (!/^[a-zA-Z0-9-]{6,}$/.test(code)) {
      console.error('Error: Code must be at least 6 characters long and contain only letters and numbers.')
      exit()
    }
  } else {
    code = randomCode()
  }

  let finished = false
  const adaptiveBuffer = new AdaptiveBufferController()
  let currentFileId = null
  let currentFileSize = 0
  let remoteReceivedBytes = 0
  let lastStatus = ''
  let statusActive = false

  function setStatus(message) {
    if (!message || message === lastStatus) return
    process.stdout.write(`\r`)
    process.stdout.write(message)
    readline.clearLine(process.stdout, 1)
    lastStatus = message
    statusActive = true
  }

  function clearStatusLine() {
    if (!statusActive) return
    process.stdout.write(`\r`)
    readline.clearLine(process.stdout, 1)
    statusActive = false
  }

  eventBus.on('peer:channel:message', (message) => {
    if (!message || message.type !== 'progress') return
    if (!currentFileId || message.fileId !== currentFileId) return

    remoteReceivedBytes = Math.max(remoteReceivedBytes, Number(message.received) || 0)
    showProgress(currentFileSize, remoteReceivedBytes)
  })

  this.rtcPeer = new RTCPeerSender({ code })
  globalThis.rtcPeer = this.rtcPeer
  eventBus.on('terminal:start', () => {
    if (finished) return
    setStatus('Receiver detected, negotiating connection...')
  })
  eventBus.on('terminal:answer', () => {
    if (finished) return
    setStatus('Answer received, establishing data channel...')
  })
  eventBus.on('terminal:error', () => {
    if (finished) return
    finished = true
    console.error('Error: signaling server connection failed')
    exit()
  })
  eventBus.on('peer:failed', () => {
    if (finished) return
    finished = true
    console.error('Error: peer connection failed')
    exit()
  })
  eventBus.on('peer:exit', (reason) => {
    if (finished) return
    if (reason === 'channel:all-files-received') {
      finished = true
      process.stdout.write(`\n`)
      exit(100)
      return
    }

    finished = true
    console.error(`\nError: transfer interrupted (${reason || 'unknown'})`)
    exit()
  })
  eventBus.on('peer:channel:open', async () => {
    setStatus('Connection established, starting transfer...')
    clearStatusLine()
    try {
      for (const { path: filePath, relativePath: fileName } of files) {
        currentFileId = `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const fileSize = statSync(filePath).size
        currentFileSize = fileSize
        remoteReceivedBytes = 0
        this.rtcPeer.sendData({ type: 'file', id: currentFileId, name: fileName, size: fileSize })

        const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE })

        for await (const chunk of stream) {
          const waitMs = await waitForBufferLow(this.rtcPeer, adaptiveBuffer.getLimit())
          adaptiveBuffer.observeWait(waitMs)
          adaptiveBuffer.maybeAdjust()

          const sent = this.rtcPeer.sendChunk(chunk)
          if (!sent) {
            throw new Error('Data channel is closed during file transfer')
          }
        }

        this.rtcPeer.sendData({ type: 'file-end' })
      }

      this.rtcPeer.sendData({ type: 'all-files-end' })
    } catch (err) {
      if (finished) return
      finished = true
      console.error(`\nError: ${err.message}`)
      exit()
    }
  })
}
