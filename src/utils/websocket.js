import nodeDataChannel from 'node-datachannel'

export default class WebSocketManager {
  constructor() {
    this.wsUrl = 'wss://dx.ld160.eu.org'
    this.ws = null
    this.onOpenCallback = null
    this.onErrorCallback = null
    this.onMessageCallback = null
  }

  connect() {
    this.ws = new nodeDataChannel.WebSocket()
    this.ws.open(this.wsUrl)

    this.ws.onOpen(() => {
      if (this.onOpenCallback) {
        this.onOpenCallback()
      }
    })

    this.ws.onError((err) => {
      if (this.onErrorCallback) {
        this.onErrorCallback(err)
      }
    })

    this.ws.onMessage((msgStr) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(msgStr)
      }
    })
  }

  onOpen(callback) {
    this.onOpenCallback = callback
  }

  onError(callback) {
    this.onErrorCallback = callback
  }

  onMessage(callback) {
    this.onMessageCallback = callback
  }

  sendMessage(message) {
    if (this.ws) {
      this.ws.sendMessage(message)
    }
  }

  joinRoom(roomCode) {
    this.sendMessage(JSON.stringify({ type: 'join', code: roomCode }))
  }

  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
}