import fse from 'fs-extra'
import path from 'path'
import readline from 'readline'
import { RTCPeerReceiver } from '../utils/peer.js'
import { showProgress, randomCode, exit } from '../utils/tools.js'
import eventBus from '../utils/events.js'

const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
const PROGRESS_REPORT_INTERVAL_MS = 200
const PROGRESS_REPORT_BYTES_STEP = 256 * 1024

export default async function (options) {
  let code = options.code || process.env.DXcode
  if (code) {
    if (!/^[a-zA-Z0-9-]{6,}$/.test(code)) {
      console.error('Error: Code must be at least 6 characters long and contain only letters and numbers.')
      process.exit(1)
    }
  } else {
    code = randomCode()
  }

  let received = 0
  let total = 0
  let pendingFiles = 0
  let remoteFinished = false
  let transferEnded = false
  let writeStream = null
  let currentFileId = null
  let lastProgressSentAt = 0
  let lastProgressSentBytes = 0
  let startedReceivingData = false
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

  this.rtcPeer = new RTCPeerReceiver({ code })
  globalThis.rtcPeer = this.rtcPeer
  eventBus.on('terminal:open', () => {
    if (transferEnded) return
    setStatus('Connected to signaling server, waiting for sender...')
  })
  eventBus.on('terminal:offer', () => {
    if (transferEnded) return
    setStatus('Sender detected, negotiating connection...')
  })
  eventBus.on('peer:channel:open', () => {
    if (transferEnded) return
    setStatus('Connection established, waiting for transfer...')
  })
  eventBus.on('terminal:error', () => {
    if (transferEnded) return
    transferEnded = true
    console.error('Error: signaling server connection failed')
    exit()
  })
  eventBus.on('peer:failed', () => {
    if (transferEnded) return
    transferEnded = true
    console.error('Error: peer connection failed')
    exit()
  })
  eventBus.on('peer:exit', (reason) => {
    if (transferEnded) return
    if (reason === 'sigint') {
      transferEnded = true
      exit()
      return
    }

    if (remoteFinished && pendingFiles === 0) {
      return
    }

    transferEnded = true
    console.error(`\nError: transfer interrupted (${reason || 'unknown'})`)
    exit()
  })

  function maybeFinishTransfer() {
    if (transferEnded) return
    if (!remoteFinished || pendingFiles !== 0) return
    transferEnded = true
    this.rtcPeer.sendData({ type: 'all-files-received' })
    process.stdout.write(`\n`)
    exit(100)
  }

  function reportProgress(force = false) {
    if (!currentFileId || total === 0) return
    const now = Date.now()
    const advancedBytes = received - lastProgressSentBytes
    if (!force) {
      if (now - lastProgressSentAt < PROGRESS_REPORT_INTERVAL_MS) return
      if (advancedBytes < PROGRESS_REPORT_BYTES_STEP) return
    }

    this.rtcPeer.sendData({
      type: 'progress',
      fileId: currentFileId,
      received,
      total,
    })
    lastProgressSentAt = now
    lastProgressSentBytes = received
  }

  eventBus.on('peer:channel:message', async (data) => {
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      if (!startedReceivingData) {
        startedReceivingData = true
        setStatus('Starting to receive data...')
        clearStatusLine()
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
      received += buf.length
      if (!writeStream) {
        console.error('Error: received file chunk before file metadata')
        exit()
        return
      }
      writeStream.write(buf, (err) => {
        if (err) {
          console.error('Error writing to file:', err)
          exit()
        } else {
          showProgress(total, received)
          reportProgress.call(this)
        }
      })
      return
    }
    try {
      const parsed = JSON.parse(data)
      if (parsed.type === 'sigint') {
        exit()
      } else if (parsed.type === 'file') {
        const filePath = parsed.name
        const dir = path.dirname(filePath)
        if (dir !== '') fse.ensureDirSync(dir)
        writeStream = fse.createWriteStream(filePath, { highWaterMark: CHUNK_SIZE })
        currentFileId = parsed.id || null
        total = parsed.size
        received = 0
        lastProgressSentAt = 0
        lastProgressSentBytes = 0
        pendingFiles += 1
      } else if (parsed.type === 'file-end') {
        reportProgress.call(this, true)
        await new Promise((res) => writeStream.end(res))
        pendingFiles = Math.max(0, pendingFiles - 1)
        maybeFinishTransfer.call(this)
      } else if (parsed.type === 'all-files-end') {
        remoteFinished = true
        maybeFinishTransfer.call(this)
      }
    } catch (err) {
      exit()
    }
  })
}
