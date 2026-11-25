'use strict';
/* =========================================================
   KRIDIA — local server (no dependencies, Node 16+)

     node server.js        → http://localhost:3000

   • Serves the website
   • Stores all content as JSON in ./data
   • Stores uploaded images in ./images
   • Password-protected admin (/admin.html), reached by signing in
     with "Admin" as the email on the website's sign-in window.
   ========================================================= */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('./schema');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const IMG_DIR = path.join(ROOT, 'images');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DEFAULT_ADMIN_PASSWORD = '123o123o123';
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_UPLOAD = 15 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------------- JSON storage ---------------- */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
function writeJSON(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
const colFile = n => path.join(DATA_DIR, n + '.json');
function loadCol(n) {
  const d = readJSON(colFile(n), null) || {};
  if (!Array.isArray(d.items)) d.items = [];
  if (!Number.isInteger(d.nextId)) d.nextId = 1;
  const max = d.items.reduce((m, i) => Math.max(m, i.id || 0), 0);
  if (d.nextId <= max) d.nextId = max + 1;
  return d;
}
const saveCol = (n, d) => writeJSON(colFile(n), d);
function makeCtx() {
  const cache = {};
  return { hasId: (c, id) => (cache[c] || (cache[c] = new Set(loadCol(c).items.map(i => i.id)))).has(id) };
}
const getSettings = () => S.cleanSettings(readJSON(SETTINGS_FILE, {}), makeCtx(), true);

/* ---------------- Password ---------------- */
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
function verifyPw(pw) {
  const a = readJSON(AUTH_FILE, null);
  if (!a) return false;
  const got = Buffer.from(hashPw(pw, a.salt), 'hex');
  const want = Buffer.from(a.hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  writeJSON(AUTH_FILE, { salt, hash: hashPw(pw, salt), changedAt: new Date().toISOString() });
}

function bootstrap() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });
  for (const n of Object.keys(S.COLLECTIONS)) if (!fs.existsSync(colFile(n))) saveCol(n, { nextId: 1, items: [] });
  if (!fs.existsSync(SETTINGS_FILE)) writeJSON(SETTINGS_FILE, S.defaultSettings());
  if (!fs.existsSync(AUTH_FILE)) setPassword(process.env.KRIDIA_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD);
}

/* ---------------- Sessions + login throttling ---------------- */
const sessions = new Map();
const fails = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of sessions) if (exp < now) sessions.delete(t);
  for (const [ip, r] of fails) if (r.until < now && !r.count) fails.delete(ip);
}, 10 * 60 * 1000).unref();

function startSession(req, res) {
  const t = crypto.randomBytes(32).toString('hex');
  sessions.set(t, Date.now() + SESSION_MS);
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `kridia_admin=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
}
function getSession(req) {
  const m = /(?:^|;\s*)kridia_admin=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const exp = sessions.get(m[1]);
  if (!exp || exp < Date.now()) { sessions.delete(m[1]); return null; }
  return m[1];
}

/* ---------------- HTTP helpers ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif'
};
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0, over = false;
    req.on('data', c => { n += c.length; if (n > limit) over = true; else chunks.push(c); });
    req.on('end', () => (over ? reject(new HttpError(413, 'That file or request is too large.')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}
async function jsonBody(req) {
  const buf = await readBody(req, MAX_JSON);
  try { const d = JSON.parse(buf.toString('utf8') || '{}'); return d && typeof d === 'object' ? d : {}; }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}
function csrfCheck(req) {
  if (req.headers['x-requested-with'] !== 'kridia') throw new HttpError(403, 'Forbidden.');
  const o = req.headers.origin;
  if (o) {
    let host = '';
    try { host = new URL(o).host; } catch { /* fall through */ }
    if (host !== req.headers.host) throw new HttpError(403, 'Forbidden.');
  }
}
const asClientError = fn => { try { return fn(); } catch (e) { throw new HttpError(400, e.message); } };

/* ---------------- Static files ---------------- */
const PUBLIC_FILES = {
  '/': 'index.html', '/index.html': 'index.html', '/listing.html': 'listing.html',
  '/styles.css': 'styles.css', '/auth.css': 'auth.css',
  '/common.js': 'common.js', '/script.js': 'script.js', '/listing.js': 'listing.js',
  '/auth.js': 'auth.js', '/firebase-config.js': 'firebase-config.js'
};
const ADMIN_FILES = { '/admin.html': 'admin.html', '/admin.js': 'admin.js', '/admin.css': 'admin.css' };

function sendFile(req, res, file, cache) {
  return new Promise(resolve => {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return resolve(); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': cache
      });
      if (req.method === 'HEAD') { res.end(); return resolve(); }
      const s = fs.createReadStream(file);
      s.on('error', () => { res.destroy(); resolve(); });
      s.on('end', resolve);
      s.pipe(res);
    });
  });
}
async function serveStatic(req, res, u) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { throw new HttpError(400, 'Bad request'); }
  if (p === '/admin' || p === '/admin/') p = '/admin.html';
  if (ADMIN_FILES[p]) {
    if (!getSession(req)) {
      if (p === '/admin.html') { res.writeHead(302, { Location: '/' }); return res.end(); }
      throw new HttpError(404, 'Not found');
    }
    return sendFile(req, res, path.join(ROOT, ADMIN_FILES[p]), 'no-store');
  }
  if (PUBLIC_FILES[p]) return sendFile(req, res, path.join(ROOT, PUBLIC_FILES[p]), 'no-cache');
  const m = /^\/images\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(p);
  if (m) return sendFile(req, res, path.join(IMG_DIR, m[1]), 'public, max-age=31536000, immutable');
  throw new HttpError(404, 'Not found');
}

/* ---------------- Images ---------------- */
function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.slice(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.slice(4, 8).toString('latin1') === 'ftyp' && /^avi[fs]$/.test(b.slice(8, 12).toString('latin1'))) return 'avif';
  return null;
}
function listImages() {
  return fs.readdirSync(IMG_DIR)
    .filter(n => /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|png|webp|gif|avif)$/.test(n))
    .map(n => { const st = fs.statSync(path.join(IMG_DIR, n)); return { name: n, path: 'images/' + n, size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime);
}
function scrubImage(rel) {
  for (const [n, def] of Object.entries(S.COLLECTIONS)) {
    const d = loadCol(n);
    let changed = false;
    for (const it of d.items) for (const f of def.fields) {
      if (f.type === 'image' && it[f.key] === rel) { it[f.key] = ''; changed = true; }
      else if (f.type === 'images' && Array.isArray(it[f.key]) && it[f.key].includes(rel)) { it[f.key] = it[f.key].filter(x => x !== rel); changed = true; }
    }
    if (changed) saveCol(n, d);
  }
  const st = readJSON(SETTINGS_FILE, {});
  let changed = false;
  for (const g of S.SETTINGS_GROUPS) for (const f of g.fields) {
    if (f.type === 'image' && S.getPath(st, f.key) === rel) { S.setPath(st, f.key, ''); changed = true; }
  }
  if (changed) writeJSON(SETTINGS_FILE, st);
}
function cascadeRef(col, id) {
  for (const [n, def] of Object.entries(S.COLLECTIONS)) {
    const refs = def.fields.filter(f => f.type === 'ref' && f.ref === col);
    if (!refs.length) continue;
    const d = loadCol(n);
    let changed = false;
    for (const it of d.items) for (const f of refs) if (it[f.key] === id) { it[f.key] = null; changed = true; }
    if (changed) saveCol(n, d);
  }
}

/* ---------------- API ---------------- */
function publicData() {
  const out = { settings: getSettings() };
  for (const n of Object.keys(S.COLLECTIONS)) out[n] = loadCol(n).items;
  out.listings = out.listings.filter(l => l.published !== false);
  return out;
}

async function login(req, res) {
  const ip = req.socket.remoteAddress || '?';
  const rec = fails.get(ip);
  if (rec && rec.until > Date.now()) {
    const mins = Math.ceil((rec.until - Date.now()) / 60000);
    throw new HttpError(429, `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  const body = await jsonBody(req);
  const pw = typeof body.password === 'string' ? body.password : '';
  if (pw && pw.length <= 200 && verifyPw(pw)) {
    fails.delete(ip);
    startSession(req, res);
    return sendJSON(res, 200, { ok: true });
  }
  const r = fails.get(ip) || { count: 0, until: 0 };
  r.count++;
  if (r.count >= 5) { r.until = Date.now() + 15 * 60 * 1000; r.count = 0; }
  fails.set(ip, r);
  await new Promise(ok => setTimeout(ok, 500));
  throw new HttpError(401, 'Incorrect email or password.');
}

async function handleApi(req, res, u) {
  const p = u.pathname, m = req.method;
  if (p === '/api/public') {
    if (m !== 'GET') throw new HttpError(405, 'Method not allowed');
    return sendJSON(res, 200, publicData());
  }
  if (!p.startsWith('/api/admin/')) throw new HttpError(404, 'Not found');
  if (m !== 'GET') csrfCheck(req);

  if (p === '/api/admin/login' && m === 'POST') return login(req, res);
  if (p === '/api/admin/session' && m === 'GET') return sendJSON(res, 200, { authenticated: !!getSession(req) });

  const sid = getSession(req);
  if (!sid) throw new HttpError(401, 'Please sign in again.');

  if (p === '/api/admin/logout' && m === 'POST') {
    sessions.delete(sid);
    res.setHeader('Set-Cookie', 'kridia_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/admin/schema' && m === 'GET') return sendJSON(res, 200, { collections: S.COLLECTIONS, settings: S.SETTINGS_GROUPS });
  if (p === '/api/admin/data' && m === 'GET') {
    const collections = {};
    for (const n of Object.keys(S.COLLECTIONS)) collections[n] = loadCol(n).items;
    return sendJSON(res, 200, { settings: getSettings(), collections });
  }

  if (p === '/api/admin/settings' && m === 'PUT') {
    const body = await jsonBody(req);
    const clean = asClientError(() => S.cleanSettings(body, makeCtx(), false));
    writeJSON(SETTINGS_FILE, clean);
    return sendJSON(res, 200, { settings: clean });
  }

  const mc = /^\/api\/admin\/c\/([a-z]+)(?:\/(\d+))?(?:\/(move))?$/.exec(p);
  if (mc) {
    const name = mc[1];
    if (!S.COLLECTIONS[name]) throw new HttpError(404, 'Unknown collection');
    const id = mc[2] ? Number(mc[2]) : null;

    if (!id && m === 'POST') {
      const body = await jsonBody(req);
      const clean = asClientError(() => S.cleanItem(name, body, makeCtx()));
      const d = loadCol(name);
      const now = new Date().toISOString();
      const item = { id: d.nextId++, ...clean, createdAt: now, updatedAt: now };
      d.items.push(item);
      saveCol(name, d);
      return sendJSON(res, 201, { item });
    }
    if (id && !mc[3] && m === 'PUT') {
      const body = await jsonBody(req);
      const d = loadCol(name);
      const idx = d.items.findIndex(i => i.id === id);
      if (idx < 0) throw new HttpError(404, 'Not found');
      const clean = asClientError(() => S.cleanItem(name, body, makeCtx()));
      d.items[idx] = { ...d.items[idx], ...clean, id, updatedAt: new Date().toISOString() };
      saveCol(name, d);
      return sendJSON(res, 200, { item: d.items[idx] });
    }
    if (id && !mc[3] && m === 'DELETE') {
      const d = loadCol(name);
      const idx = d.items.findIndex(i => i.id === id);
      if (idx < 0) throw new HttpError(404, 'Not found');
      d.items.splice(idx, 1);
      saveCol(name, d);
      cascadeRef(name, id);
      return sendJSON(res, 200, { ok: true });
    }
    if (id && mc[3] === 'move' && m === 'POST') {
      const body = await jsonBody(req);
      const dir = body.dir === -1 ? -1 : 1;
      const d = loadCol(name);
      const i = d.items.findIndex(x => x.id === id);
      const j = i + dir;
      if (i < 0) throw new HttpError(404, 'Not found');
      if (j >= 0 && j < d.items.length) { [d.items[i], d.items[j]] = [d.items[j], d.items[i]]; saveCol(name, d); }
      return sendJSON(res, 200, { ok: true });
    }
    throw new HttpError(405, 'Method not allowed');
  }

  if (p === '/api/admin/upload' && m === 'POST') {
    const buf = await readBody(req, MAX_UPLOAD);
    const ext = sniff(buf);
    if (!ext) throw new HttpError(415, 'Only JPG, PNG, WebP, GIF or AVIF images are allowed.');
    let base = '';
    try { base = decodeURIComponent(String(req.headers['x-filename'] || '')); } catch { /* ignore */ }
    base = base.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}-${base}.${ext}`;
    fs.writeFileSync(path.join(IMG_DIR, name), buf, { flag: 'wx' });
    return sendJSON(res, 201, { name, path: 'images/' + name, size: buf.length });
  }
  if (p === '/api/admin/images' && m === 'GET') return sendJSON(res, 200, { images: listImages() });
  const mi = /^\/api\/admin\/images\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(p);
  if (mi && m === 'DELETE') {
    const file = path.join(IMG_DIR, mi[1]);
    if (!fs.existsSync(file)) throw new HttpError(404, 'Not found');
    fs.unlinkSync(file);
    scrubImage('images/' + mi[1]);
    return sendJSON(res, 200, { ok: true });
  }

  if (p === '/api/admin/password' && m === 'POST') {
    const body = await jsonBody(req);
    const cur = typeof body.current === 'string' ? body.current : '';
    const next = typeof body.next === 'string' ? body.next : '';
    if (!cur || !verifyPw(cur)) { await new Promise(ok => setTimeout(ok, 500)); throw new HttpError(400, 'Your current password is incorrect.'); }
    if (next.length < 8 || next.length > 200) throw new HttpError(400, 'Choose a new password of at least 8 characters.');
    setPassword(next);
    sessions.clear();
    startSession(req, res);
    return sendJSON(res, 200, { ok: true });
  }

  throw new HttpError(404, 'Not found');
}

/* ---------------- Server ---------------- */
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  let isApi = false;
  try {
    const u = new URL(req.url, 'http://localhost');
    isApi = u.pathname.startsWith('/api/');
    if (isApi) await handleApi(req, res, u);
    else await serveStatic(req, res, u);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (res.headersSent) return res.end();
    const msg = status === 500 ? 'Something went wrong on the server.' : e.message;
    if (isApi) sendJSON(res, status, { error: msg });
    else { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(msg); }
  }
});

bootstrap();
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set another with: PORT=3001 node server.js` : e);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`\n  Kridia is running → http://localhost:${PORT}`);
  console.log('  Admin: click the account icon, enter "Admin" as the email and your admin password.\n');
});
