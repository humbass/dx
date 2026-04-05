import fse from 'fs-extra'
import path from 'path'
import { RTCPeerReceiver } from '../utils/peer.js'
import { showProgress, randomCode, exit } from '../utils/tools.js'
import eventBus from '../utils/events.js'

const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024

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

  this.rtcPeer = new RTCPeerReceiver({ code })
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

  eventBus.on('peer:channel:message', async (data) => {
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
      received += buf.length
      writeStream.write(buf, (err) => {
        if (err) {
          console.error('Error writing to file:', err)
          exit()
        } else {
          showProgress(total, received)
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
        total = parsed.size
        received = 0
        pendingFiles += 1
      } else if (parsed.type === 'file-end') {
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
