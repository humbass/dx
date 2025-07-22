import fse from 'fs-extra'
import path from 'path'
import { globSync } from 'glob'
import { createReadStream, statSync } from 'fs'
import { RTCPeerSender } from '../utils/peer.js'
import { showProgress, getAllFiles, randomCode, exit } from '../utils/tools.js'
import eventBus from '../utils/events.js'

const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024

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

  this.rtcPeer = new RTCPeerSender({ code })
  eventBus.on('peer:exit', () => {
    exit(100)
  })
  eventBus.on('peer:channel:open', async () => {
    for (const { path: filePath, relativePath: fileName } of files) {
      const fileSize = statSync(filePath).size
      this.rtcPeer.sendData({ type: 'file', name: fileName, size: fileSize })

      const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
      let sentBytes = 0

      for await (const chunk of stream) {
        while (dataChannel.bufferedAmount > CHUNK_SIZE) {
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        this.rtcPeer.sendChunk(chunk)
        sentBytes += chunk.length
        showProgress(fileSize, sentBytes)
      }

      while (dataChannel.bufferedAmount > CHUNK_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }

      this.rtcPeer.sendData({ type: 'file-end' })
    }

    this.rtcPeer.sendData({ type: 'all-files-end' })
  })
}
