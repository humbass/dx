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

import { createRequire } from 'module'
import {  promises } from 'fs'

export default async function version() {
  try {
    const require = createRequire(import.meta.url)
    const packagePath = require.resolve('../../package.json')
    const data = await promises.readFile(packagePath, 'utf-8')
    const pkg = JSON.parse(data)
    console.log(pkg.version || 'unknown')
  } catch (e) {
    console.log('unknown')
  }
}


