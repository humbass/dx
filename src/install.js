#!/usr/bin/env node

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

import { exit } from 'process'

// Check Node.js Version
function checkNodeVersion() {
  const requiredVersion = '20.0.0'
  const currentVersion = process.version.replace(/^v/, '')

  const isSatisfied = compareVersions(currentVersion, requiredVersion)
  if (!isSatisfied) {
    console.error(`Error: Node.js version ${requiredVersion} or higher is required, but found ${currentVersion}.`)
    console.error('Please upgrade Node.js using a version manager like nvm:')
    console.error('  - Install nvm: https://github.com/nvm-sh/nvm')
    console.error('  - Run: nvm install 20')
    exit(1)
  }
  console.log(`Node.js version ${currentVersion} is compatible.`)
}

function compareVersions(current, required) {
  const currentParts = current.split('.').map(Number)
  const requiredParts = required.split('.').map(Number)

  for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
    const currentPart = currentParts[i] || 0
    const requiredPart = requiredParts[i] || 0
    if (currentPart < requiredPart) return false
    if (currentPart > requiredPart) return true
  }
  return true
}

checkNodeVersion()
