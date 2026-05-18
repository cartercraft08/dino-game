const WebSocket = require('ws');
const crypto = require('crypto');

const wss = new WebSocket.Server({ port: process.env.PORT || 10000 });

const rooms = {};

function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create') {
      const code = generateRoomCode();
      rooms[code] = { players: [ws], ready: [false, false], seed: Math.floor(Math.random() * 2147483647) };
      ws.room = code;
      ws.playerIndex = 0;
      ws.send(JSON.stringify({ type: 'roomCreated', code, seed: rooms[code].seed }));
    }

    else if (msg.type === 'join') {
      const code = msg.code;
      const room = rooms[code];
      if (!room || room.players.length >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full.' }));
        return;
      }
      room.players.push(ws);
      ws.room = code;
      ws.playerIndex = 1;
      room.players[0].send(JSON.stringify({ type: 'opponentJoined', seed: room.seed }));
      ws.send(JSON.stringify({ type: 'joined', code, seed: room.seed }));
    }

    else if (msg.type === 'setTeam') {
      const room = rooms[ws.room];
      if (!room) return;
      room.ready[ws.playerIndex] = true;
      if (room.ready.every(r => r)) {
        room.players.forEach(p => p.send(JSON.stringify({ type: 'bothReady' })));
      }
    }

    else if (msg.type === 'move') {
      const room = rooms[ws.room];
      if (!room) return;
      const opponent = room.players[1 - ws.playerIndex];
      if (opponent) opponent.send(JSON.stringify({ type: 'opponentMove', move: msg.move }));
    }
  });

  ws.on('close', () => {
    if (ws.room && rooms[ws.room]) {
      const opponent = rooms[ws.room].players[1 - ws.playerIndex];
      if (opponent) opponent.send(JSON.stringify({ type: 'opponentLeft' }));
      delete rooms[ws.room];
    }
  });
});
