#!/usr/bin/env node
import { execSync } from 'child_process'

function checkNodeVersion() {
  const requiredVersion = '20.0.0'
  const currentVersion = process.version.replace(/^v/, '')

  const isSatisfied = compareVersions(currentVersion, requiredVersion)
  if (!isSatisfied) {
    console.error(`Error: Node.js version ${requiredVersion} or higher is required, but found ${currentVersion}.`)
    console.error('Please upgrade Node.js using a version manager like nvm:')
    console.error('  - Install nvm: https://github.com/nvm-sh/nvm')
    console.error('  - Run: nvm install 20')
    process.exit(1)
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

// check node-pre-gyp
function isNodePreGypInstalled() {
  try {
    execSync('npm list -g node-pre-gyp --depth=0', { stdio: 'ignore' })
    return true
  } catch (error) {
    return false
  }
}

// auto install node-pre-gyp
function installNodePreGyp() {
  console.log('node-pre-gyp is not installed globally. Attempting to install...')
  try {
    execSync('npm install -g node-pre-gyp', { stdio: 'inherit' })
    console.log('node-pre-gyp installed successfully.')
  } catch (error) {
    console.error('Error: Failed to install node-pre-gyp globally.')
    console.error('Please install it manually using: npm install -g node-pre-gyp')
    console.error('You may need to run with sudo or as an administrator.')
    process.exit()
  }
}

checkNodeVersion()
if (!isNodePreGypInstalled()) {
  installNodePreGyp()
} else {
  console.log('node-pre-gyp is already installed globally.')
}
