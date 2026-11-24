import { createServer } from 'node:http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 4000;
// Allowed browser origins, comma separated. Default "*" = anyone (fine for a school project).
const ORIGINS = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : '*';
const HISTORY_LIMIT = 50;

// Plain HTTP server: only answers a health check, Socket.io attaches to it
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Socket.io server is running');
});

const io = new Server(httpServer, { cors: { origin: ORIGINS } });

const history = []; // last messages, kept in memory (lost on restart)

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

function systemMessage(text) {
  return { system: true, text, time: Date.now() };
}

io.on('connection', (socket) => {
  // Name comes from the client (socket.io-client `auth` option)
  const name = String(socket.handshake.auth?.username || '').trim().slice(0, 20) || `guest-${socket.id.slice(0, 4)}`;
  socket.data.name = name;

  log(`CONNECTED    ${name} (id ${socket.id}, ip ${socket.handshake.address}) - online: ${io.sockets.sockets.size}`);

  // Send the history only to the new client, announce the join to everyone
  socket.emit('chat:history', history);
  const joined = systemMessage(`${name} joined the chat`);
  history.push(joined);
  io.emit('chat:message', joined);
  io.emit('chat:online', io.sockets.sockets.size);

  socket.on('chat:message', (text) => {
    const clean = String(text ?? '').trim().slice(0, 500);
    if (!clean) return;
    const message = { id: socket.id, user: name, text: clean, time: Date.now() };
    history.push(message);
    if (history.length > HISTORY_LIMIT) history.shift();
    log(`MESSAGE      ${name}: ${clean}`);
    io.emit('chat:message', message);
  });

  socket.on('disconnect', (reason) => {
    log(`DISCONNECTED ${name} (${reason}) - online: ${io.sockets.sockets.size}`);
    const left = systemMessage(`${name} left the chat`);
    history.push(left);
    io.emit('chat:message', left);
    io.emit('chat:online', io.sockets.sockets.size);
  });
});

httpServer.listen(PORT, () => log(`Socket.io server listening on http://localhost:${PORT}`));
