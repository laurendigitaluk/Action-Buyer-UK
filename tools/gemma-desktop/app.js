const views = {
  chat: ['Chat with Gemma', 'Your local Gemma workspace'],
  research: ['Research Centre', 'Research jobs, findings and controls'],
  products: ['Product Knowledge Base', 'Canonical products and shared market knowledge'],
  evidence: ['Evidence', 'Sources, candidates and review'],
  memory: ['Shared Memory', 'Controlled ChatGPT ↔ Gemma memory exchange'],
  learning: ['Learning', 'Rules, lessons and research methodology'],
  tasks: ['Tasks & Controls', 'Local queue and Research PC controls'],
  activity: ['Activity', 'Local Gemma activity and history'],
  settings: ['Settings', 'Local connections and project links']
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}

function addMessage(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  wrap.innerHTML = `<div class="avatar">G</div><div><div class="message-name">${role === 'user' ? 'You' : 'Gemma'}</div><div class="bubble"></div></div>`;
  wrap.querySelector('.bubble').textContent = content;
  $('#chatMessages').appendChild(wrap);
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
}

function setChatBusy(busy) {
  $('#sendButton').disabled = busy;
  $('#chatInput').disabled = busy;
  $('#sendButton').textContent = busy ? 'Thinking…' : 'Send';
}

async function sendMessage(message) {
  const clean = String(message || '').trim();
  if (!clean || $('#sendButton').disabled) return;
  addMessage('user', clean);
  $('#chatInput').value = '';
  setChatBusy(true);
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: clean }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gemma request failed');
    addMessage('gemma', data.reply || '(Gemma returned an empty response.)');
  } catch (error) {
    addMessage('gemma', `I couldn't reach Ollama: ${error.message}`);
  } finally {
    setChatBusy(false);
  }
}

async function loadChatHistory() {
  try {
    const response = await fetch('/api/chat/history', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load chat history');
    const history = Array.isArray(data.history) ? data.history : [];
    if (!history.length) return;
    $('#chatMessages').innerHTML = '';
    history.forEach(item => addMessage(item.role === 'user' ? 'user' : 'gemma', item.content || ''));
  } catch (error) {
    console.warn(error);
  }
}

async function clearChat() {
  if (!confirm('Clear Gemma Desktop chat history? This does not delete Shared Memory.')) return;
  try {
    const response = await fetch('/api/chat/clear', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not clear history');
    $('#chatMessages').innerHTML = '<div class="message gemma"><div class="avatar">G</div><div><div class="message-name">Gemma</div><div class="bubble">Chat history cleared. Shared Memory has not been changed.</div></div></div>';
  } catch (error) {
    addMessage('gemma', `I couldn't clear the chat history: ${error.message}`);
  }
}

function showView(view) {
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $$('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  const meta = views[view] || views.chat;
  $('#pageTitle').textContent = meta[0];
  $('#pageSubtitle').textContent = meta[1];
  if (view === 'memory') loadMemory();
}

async function refreshStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    const data = await response.json();
    const online = data.ok;
    $('#ollamaDot').className = `dot ${online ? 'online' : ''}`;
    $('#ollamaStatus').textContent = online ? 'Online' : 'Offline';
    $('#modelLabel').textContent = `Model: ${data.model || 'unknown'}`;
    $('#modelSetting').value = data.model || '';
    $('#ollamaUrl').value = data.ollamaUrl || '';
    $('#memoryCount').textContent = `${data.memory?.count || 0} entries`;
    $('#memoryVersion').textContent = `v${data.memory?.version || 1}`;
    renderMemoryMeta(data.memory);
  } catch {
    $('#ollamaDot').className = 'dot';
    $('#ollamaStatus').textContent = 'Offline';
  }
}

function renderMemoryMeta(memory) {
  const updated = memory?.updated_at ? new Date(memory.updated_at).toLocaleString() : 'Not yet updated';
  $('#memoryUpdated').textContent = updated;
}

async function loadMemory() {
  const query = $('#memorySearch')?.value.trim() || '';
  try {
    const response = await fetch(`/api/memory${query ? `?q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not read local memory');
    renderMemory(data);
    renderMemoryMeta(data);
    $('#memoryCount').textContent = `${data.entries.length} shown`;
    $('#memoryVersion').textContent = `v${data.version || 1}`;
  } catch (error) {
    $('#memoryList').innerHTML = `<div class="empty-state">Could not read local memory: ${escapeHtml(error.message)}</div>`;
  }
}

function renderMemory(memory) {
  const entries = Array.isArray(memory?.entries) ? memory.entries : [];
  if (!entries.length) {
    $('#memoryList').innerHTML = '<div class="empty-state">No shared-memory entries yet. Add the first local memory entry below.</div>';
    return;
  }
  $('#memoryList').innerHTML = entries.map(entry => `
    <article class="memory-entry" data-memory-id="${escapeHtml(entry.id)}">
      <div class="memory-entry-head"><div><strong>${escapeHtml(entry.title || entry.type || 'Memory entry')}</strong><span class="memory-badge">${escapeHtml(entry.type || 'note')}</span><span class="memory-project">${escapeHtml(entry.project || 'shared')}</span></div><button class="danger-link memory-delete" data-id="${escapeHtml(entry.id)}">Delete</button></div>
      <p>${escapeHtml(entry.content || '')}</p>
      <small>${escapeHtml(entry.updated_at ? new Date(entry.updated_at).toLocaleString() : '')}${entry.pinned ? ' · Pinned' : ''}</small>
    </article>`).join('');
  $$('.memory-delete').forEach(button => button.addEventListener('click', () => deleteMemory(button.dataset.id)));
}

async function saveMemory() {
  const payload = {
    title: $('#memoryTitle').value,
    type: $('#memoryType').value,
    project: $('#memoryProject').value || 'shared',
    content: $('#memoryContent').value,
    pinned: $('#memoryPinned').checked,
    source: 'gemma-desktop'
  };
  if (!payload.title.trim() || !payload.content.trim()) return addMessage('gemma', 'A memory needs both a title and content.');
  $('#saveMemory').disabled = true;
  try {
    const response = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save memory');
    $('#memoryTitle').value = '';
    $('#memoryContent').value = '';
    $('#memoryPinned').checked = false;
    await loadMemory();
    await refreshStatus();
  } catch (error) {
    addMessage('gemma', `I couldn't save that memory: ${error.message}`);
  } finally {
    $('#saveMemory').disabled = false;
  }
}

async function deleteMemory(id) {
  if (!confirm('Delete this local Shared Memory entry?')) return;
  try {
    const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not delete memory');
    await loadMemory();
    await refreshStatus();
  } catch (error) {
    addMessage('gemma', `I couldn't delete that memory: ${error.message}`);
  }
}

$$('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('#chatForm').addEventListener('submit', event => { event.preventDefault(); sendMessage($('#chatInput').value); });
$('#chatInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage($('#chatInput').value); } });
$$('.quick').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
$('#refreshStatus').addEventListener('click', refreshStatus);
$('#reloadMemory').addEventListener('click', loadMemory);
$('#memorySearch').addEventListener('input', () => loadMemory());
$('#saveMemory').addEventListener('click', saveMemory);
$('#clearChat').addEventListener('click', clearChat);
$$('[data-local]').forEach(button => button.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: button.dataset.local }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not open local location');
  } catch (error) {
    addMessage('gemma', `I couldn't open that local location: ${error.message}`);
  }
}));

loadChatHistory();
refreshStatus();
