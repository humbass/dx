import nodeDataChannel from 'node-datachannel'
import WebSocket from '../utils/websocket.js'
import { EventEmitter } from 'events'

export class RTCPeerSender extends EventEmitter {
  constructor(code) {
    super()
    this.code = code
    this.peerConnection = null
    this.dataChannel = null
    this.ws = new WebSocket()
    this.init()
  }

  init() {
    nodeDataChannel.initLogger('Error')

    this.ws.connect()

    this.ws.onOpen(() => {
      this.ws.joinRoom(this.code)
      this.emit('peer:join')
    })

    this.ws.onError(err => {
      this.emit('peer:exit', { error: err })
    })

    this.ws.onMessage(msgStr => {
      let msg = JSON.parse(msgStr)
      switch (msg.type) {
        case 'start':
          this.createPeerConnection()
          break
        case 'answer':
          this.peerConnection.setRemoteDescription(msg.description, msg.type)
          break
        case 'ice-candidate':
          this.peerConnection.addRemoteCandidate(msg.candidate, msg.mid)
          break
      }
    })
  }

  createPeerConnection() {
    this.peerConnection = new nodeDataChannel.PeerConnection('sender', {
      iceServers: ['stun:stun.l.google.com:19302'],
    })

    this.peerConnection.onStateChange(state => {
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.emit('peer:exit', { state })
      }
    })

    this.peerConnection.onLocalDescription((description, type) => {
      this.ws.sendMessage(JSON.stringify({ type, description }))
    })

    this.peerConnection.onLocalCandidate((candidate, mid) => {
      this.ws.sendMessage(JSON.stringify({ type: 'ice-candidate', candidate, mid }))
    })

    this.dataChannel = this.peerConnection.createDataChannel('chat')

    this.dataChannel.onOpen(() => {
      this.emit('peer:channel:open')
    })

    this.dataChannel.onMessage(msg => {
      try {
        const parsed = JSON.parse(msg)
        if (parsed.type === 'all-files-received') {
          this.emit('peer:exit', { reason: 'all-files-received' })
        } else if (parsed.type === 'sigint') {
          this.emit('peer:exit', { reason: 'sigint' })
        }
      } catch (e) {}
    })

    this.dataChannel.onClosed(() => {
      this.emit('peer:exit', { reason: 'channel_closed' })
    })
  }

  sendChunk(buffer) {
    if (this.dataChannel && Buffer.isBuffer(buffer)) {
      this.dataChannel.sendMessageBinary(buffer)
    }
  }

  sendData(data) {
    if (this.dataChannel) {
      this.dataChannel.sendMessage(JSON.stringify(data))
    }
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close()
    }
    if (this.peerConnection) {
      this.peerConnection.close()
    }
    if (this.ws) {
      this.ws.close()
    }
  }
}

export class RTCPeerReceiver extends EventEmitter {
  constructor(code) {
    super()
    this.code = code
    this.peerConnection = null
    this.dataChannel = null
    this.ws = new WebSocket()
    this.init()
  }

  init() {
    nodeDataChannel.initLogger('Error')

    this.ws.connect()

    this.ws.onOpen(() => {
      this.ws.joinRoom(this.code)
    })

    this.ws.onError(err => {
      this.emit('peer:exit', { error: err })
    })

    this.ws.onMessage(msgStr => {
      let msg = JSON.parse(msgStr)
      switch (msg.type) {
        case 'start':
          this.createPeerConnection()
          break
        case 'offer':
          if (!this.peerConnection) {
            this.createPeerConnection()
          }
          this.peerConnection.setRemoteDescription(msg.description, msg.type)
          break
        case 'ice-candidate':
          this.peerConnection.addRemoteCandidate(msg.candidate, msg.mid)
          break
      }
    })
  }

  createPeerConnection() {
    this.peerConnection = new nodeDataChannel.PeerConnection('receiver', {
      iceServers: ['stun:stun.l.google.com:19302'],
    })

    this.peerConnection.onStateChange(state => {
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.emit('peer:exit', { state })
      }
    })

    this.peerConnection.onLocalDescription((description, type) => {
      this.ws.sendMessage(JSON.stringify({ type, description }))
    })

    this.peerConnection.onLocalCandidate((candidate, mid) => {
      this.ws.sendMessage(JSON.stringify({ type: 'ice-candidate', candidate, mid }))
    })

    this.peerConnection.onDataChannel(dataChannel => {
      dataChannel.onOpen(() => {})
      dataChannel.onMessage(msg => {
        if (Buffer.isBuffer(msg)) {
          this.emit('peer:channel:buffer', msg)
        } else {
          this.emit('peer:channel:message', msg)
        }
      })

      dataChannel.onClosed(() => {
        this.emit('peer:exit', { reason: 'channel_closed' })
      })
      this.dataChannel = dataChannel
    })
  }

  sendData(data) {
    if (this.dataChannel) {
      this.dataChannel.sendMessage(JSON.stringify(data))
    }
  }

  close() {
    if (this.peerConnection) {
      this.peerConnection.close()
    }
    if (this.ws) {
      this.ws.close()
    }
  }
}
