import path from 'path'
import readline from 'readline'
import fse from 'fs-extra'
import { stdout } from 'process'
import wrtc from 'wrtc'

export function getRTCPeer() {
  const rtcConfig = globalThis.ICE_SERVER_CFG
  return new wrtc.RTCPeerConnection(rtcConfig)
}

export function generateRandomCode() {
  return Math.random()
    .toString()
    .substring(2, 12)
    .replace(/(\d{3})(\d{4})(\d{3})/, '$1-$2-$3')
}

export function validateCode(code) {
  return /^[a-zA-Z0-9-]{6,}$/.test(code)
}

export function getValidCode(providedCode, isSender = false) {
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

export function showProgress(fileName, total, current, barLength = 50) {
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

export function getAllFiles(dirPath) {
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

export function cleanupAndExit(dataChannel, peer, ws) {
  dataChannel?.close()
  peer?.close()
  ws?.close()
  process.exit(0)
}

export function sendData(dataChannel, data) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    return
  }
  dataChannel.send(JSON.stringify(data))
}
