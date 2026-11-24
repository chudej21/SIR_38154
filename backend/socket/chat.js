// Socket.io chat with Instagram-like features, attached to the same HTTP server as the REST API.
// Everything is kept in memory: groups, private chats and messages disappear when the server restarts.
//
// Features: groups (create / delete by creator), private 1:1 chats (DMs), unique nicknames,
// typing indicator, "Seen", reactions, replies, editing (15 min) and unsending own messages,
// unread counters and an online users list.
//
// Client -> server
//   room:create (name, ack)          create a group and join it
//   room:join   (roomId, ack)        open a group or a private chat
//   room:delete (roomId, ack)        delete a group (creator) or a private chat (either member)
//   dm:open     (username, ack)      open (or create) a private chat with a user
//   chat:message ({ text, replyTo }) send a message to the current room
//   msg:react   ({ id, emoji })      react to a message (one reaction per user, same emoji again removes it)
//   msg:edit    ({ id, text }, ack)  edit an own message (max 15 minutes old)
//   msg:unsend  ({ id }, ack)        remove an own message for everyone
//   typing      (isTyping)           typing indicator for the current room
//   room:seen   (messageId)          last message the user has seen in the current room
// Server -> client
//   room:list    [{ id, type, name, owner, members, online }]  (only rooms this user can see)
//   room:joined  { room, history, seen }
//   room:deleted { room, name, by }
//   room:activity { room }            new message somewhere (for unread counters)
//   chat:message  message
//   msg:update    message             reaction / edit
//   msg:removed   { room, id }
//   typing        { room, user, isTyping }
//   room:seen     { room, user, id }
//   users:list    [names]             online users
//   chat:online   number of connected users
const { Server } = require('socket.io');

const HISTORY_LIMIT = 100; // messages kept per room
const MAX_SAME_NAME = 1; // how many users may be online with the same nickname at once
const MAX_GROUPS = 30;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
const DEFAULT_GROUP = 'General';

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);
const key = (s) => String(s).trim().toLowerCase();
const groupId = (name) => `g:${key(name)}`;
const dmId = (a, b) => `dm:${[key(a), key(b)].sort().join('|')}`;

function attachChat(httpServer, app) {
  // Allowed browser origins, comma separated. Default "*" = anyone.
  const origins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : '*';
  const io = new Server(httpServer, { cors: { origin: origins } });

  // id -> { id, type: 'group' | 'dm', name, owner, members: [names] (dm only), history: [], seen: { nameKey: { name, id } } }
  const rooms = new Map();
  const names = new Map(); // nickname key -> number of connected users with that name
  let nextMessageId = 1;

  rooms.set(groupId(DEFAULT_GROUP), {
    id: groupId(DEFAULT_GROUP), type: 'group', name: DEFAULT_GROUP, owner: null, members: null, history: [], seen: {},
  });

  const isNameTaken = (name) => (names.get(key(name)) ?? 0) >= MAX_SAME_NAME;
  const onlineIn = (id) => io.sockets.adapter.rooms.get(id)?.size ?? 0;
  const canSee = (room, name) => room.type === 'group' || room.members.some((m) => key(m) === key(name));
  const onlineNames = () => [...new Set([...io.sockets.sockets.values()].map((s) => s.data.name))].sort();

  function listFor(name) {
    return [...rooms.values()]
      .filter((r) => canSee(r, name))
      .map((r) => ({ id: r.id, type: r.type, name: r.name, owner: r.owner, members: r.members, online: onlineIn(r.id) }))
      .sort((a, b) => {
        if (a.id === groupId(DEFAULT_GROUP)) return -1;
        if (b.id === groupId(DEFAULT_GROUP)) return 1;
        if (a.type !== b.type) return a.type === 'group' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  function broadcastRooms() {
    for (const s of io.sockets.sockets.values()) s.emit('room:list', listFor(s.data.name));
  }

  function broadcastUsers() {
    io.emit('users:list', onlineNames());
    io.emit('chat:online', io.sockets.sockets.size);
  }

  // Emit to everyone who may see a room (everyone for groups, the two members for a private chat)
  function emitToAudience(room, event, data) {
    if (room.type === 'group') return io.emit(event, data);
    for (const s of io.sockets.sockets.values()) if (canSee(room, s.data.name)) s.emit(event, data);
  }

  function findMessage(room, id) {
    return room.history.find((m) => m.id === Number(id));
  }

  function post(room, message) {
    const full = { id: nextMessageId++, room: room.id, time: Date.now(), reactions: {}, ...message };
    room.history.push(full);
    if (room.history.length > HISTORY_LIMIT) room.history.shift();
    io.to(room.id).emit('chat:message', full);
    emitToAudience(room, 'room:activity', { room: room.id });
    return full;
  }

  function leaveCurrent(socket) {
    const current = socket.data.room;
    if (!current) return;
    socket.leave(current);
    socket.data.room = null;
    io.to(current).emit('typing', { room: current, user: socket.data.name, isTyping: false });
  }

  function joinRoom(socket, id) {
    const room = rooms.get(id);
    if (!room || !canSee(room, socket.data.name)) return { ok: false, error: 'This chat does not exist anymore.' };
    if (socket.data.room !== room.id) {
      leaveCurrent(socket);
      socket.join(room.id);
      socket.data.room = room.id;
    }
    socket.emit('room:joined', { room: room.id, history: room.history, seen: room.seen });
    broadcastRooms();
    return { ok: true, room: room.id };
  }

  function currentRoom(socket) {
    return socket.data.room ? rooms.get(socket.data.room) : null;
  }

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

    broadcastUsers();
    joinRoom(socket, groupId(DEFAULT_GROUP));

    // ---- Groups and private chats ----

    socket.on('room:create', (raw, ack = () => {}) => {
      const roomName = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      if (roomName.length < 2) return ack({ ok: false, error: 'Group name must have at least 2 characters.' });
      if (rooms.has(groupId(roomName))) return ack({ ok: false, error: 'A group with this name already exists.' });
      if ([...rooms.values()].filter((r) => r.type === 'group').length >= MAX_GROUPS)
        return ack({ ok: false, error: 'Too many groups, join an existing one.' });
      const room = { id: groupId(roomName), type: 'group', name: roomName, owner: name, members: null, history: [], seen: {} };
      rooms.set(room.id, room);
      log(`GROUP CREATED ${roomName} by ${name}`);
      post(room, { system: true, text: `${name} created the group` });
      ack(joinRoom(socket, room.id));
    });

    socket.on('room:join', (id, ack = () => {}) => ack(joinRoom(socket, String(id ?? ''))));

    socket.on('dm:open', (other, ack = () => {}) => {
      const otherName = onlineNames().find((n) => key(n) === key(other ?? ''));
      const id = otherName ? dmId(name, otherName) : null;
      if (!rooms.has(id ?? '')) {
        if (!otherName) return ack({ ok: false, error: 'This user is not online.' });
        if (key(otherName) === key(name)) return ack({ ok: false, error: 'You cannot message yourself.' });
        rooms.set(id, { id, type: 'dm', name: `${name} & ${otherName}`, owner: null, members: [name, otherName], history: [], seen: {} });
        log(`DM CREATED   ${name} <-> ${otherName}`);
      }
      ack(joinRoom(socket, id));
    });

    socket.on('room:delete', async (id, ack = () => {}) => {
      const room = rooms.get(String(id ?? ''));
      if (!room || !canSee(room, name)) return ack({ ok: false, error: 'This chat does not exist anymore.' });
      if (room.id === groupId(DEFAULT_GROUP)) return ack({ ok: false, error: 'This group cannot be deleted.' });
      if (room.type === 'group' && key(room.owner) !== key(name))
        return ack({ ok: false, error: 'Only the creator of the group can delete it.' });

      rooms.delete(room.id);
      log(`ROOM DELETED ${room.name} by ${name}`);
      emitToAudience(room, 'room:deleted', { room: room.id, name: room.name, by: name });

      // Move everyone who had it open back to the default group
      const members = await io.in(room.id).fetchSockets();
      for (const m of members) {
        const s = io.sockets.sockets.get(m.id);
        if (!s) continue;
        s.leave(room.id);
        s.data.room = null;
        joinRoom(s, groupId(DEFAULT_GROUP));
      }
      broadcastRooms();
      ack({ ok: true });
    });

    // ---- Messages ----

    socket.on('chat:message', (payload) => {
      const room = currentRoom(socket);
      if (!room) return;
      const data = typeof payload === 'string' ? { text: payload } : payload ?? {};
      const text = String(data.text ?? '').trim().slice(0, 1000);
      if (!text) return;
      const original = data.replyTo != null ? findMessage(room, data.replyTo) : null;
      const replyTo = original && !original.system ? { id: original.id, user: original.user, text: original.text.slice(0, 120) } : null;
      const message = post(room, { user: name, text, replyTo });
      room.seen[key(name)] = { name, id: message.id }; // the sender has seen their own message
      log(`MESSAGE      [${room.name}] ${name}: ${text}`);
    });

    socket.on('msg:react', ({ id, emoji } = {}) => {
      const room = currentRoom(socket);
      const msg = room && findMessage(room, id);
      if (!msg || msg.system || !REACTIONS.includes(emoji)) return;
      // One reaction per user: remove the previous one, same emoji again = remove
      const had = msg.reactions[emoji]?.includes(name);
      for (const e of Object.keys(msg.reactions)) {
        msg.reactions[e] = msg.reactions[e].filter((n) => n !== name);
        if (!msg.reactions[e].length) delete msg.reactions[e];
      }
      if (!had) msg.reactions[emoji] = [...(msg.reactions[emoji] ?? []), name];
      io.to(room.id).emit('msg:update', msg);
    });

    socket.on('msg:edit', ({ id, text } = {}, ack = () => {}) => {
      const room = currentRoom(socket);
      const msg = room && findMessage(room, id);
      if (!msg || msg.user !== name) return ack({ ok: false, error: 'You can only edit your own messages.' });
      if (Date.now() - msg.time > EDIT_WINDOW_MS) return ack({ ok: false, error: 'Messages can only be edited for 15 minutes.' });
      const clean = String(text ?? '').trim().slice(0, 1000);
      if (!clean) return ack({ ok: false, error: 'The message cannot be empty.' });
      msg.text = clean;
      msg.edited = true;
      io.to(room.id).emit('msg:update', msg);
      ack({ ok: true });
    });

    socket.on('msg:unsend', ({ id } = {}, ack = () => {}) => {
      const room = currentRoom(socket);
      const msg = room && findMessage(room, id);
      if (!msg || msg.user !== name) return ack({ ok: false, error: 'You can only unsend your own messages.' });
      room.history = room.history.filter((m) => m.id !== msg.id);
      io.to(room.id).emit('msg:removed', { room: room.id, id: msg.id });
      ack({ ok: true });
    });

    socket.on('typing', (isTyping) => {
      if (!socket.data.room) return;
      socket.to(socket.data.room).emit('typing', { room: socket.data.room, user: name, isTyping: !!isTyping });
    });

    socket.on('room:seen', (id) => {
      const room = currentRoom(socket);
      if (!room || !Number(id)) return;
      if ((room.seen[key(name)]?.id ?? 0) >= Number(id)) return;
      room.seen[key(name)] = { name, id: Number(id) };
      io.to(room.id).emit('room:seen', { room: room.id, user: name, id: Number(id) });
    });

    socket.on('disconnect', (reason) => {
      log(`DISCONNECTED ${name} (${reason}) - online: ${io.sockets.sockets.size}`);
      const left = (names.get(key(name)) ?? 1) - 1;
      if (left > 0) names.set(key(name), left);
      else names.delete(key(name));
      leaveCurrent(socket);
      broadcastUsers();
      broadcastRooms();
    });
  });

  return io;
}

module.exports = { attachChat, REACTIONS };
