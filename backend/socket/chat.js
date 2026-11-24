// Socket.io chat, attached to the same HTTP server as the REST API.
// Same events as the standalone socket-server/: chat:history, chat:message, chat:online
const { Server } = require('socket.io');

const HISTORY_LIMIT = 50;

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

function systemMessage(text) {
  return { system: true, text, time: Date.now() };
}

function attachChat(httpServer) {
  // Allowed browser origins, comma separated. Default "*" = anyone.
  const origins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : '*';
  const io = new Server(httpServer, { cors: { origin: origins } });

  const history = []; // last messages, kept in memory (lost on restart)

  io.on('connection', (socket) => {
    // Name comes from the client (socket.io-client `auth` option)
    const name =
      String(socket.handshake.auth?.username || '').trim().slice(0, 20) || `guest-${socket.id.slice(0, 4)}`;
    socket.data.name = name;

    log(`CONNECTED    ${name} (id ${socket.id}) - online: ${io.sockets.sockets.size}`);

    // History only to the new client, announce the join to everyone
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

  return io;
}

module.exports = { attachChat };
