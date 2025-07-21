import fse from 'fs-extra'
import path from 'path'
import { globSync } from 'glob'
import { RTCPeerSender } from '../utils/peer.js'
import { generateRandomCode } from './common.js'

export default async function send(file, options) {
  if (!fse.existsSync(file)) {
    console.error(`Error: File or directory '${file}' does not exist`)
    process.exit(1)
  }

  let files = []
  if (fse.existsSync(file) && fse.statSync(file).isDirectory()) {
    files = getAllFiles(file).map(f => ({ path: f, relativePath: path.relative(path.dirname(file), f) }))
  } else {
    files = globSync(file).map(f => ({ path: f, relativePath: path.basename(f) }))
  }

  if (files.length === 0) {
    console.error(`Error: No files found in '${file}'`)
    process.exit(1)
  }

  const _code = options.code || process.env.DX_CODE
  const code = _code
  ? (/^[a-zA-Z0-9-]{6,}$/.test(_code) ? _code : (() => { 
    console.error('Error: Code must be at least 6 characters long and contain only letters and numbers.')
    process.exit(1)
   })())
  : generateRandomCode()

  this.rtcPeer = new RTCPeerSender({ code, files })
  this.rtcPeer.on('exit', () => {
    setTimeout(() => process.exit(1), 50)
  })

}
