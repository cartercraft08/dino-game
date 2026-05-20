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
      // Store the player’s team
      if (!room.teams) room.teams = [];
      room.teams[ws.playerIndex] = msg.team;
      room.ready[ws.playerIndex] = true;
      if (room.ready.every(r => r)) {
        // Send each player the opponent’s team
        room.players[0].send(JSON.stringify({ type: 'bothReady', opponentTeam: room.teams[1] }));
        room.players[1].send(JSON.stringify({ type: 'bothReady', opponentTeam: room.teams[0] }));
      }
    }
                else if (msg.type === 'replace') {
      const room = rooms[ws.room];
      if (!room) return;
      // Store the replacement name (not index, to avoid order mismatches)
      if (!room.replaces) room.replaces = {};
      room.replaces[ws.playerIndex] = msg.name;
      // Send the replacement name to the opponent
      const opponent = room.players[1 - ws.playerIndex];
      if (opponent) opponent.send(JSON.stringify({ type: 'opponentReplace', name: msg.name, playerIndex: ws.playerIndex }));

      // When both players have chosen their replacements (or only one needed), clear and advance
      const neededCount = room.players.filter((p, i) => room.replaces[i] !== undefined).length;
      const totalNeeded = room.players.length; // both might need a replacement
      if (neededCount === totalNeeded) {
        room.replaces = {};
        room.players.forEach(p => p.send(JSON.stringify({ type: 'replacementsDone' })));
      }
    }
                  else if (msg.type === 'swapTarget') {
      const room = rooms[ws.room];
      if (!room) return;
      const opponent = room.players[1 - ws.playerIndex];
      if (opponent) opponent.send(JSON.stringify({ type: 'opponentSwapTarget', index: msg.index }));
    }
    else if (msg.type === 'nextTurn') {
      const room = rooms[ws.room];
      if (!room) return;
      if (!room.nextTurnReady) room.nextTurnReady = {};
      room.nextTurnReady[ws.playerIndex] = true;
      if (Object.keys(room.nextTurnReady).length === 2) {
        // Both players are ready for the next turn
        room.players.forEach(p => p.send(JSON.stringify({ type: 'turnAdvance' })));
        room.nextTurnReady = {};
      }
    }
        else if (msg.type === 'move') {
      const room = rooms[ws.room];
      if (!room) return;
      // Store the move for this player
      if (!room.moves) room.moves = {};
      room.moves[ws.playerIndex] = msg.move;
      // When both moves are in, send them to both players
      if (Object.keys(room.moves).length === 2) {
        room.players[0].send(JSON.stringify({ type: 'turnResolve', opponentMove: room.moves[1] }));
        room.players[1].send(JSON.stringify({ type: 'turnResolve', opponentMove: room.moves[0] }));
        room.moves = {}; // clear for next turn
      }
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
