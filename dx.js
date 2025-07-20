#!/usr/bin/env node
/*
  ///////////
  /         /
  /   DX    /  
  /         /
  ///////////
*/
import { program } from 'commander'
import { createRequire } from 'module'
import { createReadStream, statSync, promises } from 'fs'
import path from 'path'
import readline from 'readline'
import fse from 'fs-extra'
import { stdout } from 'process'
import { globSync } from 'glob'
import wrtc from 'wrtc'
import { WebSocket } from 'ws'

const { RTCPeerConnection } = wrtc

const rtcConfig = {
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

const SIGNALING_SERVER = 'wss://dx.ld160.eu.org'

async function getVersion() {
  try {
    const require = createRequire(import.meta.url)
    const packagePath = require.resolve('./package.json')
    const data = await promises.readFile(packagePath, 'utf-8')
    const pkg = JSON.parse(data)
    return pkg.version || 'unknown'
  } catch (e) {
    return 'unknown'
  }
}

function generateRandomCode() {
  return Math.random().toString().substring(2, 12).replace(/(\d{3})(\d{4})(\d{3})/, '$1-$2-$3')
}

function validateCode(code) {
  return  /^[a-zA-Z0-9-]{6,}$/.test(code)
}

function getValidCode(providedCode, isSender = false) {
  if (providedCode) {
    if (!validateCode(providedCode)) {
      console.error('Error: Code must be at least 6 characters long and contain only letters and numbers.')
      process.exit(1)
    }
    return providedCode
  }

  const envCode = process.env.DX_CODE
  if (isSender) {
    if (envCode) {
      if (!validateCode(envCode)) {
        console.error('Error: DX_CODE must be at least 6 characters long and contain only letters and numbers.')
        process.exit(1)
      }
      return envCode
    }
    return generateRandomCode()
  }

  if (!envCode) {
    process.exit(1)
  }
  if (!validateCode(envCode)) {
    process.exit(1)
  }
  return envCode
}

function showProgress(fileName, total, current, barLength = 50) {
  const percentage = Math.min((current / total) * 100, 100).toFixed(2)
  const filled = Math.round((current / total) * barLength)
  const bar = '█'.repeat(filled) + '-'.repeat(barLength - filled)
  readline.cursorTo(stdout, 0)
  stdout.write(`File: ${fileName} [${bar}] ${percentage}%`)
  if (total === current) {
    if (globalThis.clientType === 'receive') {
      sendData(globalThis.dataChannel, { type: 'all-files-received' })
      setTimeout(() => process.exit(1), 50)
    }
  }
}

function getAllFiles(dirPath) {
  const files = []
  const items = fse.readdirSync(dirPath, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name)
    if (item.isDirectory()) {
      files.push(...getAllFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

function cleanupAndExit(dataChannel, peer, ws) {
  dataChannel?.close()
  peer?.close()
  ws?.close()
  process.exit(0)
}

function sendData(dataChannel, data) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    return
  }
  dataChannel.send(JSON.stringify(data))
}

program
  .version(await getVersion())
  .command('send')
  .description('Send files, folders')
  .argument('<file>', 'File, folder, or pattern to send (e.g., *.txt or folder/)')
  .option('-c, --code <code>', 'code for transfer')
  .action(async (file, options) => {
    if (!fse.existsSync(file)) {
      console.error(`Error: File or directory '${file}' does not exist`)
      process.exit(1)
    }
    const { code } = options
    const validCode = getValidCode(code, true)
    const ws = new WebSocket(SIGNALING_SERVER)
    const peer = new RTCPeerConnection(rtcConfig)
    const dataChannel = peer.createDataChannel('transfer', { ordered: true, maxRetransmits: 0 })
    globalThis.dataChannel = dataChannel

    peer.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(peer.iceConnectionState)) {
        console.error('Peer connection failed')
        cleanupAndExit(dataChannel, peer, ws)
      }
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', code: validCode }))
      if (code || !process.env.DX_CODE) {
        console.log(`\ndx receive --code ${validCode}\n`)
      } else {
        console.log(`\ndx receive\n`)
      }
    })

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message)
        if (data.type === 'start') {
          const offer = await peer.createOffer()
          await peer.setLocalDescription(offer)
          ws.send(JSON.stringify({ type: 'offer', sdp: offer, code: validCode }))
        } else if (data.type === 'answer') {
          await peer.setRemoteDescription(data.sdp)
        } else if (data.type === 'ice-candidate') {
          await peer.addIceCandidate(data.candidate).catch(() => {})
        }
      } catch {
        cleanupAndExit(dataChannel, peer, ws)
      }
    })

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) ws.send(JSON.stringify({ type: 'ice-candidate', candidate, code: validCode }))
    }

    dataChannel.onmessage = ({ data }) => {
      try {
        const parseed = JSON.parse(data)
        if (parseed.type == 'sigint') {
          cleanupAndExit(dataChannel, peer, ws)
        } else if (parseed.type === 'all-files-received') {
          cleanupAndExit(dataChannel, peer, ws)
        }
      } catch {}
    }

    dataChannel.onopen = async () => {
      const CHUNK_SIZE = 16 * 1024
      dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE
      // Gather files list
      let files = []
      if (fse.existsSync(file) && fse.statSync(file).isDirectory()) {
        files = getAllFiles(file).map((f) => ({ path: f, relativePath: path.relative(path.dirname(file), f) }))
      } else {
        files = globSync(file).map((f) => ({ path: f, relativePath: path.basename(f) }))
      }
      if (!files.length) return cleanupAndExit(dataChannel, peer, ws)

      for (const { path: filePath, relativePath: fileName } of files) {
        const fileSize = statSync(filePath).size
        sendData(dataChannel, { type: 'file', name: fileName, size: fileSize })

        // Read, queue, and send all chunks
        await new Promise((resolve, reject) => {
          const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
          let sendQueue = [],
            sending = false,
            streamEnded = false,
            sentBytes = 0

          stream.on('data', (chunk) => {
            sendQueue.push(chunk)
            pump()
          })
          stream.on('end', () => {
            streamEnded = true
            pump()
          })
          stream.on('error', reject)

          function pump() {
            if (sending) return
            if (!sendQueue.length) {
              if (streamEnded) return resolve()
              return
            }
            if (dataChannel.bufferedAmount > CHUNK_SIZE) return setTimeout(pump, 20)
            sending = true
            const chunk = sendQueue.shift()
            try {
              dataChannel.send(chunk)
              sentBytes += chunk.length
              showProgress(fileName, fileSize, sentBytes)
            } catch (err) {
              return reject(err)
            } finally {
              sending = false
              setImmediate(pump)
            }
          }
        })

        // Ensure buffer drained before file-end
        await new Promise((resolve) => {
          if (dataChannel.bufferedAmount <= CHUNK_SIZE) return resolve()
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null
            resolve()
          }
        })

        sendData(dataChannel, { type: 'file-end' })
      }

      sendData(dataChannel, { type: 'all-files-end' })
    }

    dataChannel.onclose = () => {
      cleanupAndExit(dataChannel, peer, ws)
    }

    dataChannel.onerror = (err) => {
      cleanupAndExit(dataChannel, peer, ws)
    }
  })

program
  .command('receive')
  .description('Receive files, folders, or a string')
  .option('-c, --code <code>', 'code for transfer')
  .action(async ({ code }) => {
    const validCode = getValidCode(code, false)
    const ws = new WebSocket(SIGNALING_SERVER)
    const peer = new RTCPeerConnection(rtcConfig)
    let writeStream = null
    let total = 0
    let received = 0
    globalThis.clientType = 'receive'

    peer.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(peer.iceConnectionState)) {
        console.error('Peer connection failed')
        cleanupAndExit(null, peer, ws)
      }
    }

    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code: validCode })))
    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg)
        if (data.type === 'offer') {
          await peer.setRemoteDescription(data.sdp)
          const ans = await peer.createAnswer()
          await peer.setLocalDescription(ans)
          ws.send(JSON.stringify({ type: 'answer', sdp: ans, code: validCode }))
        } else if (data.type === 'ice-candidate') {
          await peer.addIceCandidate(data.candidate).catch(() => {})
        }
      } catch {
        cleanupAndExit(null, peer, ws)
      }
    })
    ws.on('error', () => cleanupAndExit(null, peer, ws))
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) ws.send(JSON.stringify({ type: 'ice-candidate', candidate, code: validCode }))
    }
    peer.ondatachannel = ({ channel: dataChannel }) => {
      globalThis.dataChannel = dataChannel
      dataChannel.onmessage = async ({ data }) => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'sigint') {
            cleanupAndExit(dataChannel, peer, ws)
          } else if (parsed.type === 'file') {
            const filePath = parsed.name
            const dir = path.dirname(filePath)
            if (dir !== '') fse.ensureDirSync(dir)
            writeStream = fse.createWriteStream(filePath, { highWaterMark: 16 * 1024 })
            total = parsed.size
            received = 0
          } else if (parsed.type === 'file-end') {
            await new Promise((res) => writeStream.end(res))
          }
        } catch {
          const buf = Buffer.from(data)
          received += buf.length
          await new Promise((res, rej) =>
            writeStream.write(buf, (err) => {
              if (err) {
                console.error('Error writing to file:', err)
                rej(err)
              } else {
                showProgress(writeStream.path, total, received)
                res()
              }
            }),
          )
        }
      }
      dataChannel.onerror = (err) => {
        cleanupAndExit(dataChannel, peer, ws)
      }
    }
  })

program.parse()

process.on('SIGINT', () => {
  if (globalThis.dataChannel) {
    sendData(globalThis.dataChannel, { type: 'sigint' })
  }
  setTimeout(() => process.exit(0), 100)
})
