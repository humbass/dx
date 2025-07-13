#!/usr/bin/env node
/*
  ///////////
  /         /
  /   DX    /  
  /         /
  ///////////
*/
import { WebSocket } from 'ws'
import { program } from 'commander'
import { createReadStream, statSync } from 'fs'
import fse from 'fs-extra'
import { globSync } from 'glob'
import wrtc from 'wrtc'
import { stdin, stdout } from 'process'
import readline from 'readline'
import path from 'path'


// 从 wrtc 解构出 RTCPeerConnection 和 RTCDataChannel
const { RTCPeerConnection, RTCDataChannel } = wrtc

// 配置 STUN 服务器
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.nextcloud.com:443' },
    { urls: 'stun:stun.1und1.de:3478' },
    { urls: 'stun:stun.gmx.net:3478' },
  ],
}

// 信令服务器地址
const SIGNALING_SERVER = 'wss://dx.ld160.eu.org'

// 验证 code 的正则表达式：6 位以上字母数字
const CODE_REGEX = /^[a-zA-Z0-9]{6,}$/

async function getVersion() {
  try {
    const pkg = await import('./package.json', { assert: { type: 'json' } })
    return pkg.default.version || 'unknown'
  } catch (err) {
    return 'unknown'
  }
}

// debug 函数，用来打印调试信息
function print(...args) {
  const formattedArgs = args.map((arg) => (typeof arg === 'object' ? util.inspect(arg, { depth: null, colors: true }) : arg))
  console.log('On the other terminal run:')
  console.log(...formattedArgs)
}

// 生成随机 code
function generateRandomCode(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// 验证 code 是否符合规则
function validateCode(code) {
  return CODE_REGEX.test(code)
}

// 获取有效的 code
function getValidCode(providedCode, isSender = false) {
  if (providedCode) {
    if (!validateCode(providedCode)) {
      console.error('Error: Code must be at least 6 characters long and contain only letters and numbers.')
      process.exit(1)
    }
    return providedCode
  }

  if (isSender) {
    const envCode = process.env.DX_CODE
    if (envCode) {
      if (!validateCode(envCode)) {
        console.error('Error: DX_CODE must be at least 6 characters long and contain only letters and numbers.')
        process.exit(1)
      }
      return envCode
    }
    return generateRandomCode()
  }

  const envCode = process.env.DX_CODE
  if (!envCode) {
    console.error('Error: Please set DX_CODE environment variable or provide --code option.')
    console.error('Example: export DX_CODE="abc123" && dx receive')
    process.exit(1)
  }
  if (!validateCode(envCode)) {
    console.error('Error: DX_CODE must be at least 6 characters long and contain only letters and numbers.')
    process.exit(1)
  }
  return envCode
}

// 进度条工具
function showProgress(fileName, total, current, barLength = 50) {
  const percentage = Math.min((current / total) * 100, 100).toFixed(2)
  const filled = Math.round((current / total) * barLength)
  const bar = '█'.repeat(filled) + '-'.repeat(barLength - filled)
  readline.cursorTo(stdout, 0)
  stdout.write(`File: ${fileName} [${bar}] ${percentage}%`)
  if (current >= total) stdout.write('\n')
}

// 递归获取文件夹中的所有文件
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

// 清理并正常退出
function cleanupAndExit(dataChannel, peer, ws) {
  dataChannel?.close()
  peer?.close()
  ws?.close()
  process.exit(0)
}

program
  .version(await getVersion())
  .command('send')
  .description('Send files, folders, or a string')
  .option('-f, --file <pattern>', 'File, folder, or pattern to send (e.g., *.txt or folder/)')
  .option('-t, --text <string>', 'Text to send')
  .option('-c, --code <code>', 'code for transfer')
  .action(async ({ file, text, code }) => {
    const validCode = getValidCode(code, true)
    const ws = new WebSocket(SIGNALING_SERVER)
    const peer = new RTCPeerConnection(rtcConfig)
    const dataChannel = peer.createDataChannel('transfer', {
      ordered: true,
    })

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'disconnected' || peer.iceConnectionState === 'failed') {
        console.error('ICE connection failed')
        cleanupAndExit(dataChannel, peer, ws)
      }
    }
    peer.onsignalingstatechange = () => {}

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', code: validCode }))
      if (code || !process.env.DX_CODE) {
        print(`\n  dx receive --code ${validCode}\n`)
      } else {
        print(`\n  dx receive\n`)
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
          await peer.addIceCandidate(data.candidate).catch((err) => {
            console.error('Error adding ICE candidate:', err)
          })
        }
      } catch (err) {
        console.error('Error processing message:', err)
        cleanupAndExit(dataChannel, peer, ws)
      }
    })

    ws.on('error', (err) => {
      console.error('WebSocket error:', err)
      cleanupAndExit(dataChannel, peer, ws)
    })

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        ws.send(JSON.stringify({ type: 'ice-candidate', candidate, code: validCode }))
      }
    }

    dataChannel.onopen = async () => {
      dataChannel.bufferedAmountLowThreshold = 16384
      if (file) {
        let files = []
        if (fse.existsSync(file) && fse.statSync(file).isDirectory()) {
          files = getAllFiles(file).map((f) => ({
            path: f,
            relativePath: path.relative(path.dirname(file), f),
          }))
        } else {
          files = globSync(file).map((f) => ({
            path: f,
            relativePath: path.basename(f),
          }))
        }

        if (files.length === 0) {
          cleanupAndExit(dataChannel, peer, ws)
          return
        }

        dataChannel.send(JSON.stringify({ type: 'file-count', count: files.length }))

        for (const { path: filePath, relativePath } of files) {
          const fileName = relativePath
          const fileSize = statSync(filePath).size
          const stream = createReadStream(filePath, { highWaterMark: 2048 })
          let total = 0
          let sent = 0

          const fileInfo = { name: fileName, size: fileSize, type: 'file' }
          dataChannel.send(JSON.stringify(fileInfo))

          await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
              if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
                stream.pause()
                dataChannel.onbufferedamountlow = () => {
                  dataChannel.onbufferedamountlow = null
                  stream.resume()
                }
                return
              }

              dataChannel.send(chunk)
              total += chunk.length
              sent += chunk.length
              showProgress(fileName, fileSize, sent)
            })

            stream.on('end', () => {
              dataChannel.send(JSON.stringify({ type: 'file-end' }))
              resolve()
            })

            stream.on('error', (err) => {
              reject(err)
            })
          })
        }

        dataChannel.send(JSON.stringify({ type: 'all-files-end' }))
        const timeout = setTimeout(() => {
          cleanupAndExit(dataChannel, peer, ws)
        }, 30000)
        await new Promise((resolve) => {
          dataChannel.onmessage = ({ data }) => {
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'all-files-received') {
                clearTimeout(timeout)
                resolve()
              }
            } catch (e) {}
          }
        })
        cleanupAndExit(dataChannel, peer, ws)
      } else if (text) {
        dataChannel.send(JSON.stringify({ type: 'text', content: text }))
        console.log('Text sent successfully')
        cleanupAndExit(dataChannel, peer, ws)
      }
    }

    dataChannel.onerror = (err) => {
      console.error('Data channel error:', err)
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
    let fileCount = 0
    let currentFile = 0

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'disconnected' || peer.iceConnectionState === 'failed') {
        console.error('ICE connection failed')
        cleanupAndExit(null, peer, ws)
      }
    }
    peer.onsignalingstatechange = () => {}

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', code: validCode }))
    })

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message)

        if (data.type === 'offer') {
          await peer.setRemoteDescription(data.sdp)
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          ws.send(JSON.stringify({ type: 'answer', sdp: answer, code: validCode }))
        } else if (data.type === 'ice-candidate') {
          await peer.addIceCandidate(data.candidate).catch((err) => {})
        }
      } catch (err) {
        cleanupAndExit(null, peer, ws)
      }
    })

    ws.on('error', (err) => {
      cleanupAndExit(null, peer, ws)
    })

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        ws.send(JSON.stringify({ type: 'ice-candidate', candidate, code: validCode }))
      }
    }

    peer.ondatachannel = ({ channel }) => {
      channel.onmessage = async ({ data }) => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'file-count') {
            fileCount = parsed.count
          } else if (parsed.type === 'file') {
            const filePath = parsed.name
            const dir = path.dirname(filePath)
            if (dir !== '.') {
              fse.ensureDirSync(dir)
            }
            writeStream = fse.createWriteStream(filePath, { highWaterMark: 2048 })
            total = parsed.size
            received = 0
          } else if (parsed.type === 'text') {
            cleanupAndExit(channel, peer, ws)
          } else if (parsed.type === 'file-end') {
            await new Promise((resolve) => writeStream.end(resolve))
            if (received !== total) {
              console.error(`File incomplete: received ${received} of ${total} bytes`)
            }
            currentFile += 1
          } else if (parsed.type === 'all-files-end') {
            if (received === total && currentFile === fileCount) {
              channel.send(JSON.stringify({ type: 'all-files-received' }))
            } else {
              channel.send(JSON.stringify({ type: 'error', message: 'Incomplete file transfer' }))
            }
            cleanupAndExit(channel, peer, ws)
          }
        } catch (e) {
          const buffer = Buffer.from(data)
          if (!writeStream) {
            console.error('Received data before file info, ignoring')
            return
          }
          received += buffer.length
          await new Promise((resolve, reject) => {
            writeStream.write(buffer, (err) => {
              if (err) {
                console.error('Error writing to file:', err)
                reject(err)
              } else {
                showProgress(writeStream.path, total, received)
                resolve()
              }
            })
          })
        }
      }

      channel.onerror = (err) => {
        console.error('Data channel error:', err)
        cleanupAndExit(channel, peer, ws)
      }
    }
  })

program.parse()
