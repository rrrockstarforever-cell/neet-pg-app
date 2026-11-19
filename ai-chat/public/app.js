// AI Chat front end. Plain JS, no build step.
(() => {
  const STORE_KEY = 'ai-chat-v1';
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_TEXT_BYTES = 2 * 1024 * 1024;

  const $ = (id) => document.getElementById(id);
  const els = {
    sidebar: $('sidebar'),
    chatList: $('chatList'),
    chatSearch: $('chatSearch'),
    exportChat: $('exportChat'),
    projectList: $('projectList'),
    newChat: $('newChat'),
    newProject: $('newProject'),
    toggleSidebar: $('toggleSidebar'),
    provider: $('provider'),
    model: $('model'),
    modelList: $('modelList'),
    messages: $('messages'),
    composer: $('composer'),
    input: $('input'),
    send: $('send'),
    stop: $('stop'),
    attach: $('attach'),
    fileInput: $('fileInput'),
    attachments: $('attachments'),
    searchToggle: $('searchToggle'),
    mic: $('mic'),
    openSettings: $('openSettings'),
    settingsDialog: $('settingsDialog'),
    systemPrompt: $('systemPrompt'),
    searchKey: $('searchKey'),
    voiceLang: $('voiceLang'),
    providerSettings: $('providerSettings'),
    marketProvider: $('marketProvider'),
    avKey: $('avKey'),
    clearAll: $('clearAll'),
    projectDialog: $('projectDialog'),
    projectForm: $('projectForm'),
    projectTitle: $('projectTitle'),
    projectName: $('projectName'),
    projectInstructions: $('projectInstructions'),
    deleteProject: $('deleteProject'),
    cancelProject: $('cancelProject'),
  };

  let providers = [];
  let state = load();
  let busy = false;
  let controller = null;
  let pending = [];          // attachments waiting to be sent: {name, kind, dataUrl?, text?}
  let editingProjectId = null;
  let recognition = null;
  let listening = false;
  let warnedStorage = false;

  // ---------- Storage ----------
  function defaultState() {
    return {
      chats: [],
      activeId: null,
      projects: [],           // {id, name, instructions}
      activeProjectId: null,  // null = all chats
      provider: 'openai',
      models: {},             // providerId -> model name
      keys: {},               // providerId -> API key (browser only)
      baseUrls: {},           // providerId -> base URL override
      system: '',
      webSearch: false,
      searchKey: '',
      voiceLang: 'en-US',
      marketProvider: 'yahoo',
      alphaVantageKey: '',
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
      if (!warnedStorage) {
        warnedStorage = true;
        alert('Browser storage is full. Delete old chats or attachments to keep saving.');
      }
    }
  }

  // ---------- Helpers ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const activeChat = () => state.chats.find((c) => c.id === state.activeId) || null;
  const providerInfo = (id) => providers.find((p) => p.id === id);
  const projectById = (id) => state.projects.find((p) => p.id === id) || null;

  function renderMarkdown(text) {
    if (window.marked && window.DOMPurify) {
      return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }));
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function plainText(markdown) {
    const div = document.createElement('div');
    div.innerHTML = renderMarkdown(markdown);
    return div.textContent || '';
  }

  function readFile(file, mode) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      if (mode === 'dataUrl') reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
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
  function visibleChats() {
    let list = state.activeProjectId
      ? state.chats.filter((c) => c.projectId === state.activeProjectId)
      : state.chats;
    const q = (els.chatSearch.value || '').trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => (m.content || '').toLowerCase().includes(q)));
    }
    return list;
  }

  function renderProjects() {
    els.projectList.innerHTML = '';
    const makeRow = (label, id, onEdit) => {
      const row = document.createElement('div');
      row.className = 'chat-item' + (state.activeProjectId === id ? ' active' : '');
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = label;
      row.appendChild(title);
      if (onEdit) {
        const edit = document.createElement('button');
        edit.className = 'del';
        edit.title = 'Edit project';
        edit.textContent = '✎';
        edit.addEventListener('click', (e) => {
          e.stopPropagation();
          openProjectDialog(id);
        });
        row.appendChild(edit);
      }
      row.addEventListener('click', () => {
        state.activeProjectId = id;
        save();
        renderAll();
      });
      els.projectList.appendChild(row);
    };
    makeRow('All chats', null, null);
    for (const p of state.projects) makeRow(p.name, p.id, true);
  }

  function renderChatList() {
    els.chatList.innerHTML = '';
    for (const chat of visibleChats()) {
      const item = document.createElement('div');
      item.className = 'chat-item' + (chat.id === state.activeId ? ' active' : '');
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = chat.title;
      const rename = document.createElement('button');
      rename.className = 'del';
      rename.title = 'Rename chat';
      rename.textContent = '✎';
      rename.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = prompt('Rename chat', chat.title);
        if (!name || !name.trim()) return;
        chat.title = name.trim().slice(0, 80);
        save();
        renderAll();
      });
      const del = document.createElement('button');
      del.className = 'del';
      del.title = 'Delete chat';
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete this chat?')) return;
        state.chats = state.chats.filter((c) => c.id !== chat.id);
        if (state.activeId === chat.id) state.activeId = null;
        save();
        renderAll();
      });
      item.append(title, rename, del);
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
      const proj = projectById(state.activeProjectId);
      empty.innerHTML = `<h1>How can I help?</h1><p>${proj ? `Project: ${escapeHtml(proj.name)}. ` : ''}Pick a provider and model above, add your API key in Settings, then start typing.</p>`;
      els.messages.appendChild(empty);
      return;
    }
    chat.messages.forEach((m, index) => {
      const wrap = document.createElement('div');
      wrap.className = `msg ${m.role}`;

      if (m.role === 'user' && m.images && m.images.length) {
        const imgRow = document.createElement('div');
        imgRow.className = 'msg-images';
        for (const src of m.images) {
          const img = document.createElement('img');
          img.src = src;
          img.alt = 'Attached image';
          imgRow.appendChild(img);
        }
        wrap.appendChild(imgRow);
      }

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      if (m.role === 'assistant') bubble.innerHTML = renderMarkdown(m.content || '…');
      else bubble.textContent = m.content;
      wrap.appendChild(bubble);

      if (m.role === 'user' && !busy) {
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.appendChild(actionButton('Edit', () => editMessage(chat, index)));
        wrap.appendChild(meta);
      }

      if (m.role === 'assistant' && m.content) {
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = m.model || '';
        if (index === chat.messages.length - 1 && !busy) {
          meta.appendChild(actionButton('Regenerate', () => regenerate()));
        }
        meta.appendChild(actionButton('Copy', async (btn) => {
          try {
            await navigator.clipboard.writeText(m.content);
            btn.textContent = 'Copied';
          } catch {
            btn.textContent = 'Copy failed';
          }
          setTimeout(() => (btn.textContent = 'Copy'), 1200);
        }));
        meta.appendChild(actionButton('Read aloud', (btn) => toggleSpeak(m.content, btn)));
        wrap.appendChild(meta);
      }
      els.messages.appendChild(wrap);
    });
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function actionButton(label, onClick) {
    const b = document.createElement('button');
    b.className = 'copy';
    b.textContent = label;
    b.addEventListener('click', () => onClick(b));
    return b;
  }

  function renderAttachments() {
    els.attachments.innerHTML = '';
    pending.forEach((att, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      if (att.kind === 'image') {
        const img = document.createElement('img');
        img.src = att.dataUrl;
        img.alt = att.name;
        chip.appendChild(img);
      }
      const name = document.createElement('span');
      name.textContent = att.name;
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = 'Remove';
      x.addEventListener('click', () => {
        pending.splice(i, 1);
        renderAttachments();
      });
      chip.append(name, x);
      els.attachments.appendChild(chip);
    });
  }

  function renderSearchToggle() {
    els.searchToggle.classList.toggle('on', !!state.webSearch);
    els.searchToggle.setAttribute('aria-pressed', String(!!state.webSearch));
  }

  function renderAll() {
    renderProjects();
    renderChatList();
    renderMessages();
    renderAttachments();
    renderSearchToggle();
    els.send.disabled = busy;
    els.stop.classList.toggle('hidden', !busy);
    els.send.classList.toggle('hidden', busy);
  }

  // Updates only the last assistant bubble while streaming.
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

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- Attachments ----------
  async function addFiles(fileList) {
    for (const file of fileList) {
      try {
        if (file.type.startsWith('image/')) {
          if (file.size > MAX_IMAGE_BYTES) {
            alert(`${file.name} is larger than 8 MB and was skipped.`);
            continue;
          }
          const dataUrl = await readFile(file, 'dataUrl');
          pending.push({ name: file.name, kind: 'image', dataUrl });
        } else {
          if (file.size > MAX_TEXT_BYTES) {
            alert(`${file.name} is larger than 2 MB and was skipped.`);
            continue;
          }
          const text = await readFile(file, 'text');
          pending.push({ name: file.name, kind: 'text', text });
        }
      } catch {
        alert(`Could not read ${file.name}.`);
      }
    }
    renderAttachments();
  }

  // Builds the message text: the typed text plus any text file contents.
  function buildUserMessage(text) {
    const images = pending.filter((a) => a.kind === 'image').map((a) => a.dataUrl);
    const texts = pending.filter((a) => a.kind === 'text');
    let content = text;
    for (const t of texts) {
      content += `\n\n--- File: ${t.name} ---\n${t.text}`;
    }
    const files = texts.map((t) => ({ name: t.name, text: t.text }));
    return { role: 'user', content: content.trim(), images, text, files };
  }

  // ---------- Voice ----------
  function setupVoice() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      els.mic.disabled = true;
      els.mic.title = 'Voice input is not supported in this browser';
      return;
    }
    recognition = new Rec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      els.input.value = (els.input.value ? els.input.value + ' ' : '') + transcript.trim();
      autosize();
    };
    recognition.onend = () => {
      listening = false;
      els.mic.classList.remove('on');
    };
    recognition.onerror = () => {
      listening = false;
      els.mic.classList.remove('on');
    };
  }

  function toggleMic() {
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      return;
    }
    recognition.lang = state.voiceLang || 'en-US';
    try {
      recognition.start();
      listening = true;
      els.mic.classList.add('on');
    } catch {
      listening = false;
    }
  }

  let speakingBtn = null;
  function toggleSpeak(markdown, btn) {
    if (!('speechSynthesis' in window)) {
      alert('Read aloud is not supported in this browser.');
      return;
    }
    if (speakingBtn === btn) {
      window.speechSynthesis.cancel();
      speakingBtn = null;
      btn.textContent = 'Read aloud';
      return;
    }
    window.speechSynthesis.cancel();
    if (speakingBtn) speakingBtn.textContent = 'Read aloud';
    const utter = new SpeechSynthesisUtterance(plainText(markdown));
    utter.lang = state.voiceLang || 'en-US';
    utter.onend = () => {
      speakingBtn = null;
      btn.textContent = 'Read aloud';
    };
    speakingBtn = btn;
    btn.textContent = 'Stop reading';
    window.speechSynthesis.speak(utter);
  }

  // ---------- Sending ----------
  function selectedModel() {
    return (els.model.value || '').trim() || currentModel();
  }

  async function send() {
    const text = els.input.value.trim();
    if ((!text && pending.length === 0) || busy) return;
    if (!selectedModel()) {
      alert('Enter a model name first.');
      return;
    }

    let chat = activeChat();
    if (!chat) {
      chat = { id: uid(), title: 'New chat', messages: [], projectId: state.activeProjectId };
      state.chats.unshift(chat);
      state.activeId = chat.id;
    }

    const userMsg = buildUserMessage(text);
    const attachedNames = pending.map((a) => a.name);
    if (chat.messages.length === 0) chat.title = (text || attachedNames[0] || 'New chat').slice(0, 40);
    chat.messages.push(userMsg);

    pending = [];
    els.input.value = '';
    autosize();
    await generate(chat);
  }

  // Streams a new reply into the chat. The last message must be the user's.
  async function generate(chat) {
    const provider = state.provider;
    const model = selectedModel();
    const reply = { role: 'assistant', content: '', model: `${providerInfo(provider)?.label ?? provider} · ${model}` };
    chat.messages.push(reply);

    busy = true;
    controller = new AbortController();
    save();
    renderAll();

    const history = chat.messages.slice(0, -1).map(({ role, content, images }) => ({ role, content, images: images || [] }));
    const project = projectById(chat.projectId);
    const systemParts = [state.system, project?.instructions].filter((s) => s && s.trim());

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider,
          model,
          system: systemParts.join('\n\n'),
          messages: history,
          apiKey: state.keys[provider] || '',
          baseUrl: state.baseUrls[provider] || '',
          webSearch: !!state.webSearch,
          searchKey: state.searchKey || '',
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

  // Re-runs the last user message and replaces the last reply.
  async function regenerate() {
    const chat = activeChat();
    if (busy || !chat) return;
    if (chat.messages.at(-1)?.role === 'assistant') chat.messages.pop();
    if (chat.messages.at(-1)?.role !== 'user') return;
    if (!selectedModel()) {
      alert('Enter a model name first.');
      return;
    }
    await generate(chat);
  }

  // Puts a sent message back in the composer and drops it and everything after it.
  function editMessage(chat, index) {
    if (busy) return;
    if (index < chat.messages.length - 1 && !confirm('Editing this message removes the replies after it. Continue?')) return;
    const m = chat.messages[index];
    chat.messages = chat.messages.slice(0, index);
    pending = [
      ...(m.images || []).map((dataUrl, i) => ({ name: `image-${i + 1}`, kind: 'image', dataUrl })),
      ...(m.files || []).map((f) => ({ name: f.name, kind: 'text', text: f.text })),
    ];
    els.input.value = m.text ?? m.content;
    save();
    renderAll();
    autosize();
    els.input.focus();
  }

  function exportChat() {
    const chat = activeChat();
    if (!chat || chat.messages.length === 0) {
      alert('Nothing to export yet.');
      return;
    }
    const lines = [`# ${chat.title}`, ''];
    for (const m of chat.messages) {
      if (m.role === 'user') lines.push('## You', '', m.content, '');
      else lines.push(`## Assistant${m.model ? ` (${m.model})` : ''}`, '', m.content, '');
    }
    const slug = chat.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'chat';
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + 'px';
  }

  // ---------- Projects ----------
  function openProjectDialog(id) {
    editingProjectId = id;
    const p = projectById(id);
    els.projectTitle.textContent = p ? 'Edit project' : 'New project';
    els.projectName.value = p ? p.name : '';
    els.projectInstructions.value = p ? p.instructions : '';
    els.deleteProject.classList.toggle('hidden', !p);
    els.projectDialog.showModal();
  }

  els.projectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.projectName.value.trim();
    if (!name) return;
    const instructions = els.projectInstructions.value.trim();
    const existing = projectById(editingProjectId);
    if (existing) {
      existing.name = name;
      existing.instructions = instructions;
    } else {
      const project = { id: uid(), name, instructions };
      state.projects.push(project);
      state.activeProjectId = project.id;
    }
    els.projectDialog.close();
    save();
    renderAll();
  });

  els.deleteProject.addEventListener('click', () => {
    const p = projectById(editingProjectId);
    if (!p || !confirm(`Delete project "${p.name}"? Its chats will be kept in All chats.`)) return;
    state.projects = state.projects.filter((x) => x.id !== p.id);
    state.chats.forEach((c) => {
      if (c.projectId === p.id) c.projectId = null;
    });
    if (state.activeProjectId === p.id) state.activeProjectId = null;
    els.projectDialog.close();
    save();
    renderAll();
  });

  els.cancelProject.addEventListener('click', () => els.projectDialog.close());
  els.newProject.addEventListener('click', () => openProjectDialog(null));

  // ---------- Settings ----------
  function openSettings() {
    els.systemPrompt.value = state.system;
    els.searchKey.value = state.searchKey || '';
    els.voiceLang.value = state.voiceLang || 'en-US';
    els.marketProvider.value = state.marketProvider || 'yahoo';
    els.avKey.value = state.alphaVantageKey || '';
    els.providerSettings.innerHTML = '';
    for (const p of providers) {
      const card = document.createElement('div');
      card.className = 'provider-card';
      const serverNote = p.serverKeyConfigured ? ' (server key configured)' : '';
      card.innerHTML = `
        <h3>${escapeHtml(p.label)} ${p.serverKeyConfigured ? '<span class="badge">key set on server</span>' : ''}</h3>
        <label class="label">API key${p.needsKey ? '' : ' (not needed)'}${serverNote}
          <input type="password" autocomplete="off" data-kind="key" data-id="${p.id}"
                 value="${escapeHtml(state.keys[p.id] || '')}" placeholder="${p.needsKey ? 'Paste key here' : 'Not required'}" />
        </label>
        <label class="label">Base URL
          <input type="text" autocomplete="off" data-kind="base" data-id="${p.id}"
                 value="${escapeHtml(state.baseUrls[p.id] ?? '')}" placeholder="${escapeHtml(p.baseUrl || 'https://your-endpoint/v1')}" />
        </label>
        <label class="label wide">Default model
          <input type="text" autocomplete="off" data-kind="model" data-id="${p.id}"
                 value="${escapeHtml(state.models[p.id] || '')}" placeholder="${escapeHtml(p.models[0] || 'model name')}" />
        </label>`;
      els.providerSettings.appendChild(card);
    }
    els.settingsDialog.showModal();
  }

  function saveSettings() {
    state.system = els.systemPrompt.value;
    state.searchKey = els.searchKey.value.trim();
    state.voiceLang = els.voiceLang.value.trim() || 'en-US';
    state.marketProvider = els.marketProvider.value || 'yahoo';
    state.alphaVantageKey = els.avKey.value.trim();
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

  els.attach.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', async () => {
    await addFiles(els.fileInput.files);
    els.fileInput.value = '';
  });

  els.searchToggle.addEventListener('click', () => {
    if (!state.webSearch && !state.searchKey) {
      alert('Add a Brave Search API key in Settings first (or set BRAVE_API_KEY on the server).');
      openSettings();
      return;
    }
    state.webSearch = !state.webSearch;
    save();
    renderSearchToggle();
  });

  els.mic.addEventListener('click', toggleMic);

  els.chatSearch.addEventListener('input', renderChatList);
  els.exportChat.addEventListener('click', exportChat);

  // Keyboard shortcuts: Ctrl/Cmd+K new chat, Esc stops a running reply.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      els.newChat.click();
    } else if (e.key === 'Escape' && busy) {
      controller?.abort();
    }
  });

  els.openSettings.addEventListener('click', openSettings);
  els.settingsDialog.addEventListener('close', saveSettings);
  els.clearAll.addEventListener('click', () => {
    if (!confirm('Delete all chats? This cannot be undone.')) return;
    state.chats = [];
    state.activeId = null;
    save();
    renderAll();
  });

  // Drag and drop files onto the composer.
  els.composer.addEventListener('dragover', (e) => e.preventDefault());
  els.composer.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files).then(renderAttachments);
  });

  // ---------- Hook for the Markets tab ----------
  window.aiChat = {
    getState: () => state,
    // Puts text in the composer and sends it as a normal chat message.
    ask(text) {
      els.input.value = text;
      send();
    },
    setMarketSettings(provider, key) {
      state.marketProvider = provider;
      state.alphaVantageKey = key;
      save();
    },
  };

  // ---------- Start ----------
  setupVoice();
  loadProviders().then(renderAll);
})();
