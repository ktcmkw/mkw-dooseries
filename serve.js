// MKW Movies — static + proxy + auth + admin backend
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

const EPISODE_COST = 1;  // MKW Coin per locked episode

// ---------- API source registry helpers ----------
// apiSources เป็น array ใน data store (admin จัดการผ่าน UI ได้)
// แต่ละ source: { key, label, badgeClass, enabled, host, basePath, tokenEnv, adapter }
//   - key       : unique identifier — ใช้ใน URL `/proxy/<key>/...` และ frontend SOURCE_ADAPTERS lookup
//   - host      : hostname เช่น 'api.seriesjeen.online'
//   - basePath  : path prefix prepend ตอน proxy เช่น '/api/platform/dramabox'
//   - tokenEnv  : ชื่อ env var ที่ server ใช้ resolve Bearer token (เก็บฝั่ง server เท่านั้น)
//   - adapter   : ชี้ไปที่ SOURCE_ADAPTERS key ใน frontend (response normalization)
function getApiSources(data) {
  return Array.isArray(data?.apiSources) ? data.apiSources : [];
}
function getApiSourceKeys(data, opts = {}) {
  const onlyEnabled = opts.onlyEnabled !== false;
  return getApiSources(data).filter(s => onlyEnabled ? s.enabled !== false : true).map(s => s.key);
}
function findApiSource(data, key) {
  return getApiSources(data).find(s => s.key === key) || null;
}
function resolveSourceToken(src) {
  if (!src) return '';
  const env = src.tokenEnv || '';
  return env ? (process.env[env] || '') : '';
}
function publicApiSource(s) {
  const eps = s.endpoints && typeof s.endpoints === 'object' ? s.endpoints : endpointsFor(s.adapter || s.key);
  return {
    key: s.key,
    label: s.label || s.key,
    badgeClass: s.badgeClass || 'bg-zinc-700',
    adapter: s.adapter || s.key,
    enabled: s.enabled !== false,
    endpoints: { ...eps },
    localeParam: s.localeParam || '',
    locales: {
      mode: (s.locales && s.locales.mode === 'selected') ? 'selected' : 'all',
      allowed: Array.isArray(s.locales?.allowed) ? s.locales.allowed.slice() : [],
    },
    fieldMap: (s.fieldMap && typeof s.fieldMap === 'object') ? { ...s.fieldMap } : {},
  };
}

// ---------- Endpoint templates per adapter (placeholder: {page},{page_size},{keyword},{series_id},{genre_id},{ep},{locale}) ----------
const DEFAULT_ENDPOINTS = {
  dramabox: {
    list:        '/list?page={page}&page_size={page_size}',
    search:      '/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:      '/detail?bookId={series_id}',
    alleps:      '/allepisode?bookId={series_id}',
    genres:      '/genres',
    genre:       '/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch: '/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}',
    locales:     '/locales',
    video:       '',
  },
  melolo: {
    list:        '/list?page={page}&page_size={page_size}',
    search:      '/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:      '/detail/{series_id}',
    alleps:      '',
    genres:      '/genres',
    genre:       '/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch: '/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}',
    locales:     '/locales',
    video:       '/video?id={series_id}&ep={ep}',
  },
  shortmax: {
    list:        '/list?page={page}&page_size={page_size}',
    search:      '/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:      '/detail/{series_id}',
    alleps:      '/alleps/{series_id}',
    genres:      '/genres',
    genre:       '/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch: '/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}',
    locales:     '/locales',
    video:       '',
  },
  dramawave: {
    list:        '/list?page={page}&page_size={page_size}',
    search:      '/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:      '/drama/{series_id}',
    alleps:      '',
    genres:      '/genres',
    genre:       '/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch: '/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}',
    locales:     '/locales',
    video:       '',
  },
  netshort: {
    list:        '/list?page={page}&page_size={page_size}',
    search:      '/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:      '/drama/{series_id}',
    alleps:      '',
    genres:      '/genres',
    genre:       '/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch: '/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}',
    locales:     '/locales',
    video:       '/watch/{series_id}/{ep}',
  },
};
const ENDPOINT_KEYS = ['list','search','detail','alleps','genres','genre','genreSearch','locales','video'];
function endpointsFor(adapter) {
  const base = DEFAULT_ENDPOINTS[adapter] || DEFAULT_ENDPOINTS.dramabox;
  return { ...base };
}
function substituteVars(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars && vars[k];
    return v == null || v === '' ? '' : encodeURIComponent(String(v));
  });
}
function sanitizeEndpoints(input, adapter) {
  const out = endpointsFor(adapter);
  if (input && typeof input === 'object') {
    for (const k of ENDPOINT_KEYS) {
      if (typeof input[k] === 'string') out[k] = input[k].slice(0, 500);
    }
  }
  return out;
}
function sanitizeLocales(input) {
  const mode = (input && input.mode === 'selected') ? 'selected' : 'all';
  const allowed = Array.isArray(input?.allowed)
    ? input.allowed.filter(x => typeof x === 'string' && x.length && x.length <= 40).slice(0, 100)
    : [];
  const discovered = Array.isArray(input?.discovered)
    ? input.discovered
        .filter(x => x && typeof x === 'object' && typeof x.id === 'string')
        .map(x => ({ id: String(x.id).slice(0, 40), name: String(x.name || x.id).slice(0, 100) }))
        .slice(0, 200)
    : [];
  return { mode, allowed, discovered };
}
// FIELD_MAP_KEYS: ชื่อ field ในแต่ละ response ที่ต้องอ่าน (ใช้ตอน response shape ของ API ใหม่ไม่ตรง 5 adapter ที่มี)
// ค่าว่าง = ใช้ fallback chain ใน dramaCard/pickList (เช่น series_id||bookId||id)
const FIELD_MAP_KEYS = ['itemsPath', 'idField', 'titleField', 'coverField', 'countField'];
function sanitizeFieldMap(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of FIELD_MAP_KEYS) {
    if (typeof input[k] === 'string') out[k] = input[k].trim().slice(0, 100);
  }
  return out;
}

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
    admin: { password: process.env.ADMIN_PASSWORD || 'admin', role: 'admin', coins: 9999999, unlocked: [], inbox: [], created: new Date().toISOString().slice(0, 10) },
  },
  sessions: {},
  locks: {},
  giftcards: {
    NSVWELCOME: { type: 'coin', coins: 100, maxUses: 1, uses: [], used: false, usedBy: null, createdBy: 'admin' },
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
  vipHistory: [],                                             // [{username, packageId, days, coinsPaid, at, vipExpiresAfter}]
  adminInbox: [],                                             // [{id, fromUsername, fromIp, subject, body, at, read, deletedAt?}] — ข้อความ user→admin
  slipPending: [],
  freeMode: { enabled: false, message: '', startAt: null, endAt: null },
  roleLimits: { guestEps: 0, userEps: 10 },
  announcement: { enabled: false, text: '', color: 'blue' },  // banner ใต้ header
  maintenance: { enabled: false, message: '' },               // ปิดเว็บชั่วคราว (admin ผ่านได้)
  loginDisabled: false,                                        // ปิดระบบ login (admin ยัง login ได้)
  registerDisabled: false,                                     // ปิดระบบสมัครสมาชิก (รวม Google OAuth สมัครใหม่)
  authToggleMessage: '',                                       // ข้อความแสดงเมื่อ login/register ปิด
  disableTracking: false,                                      // ปิดการบันทึก lastSeenAt/loginLog ชั่วคราว (ลดภาระ disk write)
  hiddenBooks: {},                                            // bookId → { hiddenBy, hiddenAt, reason, bookName }
  loginLog: [],                                               // [{ username, loginAt, logoutAt, durationMs }] max 1000
  welcomeGift: { enabled: false, coins: 0, vipDays: 0, message: 'ยินดีต้อนรับสู่ MKW Movies!' },
  registerSettings: { maxPerIp: 3, banHours: 24 },             // จำกัดสมัครต่อ IP
  registerIpLog: {},                                          // ip → { count, firstAt }
  bannedIps: {},                                              // ip → { until, reason }
  pointsConfig: { pointsPerMinute: 10, dailyCap: 10000, redeemRate: 100 },  // 100 point = 1 coin
  sessionClosures: {},                                        // token → { reason, at } (TTL 24h) เก็บไว้แจ้งฝั่ง client ที่ถูกเตะ
  seenBooks: {},                                              // source → bookId → { firstSeenAt, bookName, cover } (NEW badge tracking)
  lastPollAt: {},                                             // source → ISO timestamp ของ midnight poll ครั้งล่าสุด
  apiSources: [
    { key: 'dramabox',  label: 'DramaBox',  badgeClass: 'bg-red-600',     enabled: true,
      host: 'api.seriesjeen.online', basePath: '/api/platform/dramabox',  tokenEnv: 'SERIESJEEN_TOKEN', adapter: 'dramabox',
      endpoints: endpointsFor('dramabox'),  localeParam: '', locales: { mode: 'all', allowed: [], discovered: [] } },
    { key: 'melolo',    label: 'Melolo',    badgeClass: 'bg-yellow-500',  enabled: true,
      host: 'api.seriesjeen.online', basePath: '/api/platform/melolo',    tokenEnv: 'SERIESJEEN_TOKEN', adapter: 'melolo',
      endpoints: endpointsFor('melolo'),    localeParam: '', locales: { mode: 'all', allowed: [], discovered: [] } },
    { key: 'shortmax',  label: 'ShortMax',  badgeClass: 'bg-blue-600',    enabled: true,
      host: 'api.seriesjeen.online', basePath: '/api/platform/shortmax',  tokenEnv: 'SERIESJEEN_TOKEN', adapter: 'shortmax',
      endpoints: endpointsFor('shortmax'),  localeParam: '', locales: { mode: 'all', allowed: [], discovered: [] } },
    { key: 'dramawave', label: 'DramaWave', badgeClass: 'bg-purple-600',  enabled: true,
      host: 'api.seriesjeen.online', basePath: '/api/platform/dramawave', tokenEnv: 'SERIESJEEN_TOKEN', adapter: 'dramawave',
      endpoints: endpointsFor('dramawave'), localeParam: '', locales: { mode: 'all', allowed: [], discovered: [] } },
    { key: 'netshort',  label: 'Netshort',  badgeClass: 'bg-emerald-600', enabled: true,
      host: 'api.seriesjeen.online', basePath: '/api/platform/netshort',  tokenEnv: 'SERIESJEEN_TOKEN', adapter: 'netshort',
      endpoints: endpointsFor('netshort'),  localeParam: '', locales: { mode: 'all', allowed: [], discovered: [] } },
  ],
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
  // One-time migration: freeMode.{guestEps,userEps} → roleLimits (ถ้าเคยตั้งไว้แต่ยังไม่ย้าย)
  if (data.freeMode && (data.freeMode.guestEps != null || data.freeMode.userEps != null)) {
    data.roleLimits = data.roleLimits || {};
    if (data.roleLimits.guestEps == null && data.freeMode.guestEps != null) data.roleLimits.guestEps = data.freeMode.guestEps;
    if (data.roleLimits.userEps == null && data.freeMode.userEps != null) data.roleLimits.userEps = data.freeMode.userEps;
    delete data.freeMode.guestEps;
    delete data.freeMode.userEps;
  }
  // apiSources migration: เพิ่ม endpoints/localeParam/locales ให้ source เก่าที่ยังไม่มี
  if (Array.isArray(data.apiSources)) {
    for (const s of data.apiSources) {
      if (!s.endpoints || typeof s.endpoints !== 'object') s.endpoints = endpointsFor(s.adapter || s.key);
      else {
        const base = endpointsFor(s.adapter || s.key);
        for (const k of ENDPOINT_KEYS) if (typeof s.endpoints[k] !== 'string') s.endpoints[k] = base[k] || '';
      }
      if (typeof s.localeParam !== 'string') s.localeParam = '';
      if (!s.locales || typeof s.locales !== 'object') s.locales = { mode: 'all', allowed: [], discovered: [] };
      else {
        if (s.locales.mode !== 'selected') s.locales.mode = 'all';
        if (!Array.isArray(s.locales.allowed)) s.locales.allowed = [];
        if (!Array.isArray(s.locales.discovered)) s.locales.discovered = [];
      }
      if (!s.fieldMap || typeof s.fieldMap !== 'object') s.fieldMap = {};
    }
  }
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
function unauthorized(res, msg = 'ต้อง login ก่อน', reason) {
  const body = { error: msg };
  if (reason) body.reason = reason;
  json(res, 401, body);
}
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
  const tok = m[1];
  const sess = data.sessions[tok];
  if (!sess) {
    // ตรวจว่าเคยถูกเตะออกจาก single-device enforcement ไหม (เก็บใน sessionClosures TTL 24h)
    const closure = data.sessionClosures?.[tok];
    if (closure) req._closureReason = closure.reason || 'session_closed';
    return null;
  }
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

// Single-device enforcement — ปิด session อื่นทั้งหมดของ user นี้ (ยกเว้น keepToken)
// เก็บใน sessionClosures เพื่อบอกฝั่ง client ที่ถูกเตะว่าโดน replace
function kickOtherSessionsOfUser(data, username, keepToken) {
  data.sessionClosures = data.sessionClosures || {};
  const nowIso = new Date().toISOString();
  let count = 0;
  for (const [tok, sess] of Object.entries(data.sessions)) {
    const uname = typeof sess === 'string' ? sess : sess.username;
    if (uname !== username) continue;
    if (tok === keepToken) continue;
    closeSession(data, tok, 'session_replaced');
    data.sessionClosures[tok] = { reason: 'session_replaced', at: nowIso };
    count++;
  }
  // GC — ลบ closures ที่เก่ากว่า 24h
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [tok, c] of Object.entries(data.sessionClosures)) {
    if (new Date(c.at).getTime() < cutoff) delete data.sessionClosures[tok];
  }
  return count;
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

function publicUser(u, data) {
  if (!u) return null;
  const today = getBangkokDate();
  const pd = u.pointsDaily || { date: '', earned: 0 };
  const pc = data ? getPointsConfig(data) : { pointsPerMinute: 10, dailyCap: 10000, redeemRate: 100 };
  return {
    username: u.username,
    role: u.role,
    coins: u.coins,
    unlocked: u.unlocked || [],
    created: u.created,
    vipExpires: u.vipExpires || null,
    points: u.points || 0,
    pointsToday: pd.date === today ? (pd.earned || 0) : 0,
    pointsDailyCap: pc.dailyCap,
    pointsPerMinute: pc.pointsPerMinute,
    pointsRedeemRate: pc.redeemRate,
  };
}

function getPointsConfig(data) {
  const pc = data.pointsConfig || {};
  return {
    pointsPerMinute: Math.max(1, Math.min(1000, parseInt(pc.pointsPerMinute, 10) || 10)),
    dailyCap: Math.max(0, Math.min(1000000, parseInt(pc.dailyCap, 10) || 10000)),
    redeemRate: Math.max(1, Math.min(100000, parseInt(pc.redeemRate, 10) || 100)),
  };
}

function getBangkokDate() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// ---------- IP ban / register throttle ----------
function isIpBanned(data, ip) {
  const b = data.bannedIps?.[ip];
  if (!b) return null;
  if (Date.now() >= new Date(b.until).getTime()) {
    delete data.bannedIps[ip];
    return null;
  }
  return b;
}
// Register ครั้งที่ N — คืน { ok, warning?, banned? }
function recordRegisterIp(data, ip) {
  const settings = data.registerSettings || { maxPerIp: 3, banHours: 24 };
  const max = Math.max(1, parseInt(settings.maxPerIp, 10) || 3);
  const windowMs = Math.max(1, parseInt(settings.banHours, 10) || 24) * 3600 * 1000;
  data.registerIpLog = data.registerIpLog || {};
  const now = Date.now();
  let rec = data.registerIpLog[ip];
  if (rec && (now - new Date(rec.firstAt).getTime() > windowMs)) rec = null;  // หมดอายุ window → reset
  if (!rec) rec = { count: 0, firstAt: new Date(now).toISOString() };
  rec.count++;
  data.registerIpLog[ip] = rec;
  if (rec.count > max) {
    data.bannedIps = data.bannedIps || {};
    data.bannedIps[ip] = {
      until: new Date(now + windowMs).toISOString(),
      reason: `สมัครสมาชิกเกินกำหนด (${rec.count}/${max}) — ทำผิดกฎของเว็บไซต์`,
    };
    return { ok: false, banned: true, until: data.bannedIps[ip].until };
  }
  if (rec.count === max) return { ok: true, warning: `IP นี้สมัครได้อีก 0 ครั้งใน ${settings.banHours} ชั่วโมงข้างหน้า — หากสมัครเพิ่มจะถูกระงับ IP` };
  return { ok: true };
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

// ---------- Inbox (per-user messages) ----------
// Message shape: {id, from, subject, body, at, read}
// Max 100 ต่อ user (ตัด oldest ออก)
function sendInbox(data, username, msg) {
  const u = data.users[username];
  if (!u) return false;
  u.inbox = u.inbox || [];
  const m = {
    id: crypto.randomBytes(6).toString('hex'),
    from: String(msg.from || 'system').slice(0, 50),
    subject: String(msg.subject || '').slice(0, 200),
    body: String(msg.body || '').slice(0, 3000),
    at: new Date().toISOString(),
    read: false,
  };
  if (msg.gift) m.gift = msg.gift;
  u.inbox.unshift(m);
  if (u.inbox.length > 100) u.inbox = u.inbox.slice(0, 100);
  return m;
}
function sendInboxBroadcast(data, msg) {
  let count = 0;
  for (const username of Object.keys(data.users)) {
    if (sendInbox(data, username, msg)) count++;
  }
  return count;
}

// ---------- Welcome gift ----------
function deliverWelcomeGift(data, username) {
  const wg = data.welcomeGift || {};
  if (!wg.enabled) { console.log('[welcome] skip (disabled) →', username); return null; }
  const coins = Math.max(0, parseInt(wg.coins, 10) || 0);
  const vipDays = Math.max(0, parseInt(wg.vipDays, 10) || 0);
  if (coins === 0 && vipDays === 0) { console.log('[welcome] skip (0 coins + 0 vipDays) →', username); return null; }
  const type = coins > 0 && vipDays > 0 ? 'both' : (vipDays > 0 ? 'vip' : 'coin');
  const m = sendInbox(data, username, {
    from: 'system',
    subject: '🎁 ของขวัญต้อนรับสมาชิกใหม่',
    body: wg.message || 'ยินดีต้อนรับสู่ MKW Movies!',
    gift: { type, coins, vipDays, claimed: false, claimedAt: null },
  });
  console.log('[welcome] delivered →', username, 'type=' + type, 'coins=' + coins, 'vipDays=' + vipDays, 'msgId=' + (m?.id || '(sendInbox failed)'));
  return m;
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

// ---------- Proxy to API source (registry-aware) ----------
// URL pattern: `/proxy/<sourceKey>/<rest>` → `https://<host><basePath>/<rest>`
// Backward compat: `/proxy/api/platform/<src>/<rest>` → ลองหา src ใน registry; ถ้าเจอ
//   forward ไป `https://<src.host>/api/platform/<src>/<rest>` (path คงเดิม ignore basePath)
async function proxyToSource(reqUrl, res) {
  const data = await readData();
  let src = null;
  let finalPath = '';

  // (legacy) /proxy/api/platform/<key>/<rest>
  const mLegacy = reqUrl.match(/^\/proxy(\/api\/platform\/([^/?#]+).*)$/);
  if (mLegacy) {
    src = findApiSource(data, mLegacy[2]);
    finalPath = mLegacy[1];  // คง path เดิม
  } else {
    // /proxy/<key>/<rest>
    const m = reqUrl.match(/^\/proxy\/([^/?#]+)(.*)$/);
    if (m) {
      src = findApiSource(data, m[1]);
      const sub = m[2] || '/';
      finalPath = (src?.basePath || '') + (sub.startsWith('/') ? sub : '/' + sub);
    }
  }

  if (!src) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'source_not_found', message: 'ไม่พบ API source ในระบบ', url: reqUrl }));
  }
  if (src.enabled === false) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'source_disabled', message: `API "${src.label || src.key}" ถูกปิดอยู่` }));
  }
  const token = resolveSourceToken(src);
  if (!token) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'token_missing', message: `ตั้ง env var "${src.tokenEnv}" ใน Render ก่อน` }));
  }
  const options = {
    hostname: src.host || SERIESJEEN_HOST,
    path: finalPath,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
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
    res.end(JSON.stringify({ error: 'proxy_error', message: e.message, target: finalPath }));
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

  // admin / vip → ดูได้ทุกอย่างเสมอ (ไม่สน freeMode, role limit, admin lock)
  if (user?.role === 'admin') return { allowed: true };
  if (user?.role === 'vip')   return { allowed: true };

  const idx = Number(index);

  // FreeMode ON: user login ดูได้ทุกตอนฟรี / guest ต้อง login
  if (isFreeActive(data)) {
    if (!user) return { allowed: false, reason: 'need_login', freeMode: true };
    return { allowed: true, freeMode: true };
  }

  // FreeMode OFF → เช็ค per-role limit ก่อน (ตั้งค่าแยกใน admin panel)
  const limits = data.roleLimits || {};
  const guestEps = Number.isFinite(limits.guestEps) ? limits.guestEps : 0;
  const userEps  = Number.isFinite(limits.userEps)  ? limits.userEps  : 10;

  if (!user) {
    if (idx > guestEps) return { allowed: false, reason: 'need_login', guestLimit: guestEps };
  } else {
    // role === 'user'
    if (idx > userEps) return { allowed: false, reason: 'need_vip', userLimit: userEps };
  }

  // ภายใน role limit → ตรวจ admin-set per-book lock
  const adminLocked = (data.locks[bookId]?.episodes || []).includes(idx);
  if (!adminLocked) return { allowed: true };

  // Locked ep → guest need login / user ใช้เหรียญ หรือ VIP (VIP handled ด้านบนแล้ว)
  if (!user) return { allowed: false, reason: 'need_login' };
  const key = `${bookId}:${idx}`;
  if ((user.unlocked || []).includes(key)) return { allowed: true };
  return { allowed: false, reason: 'need_coin', cost: EPISODE_COST, userCoins: user.coins };
}

// ---------- Route dispatch ----------
async function handleApi(req, res, pathname, query) {
  const data = await readData();
  const user = await getAuthUser(req, data);
  const ip = clientIp(req);

  // Single-device: token ของ user นี้ถูกเตะเพราะ login จากเครื่องอื่น → แจ้ง client ให้ logout + เด้ง alert
  if (!user && req._closureReason === 'session_replaced') {
    return unauthorized(res, 'พบการ login จากเครื่องอื่น — คุณถูก logout จากเครื่องนี้', 'session_replaced');
  }

  // IP ban — ปิดเว็บทั้งหมด ยกเว้น admin (login ผ่าน session เดิมได้)
  const ban = isIpBanned(data, ip);
  if (ban && user?.role !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'ip_banned', message: 'ทำผิดกฎของเว็บไซต์ — IP นี้ถูกระงับ', until: ban.until, reason: ban.reason || '' }));
  }

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
      roleLimits: {
        guestEps: Number.isFinite(data.roleLimits?.guestEps) ? data.roleLimits.guestEps : 0,
        userEps: Number.isFinite(data.roleLimits?.userEps) ? data.roleLimits.userEps : 10,
      },
      announcement: { enabled: !!an.enabled, text: an.text || '', color: an.color || 'blue' },
      maintenance: { enabled: !!mt.enabled, message: mt.message || '' },
      authToggle: {
        loginDisabled: !!data.loginDisabled,
        registerDisabled: !!data.registerDisabled,
        message: data.authToggleMessage || '',
      },
      hiddenBooks: Object.keys(data.hiddenBooks || {}),
      trackingDisabled: !!data.disableTracking,
      apiSources: getApiSources(data).filter(s => s.enabled !== false).map(publicApiSource),
    });
  }

  // ===== Books ingest — บันทึก bookId ที่ frontend เห็นใน /list → กลับ bookIds ที่เป็น NEW =====
  // NEW = firstSeenAt อยู่ใน 7 วันล่าสุด + อยู่ใน top 10 ล่าสุดของ source นั้น
  // Public endpoint (ไม่ต้อง login) — rate limited per IP เพื่อกันสแปม
  if (req.method === 'POST' && pathname === '/api/books/ingest') {
    const rl = rateLimit(`ingest:${ip}`, 30, 60_000);
    if (!rl.ok) return badRequest(res, `ส่งถี่เกินไป ลองใหม่ใน ${rl.retryAfterSec} วินาที`);
    const body = await readBody(req);
    const source = String(body.source || '').trim();
    if (!getApiSourceKeys(data).includes(source)) return badRequest(res, 'source ไม่ถูกต้อง');
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    data.seenBooks = data.seenBooks || {};
    data.seenBooks[source] = data.seenBooks[source] || {};
    const bucket = data.seenBooks[source];
    const nowIso = new Date().toISOString();
    let added = 0;
    for (const it of items) {
      const bookId = String(it?.bookId || '').trim();
      if (!bookId) continue;
      if (!bucket[bookId]) {
        bucket[bookId] = {
          firstSeenAt: nowIso,
          bookName: String(it.bookName || '').slice(0, 200),
          cover: String(it.cover || '').slice(0, 500),
        };
        added++;
      }
    }
    // GC: ลบ entry ที่เก่ากว่า 30 วัน เพื่อจำกัดขนาด
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [bid, info] of Object.entries(bucket)) {
      const t = new Date(info.firstSeenAt).getTime();
      if (!isNaN(t) && t < cutoff) delete bucket[bid];
    }
    if (added > 0) await writeData(data);
    // คำนวณ NEW: top 10 ล่าสุด + firstSeenAt ≤ 7 วัน
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const sorted = Object.entries(bucket)
      .sort((a, b) => (b[1].firstSeenAt || '').localeCompare(a[1].firstSeenAt || ''))
      .slice(0, 10);
    const newBookIds = sorted
      .filter(([, info]) => new Date(info.firstSeenAt).getTime() >= weekAgo)
      .map(([bid]) => bid);
    return json(res, 200, { newBookIds, added, total: Object.keys(bucket).length });
  }

  // ===== Auth =====
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    const { username, password } = body;
    if (data.registerDisabled) return badRequest(res, 'ระบบสมัครสมาชิกปิดชั่วคราว — ' + (data.authToggleMessage || 'กรุณากลับมาภายหลัง'));
    if (!username || !password) return badRequest(res, 'ต้องมี username และ password');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return badRequest(res, 'username: a-z 0-9 _ ยาว 3-20');
    if (password.length < 3) return badRequest(res, 'password สั้นเกินไป');
    if (data.users[username]) return badRequest(res, 'username นี้ถูกใช้แล้ว');
    data.users[username] = { password, role: 'user', coins: 0, unlocked: [], inbox: [], created: new Date().toISOString().slice(0, 10) };
    const ipTrack = recordRegisterIp(data, ip);
    if (!ipTrack.ok && ipTrack.banned) {
      delete data.users[username];
      await writeData(data);
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'ip_banned', message: 'ทำผิดกฎของเว็บไซต์ — IP นี้ถูกระงับจากการสมัครเกินกำหนด', until: ipTrack.until }));
    }
    deliverWelcomeGift(data, username);
    const token = randomToken();
    const nowIso = new Date().toISOString();
    kickOtherSessionsOfUser(data, username, token);
    data.sessions[token] = { username, loginAt: nowIso, lastSeenAt: nowIso };
    await writeData(data);
    return json(res, 200, { token, user: publicUser({ username, ...data.users[username] }, data), warning: ipTrack.warning || null });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const { username, password } = body;
    if (!username || !password) return badRequest(res, 'ต้องมี username และ password');
    const u = data.users[username];
    if (!u || u.password !== password) return unauthorized(res, 'username หรือ password ผิด');
    if (data.loginDisabled && u.role !== 'admin') return badRequest(res, 'ระบบ login ปิดชั่วคราว — ' + (data.authToggleMessage || 'กรุณากลับมาภายหลัง'));
    const token = randomToken();
    const nowIso = new Date().toISOString();
    kickOtherSessionsOfUser(data, username, token);
    data.sessions[token] = { username, loginAt: nowIso, lastSeenAt: nowIso };
    await writeData(data);
    return json(res, 200, { token, user: publicUser({ username, ...u }, data) });
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
        if (data.registerDisabled) { res.writeHead(403); return res.end('ระบบสมัครสมาชิกปิดชั่วคราว — ' + (data.authToggleMessage || 'กรุณากลับมาภายหลัง')); }
        // ใช้ email prefix เป็น username (sanitize)
        let base = profile.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16) || 'user';
        username = base;
        let i = 1;
        while (data.users[username]) { username = base + '_' + i++; }
        data.users[username] = {
          password: crypto.randomBytes(16).toString('hex'), // random — google-only login
          role: 'user', coins: 0, unlocked: [], inbox: [], created: new Date().toISOString().slice(0, 10),
          googleEmail: profile.email, googleName: profile.name || '',
        };
        const ipTrack = recordRegisterIp(data, ip);
        if (!ipTrack.ok && ipTrack.banned) {
          delete data.users[username];
          await writeData(data);
          res.writeHead(403);
          return res.end('ทำผิดกฎของเว็บไซต์ — IP นี้ถูกระงับจากการสมัครเกินกำหนด');
        }
        deliverWelcomeGift(data, username);
      } else if (data.loginDisabled && data.users[username].role !== 'admin') {
        res.writeHead(403); return res.end('ระบบ login ปิดชั่วคราว — ' + (data.authToggleMessage || 'กรุณากลับมาภายหลัง'));
      }
      const token = randomToken();
      const nowIso = new Date().toISOString();
      kickOtherSessionsOfUser(data, username, token);
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
    return json(res, 200, { user: publicUser(user, data) });
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

  // ===== Online Points (เก็บพ้อยจากการดูวิดีโอ — ตั้งค่าใน admin panel) =====
  if (req.method === 'POST' && pathname === '/api/user/points/tick') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const seconds = Math.max(0, Math.min(600, parseInt(body.seconds || 0, 10) || 0));
    const today = getBangkokDate();
    const u = data.users[user.username];
    u.points = u.points || 0;
    if (!u.pointsDaily || u.pointsDaily.date !== today) u.pointsDaily = { date: today, earned: 0 };
    const pc = getPointsConfig(data);
    const minutes = Math.floor(seconds / 60);
    const want = minutes * pc.pointsPerMinute;
    const room = Math.max(0, pc.dailyCap - u.pointsDaily.earned);
    const give = Math.min(room, want);
    if (give > 0) {
      u.points += give;
      u.pointsDaily.earned += give;
      await writeData(data);
    }
    return json(res, 200, { points: u.points, pointsToday: u.pointsDaily.earned, cap: pc.dailyCap, added: give });
  }

  if (req.method === 'POST' && pathname === '/api/user/redeem-points') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const want = parseInt(body.points || 0, 10) || 0;
    const u = data.users[user.username];
    u.points = u.points || 0;
    const pc = getPointsConfig(data);
    const rate = pc.redeemRate;
    const usable = Math.floor(Math.min(u.points, want) / rate) * rate;
    if (usable < rate) return badRequest(res, `ต้องแลกอย่างน้อย ${rate} Point (มี ${u.points} Point)`);
    const coinsAdded = usable / rate;
    u.points -= usable;
    u.coins = (u.coins || 0) + coinsAdded;
    await writeData(data);
    return json(res, 200, { ok: true, points: u.points, coinsAdded, newBalance: u.coins });
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
    const maxUses = Number.isFinite(g.maxUses) && g.maxUses > 0 ? g.maxUses : 1;
    g.uses = Array.isArray(g.uses) ? g.uses : [];
    // Backward compat: ถ้า code เก่ามี used=true แต่ไม่มี uses array → migrate
    if (g.used && g.uses.length === 0 && g.usedBy) {
      g.uses.push({ username: g.usedBy, at: g.usedAt || new Date().toISOString() });
    }
    if (g.uses.length >= maxUses) return badRequest(res, 'โค้ดถูกใช้ครบจำนวนแล้ว');
    if (g.uses.find(x => x.username === user.username)) return badRequest(res, 'คุณใช้โค้ดนี้แล้ว');
    const u = data.users[user.username];
    const type = g.type || 'coin';
    const recordUse = () => {
      g.uses.push({ username: user.username, at: new Date().toISOString() });
      if (g.uses.length >= maxUses) {
        g.used = true;
        g.usedBy = user.username;
        g.usedAt = new Date().toISOString();
      }
    };
    if (type === 'vip') {
      const days = Number(g.vipDays || 0);
      if (!days || days <= 0) return badRequest(res, 'Gift card VIP ไม่มีจำนวนวัน');
      const now = Date.now();
      const base = (u.role === 'vip' && u.vipExpires && u.vipExpires > now) ? u.vipExpires : now;
      u.vipExpires = base + days * 24 * 60 * 60 * 1000;
      if (u.role !== 'admin') u.role = 'vip';
      data.vipHistory = data.vipHistory || [];
      data.vipHistory.push({
        username: user.username, packageId: 'giftcard:' + code, packageLabel: `Gift Card VIP ${days} วัน`,
        days, coinsPaid: 0,
        at: new Date().toISOString(), vipExpiresAfter: u.vipExpires,
      });
      if (data.vipHistory.length > 2000) data.vipHistory = data.vipHistory.slice(-2000);
      sendInbox(data, user.username, {
        from: 'system',
        subject: `🎉 แลก Gift Card VIP ${days} วัน สำเร็จ`,
        body: `คุณแลกโค้ด "${code}" ได้ VIP ${days} วัน\nVIP หมดอายุ: ${new Date(u.vipExpires).toLocaleString('th-TH')}\n\nขอบคุณที่สนับสนุน ${process.env.APP_NAME || 'MKW Movies'}`,
      });
      recordUse();
      await writeData(data);
      return json(res, 200, { ok: true, type: 'vip', daysAdded: days, vipExpires: u.vipExpires, role: u.role });
    }
    // default: coin
    u.coins = (u.coins || 0) + (g.coins || 0);
    recordUse();
    await writeData(data);
    return json(res, 200, { ok: true, type: 'coin', coinsAdded: g.coins, newBalance: u.coins });
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
    // บันทึก vipHistory + inbox
    data.vipHistory = data.vipHistory || [];
    data.vipHistory.push({
      username: user.username, packageId: pkg.id, packageLabel: pkg.label || '',
      days: pkg.days, coinsPaid: pkg.coins,
      at: new Date().toISOString(), vipExpiresAfter: u.vipExpires,
    });
    if (data.vipHistory.length > 2000) data.vipHistory = data.vipHistory.slice(-2000);
    sendInbox(data, user.username, {
      from: 'system',
      subject: `🎉 ซื้อ VIP ${pkg.days} วัน สำเร็จ`,
      body: `คุณได้ซื้อแพ็กเกจ "${pkg.label || pkg.id}" (${pkg.days} วัน)\nใช้เหรียญ: ${pkg.coins} MKW\nVIP หมดอายุ: ${new Date(u.vipExpires).toLocaleString('th-TH')}\n\nขอบคุณที่สนับสนุน ${process.env.APP_NAME || 'MKW Movies'}`,
    });
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

  // Admin ดูประวัติเติมเงิน + VIP + สลิปของ user รายคน
  const mUserPurchase = pathname.match(/^\/api\/admin\/user\/([^/]+)\/purchase-history$/);
  if (mUserPurchase && req.method === 'GET') {
    if (!requireAdmin()) return;
    const target = decodeURIComponent(mUserPurchase[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    const topups = (data.topupHistory || []).filter(t => t.username === target);
    const vip = (data.vipHistory || []).filter(v => v.username === target);
    const slips = (data.slipPending || []).filter(s => s.username === target)
      .map(s => ({ id: s.id, amount: s.amount, note: s.note || '', status: s.status, uploadedAt: s.uploadedAt, approvedAt: s.approvedAt || null, rejectReason: s.rejectReason || '' }));
    return json(res, 200, { topups, vip, slips });
  }

  // Admin ดูจดหมายทั้งหมดของ user (รวมที่ user ลบไปแล้ว — soft-delete)
  const mUserInbox = pathname.match(/^\/api\/admin\/user\/([^/]+)\/inbox$/);
  if (mUserInbox && req.method === 'GET') {
    if (!requireAdmin()) return;
    const target = decodeURIComponent(mUserInbox[1]);
    if (!data.users[target]) return notFound(res, 'ไม่พบ user');
    return json(res, 200, { messages: data.users[target].inbox || [] });
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

  // ===== Seen books (NEW badge tracking) =====
  // GET list ทั้งหมดต่อ source พร้อม NEW marker
  if (pathname === '/api/admin/seen-books' && req.method === 'GET') {
    if (!requireAdmin()) return;
    const sb = data.seenBooks || {};
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const out = {};
    for (const src of getApiSourceKeys(data, { onlyEnabled: false })) {
      const bucket = sb[src] || {};
      const entries = Object.entries(bucket)
        .map(([bookId, info]) => ({
          bookId,
          bookName: info.bookName || '',
          cover: info.cover || '',
          firstSeenAt: info.firstSeenAt,
          isNew: new Date(info.firstSeenAt).getTime() >= weekAgo,
        }))
        .sort((a, b) => (b.firstSeenAt || '').localeCompare(a.firstSeenAt || ''));
      // Mark top 10 ล่าสุด + ≤7วัน = NEW (ตรงกับ frontend logic)
      const top10 = new Set(entries.slice(0, 10).filter(e => e.isNew).map(e => e.bookId));
      entries.forEach(e => { e.isNew = top10.has(e.bookId); });
      out[src] = entries;
    }
    return json(res, 200, { seenBooks: out });
  }
  // DELETE all per source
  if (pathname === '/api/admin/seen-books' && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const src = String(query.source || '').trim();
    data.seenBooks = data.seenBooks || {};
    if (src && getApiSourceKeys(data, { onlyEnabled: false }).includes(src)) {
      data.seenBooks[src] = {};
    } else {
      for (const s of getApiSourceKeys(data, { onlyEnabled: false })) data.seenBooks[s] = {};
    }
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  // DELETE รายการเดียว
  const mSeenDel = pathname.match(/^\/api\/admin\/seen-books\/([^/]+)\/([^/]+)$/);
  if (mSeenDel && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const src = decodeURIComponent(mSeenDel[1]);
    const bookId = decodeURIComponent(mSeenDel[2]);
    if (!getApiSourceKeys(data, { onlyEnabled: false }).includes(src)) return badRequest(res, 'source ไม่ถูกต้อง');
    if (!data.seenBooks?.[src]?.[bookId]) return notFound(res);
    delete data.seenBooks[src][bookId];
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // Manual trigger active poll (admin) — รัน immediately แทนรอเที่ยงคืน
  if (pathname === '/api/admin/poll-now' && req.method === 'POST') {
    if (!requireAdmin()) return;
    try {
      const summary = await pollAllSourcesForNewBooks();
      return json(res, 200, { ok: true, summary, lastPollAt: (await readData()).lastPollAt || {} });
    } catch (e) {
      return json(res, 500, { error: 'poll_failed', message: e.message });
    }
  }
  // GET สถานะ poll ล่าสุด
  if (pathname === '/api/admin/poll-status' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { lastPollAt: data.lastPollAt || {}, sources: getApiSourceKeys(data, { onlyEnabled: false }) });
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

  // ===== Auth toggle (ปิด login/register ชั่วคราว — admin ยัง login ได้) =====
  if (pathname === '/api/admin/auth-toggle' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, {
      loginDisabled: !!data.loginDisabled,
      registerDisabled: !!data.registerDisabled,
      message: data.authToggleMessage || '',
    });
  }
  if (pathname === '/api/admin/auth-toggle' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    data.loginDisabled = !!body.loginDisabled;
    data.registerDisabled = !!body.registerDisabled;
    data.authToggleMessage = String(body.message || '').slice(0, 500);
    await writeData(data);
    return json(res, 200, {
      ok: true,
      loginDisabled: data.loginDisabled,
      registerDisabled: data.registerDisabled,
      message: data.authToggleMessage,
    });
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

  // ===== Per-role episode limits (ใช้เมื่อ freeMode OFF) =====
  if (pathname === '/api/admin/role-limits' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { roleLimits: data.roleLimits || { guestEps: 0, userEps: 10 } });
  }
  if (pathname === '/api/admin/role-limits' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const parseEps = (v, def) => {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0) return def;
      return Math.min(n, 999);
    };
    data.roleLimits = {
      guestEps: parseEps(body.guestEps, 0),
      userEps: parseEps(body.userEps, 10),
      setBy: user.username,
      setAt: new Date().toISOString(),
    };
    await writeData(data);
    return json(res, 200, { ok: true, roleLimits: data.roleLimits });
  }

  if (pathname === '/api/admin/giftcards' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { giftcards: data.giftcards });
  }
  if (pathname === '/api/admin/giftcards' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    let { code, coins, type, vipDays, maxUses } = body;
    code = String(code || '').trim().toUpperCase();
    type = (type === 'vip') ? 'vip' : 'coin';
    if (!code) return badRequest(res, 'ต้องมี code');
    if (data.giftcards[code]) return badRequest(res, 'code นี้มีอยู่แล้ว');
    maxUses = parseInt(maxUses, 10);
    if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 999) maxUses = 1;
    const baseFields = { maxUses, uses: [], used: false, usedBy: null, createdBy: user.username, createdAt: new Date().toISOString() };
    if (type === 'vip') {
      vipDays = parseInt(vipDays, 10);
      if (!vipDays || vipDays <= 0 || vipDays > 3650) return badRequest(res, 'vipDays ต้อง 1-3650');
      data.giftcards[code] = { type: 'vip', vipDays, ...baseFields };
    } else {
      coins = parseInt(coins, 10);
      if (!coins || coins <= 0) return badRequest(res, 'ต้องมี coins > 0');
      data.giftcards[code] = { type: 'coin', coins, ...baseFields };
    }
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
    const { bookId, index, bookName, cover, source } = body;
    if (!bookId || !index) return badRequest(res, 'ต้องมี bookId และ index');
    const u = data.users[user.username];
    u.history = u.history || [];
    // dedupe: ถ้ามี bookId นี้อยู่แล้ว → remove เก่าก่อน push ใหม่
    u.history = u.history.filter(h => h.bookId !== bookId);
    u.history.unshift({ bookId, index: Number(index), bookName: bookName || '', cover: cover || '', source: source || 'dramabox', at: new Date().toISOString() });
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
    slip.image = '';  // เคลียร์ภาพหลัง approve — เก็บ metadata ไว้ดู audit
    data.topupHistory = data.topupHistory || [];
    data.topupHistory.push({ username: slip.username, packageId: 'slip:' + slip.id, coins: slip.amount, pricePaid: slip.amount, discount: null, at: slip.approvedAt });
    sendInbox(data, slip.username, {
      from: 'admin',
      subject: `✅ สลิปได้รับการอนุมัติ +${slip.amount} MKW`,
      body: `สลิปเลขที่ ${slip.id} ของคุณได้รับการอนุมัติแล้ว\nจำนวน: +${slip.amount} MKW Coin\nยอดเหรียญปัจจุบัน: ${u.coins} MKW\n\nขอบคุณที่ใช้บริการ`,
    });
    await writeData(data);
    return json(res, 200, { ok: true, coinsAdded: slip.amount, newBalance: u.coins });
  }
  const mSlipReject = pathname.match(/^\/api\/admin\/slips\/([^/]+)\/reject$/);
  if (mSlipReject && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const slip = (data.slipPending || []).find(s => s.id === mSlipReject[1]);
    if (!slip) return notFound(res);
    slip.status = 'rejected';
    slip.approvedBy = user.username;
    slip.approvedAt = new Date().toISOString();
    slip.rejectReason = String(body?.reason || '').slice(0, 300);
    slip.image = '';  // เคลียร์ภาพหลัง reject — เก็บ metadata ไว้ดู audit
    sendInbox(data, slip.username, {
      from: 'admin',
      subject: `❌ สลิปถูกปฏิเสธ (${slip.amount} MKW)`,
      body: `สลิปเลขที่ ${slip.id} ของคุณถูกปฏิเสธ\nจำนวนที่แจ้ง: ${slip.amount} MKW\n${slip.rejectReason ? 'เหตุผล: ' + slip.rejectReason : 'โปรดติดต่อ admin หากมีข้อสงสัย'}\n\nหากต้องการเติมเงินอีกครั้ง กรุณาอัพโหลดสลิปใหม่`,
    });
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== Inbox (user) =====
  if (req.method === 'GET' && pathname === '/api/user/inbox') {
    if (!user) return unauthorized(res);
    const u = data.users[user.username];
    const messages = (u.inbox || []).filter(m => !m.deletedAt);
    const unread = messages.filter(m => !m.read).length;
    return json(res, 200, { messages, unread });
  }
  // Lightweight unread count (ใช้ใน heartbeat poll ทุก 60 วิ)
  if (req.method === 'GET' && pathname === '/api/user/inbox/unread') {
    if (!user) return json(res, 200, { unread: 0 });
    const inbox = data.users[user.username]?.inbox || [];
    return json(res, 200, { unread: inbox.filter(m => !m.read && !m.deletedAt).length });
  }
  if (req.method === 'POST' && pathname === '/api/user/inbox/read-all') {
    if (!user) return unauthorized(res);
    const u = data.users[user.username];
    (u.inbox || []).forEach(m => { if (!m.deletedAt) m.read = true; });
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'DELETE' && pathname === '/api/user/inbox') {
    if (!user) return unauthorized(res);
    const u = data.users[user.username];
    const nowIso = new Date().toISOString();
    (u.inbox || []).forEach(m => { if (!m.deletedAt) m.deletedAt = nowIso; });
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  const mInboxRead = pathname.match(/^\/api\/user\/inbox\/([^/]+)\/read$/);
  if (mInboxRead && req.method === 'POST') {
    if (!user) return unauthorized(res);
    const id = decodeURIComponent(mInboxRead[1]);
    const msg = (data.users[user.username].inbox || []).find(m => m.id === id);
    if (!msg) return notFound(res);
    msg.read = true;
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  const mInboxDel = pathname.match(/^\/api\/user\/inbox\/([^/]+)$/);
  if (mInboxDel && req.method === 'DELETE') {
    if (!user) return unauthorized(res);
    const id = decodeURIComponent(mInboxDel[1]);
    const u = data.users[user.username];
    const msg = (u.inbox || []).find(m => m.id === id);
    if (!msg) return notFound(res);
    if (!msg.deletedAt) msg.deletedAt = new Date().toISOString();
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== User → Admin message (รายงานปัญหา / ติดต่อ admin) =====
  if (req.method === 'POST' && pathname === '/api/user/send-to-admin') {
    if (!user) return unauthorized(res);
    const rl = rateLimit(`msg:${user.username}`, 5, 5 * 60 * 1000);
    if (!rl.ok) return badRequest(res, `ส่งถี่เกินไป ลองใหม่ใน ${rl.retryAfterSec} วินาที`);
    const body = await readBody(req);
    const subject = String(body.subject || '').trim().slice(0, 200);
    const text = String(body.body || '').trim().slice(0, 3000);
    if (!subject && !text) return badRequest(res, 'ต้องมี subject หรือ body');
    data.adminInbox = data.adminInbox || [];
    data.adminInbox.unshift({
      id: crypto.randomBytes(6).toString('hex'),
      fromUsername: user.username,
      fromIp: clientIp(req),
      subject, body: text,
      at: new Date().toISOString(),
      read: false,
    });
    if (data.adminInbox.length > 500) data.adminInbox = data.adminInbox.slice(0, 500);
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== Purchase history (user's own: topups + vip + slips) =====
  if (req.method === 'GET' && pathname === '/api/user/purchase-history') {
    if (!user) return unauthorized(res);
    const uname = user.username;
    const topups = (data.topupHistory || []).filter(t => t.username === uname);
    const vip = (data.vipHistory || []).filter(v => v.username === uname);
    const slips = (data.slipPending || []).filter(s => s.username === uname)
      .map(s => ({ id: s.id, amount: s.amount, note: s.note || '', status: s.status, uploadedAt: s.uploadedAt, approvedAt: s.approvedAt || null, rejectReason: s.rejectReason || '' }));
    return json(res, 200, { topups, vip, slips });
  }

  // ===== Admin: send message =====
  if (req.method === 'POST' && pathname === '/api/admin/send-message') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const to = String(body.to || '').trim();  // username หรือ '*' = broadcast
    const subject = String(body.subject || '').trim();
    const text = String(body.body || '').trim();
    const coins = Math.max(0, parseInt(body.coins, 10) || 0);
    const vipDays = Math.max(0, parseInt(body.vipDays, 10) || 0);
    if (!to) return badRequest(res, 'ต้องระบุ to (username หรือ "*" เพื่อส่งทุกคน)');
    if (!subject && !text && coins === 0 && vipDays === 0) return badRequest(res, 'ต้องมี subject/body หรือ coins/vipDays อย่างน้อยหนึ่งอย่าง');
    const msg = { from: user.username, subject, body: text };
    if (coins > 0 || vipDays > 0) {
      const type = coins > 0 && vipDays > 0 ? 'both' : (vipDays > 0 ? 'vip' : 'coin');
      msg.gift = { type, coins, vipDays, claimed: false, claimedAt: null };
    }
    if (to === '*') {
      const count = sendInboxBroadcast(data, msg);
      await writeData(data);
      return json(res, 200, { ok: true, sentTo: count, broadcast: true, gift: !!msg.gift });
    }
    if (!data.users[to]) return notFound(res, 'ไม่พบ user: ' + to);
    sendInbox(data, to, msg);
    await writeData(data);
    return json(res, 200, { ok: true, sentTo: 1, broadcast: false, gift: !!msg.gift });
  }

  // ===== Admin: ข้อความจาก user (adminInbox) =====
  if (req.method === 'GET' && pathname === '/api/admin/user-messages') {
    if (!requireAdmin()) return;
    const messages = data.adminInbox || [];
    const unread = messages.filter(m => !m.read).length;
    return json(res, 200, { messages, unread });
  }
  if (req.method === 'DELETE' && pathname === '/api/admin/user-messages') {
    if (!requireAdmin()) return;
    data.adminInbox = [];
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  const mAdmMsgRead = pathname.match(/^\/api\/admin\/user-messages\/([^/]+)\/read$/);
  if (mAdmMsgRead && req.method === 'POST') {
    if (!requireAdmin()) return;
    const id = decodeURIComponent(mAdmMsgRead[1]);
    const msg = (data.adminInbox || []).find(m => m.id === id);
    if (!msg) return notFound(res);
    msg.read = true;
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  const mAdmMsgDel = pathname.match(/^\/api\/admin\/user-messages\/([^/]+)$/);
  if (mAdmMsgDel && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const id = decodeURIComponent(mAdmMsgDel[1]);
    const before = (data.adminInbox || []).length;
    data.adminInbox = (data.adminInbox || []).filter(m => m.id !== id);
    if (data.adminInbox.length === before) return notFound(res);
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== User: claim gift from inbox message =====
  if (req.method === 'POST' && pathname === '/api/user/inbox/claim-gift') {
    if (!user) return unauthorized(res);
    const body = await readBody(req);
    const id = String(body.messageId || '').trim();
    if (!id) return badRequest(res, 'ต้องมี messageId');
    const u = data.users[user.username];
    const msg = (u.inbox || []).find(m => m.id === id);
    if (!msg) return notFound(res, 'ไม่พบข้อความ');
    if (!msg.gift) return badRequest(res, 'ข้อความนี้ไม่มีของขวัญ');
    if (msg.gift.claimed) return badRequest(res, 'เปิดของขวัญนี้แล้ว');
    const coins = Math.max(0, parseInt(msg.gift.coins, 10) || 0);
    const vipDays = Math.max(0, parseInt(msg.gift.vipDays, 10) || 0);
    if (coins > 0) u.coins = (u.coins || 0) + coins;
    if (vipDays > 0) {
      const now = Date.now();
      const base = (u.role === 'vip' && u.vipExpires && u.vipExpires > now) ? u.vipExpires : now;
      u.vipExpires = base + vipDays * 24 * 60 * 60 * 1000;
      if (u.role !== 'admin') u.role = 'vip';
    }
    msg.gift.claimed = true;
    msg.gift.claimedAt = new Date().toISOString();
    msg.read = true;
    await writeData(data);
    return json(res, 200, {
      ok: true,
      coinsAdded: coins,
      vipDaysAdded: vipDays,
      role: u.role,
      coins: u.coins,
      vipExpires: u.vipExpires || null,
    });
  }

  // ===== Admin: Welcome gift config =====
  if (pathname === '/api/admin/welcome-gift' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { welcomeGift: data.welcomeGift || { enabled: false, coins: 0, vipDays: 0, message: '' } });
  }
  if (pathname === '/api/admin/welcome-gift' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    data.welcomeGift = {
      enabled: !!body.enabled,
      coins: Math.max(0, parseInt(body.coins, 10) || 0),
      vipDays: Math.max(0, parseInt(body.vipDays, 10) || 0),
      message: String(body.message || '').slice(0, 1000),
    };
    await writeData(data);
    return json(res, 200, { ok: true, welcomeGift: data.welcomeGift });
  }
  // Test: admin ยิง welcome gift ให้ตัวเอง (ช่วย debug ว่า config ทำงานไหม)
  if (pathname === '/api/admin/welcome-gift/test' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const wg = data.welcomeGift || {};
    if (!wg.enabled) return badRequest(res, 'ยังไม่ได้เปิดใช้งานของขวัญต้อนรับ (ติ๊ก "เปิดใช้งาน" แล้วกดบันทึกก่อน)');
    const coins = Math.max(0, parseInt(wg.coins, 10) || 0);
    const vipDays = Math.max(0, parseInt(wg.vipDays, 10) || 0);
    if (coins === 0 && vipDays === 0) return badRequest(res, 'ต้องตั้งค่า coins หรือ VIP days อย่างน้อยหนึ่งอย่าง (> 0) แล้วกดบันทึกก่อน');
    const m = deliverWelcomeGift(data, user.username);
    if (!m) return badRequest(res, 'deliver ล้มเหลว — ดู server log');
    await writeData(data);
    return json(res, 200, { ok: true, messageId: m.id, subject: m.subject, gift: m.gift, deliveredTo: user.username });
  }

  // ===== Admin: Register settings (IP limit + ban duration) =====
  if (pathname === '/api/admin/register-settings' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, {
      registerSettings: data.registerSettings || { maxPerIp: 3, banHours: 24 },
      registerIpLog: data.registerIpLog || {},
      bannedIps: data.bannedIps || {},
    });
  }
  if (pathname === '/api/admin/register-settings' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const max = Math.max(1, Math.min(999, parseInt(body.maxPerIp, 10) || 3));
    const hours = Math.max(1, Math.min(24 * 30, parseInt(body.banHours, 10) || 24));
    data.registerSettings = { maxPerIp: max, banHours: hours };
    await writeData(data);
    return json(res, 200, { ok: true, registerSettings: data.registerSettings });
  }

  // ===== Admin: ปลด ban IP =====
  const mUnban = pathname.match(/^\/api\/admin\/banned-ips\/([^/]+)$/);
  if (mUnban && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const ipKey = decodeURIComponent(mUnban[1]);
    let removed = false;
    if (data.bannedIps?.[ipKey]) { delete data.bannedIps[ipKey]; removed = true; }
    if (data.registerIpLog?.[ipKey]) { delete data.registerIpLog[ipKey]; removed = true; }
    if (!removed) return notFound(res);
    await writeData(data);
    return json(res, 200, { ok: true });
  }

  // ===== Admin: Points config (pointsPerMinute, dailyCap, redeemRate) =====
  if (pathname === '/api/admin/points-config' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { pointsConfig: getPointsConfig(data) });
  }
  if (pathname === '/api/admin/points-config' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    data.pointsConfig = {
      pointsPerMinute: Math.max(1, Math.min(1000, parseInt(body.pointsPerMinute, 10) || 10)),
      dailyCap: Math.max(0, Math.min(1000000, parseInt(body.dailyCap, 10) || 10000)),
      redeemRate: Math.max(1, Math.min(100000, parseInt(body.redeemRate, 10) || 100)),
    };
    await writeData(data);
    return json(res, 200, { ok: true, pointsConfig: data.pointsConfig });
  }

  // ===== Admin: Topup packages CRUD =====
  if (pathname === '/api/admin/topup-packages' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { packages: data.topupPackages || [] });
  }
  if (pathname === '/api/admin/topup-packages' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const list = Array.isArray(body.packages) ? body.packages : null;
    if (!list) return badRequest(res, 'ต้องส่ง packages เป็น array');
    const cleaned = [];
    for (const p of list) {
      const id = String(p.id || '').trim().slice(0, 50);
      const coins = parseInt(p.coins, 10);
      const price = parseInt(p.price, 10);
      const label = String(p.label || '').slice(0, 100);
      if (!id) return badRequest(res, 'ทุก package ต้องมี id');
      if (!Number.isFinite(coins) || coins <= 0) return badRequest(res, `package "${id}": coins ต้อง > 0`);
      if (!Number.isFinite(price) || price <= 0) return badRequest(res, `package "${id}": price ต้อง > 0`);
      cleaned.push({ id, coins, price, label });
    }
    const ids = cleaned.map(p => p.id);
    if (new Set(ids).size !== ids.length) return badRequest(res, 'id ห้ามซ้ำ');
    data.topupPackages = cleaned;
    await writeData(data);
    return json(res, 200, { ok: true, packages: data.topupPackages });
  }

  // ===== Admin: VIP packages CRUD =====
  if (pathname === '/api/admin/vip-packages' && req.method === 'GET') {
    if (!requireAdmin()) return;
    return json(res, 200, { packages: data.vipPackages || [] });
  }
  if (pathname === '/api/admin/vip-packages' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const list = Array.isArray(body.packages) ? body.packages : null;
    if (!list) return badRequest(res, 'ต้องส่ง packages เป็น array');
    const cleaned = [];
    for (const p of list) {
      const id = String(p.id || '').trim().slice(0, 50);
      const days = parseInt(p.days, 10);
      const coins = parseInt(p.coins, 10);
      const label = String(p.label || '').slice(0, 100);
      if (!id) return badRequest(res, 'ทุก package ต้องมี id');
      if (!Number.isFinite(days) || days <= 0) return badRequest(res, `package "${id}": days ต้อง > 0`);
      if (!Number.isFinite(coins) || coins <= 0) return badRequest(res, `package "${id}": coins ต้อง > 0`);
      cleaned.push({ id, days, coins, label });
    }
    const ids = cleaned.map(p => p.id);
    if (new Set(ids).size !== ids.length) return badRequest(res, 'id ห้ามซ้ำ');
    data.vipPackages = cleaned;
    await writeData(data);
    return json(res, 200, { ok: true, packages: data.vipPackages });
  }

  // ===== Admin: API Sources registry =====
  // GET คืน list ทั้งหมด (รวม disabled) + flag tokenAvailable (ไม่คืน token จริง)
  if (pathname === '/api/admin/api-sources' && req.method === 'GET') {
    if (!requireAdmin()) return;
    const list = getApiSources(data).map(s => ({
      key: s.key,
      label: s.label || s.key,
      badgeClass: s.badgeClass || 'bg-zinc-700',
      enabled: s.enabled !== false,
      host: s.host || '',
      basePath: s.basePath || '',
      tokenEnv: s.tokenEnv || '',
      adapter: s.adapter || s.key,
      endpoints: s.endpoints && typeof s.endpoints === 'object' ? { ...s.endpoints } : endpointsFor(s.adapter || s.key),
      localeParam: s.localeParam || '',
      locales: {
        mode: s.locales?.mode === 'selected' ? 'selected' : 'all',
        allowed: Array.isArray(s.locales?.allowed) ? s.locales.allowed.slice() : [],
        discovered: Array.isArray(s.locales?.discovered) ? s.locales.discovered.slice() : [],
      },
      fieldMap: (s.fieldMap && typeof s.fieldMap === 'object') ? { ...s.fieldMap } : {},
      tokenAvailable: !!resolveSourceToken(s),
    }));
    return json(res, 200, { sources: list });
  }
  // POST = upsert (create หรือ update by key)
  if (pathname === '/api/admin/api-sources' && req.method === 'POST') {
    if (!requireAdmin()) return;
    const body = await readBody(req);
    const key = String(body.key || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,30}$/.test(key)) return badRequest(res, 'key: a-z 0-9 _ - ยาว 2-30');
    const label = String(body.label || key).slice(0, 50);
    const badgeClass = String(body.badgeClass || 'bg-zinc-700').slice(0, 50);
    const host = String(body.host || '').trim().slice(0, 200);
    if (!host) return badRequest(res, 'ต้องมี host');
    if (!/^[a-z0-9.\-]+$/i.test(host)) return badRequest(res, 'host มีอักขระไม่ถูกต้อง');
    const basePath = String(body.basePath || '').trim().slice(0, 200);
    if (basePath && !basePath.startsWith('/')) return badRequest(res, 'basePath ต้องขึ้นต้นด้วย /');
    const tokenEnv = String(body.tokenEnv || '').trim().slice(0, 100);
    if (!/^[A-Z0-9_]*$/.test(tokenEnv)) return badRequest(res, 'tokenEnv: A-Z 0-9 _ เท่านั้น');
    const adapter = String(body.adapter || 'dramabox').trim().slice(0, 50);
    const enabled = body.enabled !== false;
    const endpoints = sanitizeEndpoints(body.endpoints, adapter);
    const localeParam = String(body.localeParam || '').trim().slice(0, 40);
    if (localeParam && !/^[a-zA-Z0-9_]+$/.test(localeParam)) return badRequest(res, 'localeParam: a-z 0-9 _ เท่านั้น');
    const locales = sanitizeLocales(body.locales);
    const fieldMap = sanitizeFieldMap(body.fieldMap);

    data.apiSources = getApiSources(data);
    const idx = data.apiSources.findIndex(s => s.key === key);
    const existing = idx >= 0 ? data.apiSources[idx] : null;
    // preserve discovered list ถ้า body ไม่ส่ง (หรือ admin แค่ save form โดยไม่กด probe ใหม่)
    if (existing?.locales?.discovered && !Array.isArray(body.locales?.discovered)) {
      locales.discovered = existing.locales.discovered;
    }
    const entry = { key, label, badgeClass, enabled, host, basePath, tokenEnv, adapter, endpoints, localeParam, locales, fieldMap };
    if (idx >= 0) data.apiSources[idx] = entry; else data.apiSources.push(entry);
    await writeData(data);
    return json(res, 200, { ok: true, source: entry, tokenAvailable: !!resolveSourceToken(entry) });
  }
  // DELETE by key
  const mApiSrcDel = pathname.match(/^\/api\/admin\/api-sources\/([^/]+)$/);
  if (mApiSrcDel && req.method === 'DELETE') {
    if (!requireAdmin()) return;
    const key = decodeURIComponent(mApiSrcDel[1]);
    data.apiSources = getApiSources(data);
    const before = data.apiSources.length;
    data.apiSources = data.apiSources.filter(s => s.key !== key);
    if (data.apiSources.length === before) return notFound(res);
    await writeData(data);
    return json(res, 200, { ok: true });
  }
  // POST test = ลอง fetch /list?page=1&page_size=1 เพื่อทดสอบ host/token/basePath
  const mApiSrcTest = pathname.match(/^\/api\/admin\/api-sources\/([^/]+)\/test$/);
  if (mApiSrcTest && req.method === 'POST') {
    if (!requireAdmin()) return;
    const key = decodeURIComponent(mApiSrcTest[1]);
    const src = findApiSource(data, key);
    if (!src) return notFound(res, 'ไม่พบ source');
    if (!resolveSourceToken(src)) {
      return json(res, 200, { ok: false, error: 'token_missing', message: `env "${src.tokenEnv}" ว่าง — ตั้งใน Render dashboard` });
    }
    try {
      const t0 = Date.now();
      const payload = await httpsGetSource(src, '/list?page=1&page_size=1');
      const items = Array.isArray(payload) ? payload : (payload?.items || []);
      return json(res, 200, { ok: true, durationMs: Date.now() - t0, items: items.length, sample: items[0] || null });
    } catch (e) {
      return json(res, 200, { ok: false, error: 'fetch_failed', message: e.message });
    }
  }

  // POST probe = ยิง endpoint ที่ระบุ (ใช้ template จาก body ถ้าส่งมา, ไม่งั้น fallback saved) + แสดง raw response
  // body: { endpoint: 'list'|'detail'|..., template?: '/custom/path?x={page}', vars?: { page, page_size, keyword, series_id, genre_id, ep, locale },
  //         overrides?: { host, basePath, tokenEnv } — ใช้ตอนฟอร์มกดทดสอบก่อน save }
  const mApiSrcProbe = pathname.match(/^\/api\/admin\/api-sources\/([^/]+)\/probe$/);
  if (mApiSrcProbe && req.method === 'POST') {
    if (!requireAdmin()) return;
    const key = decodeURIComponent(mApiSrcProbe[1]);
    const body = await readBody(req);
    let src = findApiSource(data, key);
    if (!src && body.overrides) {
      // new source (ยังไม่ save) — ใช้ overrides จาก form
      src = { key, host: body.overrides.host, basePath: body.overrides.basePath || '', tokenEnv: body.overrides.tokenEnv || '', adapter: body.overrides.adapter || 'dramabox' };
    }
    if (!src) return notFound(res, 'ไม่พบ source และไม่มี overrides');
    if (body.overrides && typeof body.overrides === 'object') {
      src = { ...src,
        host: body.overrides.host || src.host,
        basePath: typeof body.overrides.basePath === 'string' ? body.overrides.basePath : src.basePath,
        tokenEnv: body.overrides.tokenEnv || src.tokenEnv,
      };
    }
    const which = String(body.endpoint || 'list');
    const tpl = String(body.template != null ? body.template : (src.endpoints?.[which] ?? endpointsFor(src.adapter || src.key)[which] ?? ''));
    if (!tpl) return json(res, 200, { ok: false, error: 'empty_template', message: `endpoint "${which}" ไม่มี template` });
    if (!resolveSourceToken(src)) {
      return json(res, 200, { ok: false, error: 'token_missing', message: `env "${src.tokenEnv}" ว่าง — ตั้งใน Render dashboard ก่อน` });
    }
    const defaults = { page: 1, page_size: 5, keyword: '', series_id: '', genre_id: '', ep: 1, locale: '' };
    const vars = Object.assign({}, defaults, body.vars && typeof body.vars === 'object' ? body.vars : {});
    let subPath = substituteVars(tpl, vars);
    // append localeParam ถ้าเรียก list/search/genre + ส่ง locale
    if (body.localeParam && vars.locale) {
      const sep = subPath.includes('?') ? '&' : '?';
      subPath += `${sep}${encodeURIComponent(body.localeParam)}=${encodeURIComponent(vars.locale)}`;
    }
    try {
      const t0 = Date.now();
      const payload = await httpsGetSource(src, subPath);
      return json(res, 200, { ok: true, durationMs: Date.now() - t0, path: subPath, payload });
    } catch (e) {
      return json(res, 200, { ok: false, error: 'fetch_failed', message: e.message, path: subPath });
    }
  }

  return notFound(res, 'API endpoint ไม่พบ: ' + req.method + ' ' + pathname);
}

// ---------- Active polling: หนังใหม่จาก /list ของแต่ละค่าย (เที่ยงคืน ICT) ----------
// แต่ละ source poll แยก fail-isolated — ถ้า source หนึ่ง fetch ไม่ได้ NEW badge ของ source อื่นยังคงอยู่
function httpsGetSource(src, subPath) {
  return new Promise((resolve, reject) => {
    const token = resolveSourceToken(src);
    if (!token) return reject(new Error(`token ของ source "${src.key}" ไม่มี (env: ${src.tokenEnv})`));
    const finalPath = (src.basePath || '') + (subPath.startsWith('/') ? subPath : '/' + subPath);
    const req = https.request({
      hostname: src.host || SERIESJEEN_HOST,
      path: finalPath,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'User-Agent': 'mkw-dooseries-poller/1.0',
      },
    }, r => {
      let buf = '';
      r.on('data', d => buf += d);
      r.on('end', () => {
        if (r.statusCode >= 400) return reject(new Error(`HTTP ${r.statusCode}: ${buf.slice(0, 200)}`));
        try { resolve(JSON.parse(buf)); } catch { reject(new Error('invalid JSON: ' + buf.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function pollSourceForNewBooks(src, data) {
  const payload = await httpsGetSource(src, `/list?page=1&page_size=50`);
  const raw = Array.isArray(payload) ? payload : (payload?.items || []);
  const items = raw.map(x => ({
    bookId: String(x.series_id || x.bookId || x.id || ''),
    bookName: String(x.title || x.bookName || '').slice(0, 200),
    cover: String(x.cover || x.coverWap || '').slice(0, 500),
  })).filter(x => x.bookId);

  const source = src.key;
  data.seenBooks = data.seenBooks || {};
  data.seenBooks[source] = data.seenBooks[source] || {};
  const bucket = data.seenBooks[source];
  const nowIso = new Date().toISOString();
  let added = 0;
  for (const it of items) {
    if (!bucket[it.bookId]) {
      bucket[it.bookId] = { firstSeenAt: nowIso, bookName: it.bookName, cover: it.cover };
      added++;
    }
  }
  // GC 30 วัน (เหมือน /api/books/ingest)
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [bid, info] of Object.entries(bucket)) {
    const t = new Date(info.firstSeenAt).getTime();
    if (!isNaN(t) && t < cutoff) delete bucket[bid];
  }
  data.lastPollAt = data.lastPollAt || {};
  data.lastPollAt[source] = nowIso;
  return { source, added, fetched: items.length, total: Object.keys(bucket).length };
}

async function pollAllSourcesForNewBooks() {
  const data = await readData();
  const sources = getApiSources(data).filter(s => s.enabled !== false);
  if (!sources.length) {
    console.warn('[poll] skip — ไม่มี API source ที่ enabled');
    return [];
  }
  const results = await Promise.allSettled(sources.map(s => pollSourceForNewBooks(s, data)));
  const summary = results.map((r, i) => {
    const source = sources[i].key;
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[poll] ${source} failed:`, r.reason?.message || r.reason);
    return { source, error: r.reason?.message || String(r.reason) };
  });
  await writeData(data);
  console.log('[poll]', summary.map(s => s.error ? `${s.source}:✕(${s.error})` : `${s.source}:+${s.added}/${s.fetched}`).join(' '));
  return summary;
}

// คำนวณ ms จนถึง 00:00 ICT (UTC+7) ถัดไป
function msUntilMidnightICT() {
  const now = Date.now();
  const ictNow = new Date(now + 7 * 60 * 60 * 1000);
  const ictNextUtc = Date.UTC(ictNow.getUTCFullYear(), ictNow.getUTCMonth(), ictNow.getUTCDate() + 1, 0, 0, 0, 0);
  // ictNextUtc คือ epoch ms ของ 00:00 ICT ของวันถัดไป (เพราะ ictNow shift +7h แล้ว) → ลบ 7h กลับเป็น UTC
  return (ictNextUtc - 7 * 60 * 60 * 1000) - now;
}

function scheduleMidnightPoll() {
  const ms = msUntilMidnightICT();
  console.log(`[poll] next midnight ICT poll in ${(ms / 3_600_000).toFixed(2)}h`);
  setTimeout(async () => {
    try { await pollAllSourcesForNewBooks(); } catch (e) { console.error('[poll] error:', e); }
    scheduleMidnightPoll();
  }, ms);
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
      return proxyToSource(req.url, res);
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
  console.log(`MKW Movies: http://localhost:${PORT}/`);
  console.log(`Proxy: /proxy/<source>/* → API source registry (admin จัดการที่ /admin → 🎬 API Sources)`);
  console.log(`Data: ${DATA_FILE}`);
  scheduleMidnightPoll();
});
