// MKW - dooseries — static + proxy + auth + admin backend
// Usage: node serve.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const urlMod = require('url');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');

const SERIESJEEN_TOKEN = process.env.SERIESJEEN_TOKEN || '';
const SERIESJEEN_HOST  = 'api.seriesjeen.online';

if (!SERIESJEEN_TOKEN) {
  console.warn('⚠️  SERIESJEEN_TOKEN env ไม่ได้ตั้ง — /proxy/* จะไม่ทำงาน');
}

const EPISODE_COST = 50;  // NSV Coin per locked episode

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

// ---------- Default state (ใช้ตอน data.json ยังไม่มี เช่น first deploy) ----------
const DEFAULT_DATA = {
  users: {
    admin: { password: process.env.ADMIN_PASSWORD || 'admin', role: 'admin', coins: 9999999, unlocked: [], created: new Date().toISOString().slice(0, 10) },
  },
  sessions: {},
  locks: {},
  giftcards: {
    NSVWELCOME: { coins: 100, used: false, usedBy: null, createdBy: 'admin' },
  },
  discounts: {
    SAVE10: { percent: 10, active: true },
  },
  topupPackages: [
    { id: 'p1', coins: 100,  price: 100,  label: 'เริ่มต้น' },
    { id: 'p2', coins: 500,  price: 450,  label: 'คุ้มค่า' },
    { id: 'p3', coins: 1000, price: 850,  label: 'ยอดนิยม' },
    { id: 'p4', coins: 5000, price: 4000, label: 'เหมาดู' },
  ],
  vipPackages: [
    { id: 'vip1',  days: 1,  coins: 100,  label: 'VIP 1 วัน' },
    { id: 'vip7',  days: 7,  coins: 500,  label: 'VIP 7 วัน' },
    { id: 'vip30', days: 30, coins: 1500, label: 'VIP 30 วัน' },
  ],
  topupHistory: [],
  slipPending: [],
  freeMode: { enabled: false, message: '', startAt: null, endAt: null },
  announcement: { enabled: false, text: '', color: 'blue' },  // banner ใต้ header
  maintenance: { enabled: false, message: '' },               // ปิดเว็บชั่วคราว (admin ผ่านได้)
  disableTracking: false,                                      // ปิดการบันทึก lastSeenAt/loginLog ชั่วคราว (ลดภาระ disk write)
  hiddenBooks: {},                                            // bookId → { hiddenBy, hiddenAt, reason, bookName }
  loginLog: [],                                               // [{ username, loginAt, logoutAt, durationMs }] max 1000
};

// ---------- Data store (MongoDB ถ้ามี MONGODB_URI, ไม่งั้นใช้ data.json) ----------
const USE_MONGO = !!process.env.MONGODB_URI;
let mongoColl = null;
let mongoCache = null;

async function ensureMongo() {
  if (!USE_MONGO || mongoColl) return;
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  mongoColl = client.db(process.env.MONGODB_DB || 'mkw').collection('state');
  console.log('MongoDB connected');
}

function applyDefaults(data) {
  for (const k of Object.keys(DEFAULT_DATA)) if (!(k in data)) data[k] = DEFAULT_DATA[k];
  if (!data.users.admin) data.users.admin = DEFAULT_DATA.users.admin;
  return data;
}

async function readData() {
  if (USE_MONGO) {
    if (mongoCache) return mongoCache;
    await ensureMongo();
    const doc = await mongoColl.findOne({ _id: 'main' });
    if (!doc) {
      mongoCache = JSON.parse(JSON.stringify(DEFAULT_DATA));
      await mongoColl.insertOne({ _id: 'main', data: mongoCache });
    } else {
      mongoCache = applyDefaults(doc.data || {});
    }
    return mongoCache;
  }
  try {
    return applyDefaults(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

async function writeData(data) {
  if (USE_MONGO) {
    mongoCache = data;
    try {
      await mongoColl.replaceOne({ _id: 'main' }, { _id: 'main', data }, { upsert: true });
    } catch (e) {
      console.error('mongo write failed:', e.message);
    }
    return;
  }
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('writeData failed:', e.message);
  }
}

// ---------- Helpers ----------
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}
function badRequest(res, msg) { json(res, 400, { error: msg }); }
function unauthorized(res, msg = 'ต้อง login ก่อน') { json(res, 401, { error: msg }); }
function forbidden(res, msg = 'ไม่มีสิทธิ์') { json(res, 403, { error: msg }); }
function notFound(res, msg = 'ไม่พบ') { json(res, 404, { error: msg }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 8e6) reject(new Error('body too large (>8MB)')); });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// VIP หมดอายุ → ลดเป็น user (mutate in place ถ้ามี data arg)
async function checkVipExpiry(u, data) {
  if (u.role === 'vip' && u.vipExpires && Date.now() > u.vipExpires) {
    u.role = 'user';
    u.vipExpires = null;
    if (data) await writeData(data);
  }
}

// freeMode active ตอนนี้ไหม — ต้อง enabled=true และอยู่ในช่วง start/end (ถ้าตั้งไว้)
function isFreeActive(data) {
  const fm = data.freeMode;
  if (!fm?.enabled) return false;
  const now = Date.now();
  if (fm.startAt) {
    const s = new Date(fm.startAt).getTime();
    if (!isNaN(s) && now < s) return false;
  }
  if (fm.endAt) {
    const e = new Date(fm.endAt).getTime();
    if (!isNaN(e) && now > e) return false;
  }
  return true;
}

async function getAuthUser(req, data) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(\S+)$/);
  if (!m) return null;
  const sess = data.sessions[m[1]];
  if (!sess) return null;
  // Backwards compat: session อาจเป็น string (username) หรือ object {username, loginAt, lastSeenAt}
  const username = typeof sess === 'string' ? sess : sess.username;
  const u = data.users[username];
  if (!u) return null;
  // อัปเดต lastSeenAt (ถ้าเป็น object) — เลี่ยง writeData ทุก request: update เฉพาะเมื่อห่างเกิน 60 วิ
  // ถ้า admin เปิด disableTracking → ข้ามทั้งหมดเพื่อลดภาระ disk write
  if (typeof sess === 'object' && sess.username && !data.disableTracking) {
    const now = Date.now();
    if (!sess.lastSeenAt || now - new Date(sess.lastSeenAt).getTime() > 60000) {
      sess.lastSeenAt = new Date(now).toISOString();
      writeData(data).catch(() => {});
    }
  }
  await checkVipExpiry(u, data);
  return { username, ...u };
}

// ปิด session + push ไป loginLog (keep ≤ 1000 records)
function closeSession(data, token, reason) {
  const sess = data.sessions[token];
  if (!sess) return;
  // ถ้า tracking ถูกปิด → ไม่ push ไป loginLog (ลดการเขียน)
  if (typeof sess === 'object' && sess.loginAt && !data.disableTracking) {
    const logoutAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(sess.loginAt).getTime();
    data.loginLog = data.loginLog || [];
    data.loginLog.push({
      username: sess.username,
      loginAt: sess.loginAt,
      lastSeenAt: sess.lastSeenAt || sess.loginAt,
      logoutAt,
      durationMs,
      reason: reason || 'logout',
    });
    if (data.loginLog.length > 1000) data.loginLog = data.loginLog.slice(-1000);
  }
  delete data.sessions[token];
}

function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    role: u.role,
    coins: u.coins,
    unlocked: u.unlocked || [],
    created: u.created,
    vipExpires: u.vipExpires || null,
  };
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ---------- Password hashing (scrypt — Node native, no deps) ----------
// รูปแบบที่เก็บ: "scrypt$<saltHex>$<hashHex>"
// รองรับ migration: ถ้าเจอ plain text → verify โดย === แล้ว auto-rehash ครั้งหน้าที่ login
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (typeof stored === 'string' && stored.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return false;
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const got = crypto.scryptSync(String(plain), salt, expected.length);
      return crypto.timingSafeEqual(got, expected);
    } catch { return false; }
  }
  // Legacy plain text — เทียบตรง (จะถูก auto-migrate ตอน login สำเร็จ)
  return String(plain) === String(stored);
}
function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

// ---------- Rate limiting (in-memory; reset ทุกๆ window) ----------
const rateLimitBuckets = new Map();  // key → { count, resetAt }
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = rateLimitBuckets.get(key);
  if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + windowMs }; rateLimitBuckets.set(key, b); }
  b.count++;
  return { ok: b.count <= max, retryAfterSec: Math.ceil((b.resetAt - now) / 1000), remaining: Math.max(0, max - b.count) };
}
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
// GC bucket map ทุก 5 นาที (กัน memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateLimitBuckets) if (now > b.resetAt) rateLimitBuckets.delete(k);
}, 5 * 60 * 1000).unref();

// ---------- Audit log (admin action history, max 500) ----------
function audit(data, user, action, details) {
  data.auditLog = data.auditLog || [];
  data.auditLog.push({
    at: new Date().toISOString(),
    by: user?.username || 'anonymous',
    action,
    details: details || null,
  });
  if (data.auditLog.length > 500) data.auditLog = data.auditLog.slice(-500);
}

// ---------- Static ----------
function serveFile(filePath, res) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + filePath);
    }
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- Proxy to seriesjeen ----------
function proxyToSeriesjeen(reqUrl, res) {
  const targetPath = reqUrl.replace(/^\/proxy/, '');
  const options = {
    hostname: SERIESJEEN_HOST,
    path: targetPath,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + SERIESJEEN_TOKEN,
      'Accept': 'application/json',
      'User-Agent': 'mkw-dooseries-proxy/1.0',
    },
  };
  const proxyReq = https.request(options, proxyRes => {
    const headers = { ...proxyRes.headers, 'Access-Control-Allow-Origin': '*' };
    delete headers['content-encoding'];
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', e => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'proxy_error', message: e.message, target: targetPath }));
  });
  proxyReq.end();
}

// ---------- HTTPS helpers (Google OAuth) ----------
function httpsPostJson(url, bodyStr, contentType) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': contentType || 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
    }, r => {
      let buf = '';
      r.on('data', d => buf += d);
      r.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('invalid JSON: ' + buf.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}
function httpsGetJson(url, bearer) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: bearer ? { Authorization: 'Bearer ' + bearer } : {},
    }, r => {
      let buf = '';
      r.on('data', d => buf += d);
      r.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('invalid JSON: ' + buf.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------- Access control ----------
// คืน {allowed, reason, cost}
function checkAccess(data, user, bookId, index) {
  // Maintenance mode — ปิดทั้งเว็บ (admin ยังดูได้)
  if (data.maintenance?.enabled && user?.role !== 'admin') {
    return { allowed: false, reason: 'maintenance' };
  }

  // Hidden book — admin ซ่อนทั้งเรื่อง (admin ยังดูได้)
  if (data.hiddenBooks?.[bookId] && user?.role !== 'admin') {
    return { allowed: false, reason: 'hidden' };
  }

  // Free-for-all mode (admin-toggleable promotion) — override ทุกอย่างเมื่ออยู่ในช่วง
  if (isFreeActive(data)) return { allowed: true, freeMode: true };

  // admin-set locks per bookId (list ของ chapterIndex)
  const adminLocked = (data.locks[bookId]?.episodes || []).includes(Number(index));

  // API's isCharge — เราไม่รู้จาก backend — จะเช็คที่ frontend หลัง fetch /allepisode
  // ในที่นี้ถือว่า server-side lock = adminLocked เป็นหลัก
  // frontend รับผิดชอบรวม isCharge

  if (!adminLocked) return { allowed: true };

  if (!user) return { allowed: false, reason: 'need_login' };
  if (user.role === 'admin') return { allowed: true };
  if (user.role === 'vip') return { allowed: true };

  // user ธรรมดา
  const key = `${bookId}:${index}`;
  if ((user.unlocked || []).includes(key)) return { allowed: true };
  return { allowed: false, reason: 'need_coin', cost: EPISODE_COST, userCoins: user.coins };
}

// ---------- Route dispatch ----------
async function handleApi(req, res, pathname, query) {
  const data = await readData();
  const user = await getAuthUser(req, data);

  // ===== Public config (no auth) =====
  if (req.method === 'GET' && pathname === '/api/public-config') {
    const fm = data.freeMode || {};
    const an = data.announcement || {};
    const mt = data.maintenance || {};
    return json(res, 200, {
      freeMode: {
        enabled: isFreeActive(data),
        configured: !!fm.enabled,
        message: fm.message || '',
        startAt: fm.startAt || null,
        endAt: fm.endAt || null,
      },
      announcement: { enabled: !!an.enabled, text: an.text || '', color: an.color || 'blue' },
      maintenance: { enabled: !!mt.enabled, message: mt.message || '' },
      hiddenBooks: Object.keys(data.hiddenBooks || {}),
      trackingDisabled: !!data.disableTracking,
    });
  }

  // ===== Auth =====
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    const { username, password } = body;
    if (!username || !password) return badRequest(res, 'ต้องมี username และ password');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return badRequest(res, 'username: a-z 0-9 _ ยาว 3-20');
    if (password.length < 3) return badRequest(res, 'password สั้นเกินไป');
    if (data.users[username]) return badRequest(res, 'username นี้ถูกใช้แล้ว');
    data.users[username] = { password, role: 'user', coins: 0, unlocked: [], created: new Date().toISOString().slice(0, 10) };
    const token = randomToken();
    const nowIso = new Date().toISOString();
    data.sessions[token] = { username, loginAt: nowIso, lastSeenAt: nowIso };
    await writeData(data);
    return json(res, 200, { token, user: publicUser({ username, ...data.users[username] }) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const { username, password } = body;
    if (!username || !password) return badRequest(res, 'ต้องมี username และ password');
    const u = data.users[username];
    if (!u || u.password !== password) return unauthorized(res, 'username หรือ password ผิด');
    const token = randomToken();
    const nowIso = new Date().toISOString();
    data.sessions[token] = { username, loginAt: nowIso, lastSeenAt: nowIso };
    await writeData(data);
    return json(res, 200, { token, user: publicUser({ username, ...u }) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const auth = req.headers['authorization'] || '';
    const m = auth.match(/^Bearer\s+(\S+)$/);
    if (m && data.sessions[m[1]]) { closeSession(data, m[1], 'logout'); await writeData(data); }
    return json(res, 200, { ok: true });
  }

  // Heartbeat — ping ทุก 60 วิจากฝั่ง user เพื่ออัปเดต lastSeenAt (สำหรับ stat "time on site")
  if (req.method === 'POST' && pathname === '/api/auth/heartbeat') {
    if (!user) return unauthorized(res);
    // getAuthUser อัปเดต lastSeenAt ให้แล้ว — แค่คืน ok
    return json(res, 200, { ok: true });
  }

  // ===== Google OAuth =====
  // ต้องตั้ง env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, (option) GOOGLE_REDIRECT_URI
  if (req.method === 'GET' && pathname === '/api/auth/google/url') {
    const cid = process.env.GOOGLE_CLIENT_ID;
    if (!cid) return badRequest(res, 'Google Login ยังไม่ได้ตั้งค่า — admin ต้องตั้ง env GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET');
    const redirect = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(cid)}` +
      `&redirect_uri=${encodeURIComponent(redirect)}` +
      `&response_type=code&scope=${encodeURIComponent('email profile')}&access_type=online`;
    return json(res, 200, { url });
  }

  if (req.method === 'GET' && pathname === '/api/auth/google/callback') {
    const cid = process.env.GOOGLE_CLIENT_ID;
    const csec = process.env.GOOGLE_CLIENT_SECRET;
    if (!cid || !csec) { res.writeHead(500); return res.end('Google OAuth ยังไม่ได้ตั้งค่า'); }
    const redirect = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;
    const code = query.code;
    if (!code) { res.writeHead(400); return res.end('missing code'); }
    try {
      const tokenBody = new URLSearchParams({
        code, client_id: cid, client_secret: csec, redirect_uri: redirect, grant_type: 'authorization_code',
      }).toString();
      const tokenJson = await httpsPostJson('https://oauth2.googleapis.com/token', tokenBody, 'application/x-www-form-urlencoded');
      if (!tokenJson.access_token) { res.writeHead(400); return res.end('OAuth: ' + JSON.stringify(tokenJson)); }
      const profile = await httpsGetJson('https://openidconnect.googleapis.com/v1/userinfo', tokenJson.access_token);
      if (!profile.email) { res.writeHead(400); return res.end('Google ไม่คืน email'); }
      // หา user เดิมที่ผูก email นี้ ถ้าไม่มีก็สร้างใหม่
      let username = Object.keys(data.users).find(name => data.users[name].googleEmail === profile.email);
      if (!username) {
        // ใช้ email prefix เป็น username (sanitize)
        let base = profile.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16) || 'user';
        username = base;
        let i = 1;
        while (data.users[username]) { username = base + '_' + i++; }
        data.users[username] = {
          password: crypto.randomBytes(16).toString('hex'), // random — google-only login
          role: 'user', coins: 0, unlocked: [], created: new Date().toISOString().slice(0, 10),
          googleEmail: profile.email, googleName: profile.name || '',
        };
      }
      const token = randomToken();
      const nowIso = new Date().toISOString();
      data.sessions[token] = { username, loginAt: nowIso, lastSeenAt: nowIso };
      await writeData(data);
      // ส่ง HTML ที่ set token ใน localStorage แล้วเด้งกลับหน้าแรก
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><script>localStorage.setItem('mkw_token',${JSON.stringify(token)});location.href='/';</script>เข้าสู่ระบบสำเร็จ กำลังพากลับ...`);
    } catch (e) {
      res.writeHead(500); return res.end('Google OAuth ล้มเหลว: ' + e.message);
    }
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!user) return unauthorized(res);
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/user/change-password') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) return badRequest(res, 'ต้องมี currentPassword และ newPassword');
    if (String(newPassword).length < 3) return badRequest(res, 'รหัสผ่านใหม่สั้นเกินไป (ขั้นต่ำ 3 ตัว)');
    const u = data.users[user.username];
    if (u.password !== currentPassword) return badRequest(res, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    u.password = newPassword;
    // ลบ session อื่นทั้งหมด ยกเว้น token ปัจจุบัน → บังคับ logout จากเครื่องอื่น
    const currentToken = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    for (const [tok, sess] of Object.entries(data.sessions)) {
      const uname = typeof sess === 'string' ? sess : sess.username;
      if (uname === user.username && tok !== currentToken) closeSession(data, tok, 'password-change');
    }
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== Access & Unlock =====
  if (req.method === 'GET' && pathname === '/api/access') {
    const bookId = query.bookId;
    const index = parseInt(query.index || '0', 10);
    if (!bookId || !index) return badRequest(res, 'ต้องมี bookId และ index');
    return json(res, 200, checkAccess(data, user, bookId, index));
  }

  if (req.method === 'POST' && pathname === '/api/unlock') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const { bookId, index } = body;
    if (!bookId || !index) return badRequest(res, 'ต้องมี bookId และ index');

    if (user.role === 'admin' || user.role === 'vip') return json(res, 200, { ok: true, note: 'role ของคุณเข้าถึงได้ฟรีอยู่แล้ว' });

    const adminLocked = (data.locks[bookId]?.episodes || []).includes(Number(index));
    if (!adminLocked) return json(res, 200, { ok: true, note: 'ตอนนี้ไม่ได้ล็อก' });

    const key = `${bookId}:${index}`;
    const u = data.users[user.username];
    if ((u.unlocked || []).includes(key)) return json(res, 200, { ok: true, note: 'ปลดล็อกแล้วก่อนหน้านี้' });

    if ((u.coins || 0) < EPISODE_COST) return badRequest(res, `เหรียญไม่พอ (มี ${u.coins}, ต้องใช้ ${EPISODE_COST})`);

    u.coins -= EPISODE_COST;
    u.unlocked = u.unlocked || [];
    u.unlocked.push(key);
    await writeData(data);
    return json(res, 200, { ok: true, coins: u.coins, unlocked: u.unlocked });
  }

  // ===== User / Coin =====
  if (req.method === 'POST' && pathname === '/api/user/topup') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const { packageId, discountCode } = body;
    const pkg = (data.topupPackages || []).find(p => p.id === packageId);
    if (!pkg) return badRequest(res, 'ไม่พบ package');
    let finalPrice = pkg.price;
    let discountApplied = null;
    if (discountCode) {
      const d = data.discounts[discountCode];
      if (!d || !d.active) return badRequest(res, 'โค้ดส่วนลดใช้ไม่ได้');
      finalPrice = Math.round(pkg.price * (100 - d.percent) / 100);
      discountApplied = { code: discountCode, percent: d.percent };
    }
    const u = data.users[user.username];
    u.coins = (u.coins || 0) + pkg.coins;
    data.topupHistory = data.topupHistory || [];
    data.topupHistory.push({
      username: user.username, packageId, coins: pkg.coins, pricePaid: finalPrice, discount: discountApplied, at: new Date().toISOString(),
    });
    await writeData(data);
    return json(res, 200, { ok: true, coinsAdded: pkg.coins, pricePaid: finalPrice, newBalance: u.coins });
  }

  if (req.method === 'POST' && pathname === '/api/giftcard/redeem') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const { code } = body;
    if (!code) return badRequest(res, 'ต้องมี code');
    const g = data.giftcards[code];
    if (!g) return badRequest(res, 'โค้ดไม่ถูกต้อง');
    if (g.used) return badRequest(res, 'โค้ดถูกใช้แล้ว');
    const u = data.users[user.username];
    u.coins = (u.coins || 0) + g.coins;
    g.used = true;
    g.usedBy = user.username;
    g.usedAt = new Date().toISOString();
    await writeData(data);
    return json(res, 200, { ok: true, coinsAdded: g.coins, newBalance: u.coins });
  }

  if (req.method === 'GET' && pathname === '/api/topup/packages') {
    return json(res, 200, { packages: data.topupPackages || [], vipPackages: data.vipPackages || [] });
  }

  // ===== Buy VIP =====
  if (req.method === 'POST' && pathname === '/api/user/buy-vip') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const pkg = (data.vipPackages || []).find(p => p.id === body.packageId);
    if (!pkg) return badRequest(res, 'ไม่พบ VIP package');
    const u = data.users[user.username];
    if ((u.coins || 0) < pkg.coins) return badRequest(res, `เหรียญไม่พอ (มี ${u.coins}, ต้องใช้ ${pkg.coins})`);
    u.coins -= pkg.coins;
    // ต่ออายุถ้า VIP ยังไม่หมด, เริ่มใหม่ถ้าหมดแล้ว/ยังไม่เคย
    const now = Date.now();
    const base = (u.role === 'vip' && u.vipExpires && u.vipExpires > now) ? u.vipExpires : now;
    u.vipExpires = base + pkg.days * 24 * 60 * 60 * 1000;
    if (u.role !== 'admin') u.role = 'vip';
    await writeData(data);
    return json(res, 200, { ok: true, role: u.role, vipExpires: u.vipExpires, coins: u.coins, daysAdded: pkg.days });
  }

  // ===== Slip upload (manual verify by admin) =====
  if (req.method === 'POST' && pathname === '/api/user/upload-slip') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const { image, amount, note } = body;
    if (!image || !String(image).startsWith('data:image/')) return badRequest(res, 'ต้องส่ง image เป็น data URL');
    const amt = parseInt(amount || 0, 10);
    if (!amt || amt <= 0) return badRequest(res, 'amount ต้อง > 0');
    if (String(image).length > 5_000_000) return badRequest(res, 'ภาพใหญ่เกิน 5MB');
    data.slipPending = data.slipPending || [];
    const id = crypto.randomBytes(8).toString('hex');
    data.slipPending.push({
      id, username: user.username, amount: amt, note: note || '',
      image, uploadedAt: new Date().toISOString(), status: 'pending',
    });
    await writeData(data);
    return json(res, 200, { ok: true, id, status: 'pending' });
  }

  // ===== Admin =====
  function requireAdmin() {
    if (!user) { unauthorized(res); return false; }
    if (user.role !== 'admin') { forbidden(res, 'ต้องเป็น admin'); return false; }
    return true;
  }

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    if (!requireAdmin()) return;
    // Aggregate last login + last seen จาก sessions (active) + loginLog (historical)
    const perUser = {};
    for (const sess of Object.values(data.sessions)) {
      if (typeof sess !== 'object' || !sess.username) continue;
      const u = perUser[sess.username] = perUser[sess.username] || { active: 0 };
      u.active++;
      if (!u.lastSeenAt || sess.lastSeenAt > u.lastSeenAt) u.lastSeenAt = sess.lastSeenAt;
      if (!u.lastLoginAt || sess.loginAt > u.lastLoginAt) u.lastLoginAt = sess.loginAt;
    }
    for (const entry of (data.loginLog || [])) {
      const u = perUser[entry.username] = perUser[entry.username] || { active: 0 };
      if (!u.lastLoginAt || entry.loginAt > u.lastLoginAt) u.lastLoginAt = entry.loginAt;
      if (!u.lastSeenAt || (entry.lastSeenAt && entry.lastSeenAt > u.lastSeenAt)) u.lastSeenAt = entry.lastSeenAt;
    }
    const list = Object.entries(data.users).map(([username, u]) => ({
      username, role: u.role, coins: u.coins,
      unlocked: (u.unlocked || []).length,
      historyCount: (u.history || []).length,
      created: u.created,
      vipExpires: u.vipExpires || null,
      activeSessions: perUser[username]?.active || 0,
      lastLoginAt: perUser[username]?.lastLoginAt || null,
      lastSeenAt: perUser[username]?.lastSeenAt || null,
      googleEmail: u.googleEmail || null,
    }));
    return json(res, 200, { users: list });
  }

  const mCoin = pathname.match(/^\/api\/admin\/user\/([^/]+)\/coins$/);
  if (mCoin && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const delta = parseInt(body.delta || 0, 10);
    const target = decodeURIComponent(mCoin[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    data.users[target].coins = Math.max(0, (data.users[target].coins || 0) + delta);
    await writeData(data);
    return json(res, 200, { ok: true, coins: data.users[target].coins });
  }

  const mRole = pathname.match(/^\/api\/admin\/user\/([^/]+)\/role$/);
  if (mRole && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const role = body.role;
    if (!['admin', 'vip', 'user'].includes(role)) return badRequest(res, 'role: admin | vip | user');
    const target = decodeURIComponent(mRole[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    data.users[target].role = role;
    await writeData(data);
    return json(res, 200, { ok: true, role });
  }

  const mDel = pathname.match(/^\/api\/admin\/user\/([^/]+)$/);
  if (mDel && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const target = decodeURIComponent(mDel[1]);
    if (target === 'admin') return badRequest(res, 'ลบ admin ไม่ได้');
    if (!data.users[target]) return notFound(res);
    delete data.users[target];
    for (const [tok, sess] of Object.entries(data.sessions)) {
      const uname = typeof sess === 'string' ? sess : sess.username;
      if (uname === target) delete data.sessions[tok];
    }
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  const mResetPw = pathname.match(/^\/api\/admin\/user\/([^/]+)\/reset-password$/);
  if (mResetPw && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const newPassword = String(body.newPassword || '').trim();
    if (newPassword.length < 3) return badRequest(res, 'รหัสผ่านใหม่สั้นเกินไป (ขั้นต่ำ 3 ตัว)');
    const target = decodeURIComponent(mResetPw[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    data.users[target].password = newPassword;
    // Force logout ทุก session ของ user คนนี้
    for (const [tok, sess] of Object.entries(data.sessions)) {
      const uname = typeof sess === 'string' ? sess : sess.username;
      if (uname === target) closeSession(data, tok, 'admin-reset-password');
    }
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  const mVipExp = pathname.match(/^\/api\/admin\/user\/([^/]+)\/vip-expires$/);
  if (mVipExp && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const target = decodeURIComponent(mVipExp[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    const u = data.users[target];
    if (body.vipExpires === null || body.vipExpires === '') {
      // ยกเลิก VIP
      u.vipExpires = null;
      if (u.role === 'vip') u.role = 'user';
    } else {
      const t = new Date(body.vipExpires).getTime();
      if (isNaN(t)) return badRequest(res, 'รูปแบบวันที่ไม่ถูกต้อง');
      u.vipExpires = t;
      if (u.role === 'user') u.role = 'vip';
    }
    await writeData(data);
    return json(res, 200, { ok: true, role: u.role, vipExpires: u.vipExpires });
  }

  const mForceLogout = pathname.match(/^\/api\/admin\/user\/([^/]+)\/force-logout$/);
  if (mForceLogout && req.method === 'POST') {
    if (!requireAdmin()) return;
    const target = decodeURIComponent(mForceLogout[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    let count = 0;
    for (const [tok, sess] of Object.entries(data.sessions)) {
      const uname = typeof sess === 'string' ? sess : sess.username;
      if (uname === target) { closeSession(data, tok, 'admin-force-logout'); count++; }
    }
    await writeData(data);
    return json(res, 200, { ok: true, closed: count });
  }

  const mUserHist = pathname.match(/^\/api\/admin\/user\/([^/]+)\/history$/);
  if (mUserHist && req.method === 'GET') {
    if (!requireAdmin()) return;
    const target = decodeURIComponent(mUserHist[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    return json(res, 200, { history: data.users[target].history || [] });
  }

  // ===== Hidden books (ซ่อนทั้งเรื่อง) =====
  if (pathname === '/api/admin/hidden-books' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { hiddenBooks: data.hiddenBooks || {} });
  }
  if (pathname === '/api/admin/hidden-books' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const bookId = String(body.bookId || '').trim();
    if (!bookId) return badRequest(res, 'ต้องมี bookId');
    data.hiddenBooks = data.hiddenBooks || {};
    data.hiddenBooks[bookId] = {
      bookName: String(body.bookName || '').slice(0, 200),
      reason: String(body.reason || '').slice(0, 300),
      hiddenBy: user.username,
      hiddenAt: new Date().toISOString(),
    };
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  const mHide = pathname.match(/^\/api\/admin\/hidden-books\/([^/]+)$/);
  if (mHide && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const bookId = decodeURIComponent(mHide[1]);
    if (!data.hiddenBooks?.[bookId]) return notFound(res);
    delete data.hiddenBooks[bookId];
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== Announcement banner =====
  if (pathname === '/api/admin/announcement' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { announcement: data.announcement || { enabled: false, text: '', color: 'blue' } });
  }
  if (pathname === '/api/admin/announcement' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const color = ['blue', 'amber', 'red', 'emerald'].includes(body.color) ? body.color : 'blue';
    data.announcement = {
      enabled: !!body.enabled,
      text: String(body.text || '').slice(0, 500),
      color,
      setBy: user.username,
      setAt: new Date().toISOString(),
    };
    await writeData(data);
    return json(res, 200, { ok: true, announcement: data.announcement });
  }

  // ===== Maintenance mode =====
  if (pathname === '/api/admin/maintenance' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { maintenance: data.maintenance || { enabled: false, message: '' } });
  }
  if (pathname === '/api/admin/maintenance' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    data.maintenance = {
      enabled: !!body.enabled,
      message: String(body.message || '').slice(0, 500),
      setBy: user.username,
      setAt: new Date().toISOString(),
    };
    await writeData(data);
    return json(res, 200, { ok: true, maintenance: data.maintenance });
  }

  if (pathname === '/api/admin/tracking' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { disableTracking: !!data.disableTracking });
  }
  if (pathname === '/api/admin/tracking' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    data.disableTracking = !!body.disableTracking;
    await writeData(data);
    return json(res, 200, { ok: true, disableTracking: data.disableTracking });
  }

  // ===== Login log (active sessions + historical) =====
  if (pathname === '/api/admin/login-log' && req.method === 'GET') {
    if (!requireAdmin()) return;
    const now = Date.now();
    const active = [];
    for (const [tok, sess] of Object.entries(data.sessions)) {
      if (typeof sess !== 'object' || !sess.username) continue;
      const loginAtMs = new Date(sess.loginAt).getTime();
      const lastSeenMs = new Date(sess.lastSeenAt || sess.loginAt).getTime();
      active.push({
        username: sess.username,
        loginAt: sess.loginAt,
        lastSeenAt: sess.lastSeenAt || sess.loginAt,
        durationMs: (isNaN(lastSeenMs) ? now : lastSeenMs) - (isNaN(loginAtMs) ? now : loginAtMs),
        tokenPreview: tok.slice(0, 8) + '…',
        active: true,
      });
    }
    active.sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''));
    const historical = (data.loginLog || []).slice().reverse();
    return json(res, 200, { active, historical });
  }
  if (pathname === '/api/admin/login-log' && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    data.loginLog = [];
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/locks' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { locks: data.locks });
  }
  if (pathname === '/api/admin/locks' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const { bookId, episodes } = body;
    if (!bookId) return badRequest(res, 'ต้องมี bookId');
    const eps = Array.isArray(episodes) ? episodes.map(Number).filter(n => n > 0) : [];
    if (eps.length === 0) delete data.locks[bookId];
    else data.locks[bookId] = { episodes: eps, setBy: user.username, setAt: new Date().toISOString() };
    await writeData(data);
    return json(res, 200, { ok: true, locks: data.locks[bookId] || null });
  }

  if (pathname === '/api/admin/freemode' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, {
      freeMode: data.freeMode || { enabled: false, message: '', startAt: null, endAt: null },
      active: isFreeActive(data),
    });
  }
  if (pathname === '/api/admin/freemode' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const enabled = !!body.enabled;
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : '';
    const parseDate = v => {
      if (!v) return null;
      const t = new Date(v).getTime();
      return isNaN(t) ? null : new Date(t).toISOString();
    };
    const startAt = parseDate(body.startAt);
    const endAt = parseDate(body.endAt);
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      return badRequest(res, 'วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่ม');
    }
    data.freeMode = {
      enabled, message, startAt, endAt,
      setBy: user.username,
      setAt: new Date().toISOString(),
    };
    await writeData(data);
    return json(res, 200, { ok: true, freeMode: data.freeMode, active: isFreeActive(data) });
  }

  if (pathname === '/api/admin/giftcards' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { giftcards: data.giftcards });
  }
  if (pathname === '/api/admin/giftcards' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    let { code, coins } = body;
    coins = parseInt(coins, 10);
    if (!code || !coins || coins <= 0) return badRequest(res, 'ต้องมี code และ coins > 0');
    if (data.giftcards[code]) return badRequest(res, 'code นี้มีอยู่แล้ว');
    data.giftcards[code] = { coins, used: false, usedBy: null, createdBy: user.username, createdAt: new Date().toISOString() };
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  const mGift = pathname.match(/^\/api\/admin\/giftcards\/([^/]+)$/);
  if (mGift && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const code = decodeURIComponent(mGift[1]);
    if (!data.giftcards[code]) return notFound(res);
    delete data.giftcards[code];
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/discounts' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { discounts: data.discounts });
  }
  if (pathname === '/api/admin/discounts' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const { code } = body;
    const percent = parseInt(body.percent, 10);
    if (!code || !percent || percent <= 0 || percent >= 100) return badRequest(res, 'ต้องมี code และ percent 1-99');
    data.discounts[code] = { percent, active: true, createdBy: user.username, createdAt: new Date().toISOString() };
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  const mDisc = pathname.match(/^\/api\/admin\/discounts\/([^/]+)$/);
  if (mDisc && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const code = decodeURIComponent(mDisc[1]);
    if (!data.discounts[code]) return notFound(res);
    delete data.discounts[code];
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/topup-history' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { history: data.topupHistory || [] });
  }

  // ===== Watch history =====
  if (req.method === 'POST' && pathname === '/api/history/log') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const { bookId, index, bookName, cover } = body;
    if (!bookId || !index) return badRequest(res, 'ต้องมี bookId และ index');
    const u = data.users[user.username];
    u.history = u.history || [];
    // dedupe: ถ้ามี bookId นี้อยู่แล้ว → remove เก่าก่อน push ใหม่
    u.history = u.history.filter(h => h.bookId !== bookId);
    u.history.unshift({ bookId, index: Number(index), bookName: bookName || '', cover: cover || '', at: new Date().toISOString() });
    if (u.history.length > 100) u.history = u.history.slice(0, 100);
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && pathname === '/api/history') {
    if (!user) return unauthorized(res);
    const u = data.users[user.username];
    return json(res, 200, { history: u.history || [] });
  }
  if (req.method === 'DELETE' && pathname === '/api/history') {
    if (!user) return unauthorized(res);
    data.users[user.username].history = [];
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  // เช็คตอนล่าสุดของ bookId เดียว (ใช้ในหน้า detail)
  const mHist = pathname.match(/^\/api\/history\/latest$/);
  if (mHist && req.method === 'GET') {
    if (!user) return json(res, 200, { entry: null });
    const bookId = query.bookId;
    if (!bookId) return badRequest(res, 'ต้องมี bookId');
    const u = data.users[user.username];
    const entry = (u.history || []).find(h => h.bookId === bookId) || null;
    return json(res, 200, { entry });
  }
  // ลบรายการเดียวจากประวัติ
  const mHistDel = pathname.match(/^\/api\/history\/([^/]+)$/);
  if (mHistDel && req.method === 'DELETE' && mHistDel[1] !== 'latest') {
    if (!user) return unauthorized(res);
    const bookId = decodeURIComponent(mHistDel[1]);
    const u = data.users[user.username];
    u.history = (u.history || []).filter(h => h.bookId !== bookId);
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== Admin slip review =====
  if (pathname === '/api/admin/slips' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { slips: data.slipPending || [] });
  }
  const mSlipApprove = pathname.match(/^\/api\/admin\/slips\/([^/]+)\/approve$/);
  if (mSlipApprove && req.method === 'POST') {
    if (!requireAdmin()) return;
    const slip = (data.slipPending || []).find(s => s.id === mSlipApprove[1]);
    if (!slip) return notFound(res);
    if (slip.status !== 'pending') return badRequest(res, 'สลิปนี้ดำเนินการแล้ว');
    const u = data.users[slip.username];
    if (!u) return notFound(res, 'ไม่พบ user');
    u.coins = (u.coins || 0) + slip.amount;
    slip.status = 'approved';
    slip.approvedBy = user.username;
    slip.approvedAt = new Date().toISOString();
    data.topupHistory = data.topupHistory || [];
    data.topupHistory.push({ username: slip.username, packageId: 'slip:' + slip.id, coins: slip.amount, pricePaid: slip.amount, discount: null, at: slip.approvedAt });
    await writeData(data);
    return json(res, 200, { ok: true, coinsAdded: slip.amount, newBalance: u.coins });
  }
  const mSlipReject = pathname.match(/^\/api\/admin\/slips\/([^/]+)\/reject$/);
  if (mSlipReject && req.method === 'POST') {
    if (!requireAdmin()) return;
    const slip = (data.slipPending || []).find(s => s.id === mSlipReject[1]);
    if (!slip) return notFound(res);
    slip.status = 'rejected';
    slip.approvedBy = user.username;
    slip.approvedAt = new Date().toISOString();
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  return notFound(res, 'API endpoint ไม่พบ: ' + req.method + ' ' + pathname);
}

// ---------- Main server ----------
const server = http.createServer(async (req, res) => {
  try {
    const parsed = urlMod.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      });
      return res.end();
    }

    // Proxy to seriesjeen
    if (pathname.startsWith('/proxy/')) {
      return proxyToSeriesjeen(req.url, res);
    }

    // Our API
    if (pathname.startsWith('/api/')) {
      return handleApi(req, res, pathname, parsed.query);
    }

    // Static + clean URL
    let servePath = pathname;
    if (servePath === '/') servePath = '/index.html';
    if (!path.extname(servePath)) servePath = servePath + '.html';
    const filePath = path.join(ROOT, servePath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    // กัน data.json โดน serve ตรงๆ จาก URL
    if (filePath === DATA_FILE) { res.writeHead(403); return res.end('Forbidden'); }
    serveFile(filePath, res);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'server_error', message: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`MKW - dooseries: http://localhost:${PORT}/`);
  console.log(`Proxy: /proxy/* → https://${SERIESJEEN_HOST}/*`);
  console.log(`Data: ${DATA_FILE}`);
});
