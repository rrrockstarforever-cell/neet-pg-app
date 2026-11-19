// AI Chat front end. Plain JS, no build step.
(() => {
  const STORE_KEY = 'ai-chat-v1';

  const $ = (id) => document.getElementById(id);
  const els = {
    sidebar: $('sidebar'),
    chatList: $('chatList'),
    newChat: $('newChat'),
    toggleSidebar: $('toggleSidebar'),
    provider: $('provider'),
    model: $('model'),
    modelList: $('modelList'),
    messages: $('messages'),
    composer: $('composer'),
    input: $('input'),
    send: $('send'),
    stop: $('stop'),
    openSettings: $('openSettings'),
    settingsDialog: $('settingsDialog'),
    systemPrompt: $('systemPrompt'),
    providerSettings: $('providerSettings'),
    clearAll: $('clearAll'),
  };

  let providers = [];
  let state = load();
  let busy = false;
  let controller = null;

  // ---------- Storage ----------
  function defaultState() {
    return {
      chats: [],
      activeId: null,
      provider: 'openai',
      models: {},      // providerId -> model name
      keys: {},        // providerId -> API key (browser only)
      baseUrls: {},    // providerId -> base URL override
      system: '',
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
    } catch {
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the app still works for this session.
    }
  }

  // ---------- Helpers ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const activeChat = () => state.chats.find((c) => c.id === state.activeId) || null;
  const providerInfo = (id) => providers.find((p) => p.id === id);

  function renderMarkdown(text) {
    if (window.marked && window.DOMPurify) {
      return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }));
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---------- Providers ----------
  async function loadProviders() {
    try {
      const res = await fetch('/api/providers');
      providers = await res.json();
    } catch {
      providers = [];
    }
    els.provider.innerHTML = '';
    for (const p of providers) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      els.provider.appendChild(opt);
    }
    if (!providers.some((p) => p.id === state.provider) && providers[0]) state.provider = providers[0].id;
    els.provider.value = state.provider;
    refreshModelControls();
  }

  function currentModel() {
    const p = providerInfo(state.provider);
    return state.models[state.provider] || (p && p.models[0]) || '';
  }

  function refreshModelControls() {
    const p = providerInfo(state.provider);
    els.model.value = currentModel();
    els.modelList.innerHTML = '';
    for (const m of p ? p.models : []) {
      const opt = document.createElement('option');
      opt.value = m;
      els.modelList.appendChild(opt);
    }
  }

  // ---------- Rendering ----------
  function renderChatList() {
    els.chatList.innerHTML = '';
    for (const chat of state.chats) {
      const item = document.createElement('div');
      item.className = 'chat-item' + (chat.id === state.activeId ? ' active' : '');
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = chat.title;
      const del = document.createElement('button');
      del.className = 'del';
      del.title = 'Delete chat';
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete this chat?')) return;
        state.chats = state.chats.filter((c) => c.id !== chat.id);
        if (state.activeId === chat.id) state.activeId = state.chats[0]?.id ?? null;
        save();
        renderAll();
      });
      item.append(title, del);
      item.addEventListener('click', () => {
        state.activeId = chat.id;
        save();
        renderAll();
        if (window.innerWidth <= 720) els.sidebar.classList.add('collapsed');
      });
      els.chatList.appendChild(item);
    }
  }

  function renderMessages() {
    els.messages.innerHTML = '';
    const chat = activeChat();
    if (!chat || chat.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<h1>How can I help?</h1><p>Pick a provider and model above, add your API key in Settings, then start typing.</p>';
      els.messages.appendChild(empty);
      return;
    }
    chat.messages.forEach((m, idx) => {
      const wrap = document.createElement('div');
      wrap.className = `msg ${m.role}`;
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      if (m.role === 'assistant') {
        bubble.innerHTML = renderMarkdown(m.content || '…');
      } else {
        bubble.textContent = m.content;
      }
      wrap.appendChild(bubble);

      if (m.role === 'assistant' && m.content) {
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = m.model ? `${m.model}` : '';
        const copy = document.createElement('button');
        copy.className = 'copy';
        copy.textContent = 'Copy';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(m.content);
            copy.textContent = 'Copied';
            setTimeout(() => (copy.textContent = 'Copy'), 1200);
          } catch {
            copy.textContent = 'Copy failed';
          }
        });
        meta.appendChild(copy);
        wrap.appendChild(meta);
      }
      wrap.dataset.idx = idx;
      els.messages.appendChild(wrap);
    });
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function renderAll() {
    renderChatList();
    renderMessages();
    els.send.disabled = busy;
    els.stop.classList.toggle('hidden', !busy);
    els.send.classList.toggle('hidden', busy);
  }

  // Updates only the last assistant bubble while streaming (avoids rebuilding the whole list).
  function updateStreaming(chat) {
    const last = els.messages.lastElementChild;
    const msg = chat.messages[chat.messages.length - 1];
    if (!last || !last.classList.contains('assistant')) {
      renderMessages();
      return;
    }
    last.querySelector('.bubble').innerHTML = renderMarkdown(msg.content || '…');
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // ---------- Sending ----------
  async function send() {
    const text = els.input.value.trim();
    if (!text || busy) return;

    let chat = activeChat();
    if (!chat) {
      chat = { id: uid(), title: 'New chat', messages: [] };
      state.chats.unshift(chat);
      state.activeId = chat.id;
    }

    const provider = state.provider;
    const model = (els.model.value || '').trim() || currentModel();
    if (!model) {
      alert('Enter a model name first.');
      return;
    }

    if (chat.messages.length === 0) chat.title = text.slice(0, 40);
    chat.messages.push({ role: 'user', content: text });
    const reply = { role: 'assistant', content: '', model: `${providerInfo(provider)?.label ?? provider} · ${model}` };
    chat.messages.push(reply);

    els.input.value = '';
    autosize();
    busy = true;
    controller = new AbortController();
    save();
    renderAll();

    const history = chat.messages.slice(0, -1).map(({ role, content }) => ({ role, content }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider,
          model,
          system: state.system,
          messages: history,
          apiKey: state.keys[provider] || '',
          baseUrl: state.baseUrls[provider] || '',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.content += decoder.decode(value, { stream: true });
        updateStreaming(chat);
      }
      reply.content += decoder.decode();
    } catch (err) {
      if (err.name === 'AbortError') {
        reply.content = reply.content ? reply.content + '\n\n*[Stopped]*' : '*[Stopped]*';
      } else {
        reply.content = `**Error:** ${err.message}`;
      }
    } finally {
      busy = false;
      controller = null;
      save();
      renderAll();
    }
  }

  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + 'px';
  }

  // ---------- Settings ----------
  function openSettings() {
    els.systemPrompt.value = state.system;
    els.providerSettings.innerHTML = '';
    for (const p of providers) {
      const card = document.createElement('div');
      card.className = 'provider-card';
      const serverNote = p.serverKeyConfigured ? ' (server key configured)' : '';
      card.innerHTML = `
        <h3>${p.label} ${p.serverKeyConfigured ? '<span class="badge">key set on server</span>' : ''}</h3>
        <label class="label">API key${p.needsKey ? '' : ' (not needed)'}${serverNote}
          <input type="password" autocomplete="off" data-kind="key" data-id="${p.id}"
                 value="${escapeAttr(state.keys[p.id] || '')}" placeholder="${p.needsKey ? 'Paste key here' : 'Not required'}" />
        </label>
        <label class="label">Base URL
          <input type="text" autocomplete="off" data-kind="base" data-id="${p.id}"
                 value="${escapeAttr(state.baseUrls[p.id] ?? '')}" placeholder="${escapeAttr(p.baseUrl || 'https://your-endpoint/v1')}" />
        </label>
        <label class="label wide">Default model
          <input type="text" autocomplete="off" data-kind="model" data-id="${p.id}"
                 value="${escapeAttr(state.models[p.id] || '')}" placeholder="${escapeAttr(p.models[0] || 'model name')}" />
        </label>`;
      els.providerSettings.appendChild(card);
    }
    els.settingsDialog.showModal();
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function saveSettings() {
    state.system = els.systemPrompt.value;
    els.providerSettings.querySelectorAll('input[data-id]').forEach((input) => {
      const { kind, id } = input.dataset;
      const value = input.value.trim();
      const map = { key: 'keys', base: 'baseUrls', model: 'models' }[kind];
      if (value) state[map][id] = value;
      else delete state[map][id];
    });
    save();
    refreshModelControls();
  }

  // ---------- Events ----------
  els.newChat.addEventListener('click', () => {
    state.activeId = null;
    save();
    renderAll();
    els.input.focus();
  });

  els.toggleSidebar.addEventListener('click', () => els.sidebar.classList.toggle('collapsed'));

  els.provider.addEventListener('change', () => {
    state.provider = els.provider.value;
    save();
    refreshModelControls();
  });

  els.model.addEventListener('change', () => {
    const value = els.model.value.trim();
    if (value) state.models[state.provider] = value;
    save();
  });

  els.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  els.input.addEventListener('input', autosize);

  els.stop.addEventListener('click', () => controller?.abort());

  els.openSettings.addEventListener('click', openSettings);
  els.settingsDialog.addEventListener('close', saveSettings);
  els.clearAll.addEventListener('click', () => {
    if (!confirm('Delete all chats? This cannot be undone.')) return;
    state.chats = [];
    state.activeId = null;
    save();
    renderAll();
  });

  // ---------- Start ----------
  loadProviders().then(renderAll);
})();
