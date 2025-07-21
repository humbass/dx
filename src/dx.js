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


import { program } from 'commander'
import init from './utils/init.js'
import version from './program/version.js'
import send from './program/send.js'
import receive from './program/receive.js'
import sigint from './program/sigint.js'

init()

program.command('version').description('Show dx version').action(version)

program
  .command('send')
  .description('Send files, folders')
  .argument('<file>', 'File, folder, or pattern to send (e.g., *.txt or folder/)')
  .option('-c, --code <code>', 'code for transfer')
  .action(send)

program
  .command('receive')
  .description('Receive files, folders from remote')
  .option('-c, --code <code>', 'code for transfer')
  .action(receive)

program.parse()

process.on('SIGINT', sigint)
