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

const SIGNALING_SERVER = 'wss://dx.ld160.eu.org'
const ICE_SERVER_CFG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:64.69.32.73:3478',
      username: 'dx',
      credential: 'dx',
    },
  ],
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
}
const CHUNK_SIZE = 16 * 1024

export default function init() {
  globalThis.SIGNALING_SERVER = SIGNALING_SERVER
  globalThis.ICE_SERVER_CFG = ICE_SERVER_CFG
  globalThis.CHUNK_SIZE = CHUNK_SIZE
}