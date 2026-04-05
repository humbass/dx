export default function sigint() {
  let rtcPeer = null
  try {
    rtcPeer = globalThis.rtcPeer
    if (rtcPeer && typeof rtcPeer.sendData === 'function') {
      rtcPeer.sendData({ type: 'sigint' })
    } else {
      const dataChannel = globalThis.dataChannel
      if (dataChannel && dataChannel.readyState === 'open' && typeof dataChannel.send === 'function') {
        dataChannel.send(JSON.stringify({ type: 'sigint' }))
      }
    }
  } catch {}

  setTimeout(() => {
    try {
      if (rtcPeer && typeof rtcPeer.clear === 'function') {
        rtcPeer.clear()
      }
    } catch {}
  }, 120)

  setTimeout(() => process.exit(0), 600)
}
