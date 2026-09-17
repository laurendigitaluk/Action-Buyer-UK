import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.GEMMA_DESKTOP_PORT || 3210);
const HOST = '127.0.0.1';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const DATA_DIR = path.join(__dirname, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'shared-memory.json');
const HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

if (!fs.existsSync(MEMORY_FILE)) writeJson(MEMORY_FILE, { version: 0, entries: [] });
if (!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);

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
  const messages = [
    { role: 'system', content: 'You are Gemma, Gary\'s local research assistant. Be concise, factual and transparent. This is a local desktop prototype. Do not claim to have searched the internet, changed databases, or completed actions unless the connected tool actually did so.' },
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
      json(res, 200, { ok: !tags.error, model: MODEL, ollamaUrl: OLLAMA_URL, models: tags.models || [], memory: readJson(MEMORY_FILE, { version: 0, entries: [] }), history: readJson(HISTORY_FILE, []) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/memory') {
      json(res, 200, readJson(MEMORY_FILE, { version: 0, entries: [] }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const input = await body(req);
      if (!String(input.message || '').trim()) return json(res, 400, { error: 'Message is required.' });
      const history = readJson(HISTORY_FILE, []);
      const reply = await chat(String(input.message).trim(), history);
      history.push({ role: 'user', content: String(input.message).trim(), at: new Date().toISOString() });
      history.push({ role: 'assistant', content: reply, at: new Date().toISOString() });
      writeJson(HISTORY_FILE, history.slice(-200));
      json(res, 200, { reply, model: MODEL });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/open') {
      const input = await body(req);
      const allowed = {
        agent: process.env.GEARCASHOUT_AGENT_DIR || 'C:\\gearcashout\\Action Buyer UK main\\tools\\gear-ai-local-agent',
        gemma: path.join(__dirname),
        memory: MEMORY_FILE,
        data: DATA_DIR
      };
      const target = allowed[input.target];
      if (!target) return json(res, 400, { error: 'Unknown local target.' });
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
