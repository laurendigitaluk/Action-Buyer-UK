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

function addMessage(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  wrap.innerHTML = `<div class="avatar">${role === 'user' ? 'G' : 'G'}</div><div><div class="message-name">${role === 'user' ? 'You' : 'Gemma'}</div><div class="bubble"></div></div>`;
  wrap.querySelector('.bubble').textContent = content;
  $('#chatMessages').appendChild(wrap);
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
}

async function sendMessage(message) {
  const clean = String(message || '').trim();
  if (!clean) return;
  addMessage('user', clean);
  $('#chatInput').value = '';
  $('#sendButton').disabled = true;
  $('#sendButton').textContent = 'Thinking…';
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: clean }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gemma request failed');
    addMessage('gemma', data.reply || '(Gemma returned an empty response.)');
  } catch (error) {
    addMessage('gemma', `I couldn't reach Ollama: ${error.message}`);
  } finally {
    $('#sendButton').disabled = false;
    $('#sendButton').textContent = 'Send';
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
    renderMemory(data.memory);
  } catch {
    $('#ollamaDot').className = 'dot';
    $('#ollamaStatus').textContent = 'Offline';
  }
}

async function loadMemory() {
  try {
    const response = await fetch('/api/memory', { cache: 'no-store' });
    renderMemory(await response.json());
  } catch (error) {
    $('#memoryList').innerHTML = `<div class="empty-state">Could not read local memory: ${error.message}</div>`;
  }
}

function renderMemory(memory) {
  const entries = Array.isArray(memory?.entries) ? memory.entries : [];
  if (!entries.length) {
    $('#memoryList').innerHTML = '<div class="empty-state">No shared-memory entries yet. The local memory store is ready for the next integration phase.</div>';
    return;
  }
  $('#memoryList').innerHTML = entries.map(entry => `<div class="memory-entry"><strong>${escapeHtml(entry.title || entry.type || 'Memory entry')}</strong><span>${escapeHtml(entry.content || '')}</span></div>`).join('');
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}

$$('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('#chatForm').addEventListener('submit', event => { event.preventDefault(); sendMessage($('#chatInput').value); });
$('#chatInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage($('#chatInput').value); } });
$$('.quick').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
$('#refreshStatus').addEventListener('click', refreshStatus);
$('#reloadMemory').addEventListener('click', loadMemory);
$$('[data-local]').forEach(button => button.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: button.dataset.local }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not open local location');
  } catch (error) {
    addMessage('gemma', `I couldn't open that local location: ${error.message}`);
  }
}));

refreshStatus();
