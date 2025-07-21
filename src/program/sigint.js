import { sendData } from './common.js'

export default function sigint() {
  if (globalThis.dataChannel) {
    sendData(globalThis.dataChannel, { type: 'sigint' })
  }
  setTimeout(() => process.exit(0), 100)
}
