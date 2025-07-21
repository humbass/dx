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

import { EventEmitter } from 'events'
// import wrtc from 'wrtc'
import * as wrtc from 'werift'
import Terminal from './terminal.js'

export class RTCPeerSender extends EventEmitter {
  constructor({ code }) {
    super()
    this.code = code
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

    this.terminal.on('answer', (sdp) => {
      this.peer.setRemoteDescription(sdp)
    })

    this.terminal.on('ice-candidate', (candidate) => {
      this.peer.addIceCandidate(candidate)
    })
  }

  startPeer() {
    this.peer = new wrtc.RTCPeerConnection(globalThis.ICE_SERVER_CFG)
    this.peer.oniceconnectionstatechange = () => {
      // if (['disconnected', 'failed'].includes(this.peer.iceConnectionState)) {
      //   console.error('Peer connection failed')
      //   this.emit('peer:failed')
      //   this.clear()
      // }
    }
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.terminal.candidate(candidate)
    }
  }

  startChannel() {
    this.dataChannel = this.peer.createDataChannel('transfer', { ordered: true, maxRetransmits: 0 })
    const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
    this.dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE
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
      this.emit('channel:open')
    }

    this.dataChannel.onclose = () => {
      this.emit('exit', 'channel:close')
    }

    this.dataChannel.onerror = (err) => {
      this.emit('exit', 'channel:error')
    }

    globalThis.dataChannel = this.dataChannel
  }

  sendChunk(chunk) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false
    }
    this.dataChannel.send(chunk)
    return true
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

    this.terminal.on('offer', async (sdp) => {
      await this.peer.setRemoteDescription(sdp)
      const ans = await this.peer.createAnswer()
      await this.peer.setLocalDescription(ans)
      this.terminal.answer(ans)
    })

    this.terminal.on('ice-candidate', (candidate) => {
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
      dataChannel.onmessage = ({ data }) => {
        this.emit('channel:message', data)
      }

      dataChannel.onerror = () => {
        this.emit('exit', 'channel:error')
      }
      this.dataChannel = dataChannel
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
