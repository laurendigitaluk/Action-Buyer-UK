import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.GEMMA_DESKTOP_PORT || 3210);
const HOST = '127.0.0.1';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const DATA_DIR = path.join(__dirname, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'shared-memory.json');
const HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function defaultMemory() {
  return { version: 1, updated_at: null, entries: [] };
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function readMemory() {
  const memory = readJson(MEMORY_FILE, defaultMemory());
  if (!memory || !Array.isArray(memory.entries)) return defaultMemory();
  return { version: Number(memory.version || 1), updated_at: memory.updated_at || null, entries: memory.entries };
}

function writeMemory(memory) {
  memory.version = Math.max(1, Number(memory.version || 1));
  memory.updated_at = new Date().toISOString();
  writeJsonAtomic(MEMORY_FILE, memory);
}

if (!fs.existsSync(MEMORY_FILE)) writeJsonAtomic(MEMORY_FILE, defaultMemory());
if (!fs.existsSync(HISTORY_FILE)) writeJsonAtomic(HISTORY_FILE, []);

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value, max = 10000) {
  return String(value ?? '').trim().slice(0, max);
}

function normaliseEntry(input, existing = {}) {
  const allowedTypes = new Set(['fact', 'decision', 'instruction', 'project', 'research', 'learning', 'handover', 'note']);
  const type = cleanText(input.type || existing.type || 'note', 40).toLowerCase();
  return {
    id: existing.id || crypto.randomUUID(),
    type: allowedTypes.has(type) ? type : 'note',
    title: cleanText(input.title || existing.title, 200) || 'Untitled memory',
    content: cleanText(input.content ?? existing.content, 10000),
    project: cleanText(input.project ?? existing.project, 80) || 'shared',
    tags: Array.isArray(input.tags) ? input.tags.map(x => cleanText(x, 50)).filter(Boolean).slice(0, 20) : (Array.isArray(existing.tags) ? existing.tags : []),
    pinned: Boolean(input.pinned ?? existing.pinned),
    source: cleanText(input.source ?? existing.source, 120) || 'gemma-desktop',
    created_at: existing.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function memoryMatches(entry, query) {
  if (!query) return true;
  const haystack = [entry.title, entry.content, entry.project, ...(entry.tags || [])].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}

function selectMemoryContext(message) {
  const entries = readMemory().entries.filter(entry => entry.content);
  const terms = cleanText(message, 500).toLowerCase().split(/\s+/).filter(x => x.length > 2);
  const scored = entries.map(entry => {
    const haystack = [entry.title, entry.content, entry.project, ...(entry.tags || [])].join(' ').toLowerCase();
    let score = entry.pinned ? 3 : 0;
    for (const term of terms) if (haystack.includes(term)) score += 1;
    return { entry, score };
  });
  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.entry.updated_at) - new Date(a.entry.updated_at))
    .slice(0, 8)
    .map(x => x.entry);
}

async function ollamaTags() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

async function chat(message, history = []) {
  const relevantMemory = selectMemoryContext(message);
  const memoryBlock = relevantMemory.length
    ? `\n\nRelevant local shared memory (use as context, not as proof of external facts):\n${relevantMemory.map(x => `- [${x.type}] ${x.title}: ${x.content}`).join('\n')}`
    : '';
  const messages = [
    { role: 'system', content: `You are Gemma, Gary's local research assistant. Be concise, factual and transparent. You are running locally on this PC through Ollama. Do not claim to have searched the internet, changed databases, or completed actions unless a connected tool actually did so. Local shared memory is supplied by the desktop and may contain project notes or instructions; treat it as context and distinguish it from verified external evidence.${memoryBlock}` },
    ...history.slice(-20).map(x => ({ role: x.role, content: x.content })),
    { role: 'user', content: message }
  ];
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: false })
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const data = await response.json();
  return data?.message?.content || '';
}

function openLocal(target) {
  if (process.platform !== 'win32') return false;
  const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' });
  child.unref();
  return true;
}

function allowedLocalTarget(target) {
  return {
    agent: process.env.GEARCASHOUT_AGENT_DIR || null,
    gemma: path.join(__dirname),
    memory: MEMORY_FILE,
    data: DATA_DIR
  }[target];
}

const routes = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const tags = await ollamaTags();
      const memory = readMemory();
      const history = readJson(HISTORY_FILE, []);
      json(res, 200, { ok: !tags.error, model: MODEL, ollamaUrl: OLLAMA_URL, models: tags.models || [], memory: { version: memory.version, updated_at: memory.updated_at, count: memory.entries.length }, historyCount: history.length });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/memory') {
      const memory = readMemory();
      const query = cleanText(url.searchParams.get('q'), 200);
      const type = cleanText(url.searchParams.get('type'), 40).toLowerCase();
      const project = cleanText(url.searchParams.get('project'), 80).toLowerCase();
      const entries = memory.entries
        .filter(entry => memoryMatches(entry, query))
        .filter(entry => !type || entry.type === type)
        .filter(entry => !project || entry.project.toLowerCase() === project)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at) - new Date(a.updated_at));
      json(res, 200, { version: memory.version, updated_at: memory.updated_at, entries });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/memory') {
      const input = await body(req);
      const entry = normaliseEntry(input);
      if (!entry.content) return json(res, 400, { error: 'Memory content is required.' });
      const memory = readMemory();
      memory.entries.push(entry);
      writeMemory(memory);
      json(res, 201, { entry, version: memory.version, updated_at: memory.updated_at });
      return;
    }

    const memoryMatch = url.pathname.match(/^\/api\/memory\/([^/]+)$/);
    if (memoryMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      const id = decodeURIComponent(memoryMatch[1]);
      const memory = readMemory();
      const index = memory.entries.findIndex(entry => entry.id === id);
      if (index === -1) return json(res, 404, { error: 'Memory entry not found.' });
      if (req.method === 'DELETE') {
        memory.entries.splice(index, 1);
        writeMemory(memory);
        json(res, 200, { ok: true, version: memory.version, updated_at: memory.updated_at });
        return;
      }
      const input = await body(req);
      const entry = normaliseEntry(input, memory.entries[index]);
      if (!entry.content) return json(res, 400, { error: 'Memory content is required.' });
      memory.entries[index] = entry;
      writeMemory(memory);
      json(res, 200, { entry, version: memory.version, updated_at: memory.updated_at });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/chat/history') {
      json(res, 200, { history: readJson(HISTORY_FILE, []) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/clear') {
      writeJsonAtomic(HISTORY_FILE, []);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const input = await body(req);
      if (!cleanText(input.message)) return json(res, 400, { error: 'Message is required.' });
      const history = readJson(HISTORY_FILE, []);
      const message = cleanText(input.message);
      const reply = await chat(message, history);
      history.push({ role: 'user', content: message, at: new Date().toISOString() });
      history.push({ role: 'assistant', content: reply, at: new Date().toISOString() });
      writeJsonAtomic(HISTORY_FILE, history.slice(-200));
      json(res, 200, { reply, model: MODEL, memoryUsed: selectMemoryContext(message).map(x => x.id) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/open') {
      const input = await body(req);
      const target = allowedLocalTarget(input.target);
      if (!target) return json(res, 400, { error: input.target === 'agent' ? 'Research Agent folder is not configured yet.' : 'Unknown local target.' });
      if (!openLocal(target)) return json(res, 501, { error: 'Opening local folders is currently supported on Windows only.' });
      json(res, 200, { ok: true });
      return;
    }

    const staticRoute = routes[url.pathname];
    if (req.method === 'GET' && staticRoute) {
      const file = path.join(__dirname, staticRoute[0]);
      text(res, 200, fs.readFileSync(file, 'utf8'), staticRoute[1]);
      return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (error) {
    json(res, 500, { error: error.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Gemma Desktop listening at http://${HOST}:${PORT}`);
  console.log(`Ollama: ${OLLAMA_URL} | Model: ${MODEL}`);
});
