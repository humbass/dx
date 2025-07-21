import { EventEmitter } from 'events'
import { createReadStream, statSync } from 'fs'
import path from 'path'
import fse from 'fs-extra'
import process from 'process'
import readline from 'readline'
import wrtc from 'wrtc'
import Terminal from './terminal.js'

export class RTCPeerSender extends EventEmitter {
  constructor({ code, files }) {
    super()
    this.code = code
    this.files = files
    this.peer = null
    this.dataChannel = null
    this.terminal = null
    this.startPeer()
    this.startChannel()
    this.startTerminal()
  }

  startTerminal() {
    this.terminal = new Terminal(this.code)
    this.terminal.on('open', () => {
      console.log(`\n dx receive --code ${this.code}\n`)
    })

    this.terminal.on('start', async () => {
      const offer = await this.peer.createOffer()
      await this.peer.setLocalDescription(offer)
      this.terminal.offer(offer)
    })

    this.terminal.on('answer', sdp => {
      this.peer.setRemoteDescription(sdp)
    })

    this.terminal.on('ice-candidate', candidate => {
      this.peer.addIceCandidate(candidate)
    })
  }

  startPeer() {
    this.peer = new wrtc.RTCPeerConnection(globalThis.ICE_SERVER_CFG)
    this.peer.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(this.peer.iceConnectionState)) {
        console.error('Peer connection failed')
        this.emit('peer:failed')
        this.clear()
      }
    }
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.terminal.candidate(candidate)
    }
  }

  startChannel() {
    this.dataChannel = this.peer.createDataChannel('transfer', { ordered: true, maxRetransmits: 0 })
    this.dataChannel.onmessage = ({ data }) => {
      try {
        const parsed = JSON.parse(data)
        if (parsed.type == 'sigint') {
          this.emit('exit', 'sigint')
          this.clear()
        } else if (parsed.type === 'all-files-received') {
          this.emit('exit', 'channel:all-files-received')
          this.clear()
        }
      } catch {}
    }
    this.dataChannel.onopen = async () => {
      const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
      dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE

      for (const { path: filePath, relativePath: fileName } of this.files) {
        const fileSize = statSync(filePath).size
        this.sendData({ type: 'file', name: fileName, size: fileSize })

        const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
        let sentBytes = 0

        for await (const chunk of stream) {
          while (dataChannel.bufferedAmount > CHUNK_SIZE) {
            await new Promise(resolve => setTimeout(resolve, 20))
          }

          this.dataChannel.send(chunk)
          sentBytes += chunk.length
          this.showProgress(fileName, fileSize, sentBytes)
        }

        // Wait for buffer to drain before sending file-end
        while (dataChannel.bufferedAmount > CHUNK_SIZE) {
          await new Promise(resolve => setTimeout(resolve, 20))
        }

        this.sendData({ type: 'file-end' })
      }

      this.sendData({ type: 'all-files-end' })
    }

    this.dataChannel.onclose = () => {
      this.emit('exit', 'channel:close')
    }

    this.dataChannel.onerror = err => {
      this.emit('exit', 'channel:error')
    }

    globalThis.dataChannel = this.dataChannel
  }

  showProgress(fileName, total, current, barLength = 50) {
    const percentage = Math.min((current / total) * 100, 100).toFixed(2)
    const filled = Math.round((current / total) * barLength)
    const bar = '█'.repeat(filled) + '-'.repeat(barLength - filled)
    readline.cursorTo(process.stdout, 0)
    process.stdout.write(`File: ${fileName} [${bar}] ${percentage}%`)
  }

  sendData(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return
    }
    this.dataChannel.send(JSON.stringify(data))
  }

  clear() {
    this.dataChannel?.close()
    this.peer?.close()
  }
}

export class RTCPeerReceiver extends EventEmitter {
  constructor({ code }) {
    super()
    this.code = code
    this.peer = null
    this.dataChannel = null
    this.terminal = null
    this.writeStream = null
    this.total = 0
    this.received = 0
    this.startPeer()
    this.startTerminal()
  }

  startTerminal() {
    this.terminal = new Terminal(this.code)

    this.terminal.on('offer', async sdp => {
      await this.peer.setRemoteDescription(sdp)
      const ans = await this.peer.createAnswer()
      await this.peer.setLocalDescription(ans)
      this.terminal.answer(ans)
    })

    this.terminal.on('ice-candidate', candidate => {
      this.peer.addIceCandidate(candidate)
    })
  }

  startPeer() {
    this.peer = new wrtc.RTCPeerConnection(globalThis.ICE_SERVER_CFG)
    this.peer.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(this.peer.iceConnectionState)) {
        console.error('Peer connection failed')
        this.emit('peer:failed')
        this.clear()
      }
    }

    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.terminal.candidate(candidate)
    }

    this.peer.ondatachannel = ({ channel: dataChannel }) => {
      const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
      dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE
      dataChannel.onmessage = async ({ data }) => {
        if (data instanceof ArrayBuffer) {
          const buf = Buffer.from(data)
          this.received += buf.length
          this.writeStream.write(buf, err => {
            if (err) {
              console.error('Error writing to file:', err)
            } else {
              this.showProgress(this.writeStream.path, this.total, this.received)
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
            this.writeStream = fse.createWriteStream(filePath, { highWaterMark: CHUNK_SIZE })
            this.total = parsed.size
            this.received = 0
          } else if (parsed.type === 'file-end') {
            await new Promise(res => this.writeStream.end(res))
          } else if (parsed.type === 'all-files-end') {
            this.emit('exit', 'all-files-received')
          }
        } catch (err) {
          console.error('Error parsing control message:', err)
        }
      }

      dataChannel.onerror = () => {
        this.emit('exit', 'channel:error')
      }
      this.dataChannel = dataChannel
      globalThis.dataChannel = dataChannel
    }
  }

  showProgress(fileName, total, current, barLength = 50) {
    const percentage = Math.min((current / total) * 100, 100).toFixed(2)
    const filled = Math.round((current / total) * barLength)
    const bar = '█'.repeat(filled) + '-'.repeat(barLength - filled)
    readline.cursorTo(process.stdout, 0)
    process.stdout.write(`File: ${fileName} [${bar}] ${percentage}%`)
    if (total === current) {
      this.sendData({ type: 'all-files-received' })
    }
  }

  sendData(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return
    }
    this.dataChannel.send(JSON.stringify(data))
  }

  clear() {
    this.dataChannel?.close()
    this.peer?.close()
  }
}
