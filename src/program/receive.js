/*
████████▄       ▀████    ▐████▀
███   ▀███        ███▌   ████▀ 
███    ███         ███  ▐███   
███    ███         ▀███▄███▀   
███    ███         ████▀██▄    
███    ███        ▐███  ▀███   
███   ▄███       ▄███     ███▄ 
████████▀       ████       ███▄     File Transfer Assistant
*/

import fse from 'fs-extra'
import path from 'path'
import { RTCPeerReceiver } from '../utils/peer.js'
import { showProgress, randomCode, exit } from '../utils/tools.js'

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
  let writeStream = null

  this.rtcPeer = new RTCPeerReceiver({ code })
  this.rtcPeer.on('exit', exit)
  this.rtcPeer.on('channel:message', async (data) => {
    if (data instanceof Buffer) {
      const buf = Buffer.from(data)
      received += buf.length
      writeStream.write(buf, (err) => {
        if (err) {
          console.error('Error writing to file:', err)
          exit()
        } else {
          showProgress(total, received)
          if (received >= total) {
            this.rtcPeer.sendData({ type: 'all-files-received' })
          }
        }
      })
      return
    }
    try {
      const parsed = JSON.parse(data)
      if (parsed.type === 'sigint') {
        this.clear()
      } else if (parsed.type === 'file') {
        const filePath = parsed.name
        const dir = path.dirname(filePath)
        if (dir !== '') fse.ensureDirSync(dir)
        writeStream = fse.createWriteStream(filePath, { highWaterMark: CHUNK_SIZE })
        total = parsed.size
        received = 0
      } else if (parsed.type === 'file-end') {
        await new Promise((res) => writeStream.end(res))
      } else if (parsed.type === 'all-files-end') {
        exit()
      }
    } catch (err) {
      exit()
    }
  })
}
