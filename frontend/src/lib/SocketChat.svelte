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

  let username = $state('');
  let draftName = $state('');
  let nameError = $state('');
  let nameStatus = $state(''); // '', 'checking', 'free', 'taken'
  let joining = $state(false);
  let socket = null;

  let connected = $state(false);
  let connectError = $state('');
  let online = $state(0);

  let rooms = $state([]); // [{ name, online }]
  let currentRoom = $state('');
  let messages = $state([]);
  let text = $state('');

  let newRoom = $state('');
  let roomError = $state('');
  let roomNotice = $state('');

  const isMine = (r) => r.owner && username && r.owner.toLowerCase() === username.toLowerCase();

  let list; // bound <ul>, used for auto-scroll

  async function scrollDown() {
    await tick();
    if (list) list.scrollTop = list.scrollHeight;
  }

  // Ask the server whether a nickname is free. Returns true/false, or null when the server is not reachable.
  async function checkName(name) {
    try {
      const res = await fetch(`${URL}/chat/name-available?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      return data.available ? true : (nameError = data.error ?? 'This nickname is not available.', false);
    } catch {
      return null;
    }
  }

  // Live check while typing (waits until you stop typing for a moment)
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

  async function join() {
    const name = draftName.trim();
    if (!name || joining) return;
    nameError = '';
    connectError = '';
    joining = true;

    // Check the nickname first so a taken name never gets into the chat
    const ok = await checkName(name);
    if (ok === false) {
      nameStatus = 'taken';
      joining = false;
      return;
    }
    if (ok === null) {
      connectError = 'Connecting to the chat server… The free Render server may be waking up (it can take up to a minute).';
    }

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
        // Stop reconnecting and go back to the nickname form
        socket.disconnect();
        socket = null;
        username = '';
        joining = false;
        nameStatus = 'taken';
        nameError =
          e.message === 'NAME_TAKEN'
            ? `The nickname "${name}" is already in the chat. Pick another one.`
            : 'Please enter a nickname.';
        return;
      }
      connectError = 'Connecting to the chat server… The free Render server may be waking up (it can take up to a minute).';
    });

    socket.on('room:list', (r) => (rooms = r));
    socket.on('room:joined', ({ room, history }) => {
      currentRoom = room;
      messages = history;
      scrollDown();
    });
    socket.on('chat:message', (m) => {
      if (m.room !== currentRoom) return;
      messages.push(m);
      scrollDown();
    });
    socket.on('chat:online', (n) => (online = n));
    socket.on('room:deleted', ({ room, by }) => {
      if (room === currentRoom && by !== username) roomNotice = `The group "${room}" was deleted by ${by}.`;
    });
  }

  function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !connected) return;
    socket.emit('chat:message', t);
    text = '';
  }

  function switchRoom(name) {
    if (!connected || name === currentRoom) return;
    roomError = '';
    roomNotice = '';
    socket.emit('room:join', name, (res) => {
      if (!res?.ok) roomError = res?.error ?? 'Could not join the group.';
    });
  }

  function createRoom(e) {
    e.preventDefault();
    const name = newRoom.trim();
    if (!name || !connected) return;
    roomError = '';
    roomNotice = '';
    socket.emit('room:create', name, (res) => {
      if (res?.ok) newRoom = '';
      else roomError = res?.error ?? 'Could not create the group.';
    });
  }

  function deleteRoom(name) {
    if (!connected) return;
    if (!confirm(`Delete the group "${name}"? All its messages will be lost.`)) return;
    roomError = '';
    socket.emit('room:delete', name, (res) => {
      if (!res?.ok) roomError = res?.error ?? 'Could not delete the group.';
    });
  }

  function leave() {
    socket?.disconnect();
    onback();
  }

  // Close the connection when the page is left
  onMount(() => () => socket?.disconnect());

  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<main class="mx-auto max-w-4xl px-4 py-10">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-3xl font-bold text-slate-900">Socket.io chat</h1>
    <button type="button" onclick={leave} class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
      ← Back
    </button>
  </div>

  {#if !username}
    <form onsubmit={(e) => { e.preventDefault(); join(); }} class="mx-auto max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <label for="name" class="mb-2 block text-sm font-medium text-slate-700">Choose a nickname</label>
      <div class="flex gap-2">
        <input
          id="name"
          bind:value={draftName}
          oninput={onNameInput}
          maxlength="20"
          placeholder="e.g. Radek"
          class="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none {nameStatus === 'taken'
            ? 'border-red-400 focus:border-red-500'
            : nameStatus === 'free'
              ? 'border-green-400 focus:border-green-500'
              : 'border-slate-300 focus:border-indigo-500'}"
        />
        <button
          type="submit"
          disabled={!draftName.trim() || nameStatus === 'taken' || joining}
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {joining ? 'Joining…' : 'Join'}
        </button>
      </div>
      {#if nameStatus === 'checking'}
        <p class="mt-2 text-xs text-slate-500">Checking nickname…</p>
      {:else if nameStatus === 'free'}
        <p class="mt-2 text-xs text-green-700">✓ Nickname is available</p>
      {/if}
      {#if nameError}
        <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{nameError}</p>
      {/if}
      {#if connectError}
        <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{connectError}</p>
      {/if}
      <p class="mt-3 text-xs text-slate-500">Server: {URL}</p>
    </form>
  {:else}
    <div class="grid gap-4 md:grid-cols-[220px_1fr]">
      <!-- Groups -->
      <aside class="rounded-xl bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Groups</h2>
        <ul class="mb-4 space-y-1">
          {#each rooms as r}
            <li class="flex items-center gap-1">
              <button
                type="button"
                onclick={() => switchRoom(r.name)}
                class="flex min-w-0 flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-sm {r.name === currentRoom
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'}"
              >
                <span class="truncate"># {r.name}</span>
                <span class="ml-2 text-xs {r.name === currentRoom ? 'text-indigo-100' : 'text-slate-400'}">{r.online}</span>
              </button>
              {#if isMine(r)}
                <button
                  type="button"
                  onclick={() => deleteRoom(r.name)}
                  title="Delete group"
                  aria-label="Delete group {r.name}"
                  class="rounded-lg px-2 py-2 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              {/if}
            </li>
          {/each}
        </ul>

        <form onsubmit={createRoom} class="space-y-2">
          <input
            bind:value={newRoom}
            maxlength="30"
            placeholder="New group name"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button type="submit" disabled={!connected} class="w-full rounded-lg border border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
            + Create group
          </button>
        </form>
        {#if roomError}
          <p class="mt-2 text-xs text-red-700">{roomError}</p>
        {/if}
      </aside>

      <!-- Messages -->
      <div class="rounded-xl bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
          <span class="flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full {connected ? 'bg-green-500' : 'bg-red-500'}"></span>
            <span class="font-semibold text-slate-900"># {currentRoom || '…'}</span>
            <span class="text-slate-500">· {connected ? `you are ${username}` : 'disconnected'}</span>
          </span>
          <span class="text-slate-500">{online} online</span>
        </div>

        {#if connectError}
          <p class="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{connectError}</p>
        {/if}
        {#if roomNotice}
          <p class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            {roomNotice}
            <button type="button" onclick={() => (roomNotice = '')} class="ml-3 text-slate-400 hover:text-slate-600" aria-label="Close">✕</button>
          </p>
        {/if}

        <ul bind:this={list} class="h-96 space-y-2 overflow-y-auto px-4 py-4">
          {#each messages as m}
            {#if m.system}
              <li class="text-center text-xs text-slate-400">{m.text}</li>
            {:else}
              {@const mine = m.user === username}
              <li class="flex flex-col {mine ? 'items-end' : 'items-start'}">
                <span class="text-xs text-slate-500">{mine ? 'You' : m.user} · {time(m.time)}</span>
                <span class="max-w-[80%] break-words rounded-2xl px-3 py-2 text-sm {mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-900'}">{m.text}</span>
              </li>
            {/if}
          {:else}
            <li class="text-center text-sm text-slate-400">No messages in this group yet.</li>
          {/each}
        </ul>

        <form onsubmit={send} class="flex gap-2 border-t border-slate-200 p-3">
          <input
            bind:value={text}
            maxlength="500"
            placeholder="Message #{currentRoom}…"
            class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button type="submit" disabled={!connected} class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Send</button>
        </form>
      </div>
    </div>
  {/if}
</main>
