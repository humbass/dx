import { RTCPeerReceiver } from '../utils/peer.js'
import { generateRandomCode } from './common.js'

export default async function (options) {
  const _code = options.code || process.env.DX_CODE
  const code = _code
    ? /^[a-zA-Z0-9-]{6,}$/.test(_code)
      ? _code
      : (() => {
          console.error('Error: Code must be at least 6 characters long and contain only letters and numbers.')
          process.exit(1)
        })()
    : generateRandomCode()

  this.rtcPeer = new RTCPeerReceiver({ code })
  this.rtcPeer.on('exit', () => {
    setTimeout(() => process.exit(1), 50)
  })
}
