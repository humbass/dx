import fse from 'fs-extra'
import path from 'path'
import { RTCPeerReceiver } from '../utils/peer.js'
import { showProgress, randomCode, exit } from '../utils/tools.js'

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
  let writeStream = null

  this.rtcPeer = new RTCPeerReceiver(code)
  this.rtcPeer.on('peer:exit', () => {
    exit()
  })
  this.rtcPeer.on('peer:channel:buffer', buffer => {
    received += buffer.length
    writeStream.write(buffer, err => {
      if (err) {
        console.error('Error writing to file:', err)
        exit()
      } else {
        showProgress(total, received)
        if (received >= total) {
          this.rtcPeer.sendData({ type: 'all-files-received' })
          process.stdout.write(`\n`)
          exit(100)
        }
      }
    })
  })
  this.rtcPeer.on('peer:channel:message', async data => {
    try {
      const parsed = JSON.parse(data)
      if (parsed.type === 'sigint') {
        exit()
      } else if (parsed.type === 'file') {
        const filePath = parsed.name
        const dir = path.dirname(filePath)
        if (dir !== '') fse.ensureDirSync(dir)
        writeStream = fse.createWriteStream(filePath, { highWaterMark: 16 * 1024 })
        total = parsed.size
        received = 0
      } else if (parsed.type === 'file-end') {
        await new Promise(res => writeStream.end(res))
      } else if (parsed.type === 'all-files-end') {
      }
    } catch (err) {
      exit()
    }
  })
}
