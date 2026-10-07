'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { PokerTable, makeCode } = require('./game/pokerTable');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const RECONNECT_GRACE_MS = 90_000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(express.static(path.join(__dirname, 'public')));

/** @type {Map<string, PokerTable>} */
const rooms = new Map();

/** @type {Map<string, NodeJS.Timeout>} playerId -> grace timer */
const disconnectTimers = new Map();

function getRoom(code) {
  return rooms.get(String(code || '').toUpperCase());
}

function sanitizePlayerId(raw) {
  const id = String(raw || '').trim().slice(0, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

function clearDisconnectTimer(playerId) {
  const t = disconnectTimers.get(playerId);
  if (t) {
    clearTimeout(t);
    disconnectTimers.delete(playerId);
  }
}

function broadcastRoom(table) {
  for (const [, socket] of io.of('/').sockets) {
    if (socket.data.roomCode === table.code && socket.data.playerId) {
      socket.emit('state', table.getPublicState(socket.data.playerId));
    }
  }
}

function scheduleRemoval(table, playerId) {
  clearDisconnectTimer(playerId);
  disconnectTimers.set(
    playerId,
    setTimeout(() => {
      disconnectTimers.delete(playerId);
      const room = getRoom(table.code);
      if (!room) return;
      const p = room.players.find((x) => x.id === playerId);
      if (!p || p.connected) return;
      room.removePlayer(playerId);
      if (room.players.length === 0) {
        rooms.delete(room.code);
      } else {
        broadcastRoom(room);
      }
    }, RECONNECT_GRACE_MS)
  );
}

io.on('connection', (socket) => {
  socket.data.playerId = null;
  socket.data.roomCode = null;

  socket.on('create_room', ({ nickname, playerId } = {}) => {
    const pid = sanitizePlayerId(playerId) || socket.id;
    clearDisconnectTimer(pid);

    let code = makeCode();
    while (rooms.has(code)) code = makeCode();
    const table = new PokerTable(code);
    const result = table.addPlayer(pid, nickname);
    if (!result.ok) {
      socket.emit('error_msg', result.error);
      return;
    }
    rooms.set(code, table);
    socket.join(`room:${code}`);
    socket.data.roomCode = code;
    socket.data.playerId = pid;
    socket.emit('joined', { code, playerId: pid });
    broadcastRoom(table);
  });

  socket.on('join_room', ({ code, nickname, playerId } = {}) => {
    const table = getRoom(code);
    if (!table) {
      socket.emit('error_msg', 'Oda bulunamadı.');
      return;
    }
    const pid = sanitizePlayerId(playerId) || socket.id;
    clearDisconnectTimer(pid);

    const existing = table.players.find((p) => p.id === pid);
    if (existing) {
      // Reconnect: restore seat, chips, hole cards; keep hand going
      existing.connected = true;
      if (nickname && String(nickname).trim()) {
        existing.nickname = String(nickname).trim().slice(0, 16);
      }
      table.message = `${existing.nickname} yeniden bağlandı.`;
    } else {
      const midHand =
        table.phase !== 'lobby' && table.phase !== 'hand_over';
      const result = table.addPlayer(pid, nickname);
      if (!result.ok) {
        socket.emit('error_msg', result.error);
        return;
      }
      // Join mid-hand as sit-out until the next deal
      if (midHand) {
        const p = table.players.find((x) => x.id === pid);
        if (p) {
          p.folded = true;
          p.holeCards = [];
        }
      }
    }

    socket.join(`room:${table.code}`);
    socket.data.roomCode = table.code;
    socket.data.playerId = pid;
    socket.emit('joined', { code: table.code, playerId: pid });
    broadcastRoom(table);
  });

  socket.on('start_hand', () => {
    const table = getRoom(socket.data.roomCode);
    if (!table) return;
    const result = table.startHand(socket.data.playerId);
    if (!result.ok) {
      socket.emit('error_msg', result.error);
      return;
    }
    broadcastRoom(table);
  });

  socket.on('action', ({ action, raiseTo } = {}) => {
    const table = getRoom(socket.data.roomCode);
    if (!table) return;
    const result = table.playerAction(socket.data.playerId, action, raiseTo);
    if (!result.ok) {
      socket.emit('error_msg', result.error);
      return;
    }
    broadcastRoom(table);
  });

  socket.on('reveal_hand', ({ choice } = {}) => {
    const table = getRoom(socket.data.roomCode);
    if (!table) return;
    const result = table.revealHand(socket.data.playerId, choice);
    if (!result.ok) {
      socket.emit('error_msg', result.error);
      return;
    }
    broadcastRoom(table);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const pid = socket.data.playerId;
    if (!code || !pid) return;
    const table = getRoom(code);
    if (!table) return;

    // Another socket may already own this seat (rare); only mark off if still ours
    const stillHere = [...io.of('/').sockets.values()].some(
      (s) =>
        s.id !== socket.id &&
        s.data.playerId === pid &&
        s.data.roomCode === code
    );
    if (stillHere) return;

    table.setConnected(pid, false);
    const p = table.players.find((x) => x.id === pid);
    if (p) {
      table.message = `${p.nickname} bağlantısı koptu (yeniden bağlanma bekleniyor).`;
    }
    scheduleRemoval(table, pid);
    if (table.players.length === 0) {
      rooms.delete(code);
    } else {
      broadcastRoom(table);
    }
  });
});

// SPA fallback for /r/:code
app.get('/r/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, HOST, () => {
  console.log(`Poker Hold'em listening on http://${HOST}:${PORT}`);
  console.log(`Open http://localhost:${PORT} on this machine`);
});
