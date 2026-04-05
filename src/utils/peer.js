import { RTCPeerConnection } from 'werift'
import Terminal from './terminal.js'
import eventBus from './events.js'

function toIceServers() {
  const cfg = globalThis.ICE_SERVER_CFG || {}
  const list = Array.isArray(cfg.iceServers) ? cfg.iceServers : []
  return list
    .map((item) => {
      if (typeof item === 'string') return { urls: item }
      if (item && typeof item.urls === 'string') return { urls: item.urls }
      return null
    })
    .filter(Boolean)
}

function toIceCandidateInit(candidate) {
  if (!candidate) return null
  if (typeof candidate === 'string') {
    return { candidate, sdpMid: '0', sdpMLineIndex: 0 }
  }

  if (candidate.candidate) {
    return {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid ?? '0',
      sdpMLineIndex: candidate.sdpMLineIndex ?? 0,
    }
  }

  return null
}

export class RTCPeerSender {
  constructor({ code }) {
    this.code = code
    this.peer = null
    this.dataChannel = null
    this.terminal = null
    this.isClosing = false
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
      this.terminal.offer(this.peer.localDescription)
    })

    eventBus.on('terminal:answer', async (sdp) => {
      await this.peer.setRemoteDescription(sdp)
    })

    eventBus.on('terminal:ice-candidate', async (candidate) => {
      const init = toIceCandidateInit(candidate)
      if (!init) return
      await this.peer.addIceCandidate(init)
    })
  }

  startPeer() {
    this.peer = new RTCPeerConnection({
      iceServers: toIceServers(),
      iceTransportPolicy: globalThis.ICE_SERVER_CFG?.iceTransportPolicy || 'all',
    })

    this.peer.iceConnectionStateChange.subscribe((state) => {
      if (this.isClosing) return
      if (state === 'failed') {
        console.error('Peer connection failed')
        eventBus.emit('peer:failed')
        this.clear()
      }
    })

    this.peer.onIceCandidate.subscribe((candidate) => {
      if (candidate) this.terminal.candidate(candidate)
    })
  }

  startChannel() {
    this.dataChannel = this.peer.createDataChannel('transfer', { ordered: true })
    const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
    this.dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE

    this.dataChannel.onMessage.subscribe((data) => {
      try {
        const parsed = JSON.parse(data)
        if (parsed.type == 'sigint') {
          eventBus.emit('peer:exit', 'sigint')
          this.clear()
        } else if (parsed.type === 'progress') {
          eventBus.emit('peer:channel:message', parsed)
        } else if (parsed.type === 'all-files-received') {
          eventBus.emit('peer:exit', 'channel:all-files-received')
          this.clear()
        }
      } catch {}
    })

    this.dataChannel.stateChanged.subscribe((state) => {
      if (state === 'open') {
        this.terminal.close()
        eventBus.emit('peer:channel:open')
      } else if (state === 'closed') {
        eventBus.emit('peer:exit', 'channel:close')
      }
    })

    this.dataChannel.error.subscribe(() => {
      eventBus.emit('peer:exit', 'channel:error')
    })

    globalThis.dataChannel = this.dataChannel
  }

  sendChunk(chunk) {
    if (!this.isChannelOpen()) {
      return false
    }
    this.dataChannel.send(chunk)
    return true
  }

  sendData(data) {
    if (!this.isChannelOpen()) {
      return
    }
    this.dataChannel.send(JSON.stringify(data))
  }

  getBufferedAmount() {
    if (!this.isChannelOpen()) {
      return 0
    }
    return this.dataChannel.bufferedAmount
  }

  isChannelOpen() {
    return !!this.dataChannel && this.dataChannel.readyState === 'open'
  }

  clear() {
    this.isClosing = true
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
    this.isClosing = false
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
      const answer = await this.peer.createAnswer()
      await this.peer.setLocalDescription(answer)
      this.terminal.answer(this.peer.localDescription)
    })

    eventBus.on('terminal:ice-candidate', async (candidate) => {
      const init = toIceCandidateInit(candidate)
      if (!init) return
      await this.peer.addIceCandidate(init)
    })
  }

  startPeer() {
    this.peer = new RTCPeerConnection({
      iceServers: toIceServers(),
      iceTransportPolicy: globalThis.ICE_SERVER_CFG?.iceTransportPolicy || 'all',
    })

    this.peer.iceConnectionStateChange.subscribe((state) => {
      if (this.isClosing) return
      if (state === 'failed') {
        eventBus.emit('peer:failed')
        this.clear()
      }
    })

    this.peer.onIceCandidate.subscribe((candidate) => {
      if (candidate) this.terminal.candidate(candidate)
    })

    this.peer.onDataChannel.subscribe((dataChannel) => {
      const CHUNK_SIZE = globalThis.CHUNK_SIZE || 16 * 1024
      dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE

      dataChannel.onMessage.subscribe((data) => {
        this.terminal.close()
        eventBus.emit('peer:channel:message', data)
      })

      dataChannel.error.subscribe(() => {
        eventBus.emit('peer:exit', 'channel:error')
      })

      dataChannel.stateChanged.subscribe((state) => {
        if (state === 'closed') {
          eventBus.emit('peer:exit', 'channel:close')
        }
      })

      this.dataChannel = dataChannel
    })
  }

  sendData(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return
    }
    this.dataChannel.send(JSON.stringify(data))
  }

  clear() {
    this.isClosing = true
    this.dataChannel?.close()
    this.peer?.close()
  }
}
