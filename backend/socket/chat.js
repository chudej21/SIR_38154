// Socket.io chat with groups, attached to the same HTTP server as the REST API.
// Groups stay until the server restarts (they are kept in memory, like the messages).
//
// Client -> server
//   room:create (name, ack)   create a group and join it
//   room:join   (name, ack)   switch to another group
//   chat:message (text)       send a message to the current group
// Server -> client
//   room:list    [{ name, online }]
//   room:joined  { room, history }
//   chat:message { room, user, text, time } or { room, system: true, text, time }
//   chat:online  number of connected users
const { Server } = require('socket.io');

const HISTORY_LIMIT = 50; // messages kept per group
const MAX_SAME_NAME = 1; // how many users may be online with the same nickname at once
const MAX_ROOMS = 30;
const DEFAULT_ROOM = 'General';

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);
const key = (s) => s.trim().toLowerCase();

function attachChat(httpServer, app) {
  // Allowed browser origins, comma separated. Default "*" = anyone.
  const origins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : '*';
  const io = new Server(httpServer, { cors: { origin: origins } });

  const rooms = new Map(); // key -> { name, history: [] }
  const names = new Map(); // nickname key -> number of connected users with that name
  rooms.set(key(DEFAULT_ROOM), { name: DEFAULT_ROOM, history: [] });

  const onlineIn = (roomName) => io.sockets.adapter.rooms.get(roomName)?.size ?? 0;

  function roomList() {
    return [...rooms.values()]
      .map((r) => ({ name: r.name, online: onlineIn(r.name) }))
      .sort((a, b) => (a.name === DEFAULT_ROOM ? -1 : b.name === DEFAULT_ROOM ? 1 : a.name.localeCompare(b.name)));
  }

  function broadcastRooms() {
    io.emit('room:list', roomList());
  }

  function post(room, message) {
    const r = rooms.get(key(room));
    if (!r) return;
    const full = { room: r.name, time: Date.now(), ...message };
    r.history.push(full);
    if (r.history.length > HISTORY_LIMIT) r.history.shift();
    io.to(r.name).emit('chat:message', full);
  }

  function leaveCurrent(socket) {
    const current = socket.data.room;
    if (!current) return;
    socket.leave(current);
    socket.data.room = null;
    post(current, { system: true, text: `${socket.data.name} left the group` });
  }

  function joinRoom(socket, roomName) {
    const r = rooms.get(key(roomName));
    if (!r) return { ok: false, error: 'This group does not exist anymore.' };
    if (socket.data.room === r.name) return { ok: true, room: r.name };
    leaveCurrent(socket);
    socket.join(r.name);
    socket.data.room = r.name;
    socket.emit('room:joined', { room: r.name, history: r.history });
    post(r.name, { system: true, text: `${socket.data.name} joined the group` });
    broadcastRooms();
    return { ok: true, room: r.name };
  }

  const isNameTaken = (name) => (names.get(key(name)) ?? 0) >= MAX_SAME_NAME;

  // Lets the frontend check a nickname before joining: GET /chat/name-available?name=Radek
  if (app) {
    app.get('/chat/name-available', (req, res) => {
      const name = String(req.query.name ?? '').trim().slice(0, 20);
      if (!name) return res.json({ available: false, error: 'Please enter a nickname.' });
      if (isNameTaken(name)) return res.json({ available: false, error: `The nickname "${name}" is already in the chat.` });
      res.json({ available: true });
    });
  }

  // Reject a connection when the nickname is already taken (also covers two people joining at the same moment)
  io.use((socket, next) => {
    const name = String(socket.handshake.auth?.username || '').trim().slice(0, 20);
    if (!name) return next(new Error('NAME_REQUIRED'));
    if (isNameTaken(name)) return next(new Error('NAME_TAKEN'));
    socket.data.name = name;
    next();
  });

  io.on('connection', (socket) => {
    const name = socket.data.name;
    names.set(key(name), (names.get(key(name)) ?? 0) + 1);
    log(`CONNECTED    ${name} (id ${socket.id}) - online: ${io.sockets.sockets.size}`);

    io.emit('chat:online', io.sockets.sockets.size);
    joinRoom(socket, DEFAULT_ROOM);

    socket.on('room:create', (raw, ack = () => {}) => {
      const roomName = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      if (roomName.length < 2) return ack({ ok: false, error: 'Group name must have at least 2 characters.' });
      if (rooms.has(key(roomName))) return ack({ ok: false, error: 'A group with this name already exists.' });
      if (rooms.size >= MAX_ROOMS) return ack({ ok: false, error: 'Too many groups, join an existing one.' });
      rooms.set(key(roomName), { name: roomName, history: [] });
      log(`ROOM CREATED ${roomName} by ${name}`);
      ack(joinRoom(socket, roomName));
    });

    socket.on('room:join', (roomName, ack = () => {}) => {
      ack(joinRoom(socket, String(roomName ?? '')));
    });

    socket.on('chat:message', (text) => {
      const clean = String(text ?? '').trim().slice(0, 500);
      if (!clean || !socket.data.room) return;
      log(`MESSAGE      [${socket.data.room}] ${name}: ${clean}`);
      post(socket.data.room, { id: socket.id, user: name, text: clean });
    });

    socket.on('disconnect', (reason) => {
      log(`DISCONNECTED ${name} (${reason}) - online: ${io.sockets.sockets.size}`);
      const left = (names.get(key(name)) ?? 1) - 1;
      if (left > 0) names.set(key(name), left);
      else names.delete(key(name));
      leaveCurrent(socket);
      io.emit('chat:online', io.sockets.sockets.size);
      broadcastRooms();
    });
  });

  return io;
}

module.exports = { attachChat };
