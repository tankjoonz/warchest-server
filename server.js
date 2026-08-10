// ARENA — minimal realtime relay server
//
// Mirrors the game's tiny key/value store across all connected players.
// Deploy anywhere that runs Node.js (Liara, ArvanCloud, ParsPack, a VPS...).
//
//   npm install
//   npm start
//
// The server keeps state in memory only, which is exactly what this game needs:
// if it restarts, the arena simply resets.

const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---- serve the game itself, so one deploy hosts everything ----
const server = http.createServer((req, res) => {
  let file = req.url.split('?')[0];
  if (file === '/' || file === '') file = '/index.html';
  const full = path.join(__dirname, 'public', path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(full).toLowerCase();
    const types = {
      '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
      '.json':'application/json', '.webmanifest':'application/manifest+json',
      '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
      '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp',
      '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

// roomId -> { state: {key: value}, clients: Set<ws> }
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { state: {}, clients: new Set() });
  return rooms.get(id);
}

function broadcast(room, payload, except) {
  const msg = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client !== except && client.readyState === 1) {
      try { client.send(msg); } catch (e) {}
    }
  }
}

wss.on('connection', (ws) => {
  ws.roomId = null;
  ws.ownedKeys = new Set();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    if (msg.t === 'join') {
      ws.roomId = String(msg.room || 'main').slice(0, 40);
      const room = getRoom(ws.roomId);
      room.clients.add(ws);
      // hand the newcomer the whole current world
      ws.send(JSON.stringify({ t: 'snapshot', state: room.state }));
      return;
    }

    if (!ws.roomId) return;
    const room = getRoom(ws.roomId);

    if (msg.t === 'set') {
      room.state[msg.key] = msg.value;
      // a client owns the keys it writes for itself, so we can clean them up
      if (msg.own) ws.ownedKeys.add(msg.key);
      broadcast(room, { t: 'set', key: msg.key, value: msg.value }, ws);
      return;
    }

    if (msg.t === 'del') {
      delete room.state[msg.key];
      ws.ownedKeys.delete(msg.key);
      broadcast(room, { t: 'del', key: msg.key }, ws);
      return;
    }
  });

  ws.on('close', () => {
    if (!ws.roomId) return;
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.clients.delete(ws);
    // remove this player from the arena so abandoned tanks don't linger
    for (const key of ws.ownedKeys) {
      delete room.state[key];
      broadcast(room, { t: 'del', key });
    }
    if (room.clients.size === 0) rooms.delete(ws.roomId);
  });
});

server.listen(PORT, () => {
  console.log('ARENA relay listening on port ' + PORT);
});