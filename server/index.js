import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 4011 })
// 存储房间号和客户端连接的映射
const rooms = new Map() 

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)
      console.log(data)

      // 客户端发送传输码，加入房间
      if (data.type === 'join') {
        const roomCode = data.code
        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, new Set())
        }
        rooms.get(roomCode).add(ws)
        ws.roomCode = roomCode
        // 如果房间内有两个客户端，通知它们开始 WebRTC 握手
        if (rooms.get(roomCode).size === 2) {
          rooms.get(roomCode).forEach((client) => {
            client.send(JSON.stringify({ type: 'start' }))
          })
        }
      }

      // 转发 Offer、Answer 或 ICE Candidate
      if (['offer', 'answer', 'ice-candidate'].includes(data.type)) {
        const roomCode = ws.roomCode
        if (rooms.has(roomCode)) {
          rooms.get(roomCode).forEach((client) => {
            if (client !== ws) {
              client.send(JSON.stringify(data))
            }
          })
        }
      }
    } catch (err) {
      console.error('Error processing message:', err)
    }
  })

  ws.on('close', () => {
    if (ws.roomCode && rooms.has(ws.roomCode)) {
      rooms.get(ws.roomCode).delete(ws)
      if (rooms.get(ws.roomCode).size === 0) {
        rooms.delete(ws.roomCode)
      }
    }
  })
})

console.log('Signaling server running.')