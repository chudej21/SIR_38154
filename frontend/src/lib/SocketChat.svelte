<script>
  import { onMount, tick } from 'svelte';
  import { io } from 'socket.io-client';

  let { onback } = $props();

  // The chat runs on the same server as the REST API (Render).
  // Override with VITE_SOCKET_URL (or VITE_API_URL) in frontend/.env.local for local development.
  const URL = (
    import.meta.env.VITE_SOCKET_URL ??
    import.meta.env.VITE_API_URL ??
    'https://restapi-backend-67yt.onrender.com'
  ).replace(/\/$/, '');

  const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  const key = (s) => String(s ?? '').trim().toLowerCase();

  // ---- Nickname / connection ----
  let username = $state('');
  let draftName = $state('');
  let nameError = $state('');
  let nameStatus = $state(''); // '', 'checking', 'free', 'taken'
  let joining = $state(false);
  let connected = $state(false);
  let connectError = $state('');
  let socket = null;

  // ---- Chat state ----
  let rooms = $state([]); // [{ id, type, name, owner, members, online }]
  let users = $state([]); // online nicknames
  let online = $state(0);
  let currentRoom = $state('');
  let messages = $state([]);
  let seen = $state({}); // nameKey -> { name, id }
  let unread = $state({}); // roomId -> count
  let typers = $state([]); // nicknames typing in the current room

  let text = $state('');
  let replyingTo = $state(null); // message
  let editingId = $state(null);
  let pickerFor = $state(null); // message id with the open reaction picker

  let newRoom = $state('');
  let roomError = $state('');
  let notice = $state('');

  let list = $state(); // bound <ul>, used for auto-scroll
  let input = $state(); // message input

  // ---- Derived values ----
  let room = $derived(rooms.find((r) => r.id === currentRoom));
  const otherMember = (r) => r?.members?.find((m) => key(m) !== key(username)) ?? '';
  const roomTitle = (r) => (r ? (r.type === 'dm' ? otherMember(r) : `# ${r.name}`) : '…');
  let groups = $derived(rooms.filter((r) => r.type === 'group'));
  let dms = $derived(rooms.filter((r) => r.type === 'dm'));
  let otherUsers = $derived(users.filter((u) => key(u) !== key(username)));
  const isOnline = (name) => users.some((u) => key(u) === key(name));
  const canDelete = (r) => r.type === 'dm' || (r.owner && key(r.owner) === key(username));

  // "Seen" under my last message
  let seenLabel = $derived.by(() => {
    const mine = [...messages].reverse().find((m) => !m.system && m.user === username);
    if (!mine || mine.id !== messages.at(-1)?.id) return '';
    const by = Object.values(seen)
      .filter((v) => key(v.name) !== key(username) && v.id >= mine.id)
      .map((v) => v.name);
    if (!by.length) return '';
    return room?.type === 'dm' ? 'Seen' : `Seen by ${by.join(', ')}`;
  });

  let typingLabel = $derived(
    typers.length === 0 ? '' : typers.length === 1 ? `${typers[0]} is typing…` : `${typers.slice(0, 2).join(' and ')} are typing…`
  );

  async function scrollDown() {
    await tick();
    if (list) list.scrollTop = list.scrollHeight;
  }

  // ---- Nickname check ----
  async function checkName(name) {
    try {
      const res = await fetch(`${URL}/chat/name-available?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!data.available) nameError = data.error ?? 'This nickname is not available.';
      return !!data.available;
    } catch {
      return null; // server not reachable (Render waking up)
    }
  }

  let checkTimer;
  function onNameInput() {
    clearTimeout(checkTimer);
    nameError = '';
    const name = draftName.trim();
    if (!name) return (nameStatus = '');
    nameStatus = 'checking';
    checkTimer = setTimeout(async () => {
      const ok = await checkName(name);
      if (draftName.trim() !== name) return; // user kept typing
      nameStatus = ok === true ? 'free' : ok === false ? 'taken' : '';
    }, 400);
  }

  // ---- Connect ----
  async function join() {
    const name = draftName.trim();
    if (!name || joining) return;
    nameError = '';
    connectError = '';
    joining = true;

    const ok = await checkName(name);
    if (ok === false) {
      nameStatus = 'taken';
      joining = false;
      return;
    }
    if (ok === null) connectError = 'Connecting to the chat server… The free Render server may be waking up (it can take up to a minute).';

    socket = io(URL, { auth: { username: name }, transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      username = name;
      connected = true;
      joining = false;
      connectError = '';
    });
    socket.on('disconnect', () => (connected = false));
    socket.on('connect_error', (e) => {
      connected = false;
      if (e.message === 'NAME_TAKEN' || e.message === 'NAME_REQUIRED') {
        socket.disconnect();
        socket = null;
        username = '';
        joining = false;
        nameStatus = 'taken';
        nameError = e.message === 'NAME_TAKEN' ? `The nickname "${name}" is already in the chat. Pick another one.` : 'Please enter a nickname.';
        return;
      }
      connectError = 'Connecting to the chat server… The free Render server may be waking up (it can take up to a minute).';
    });

    socket.on('room:list', (r) => (rooms = r));
    socket.on('users:list', (u) => (users = u));
    socket.on('chat:online', (n) => (online = n));

    socket.on('room:joined', ({ room: id, history, seen: s }) => {
      currentRoom = id;
      messages = history;
      seen = s;
      typers = [];
      unread[id] = 0;
      replyingTo = null;
      cancelEdit();
      markSeen();
      scrollDown();
    });

    socket.on('room:activity', ({ room: id }) => {
      if (id !== currentRoom) unread[id] = (unread[id] ?? 0) + 1;
    });

    socket.on('room:deleted', ({ room: id, name: roomName, by }) => {
      delete unread[id];
      if (id === currentRoom && key(by) !== key(username)) notice = `"${roomName}" was deleted by ${by}.`;
    });

    socket.on('chat:message', (m) => {
      if (m.room !== currentRoom) return;
      messages.push(m);
      typers = typers.filter((t) => t !== m.user);
      markSeen();
      scrollDown();
    });

    socket.on('msg:update', (m) => {
      if (m.room !== currentRoom) return;
      const i = messages.findIndex((x) => x.id === m.id);
      if (i !== -1) messages[i] = m;
    });

    socket.on('msg:removed', ({ room: id, id: msgId }) => {
      if (id !== currentRoom) return;
      messages = messages.filter((m) => m.id !== msgId);
      if (replyingTo?.id === msgId) replyingTo = null;
    });

    socket.on('room:seen', ({ room: id, user, id: msgId }) => {
      if (id === currentRoom) seen[key(user)] = { name: user, id: msgId };
    });

    const typingTimers = {};
    socket.on('typing', ({ room: id, user, isTyping }) => {
      if (id !== currentRoom || key(user) === key(username)) return;
      clearTimeout(typingTimers[user]);
      typers = typers.filter((t) => t !== user);
      if (isTyping) {
        typers = [...typers, user];
        typingTimers[user] = setTimeout(() => (typers = typers.filter((t) => t !== user)), 5000);
      }
    });
  }

  // Tell the server which message we have seen (only when the tab is visible)
  function markSeen() {
    const last = messages.at(-1);
    if (socket && last && document.visibilityState === 'visible') socket.emit('room:seen', last.id);
  }

  // ---- Typing indicator ----
  let typingSent = false;
  let typingTimer;
  function onMessageInput() {
    if (!connected || editingId) return;
    if (!typingSent) {
      socket.emit('typing', true);
      typingSent = true;
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 2500);
  }
  function stopTyping() {
    clearTimeout(typingTimer);
    if (typingSent) socket?.emit('typing', false);
    typingSent = false;
  }

  // ---- Sending / editing ----
  function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !connected) return;
    if (editingId) {
      socket.emit('msg:edit', { id: editingId, text: t }, (res) => {
        if (!res?.ok) notice = res?.error ?? 'Could not edit the message.';
      });
      cancelEdit();
      return;
    }
    socket.emit('chat:message', { text: t, replyTo: replyingTo?.id ?? null });
    text = '';
    replyingTo = null;
    stopTyping();
  }

  function startReply(m) {
    cancelEdit();
    replyingTo = m;
    pickerFor = null;
    input?.focus();
  }

  function startEdit(m) {
    replyingTo = null;
    editingId = m.id;
    text = m.text;
    pickerFor = null;
    input?.focus();
  }

  function cancelEdit() {
    if (editingId) text = '';
    editingId = null;
  }

  function unsend(m) {
    pickerFor = null;
    if (!confirm('Unsend this message for everyone?')) return;
    socket.emit('msg:unsend', { id: m.id }, (res) => {
      if (!res?.ok) notice = res?.error ?? 'Could not unsend the message.';
    });
  }

  function react(m, emoji) {
    pickerFor = null;
    socket.emit('msg:react', { id: m.id, emoji });
  }

  const myReaction = (m) => Object.entries(m.reactions ?? {}).find(([, who]) => who.includes(username))?.[0];
  const canEdit = (m) => m.user === username && Date.now() - m.time < EDIT_WINDOW_MS;

  function onKeydown(e) {
    if (e.key === 'Escape') {
      replyingTo = null;
      cancelEdit();
      pickerFor = null;
    }
  }

  // ---- Rooms ----
  function openRoom(id) {
    if (!connected || id === currentRoom) return;
    roomError = '';
    notice = '';
    stopTyping();
    socket.emit('room:join', id, (res) => {
      if (!res?.ok) roomError = res?.error ?? 'Could not open the chat.';
    });
  }

  function openDm(user) {
    if (!connected) return;
    roomError = '';
    notice = '';
    stopTyping();
    socket.emit('dm:open', user, (res) => {
      if (!res?.ok) roomError = res?.error ?? 'Could not open the chat.';
    });
  }

  function createRoom(e) {
    e.preventDefault();
    const name = newRoom.trim();
    if (!name || !connected) return;
    roomError = '';
    notice = '';
    socket.emit('room:create', name, (res) => {
      if (res?.ok) newRoom = '';
      else roomError = res?.error ?? 'Could not create the group.';
    });
  }

  function deleteRoom(r) {
    if (!connected) return;
    const what = r.type === 'dm' ? `your chat with ${otherMember(r)}` : `the group "${r.name}"`;
    if (!confirm(`Delete ${what}? All messages will be lost for everyone in it.`)) return;
    roomError = '';
    socket.emit('room:delete', r.id, (res) => {
      if (!res?.ok) roomError = res?.error ?? 'Could not delete the chat.';
    });
  }

  function leave() {
    socket?.disconnect();
    onback();
  }

  onMount(() => {
    const onVisible = () => markSeen();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      socket?.disconnect();
    };
  });

  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const reactionTitle = (who) => who.join(', ');
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Y2K / Frutiger Aero skin. All chat logic lives in the <script> above. -->
<main class="desk">
  <div class="sky" aria-hidden="true">
    <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
    {#if !username}<pre class="ghost">LOADING CHAT...
SYSTEM READY
INTERFACE.EXE
DATA_2026
CONNECTED</pre>{/if}
    <div class="floor"></div>
    <div class="floppy f1"><span class="shutter"></span><span class="label">CHAT<br /><i>disk 1</i></span></div>
    <div class="floppy f2"><span class="shutter"></span><span class="label">MSG<br /><i>disk 2</i></span></div>
  </div>

  {#if !username}
    <!-- Login dialog -->
    <form class="win dialog" onsubmit={(e) => { e.preventDefault(); join(); }}>
      <div class="titlebar">
        <span class="title">◉ LOGIN.EXE</span>
        <span class="wbtns">
          <button type="button" class="wbtn" aria-label="Minimize">_</button>
          <button type="button" class="wbtn" aria-label="Close" onclick={onback}>✕</button>
        </span>
      </div>
      <div class="dialog-body">
        <div class="dialog-row">
          <span class="folder" aria-hidden="true"></span>
          <div class="grow">
            <p class="dlg-text">Welcome to <b>Socket.io Chat</b>.<br />Choose a nickname to continue.</p>
            <label for="name" class="lbl">Nickname:</label>
            <input
              id="name"
              bind:value={draftName}
              oninput={onNameInput}
              maxlength="20"
              placeholder="e.g. Radek"
              class="field {nameStatus}"
            />
            <p class="hint">
              {#if nameStatus === 'checking'}Checking nickname…{:else if nameStatus === 'free'}✓ Nickname is available{:else}&nbsp;{/if}
            </p>
          </div>
        </div>

        {#if nameError}<p class="msgbox err">⚠ {nameError}</p>{/if}
        {#if connectError}<p class="msgbox warn">⌛ {connectError}</p>{/if}

        <div class="dialog-actions">
          <button type="submit" class="bevel primary" disabled={!draftName.trim() || nameStatus === 'taken' || joining}>
            {joining ? 'Joining…' : 'Start'}
          </button>
          <button type="button" class="bevel" onclick={onback}>Cancel</button>
        </div>
        <p class="server">Server: {URL}</p>
      </div>
    </form>
  {:else}
    <div class="app">
      <!-- Sidebar = media-player style pod -->
      <aside class="pod">
        <div class="pod-top">
          <span class="orb small" aria-hidden="true"></span>
          <span class="pod-title">CHAT PLAYER</span>
          <button type="button" class="wbtn" aria-label="Back" onclick={leave}>✕</button>
        </div>

        <div class="lcd mini">
          <span class="led {connected ? 'on' : 'off'}"></span>
          {connected ? 'ONLINE' : 'OFFLINE'} · {username}
        </div>

        {#snippet roomItem(r)}
          <li class="track-row">
            <button type="button" onclick={() => openRoom(r.id)} class="track {r.id === currentRoom ? 'active' : ''} {unread[r.id] ? 'bold' : ''}">
              {#if r.type === 'dm'}
                <span class="led {isOnline(otherMember(r)) ? 'on' : 'off'}"></span>
              {:else}
                <span class="hash">#</span>
              {/if}
              <span class="track-name">{r.type === 'dm' ? otherMember(r) : r.name}</span>
              {#if unread[r.id]}
                <span class="badge">{unread[r.id]}</span>
              {:else if r.type === 'group'}
                <span class="count">{r.online}</span>
              {/if}
            </button>
            {#if canDelete(r)}
              <button type="button" class="del" title="Delete" aria-label="Delete {roomTitle(r)}" onclick={() => deleteRoom(r)}>✕</button>
            {/if}
          </li>
        {/snippet}

        <section>
          <h2 class="sect">▸ GROUPS</h2>
          <ul class="tracks">
            {#each groups as r (r.id)}{@render roomItem(r)}{/each}
          </ul>
          <form class="newgroup" onsubmit={createRoom}>
            <input bind:value={newRoom} maxlength="30" placeholder="new group…" class="field small" />
            <button type="submit" class="gel-btn" disabled={!connected} aria-label="Create group">+</button>
          </form>
        </section>

        <section>
          <h2 class="sect">▸ MESSAGES</h2>
          {#if dms.length}
            <ul class="tracks">
              {#each dms as r (r.id)}{@render roomItem(r)}{/each}
            </ul>
          {:else}
            <p class="empty">Click a user below to send a private message.</p>
          {/if}
        </section>

        <section>
          <h2 class="sect">▸ ACTIVE NOW · {online}</h2>
          <ul class="tracks">
            {#each otherUsers as u (u)}
              <li>
                <button type="button" class="track" onclick={() => openDm(u)}>
                  <span class="led on"></span><span class="track-name">{u}</span>
                </button>
              </li>
            {:else}
              <li class="empty">Nobody else is online.</li>
            {/each}
          </ul>
        </section>

        {#if roomError}<p class="msgbox err small">⚠ {roomError}</p>{/if}
      </aside>

      <!-- Conversation window -->
      <section class="win convo">
        <div class="titlebar">
          <span class="title">◉ {room?.type === 'dm' ? `${otherMember(room)}.chat` : `${room?.name ?? '…'}.chat`}</span>
          <span class="wbtns">
            <button type="button" class="wbtn" aria-label="Minimize">_</button>
            <button type="button" class="wbtn" aria-label="Maximize">□</button>
            <button type="button" class="wbtn" aria-label="Close" onclick={leave}>✕</button>
          </span>
        </div>

        <!-- LCD status display -->
        <div class="lcd">
          <div class="lcd-row">
            <span>NOW CHATTING: <b>{roomTitle(room)}</b></span>
            <span>
              {#if room?.type === 'dm'}{isOnline(otherMember(room)) ? 'ACTIVE NOW' : 'OFFLINE'}{:else}{room?.online ?? 0} LISTENING{/if}
            </span>
          </div>
          <div class="lcd-row dim">
            <span class="marquee"><span>{typingLabel || (connected ? 'STATUS: READY' : 'STATUS: CONNECTING…')}</span></span>
            <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          </div>
        </div>

        {#if connectError}<p class="msgbox warn flat">⌛ {connectError}</p>{/if}
        {#if notice}
          <p class="msgbox flat">
            ℹ {notice}
            <button type="button" class="x" onclick={() => (notice = '')} aria-label="Close">✕</button>
          </p>
        {/if}

        <ul bind:this={list} class="screen">
          {#each messages as m (m.id)}
            {#if m.system}
              <li class="sys">— {m.text} —</li>
            {:else}
              {@const mine = m.user === username}
              {@const reactions = Object.entries(m.reactions ?? {})}
              <li class="msg {mine ? 'mine' : ''}">
                <span class="meta">{mine ? 'You' : m.user} · {time(m.time)}{m.edited ? ' · edited' : ''}</span>

                {#if m.replyTo}
                  <span class="quote">↩ {m.replyTo.user}: {m.replyTo.text}</span>
                {/if}

                <div class="bubble-row">
                  <span
                    role="button"
                    tabindex="0"
                    class="bubble"
                    onmousedown={(e) => e.detail > 1 && e.preventDefault()}
                    ondblclick={() => react(m, '❤️')}
                  >{m.text}</span>

                  <span class="actions {pickerFor === m.id ? 'show' : ''}">
                    <button type="button" class="chip" title="React" aria-label="React" onclick={() => (pickerFor = pickerFor === m.id ? null : m.id)}>☺</button>
                    <button type="button" class="chip" title="Reply" aria-label="Reply" onclick={() => startReply(m)}>↩</button>
                    {#if canEdit(m)}
                      <button type="button" class="chip" title="Edit" aria-label="Edit" onclick={() => startEdit(m)}>✎</button>
                    {/if}
                    {#if mine}
                      <button type="button" class="chip danger" title="Unsend" aria-label="Unsend" onclick={() => unsend(m)}>🗑</button>
                    {/if}
                  </span>

                  {#if pickerFor === m.id}
                    <span class="picker">
                      {#each REACTIONS as emoji}
                        <button type="button" class={myReaction(m) === emoji ? 'picked' : ''} onclick={() => react(m, emoji)}>{emoji}</button>
                      {/each}
                    </span>
                  {/if}
                </div>

                {#if reactions.length}
                  <span class="reacts">
                    {#each reactions as [emoji, who]}
                      <button type="button" title={reactionTitle(who)} onclick={() => react(m, emoji)}>{emoji}{who.length > 1 ? ` ${who.length}` : ''}</button>
                    {/each}
                  </span>
                {/if}
              </li>
            {/if}
          {:else}
            <li class="sys">No messages yet. Say hi 👋</li>
          {/each}

          {#if seenLabel}<li class="seen">{seenLabel}</li>{/if}
        </ul>

        {#if replyingTo || editingId}
          <div class="replybar">
            <span class="truncate">
              {#if editingId}✎ Editing message{:else}↩ Replying to <b>{replyingTo.user === username ? 'yourself' : replyingTo.user}</b>: {replyingTo.text}{/if}
            </span>
            <button type="button" class="x" onclick={() => { replyingTo = null; cancelEdit(); }} aria-label="Cancel">✕</button>
          </div>
        {/if}

        <form class="composer" onsubmit={send}>
          <input
            bind:this={input}
            bind:value={text}
            oninput={onMessageInput}
            maxlength="1000"
            placeholder={editingId ? 'Edit message…' : room?.type === 'dm' ? `Message ${otherMember(room)}…` : `Message ${roomTitle(room)}…`}
            class="field pill"
          />
          <button type="submit" class="orb send" disabled={!connected || !text.trim()} aria-label={editingId ? 'Save' : 'Send'}>
            {editingId ? '✓' : '▶'}
          </button>
        </form>
      </section>
    </div>
  {/if}
</main>

<style>
  /* ---------- Desktop / background ---------- */
  .desk {
    --chrome-1: #f7f9fc;
    --chrome-2: #c9d4e3;
    --chrome-edge: #7d8ca5;
    --aqua-1: #8fd0ff;
    --aqua-2: #1f6fe0;
    --ink: #13264a;
    --lcd-bg: #0a2530;
    --lcd-fg: #7cffd4;
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    padding: 48px 16px 80px;
    font-family: Tahoma, Verdana, 'Trebuchet MS', sans-serif;
    color: var(--ink);
    background: linear-gradient(180deg, #d9ecff 0%, #a9cdfb 45%, #e8f2ff 100%);
  }
  .sky { position: absolute; inset: 0; pointer-events: none; }
  .blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.7; }
  .b1 { width: 420px; height: 320px; left: -80px; top: 40px; background: #3a6df0; }
  .b2 { width: 360px; height: 360px; right: -60px; top: 160px; background: #5fb0ff; }
  .b3 { width: 300px; height: 220px; left: 40%; top: -60px; background: #ffffff; opacity: 0.9; }
  .ghost {
    position: absolute; right: 4%; top: 6%; margin: 0;
    font: 700 34px/1.15 'Courier New', monospace; letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.45); text-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
  }
  .floor {
    position: absolute; left: -20%; right: -20%; bottom: -40px; height: 260px;
    background: repeating-conic-gradient(#ffffff 0 25%, #b9d3f5 0 50%) 0 0 / 80px 80px;
    transform: perspective(500px) rotateX(62deg); transform-origin: bottom; opacity: 0.85;
  }
  .floppy {
    position: absolute; width: 92px; height: 96px; border-radius: 4px;
    background: linear-gradient(160deg, #3b4f86, #1e2d5c); box-shadow: 0 10px 25px rgba(16, 42, 100, 0.35);
  }
  .floppy .shutter { position: absolute; left: 24px; top: 0; width: 44px; height: 28px; background: linear-gradient(#e6ebf3, #a9b5c8); border-radius: 0 0 2px 2px; }
  .floppy .label {
    position: absolute; left: 10px; right: 10px; bottom: 8px; height: 46px; background: #f4f6fb; border-radius: 2px;
    font: 700 11px/1.2 'Comic Sans MS', 'Trebuchet MS', sans-serif; color: #1e2d5c; padding: 5px 6px;
  }
  .floppy .label i { font-weight: 400; font-size: 9px; }
  .f1 { right: 5%; bottom: 70px; transform: rotate(14deg); }
  .f2 { left: 3%; bottom: 120px; transform: rotate(-12deg); opacity: 0.9; }

  /* ---------- Window chrome ---------- */
  .win {
    position: relative;
    background: linear-gradient(180deg, var(--chrome-1), var(--chrome-2));
    border: 1px solid var(--chrome-edge);
    border-radius: 14px;
    box-shadow: inset 0 1px 0 #fff, inset 0 -2px 0 rgba(0, 0, 0, 0.08), 0 18px 40px rgba(20, 50, 110, 0.35);
    overflow: hidden;
  }
  .titlebar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 8px 6px 12px;
    background: linear-gradient(180deg, #7fb2ff 0%, #2d6be0 48%, #1a4fbe 52%, #3b7cf0 100%);
    color: #fff; font-weight: 700; font-size: 13px; letter-spacing: 0.5px;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.45);
  }
  .wbtns { display: flex; gap: 4px; }
  .wbtn {
    width: 22px; height: 20px; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 4px;
    background: linear-gradient(180deg, #9cc4ff, #3b72d8); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  }
  .wbtn:hover { background: linear-gradient(180deg, #ffb3a1, #d9452a); }

  /* ---------- Bevel buttons / fields ---------- */
  .bevel {
    min-width: 84px; padding: 4px 14px; font: 12px Tahoma, sans-serif; color: #111;
    background: linear-gradient(#fdfdfd, #dfe4ec); border: 1px solid #6e7a8e; border-radius: 3px;
    box-shadow: inset 1px 1px 0 #fff, inset -1px -1px 0 #a5afbf;
  }
  .bevel:active { box-shadow: inset 1px 1px 2px #8b95a6; }
  .bevel.primary { outline: 1px dotted #333; outline-offset: -4px; }
  .bevel:disabled { color: #8c95a3; }
  .field {
    width: 100%; padding: 6px 10px; font: 13px Tahoma, sans-serif; color: var(--ink);
    background: #fff; border: 1px solid #7f9db9; border-radius: 3px; box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.12);
    outline: none;
  }
  .field:focus { border-color: #2d6be0; box-shadow: 0 0 0 2px rgba(45, 107, 224, 0.25); }
  .field.taken { border-color: #d9452a; background: #fff4f2; }
  .field.free { border-color: #2ea44f; background: #f3fff6; }
  .field.small { padding: 4px 8px; font-size: 12px; }
  .field.pill { border-radius: 999px; padding: 9px 16px; }

  .msgbox { margin: 10px 0 0; padding: 6px 10px; font-size: 12px; border: 1px solid #b7c4d8; background: #fffbe6; border-radius: 3px; }
  .msgbox.err { background: #fff0ee; border-color: #e3a397; color: #8a1f0e; }
  .msgbox.warn { background: #fffbe6; border-color: #e6d08a; color: #6b5300; }
  .msgbox.flat { margin: 0; border-radius: 0; border-left: 0; border-right: 0; display: flex; justify-content: space-between; align-items: center; }
  .msgbox.small { font-size: 11px; }
  .x { color: #6e7a8e; font-size: 12px; margin-left: 10px; }

  /* ---------- Login dialog ---------- */
  .dialog { width: min(440px, 100%); margin: 8vh auto 0; }
  .dialog-body { padding: 16px; background: #ece9d8; }
  .dialog-row { display: flex; gap: 14px; }
  .grow { flex: 1; }
  .folder {
    flex: none; width: 44px; height: 34px; margin-top: 4px; border-radius: 3px;
    background: linear-gradient(#ffe48a, #f1b83a); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.1); position: relative;
  }
  .folder::before { content: ''; position: absolute; left: 0; top: -6px; width: 18px; height: 8px; background: #f1c95a; border-radius: 3px 3px 0 0; }
  .dlg-text { margin: 0 0 10px; font-size: 12px; line-height: 1.5; }
  .lbl { display: block; font-size: 12px; margin-bottom: 4px; }
  .hint { min-height: 16px; margin: 4px 0 0; font-size: 11px; color: #2e7d32; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .server { margin: 10px 0 0; font-size: 10px; color: #6e7a8e; }

  /* ---------- App layout ---------- */
  .app { position: relative; max-width: 1060px; margin: 0 auto; display: grid; gap: 18px; grid-template-columns: 270px 1fr; align-items: start; }
  @media (max-width: 760px) { .app { grid-template-columns: 1fr; } .ghost, .floppy { display: none; } }

  /* ---------- Media-player pod (sidebar) ---------- */
  .pod {
    padding: 14px 14px 18px;
    border-radius: 34px 34px 34px 60px;
    background: radial-gradient(120% 80% at 30% 0%, #ffffff 0%, #dbe7f6 40%, #9fb7d6 100%);
    border: 1px solid #7d8ca5;
    box-shadow: inset 0 2px 0 #fff, inset 0 -6px 12px rgba(40, 80, 140, 0.25), 0 18px 40px rgba(20, 50, 110, 0.35);
  }
  .pod-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .pod-title { flex: 1; font: 700 12px 'Trebuchet MS', sans-serif; letter-spacing: 2px; color: #24427a; }
  .sect { margin: 14px 4px 6px; font: 700 11px 'Trebuchet MS', sans-serif; letter-spacing: 1.5px; color: #33507f; }
  .tracks { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .track-row { display: flex; gap: 4px; }
  .track {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 6px 10px; text-align: left;
    font-size: 12.5px; color: var(--ink); border-radius: 999px; border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.55);
  }
  .track:hover { background: rgba(255, 255, 255, 0.9); border-color: #a9bedb; }
  .track.active {
    color: #fff; border-color: #1a4fbe;
    background: linear-gradient(180deg, var(--aqua-1), var(--aqua-2));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 2px 6px rgba(31, 111, 224, 0.4);
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
  }
  .track.bold .track-name { font-weight: 700; }
  .track-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hash { font-weight: 700; opacity: 0.7; }
  .count { font-size: 11px; opacity: 0.7; }
  .badge { min-width: 18px; padding: 0 5px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; text-align: center; background: linear-gradient(#ff8a7a, #d9302a); box-shadow: inset 0 1px 0 rgba(255,255,255,0.6); }
  .del { padding: 0 8px; border-radius: 999px; color: #6e7a8e; font-size: 11px; }
  .del:hover { color: #d9302a; background: rgba(255, 255, 255, 0.8); }
  .empty { margin: 0 6px; font-size: 11px; color: #4f6687; }
  .newgroup { display: flex; gap: 6px; margin-top: 8px; }

  .led { flex: none; width: 9px; height: 9px; border-radius: 50%; box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.7); }
  .led.on { background: radial-gradient(circle at 35% 35%, #c9ffc9, #1fbf3a); box-shadow: 0 0 6px #33e05a; }
  .led.off { background: radial-gradient(circle at 35% 35%, #ffd6d6, #b8322a); }

  /* ---------- Gel buttons ---------- */
  .gel-btn, .orb {
    display: grid; place-items: center; color: #fff; font-weight: 700; border: 1px solid #1a4fbe;
    background: radial-gradient(circle at 50% 25%, #d9efff 0%, #6fb6ff 35%, #1f6fe0 75%, #134aa8 100%);
    box-shadow: inset 0 2px 2px rgba(255, 255, 255, 0.8), 0 3px 8px rgba(31, 111, 224, 0.45);
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
  }
  .gel-btn { width: 30px; border-radius: 999px; font-size: 16px; }
  .orb { width: 46px; height: 46px; border-radius: 50%; font-size: 16px; }
  .orb.small { width: 20px; height: 20px; }
  .gel-btn:disabled, .orb:disabled { filter: grayscale(0.8); opacity: 0.6; }
  .orb:not(:disabled):hover, .gel-btn:not(:disabled):hover { filter: brightness(1.1); }

  /* ---------- LCD ---------- */
  .lcd {
    margin: 10px; padding: 8px 12px; border-radius: 10px;
    background: linear-gradient(180deg, #0f3341, var(--lcd-bg)); color: var(--lcd-fg);
    font: 12px/1.6 'Lucida Console', 'Courier New', monospace; letter-spacing: 0.5px;
    text-shadow: 0 0 6px rgba(124, 255, 212, 0.6);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6), 0 1px 0 #fff;
    border: 1px solid #5f7894;
  }
  .lcd.mini { margin: 0 0 4px; padding: 5px 10px; display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .lcd-row { display: flex; justify-content: space-between; gap: 12px; }
  .lcd-row.dim { opacity: 0.85; }
  .marquee { flex: 1; overflow: hidden; white-space: nowrap; }
  .marquee span { display: inline-block; padding-left: 100%; animation: scroll 9s linear infinite; }
  @keyframes scroll { to { transform: translateX(-100%); } }
  .eq { display: flex; align-items: flex-end; gap: 2px; height: 14px; }
  .eq i { width: 3px; background: var(--lcd-fg); animation: eq 1s ease-in-out infinite; }
  .eq i:nth-child(2) { animation-delay: 0.2s; } .eq i:nth-child(3) { animation-delay: 0.4s; }
  .eq i:nth-child(4) { animation-delay: 0.1s; } .eq i:nth-child(5) { animation-delay: 0.3s; }
  @keyframes eq { 0%, 100% { height: 3px; } 50% { height: 14px; } }

  /* ---------- Conversation ---------- */
  .convo { display: flex; flex-direction: column; }
  .screen {
    list-style: none; margin: 0 10px; padding: 14px; height: 26rem; overflow-y: auto;
    display: flex; flex-direction: column; gap: 12px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(232, 242, 255, 0.95));
    border: 1px solid #9fb2cc; border-radius: 10px; box-shadow: inset 0 2px 6px rgba(20, 50, 110, 0.15);
  }
  .sys { text-align: center; font-size: 11px; color: #6e86a8; font-style: italic; }
  .msg { display: flex; flex-direction: column; align-items: flex-start; }
  .msg.mine { align-items: flex-end; }
  .meta { font-size: 10.5px; color: #5d7598; margin: 0 6px 2px; }
  .quote {
    max-width: 75%; margin-bottom: 3px; padding: 3px 10px; font-size: 11px; color: #4b6283;
    background: rgba(200, 220, 245, 0.6); border-left: 3px solid #7fa6dc; border-radius: 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .bubble-row { position: relative; display: flex; align-items: center; gap: 6px; max-width: 80%; }
  .msg.mine .bubble-row { flex-direction: row-reverse; }
  .bubble {
    position: relative; padding: 8px 14px; font-size: 13px; line-height: 1.4; word-break: break-word;
    border-radius: 18px; color: var(--ink); cursor: default;
    background: linear-gradient(180deg, #ffffff 0%, #e3ecf7 55%, #cfdcee 100%);
    border: 1px solid #a3b6cf; box-shadow: 0 2px 4px rgba(20, 50, 110, 0.15);
  }
  .msg.mine .bubble {
    color: #fff; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3); border-color: #1a4fbe;
    background: linear-gradient(180deg, var(--aqua-1) 0%, #3f8ef0 50%, var(--aqua-2) 100%);
  }
  .bubble::before { /* glossy highlight */
    content: ''; position: absolute; left: 8px; right: 8px; top: 2px; height: 45%;
    border-radius: 14px 14px 10px 10px; background: linear-gradient(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0)); pointer-events: none;
  }
  .actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
  .msg:hover .actions, .actions.show, .actions:focus-within { opacity: 1; }
  .chip { width: 24px; height: 24px; border-radius: 50%; font-size: 12px; color: #33507f; background: linear-gradient(#fff, #d6e1f0); border: 1px solid #a3b6cf; }
  .chip.danger:hover { color: #d9302a; }
  .picker {
    position: absolute; top: -42px; z-index: 5; display: flex; gap: 2px; padding: 4px 8px; border-radius: 999px;
    background: linear-gradient(#ffffff, #d9e4f3); border: 1px solid #8ea3c2; box-shadow: 0 6px 16px rgba(20, 50, 110, 0.3);
  }
  .msg .picker { left: 0; } .msg.mine .picker { left: auto; right: 0; }
  .picker button { font-size: 18px; padding: 0 3px; border-radius: 999px; transition: transform 0.1s; }
  .picker button:hover { transform: scale(1.3); }
  .picker button.picked { background: #cfe2ff; }
  .reacts {
    margin-top: -4px; display: flex; gap: 4px; padding: 1px 7px; font-size: 11px; border-radius: 999px;
    background: linear-gradient(#fff, #e3ecf7); border: 1px solid #a3b6cf; box-shadow: 0 1px 2px rgba(20, 50, 110, 0.15);
  }
  .seen { text-align: right; font-size: 10.5px; color: #6e86a8; margin-top: -8px; }

  .replybar {
    display: flex; justify-content: space-between; align-items: center; margin: 8px 10px 0; padding: 5px 12px;
    font-size: 11.5px; color: #33507f; background: rgba(200, 220, 245, 0.7); border: 1px solid #a3b6cf; border-radius: 999px;
  }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .composer { display: flex; align-items: center; gap: 10px; padding: 10px 10px 12px; }
</style>
