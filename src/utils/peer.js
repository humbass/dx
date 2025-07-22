import wrtc from 'wrtc'
import Terminal from './terminal.js'
import eventBus from './events.js'

export class RTCPeerSender {
  constructor({ code }) {
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
    eventBus.on('terminal:open', () => {
      console.log(`\n dx receive --code ${this.code}\n`)
    })

    eventBus.on('terminal:start', async () => {
      const offer = await this.peer.createOffer()
      await this.peer.setLocalDescription(offer)
      this.terminal.offer(offer)
    })

    eventBus.on('terminal:answer', (sdp) => {
      this.peer.setRemoteDescription(sdp)
    })

    eventBus.on('terminal:ice-candidate', (candidate) => {
      this.peer.addIceCandidate(candidate)
    })
  }

  startPeer() {
    this.peer = new wrtc.RTCPeerConnection(globalThis.ICE_SERVER_CFG)
    this.peer.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(this.peer.iceConnectionState)) {
        console.error('Peer connection failed')
        eventBus.emit('peer:failed')
        this.clear()
      }
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
          eventBus.emit('peer:exit', 'sigint')
          this.clear()
        } else if (parsed.type === 'all-files-received') {
          eventBus.emit('peer:exit', 'channel:all-files-received')
          this.clear()
        }
      } catch {}
    }
    this.dataChannel.onopen = async () => {
      this.terminal.close()
      eventBus.emit('peer:channel:open')
    }

    this.dataChannel.onclose = () => {
      eventBus.emit('peer:exit', 'channel:close')
    }

    this.dataChannel.onerror = (err) => {
      eventBus.emit('peer:exit', 'channel:error')
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

export class RTCPeerReceiver {
  constructor({ code }) {
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

    eventBus.on('terminal:offer', async (sdp) => {
      await this.peer.setRemoteDescription(sdp)
      const ans = await this.peer.createAnswer()
      await this.peer.setLocalDescription(ans)
      this.terminal.answer(ans)
    })

    eventBus.on('terminal:ice-candidate', (candidate) => {
      this.peer.addIceCandidate(candidate)
    })
  }

  startPeer() {
    this.peer = new wrtc.RTCPeerConnection(globalThis.ICE_SERVER_CFG)
    this.peer.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(this.peer.iceConnectionState)) {
        eventBus.emit('peer:failed')
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
        this.terminal.close()
        eventBus.emit('peer:channel:message', data)
      }

      dataChannel.onerror = () => {
        eventBus.emit('peer:exit', 'channel:error')
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
