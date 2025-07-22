#!/usr/bin/env node

import { program } from 'commander'
import init from './utils/init.js'
import version from './program/version.js'
import send from './program/send.js'
import receive from './program/receive.js'
import sigint from './program/sigint.js'

init()
// prettier-ignore
program
  .command('version')
  .description('Show dx version')
  .action(version)
// prettier-ignore
program
  .command('send')
  .description('Send files, folders')
  .argument('<file>', 'File, folder, or pattern to send (e.g., *.txt or folder/)')
  .option('-c, --code <code>', 'code for transfer')
  .action(send)
// prettier-ignore
program
  .command('receive')
  .description('Receive files, folders from remote')
  .option('-c, --code <code>', 'code for transfer')
  .action(receive)
// prettier-ignore
program
  .parse()

process.on('SIGINT', sigint)
