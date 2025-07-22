import { promises } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export default async function version() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const packagePath = join(dirname(dirname(__dirname)), 'package.json')
    const data = await promises.readFile(packagePath, 'utf-8')
    const pkg = JSON.parse(data)
    console.log(pkg.version || 'unknown')
  } catch (e) {
    console.log('unknown')
  }
}


