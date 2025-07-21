import path from 'path'
import fse from 'fs-extra'
import wrtc from 'wrtc'
import Terminal from '../utils/terminal.js'

import { getValidCode, showProgress, cleanupAndExit } from './common.js'

export default async function ({ code }) {
  const validCode = getValidCode(code, false)
  const peer = new wrtc.RTCPeerConnection(globalThis.ICE_SERVER_CFG)
  const terminal = new Terminal(validCode)

  let writeStream = null
  let total = 0
  let received = 0

  peer.oniceconnectionstatechange = () => {
    if (['disconnected', 'failed'].includes(peer.iceConnectionState)) {
      console.error('Peer connection failed')
      cleanupAndExit(null, peer, terminal.ws)
    }
  }

  terminal.on('offer', async sdp => {
    await peer.setRemoteDescription(sdp)
    const ans = await peer.createAnswer()
    await peer.setLocalDescription(ans)
    terminal.answer(ans)
  })

  terminal.on('ice-candidate', candidate => {
    peer.addIceCandidate(candidate)
  })

  peer.onicecandidate = ({ candidate }) => {
    if (candidate) terminal.candidate(candidate)
  }
  peer.ondatachannel = ({ channel: dataChannel }) => {
    globalThis.dataChannel = dataChannel
    dataChannel.onmessage = async ({ data }) => {
      if (data instanceof ArrayBuffer) {
        const buf = Buffer.from(data)
        received += buf.length
        writeStream.write(buf, err => {
          if (err) {
            console.error('Error writing to file:', err)
          } else {
            showProgress(writeStream.path, total, received)
          }
        })
        return
      }
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'sigint') {
          cleanupAndExit(dataChannel, peer, terminal.ws)
        } else if (parsed.type === 'file') {
          const filePath = parsed.name
          const dir = path.dirname(filePath)
          if (dir !== '') fse.ensureDirSync(dir)
          writeStream = fse.createWriteStream(filePath, { highWaterMark: 16 * 1024 })
          total = parsed.size
          received = 0
        } else if (parsed.type === 'file-end') {
          await new Promise(res => writeStream.end(res))
        }
      } catch {
        console.error('Error parsing control message:', err)
      }
    }
    dataChannel.onerror = err => {
      cleanupAndExit(dataChannel, peer, terminal.ws)
    }
  }
}
