import fse from 'fs-extra'
import path from 'path'
import { globSync } from 'glob'
import { createReadStream, statSync } from 'fs'
import { RTCPeerSender } from '../utils/peer.js'
import { showProgress, getAllFiles, randomCode, exit } from '../utils/tools.js'
import eventBus from '../utils/events.js'

const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024
const BUFFER_POLL_INTERVAL = 10

async function waitForBufferLow(dataChannel, timeoutMs = 30000) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    throw new Error('Data channel is not open')
  }

  const startedAt = Date.now()
  while (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    if (dataChannel.readyState !== 'open') {
      throw new Error('Data channel closed while sending')
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for data channel drain')
    }
    await new Promise((resolve) => setTimeout(resolve, BUFFER_POLL_INTERVAL))
  }
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

  this.rtcPeer = new RTCPeerSender({ code })
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
      exit(100)
      return
    }

    finished = true
    console.error(`\nError: transfer interrupted (${reason || 'unknown'})`)
    exit()
  })
  eventBus.on('peer:channel:open', async () => {
    try {
      for (const { path: filePath, relativePath: fileName } of files) {
        const fileSize = statSync(filePath).size
        this.rtcPeer.sendData({ type: 'file', name: fileName, size: fileSize })

        const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
        let sentBytes = 0

        for await (const chunk of stream) {
          await waitForBufferLow(this.rtcPeer.dataChannel)
          const sent = this.rtcPeer.sendChunk(chunk)
          if (!sent) {
            throw new Error('Data channel is closed during file transfer')
          }
          sentBytes += chunk.length
          showProgress(fileSize, sentBytes)
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
