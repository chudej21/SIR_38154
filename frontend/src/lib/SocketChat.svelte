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
  let socket = null;

  let connected = $state(false);
  let connectError = $state('');
  let online = $state(0);
  let messages = $state([]);
  let text = $state('');
  let list; // bound <ul>, used for auto-scroll

  async function scrollDown() {
    await tick();
    if (list) list.scrollTop = list.scrollHeight;
  }

  function join() {
    const name = draftName.trim();
    if (!name) return;
    username = name;

    socket = io(URL, { auth: { username: name }, transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      connected = true;
      connectError = '';
    });
    socket.on('disconnect', () => (connected = false));
    socket.on('connect_error', (e) => {
      connected = false;
      connectError = 'Connecting to the chat server… The free Render server may be waking up (it can take up to a minute).';
    });

    socket.on('chat:history', (h) => {
      messages = h;
      scrollDown();
    });
    socket.on('chat:message', (m) => {
      messages.push(m);
      scrollDown();
    });
    socket.on('chat:online', (n) => (online = n));
  }

  function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !connected) return;
    socket.emit('chat:message', t);
    text = '';
  }

  function leave() {
    socket?.disconnect();
    onback();
  }

  // Close the connection when the page is left
  onMount(() => () => socket?.disconnect());

  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<main class="mx-auto max-w-2xl px-4 py-10">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-3xl font-bold text-slate-900">Socket.io chat</h1>
    <button type="button" onclick={leave} class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
      ← Back
    </button>
  </div>

  {#if !username}
    <form onsubmit={(e) => { e.preventDefault(); join(); }} class="rounded-xl bg-white p-6 shadow-sm">
      <label for="name" class="mb-2 block text-sm font-medium text-slate-700">Choose a nickname</label>
      <div class="flex gap-2">
        <input
          id="name"
          bind:value={draftName}
          maxlength="20"
          placeholder="e.g. Radek"
          class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button type="submit" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Join</button>
      </div>
      <p class="mt-3 text-xs text-slate-500">Server: {URL}</p>
    </form>
  {:else}
    <div class="rounded-xl bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
        <span class="flex items-center gap-2">
          <span class="inline-block h-2.5 w-2.5 rounded-full {connected ? 'bg-green-500' : 'bg-red-500'}"></span>
          {connected ? `Connected as ${username}` : 'Disconnected'}
        </span>
        <span class="text-slate-500">{online} online</span>
      </div>

      {#if connectError}
        <p class="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{connectError}</p>
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
          <li class="text-center text-sm text-slate-400">No messages yet.</li>
        {/each}
      </ul>

      <form onsubmit={send} class="flex gap-2 border-t border-slate-200 p-3">
        <input
          bind:value={text}
          maxlength="500"
          placeholder="Type a message…"
          class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button type="submit" disabled={!connected} class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Send</button>
      </form>
    </div>
  {/if}
</main>
