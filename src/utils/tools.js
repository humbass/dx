import readline from 'readline'
import fse from 'fs-extra'
import path from 'path'

export function showProgress(total, current, barLength = 50) {
  const percentage = Math.min((current / total) * 100, 100).toFixed(2)
  const filled = Math.round((current / total) * barLength)
  const bar = '█'.repeat(filled) + '-'.repeat(barLength - filled)
  readline.cursorTo(process.stdout, 0)
  process.stdout.write(`[${bar}] ${percentage}%`)
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

export function randomCode() {
  return Math.random()
    .toString()
    .substring(2, 12)
    .replace(/(\d{3})(\d{4})(\d{3})/, '$1-$2-$3')
}

export function exit(ms = 50) {
  setTimeout(() => process.exit(1), ms)
}
