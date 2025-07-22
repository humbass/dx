import { WebSocket } from 'ws'
import eventBus from './events.js'

export default class Terminal {
  constructor(code) {
    this.code = code
    this.terminal = null
    this.ws = new WebSocket(globalThis.SIGNALING_SERVER)
    this.ws.on('open', this.join.bind(this))
    this.ws.on('message', this.recevice.bind(this))
    this.ws.on('error', () => eventBus.emit('terminal:error'))
    this.ws.on('close', () => {})
  }

  #toJson(buffer) {
    try {
      return JSON.parse(buffer)
    } catch (error) {
      return null
    }
  }

  #send(data) {
    if (this.ws.readyState == WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  recevice(message) {
    const data = this.#toJson(message)
    if (!data || !data.type) {
      return
    }
    switch (data.type) {
      case 'start':
        eventBus.emit('terminal:start')
        break
      case 'offer':
        eventBus.emit('terminal:offer', data.sdp)
        break
      case 'answer':
        eventBus.emit('terminal:answer', data.sdp)
        break
      case 'ice-candidate':
        eventBus.emit('terminal:ice-candidate', data.candidate)
        break
    }
  }

  join() {
    this.#send({ type: 'join', code: this.code })
    eventBus.emit('terminal:open')
  }

  offer(sdp) {
    this.#send({ type: 'offer', code: this.code, sdp })
  }

  answer(sdp) {
    this.#send({ type: 'answer', code: this.code, sdp })
  }

  candidate(candidate) {
    this.#send({ type: 'ice-candidate', code: this.code, candidate })
  }

  close() {
    if (this.ws.readyState == WebSocket.OPEN) {
      this.ws.close(1000, 'client close')
    }
  }
}
