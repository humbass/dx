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

import { WebSocket } from 'ws'
import { EventEmitter } from 'events'

export default class Terminal extends EventEmitter {
  constructor(code) {
    super()
    this.code = code
    this.terminal = null
    this.ws = new WebSocket(globalThis.SIGNALING_SERVER)
    this.ws.on('open', this.join.bind(this))
    this.ws.on('message', this.recevice.bind(this))
    this.ws.on('error', () => this.emit('error'))
    this.ws.on('close', () => console.log('WebSocket closed') )
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
        this.emit('start')
        break
      case 'offer':
        this.emit('offer', data.sdp)
        break
      case 'answer':
        this.emit('answer', data.sdp)
        break
      case 'ice-candidate':
        this.emit('ice-candidate', data.candidate)
        break
    }
  }

  join() {
    this.#send({ type: 'join', code: this.code })
    this.emit('open')
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
