// ============================================================
// MKW Movies — assets/app.js
// API: seriesjeen (via /proxy/api/platform/<source>/*) + local backend (/api/*)
// ============================================================

// Source registry — เริ่มต้นด้วย 5 sources เป็น fallback
// publicConfig.load() จะ overwrite ตาม data.apiSources จาก /api/public-config (admin จัดการที่ /admin → 🎬 API Sources)
let API_SOURCES = ['dramabox', 'melolo', 'shortmax', 'dramawave', 'netshort'];
const SOURCE_LABELS = { dramabox: 'DramaBox', melolo: 'Melolo', shortmax: 'ShortMax', dramawave: 'DramaWave', netshort: 'Netshort' };
const SOURCE_BADGE_CLS = { dramabox: 'bg-red-600', melolo: 'bg-yellow-500', shortmax: 'bg-blue-600', dramawave: 'bg-purple-600', netshort: 'bg-emerald-600' };
// SOURCE_REG: key → full source entry (endpoints + localeParam + locales.{mode,allowed}) — populated โดย publicConfig.load()
const SOURCE_REG = {};
// Fallback presets (ใช้ตอน publicConfig ยังไม่ load หรือ source ใหม่ไม่มี endpoints)
const _FALLBACK_ENDPOINTS = {
  dramabox:  { list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}', detail:'/detail?bookId={series_id}', alleps:'/allepisode?bookId={series_id}', genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}', genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'' },
  melolo:    { list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}', detail:'/detail/{series_id}', alleps:'', genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}', genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'/video?id={series_id}&ep={ep}' },
  shortmax:  { list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}', detail:'/detail/{series_id}', alleps:'/alleps/{series_id}', genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}', genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'' },
  dramawave: { list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}', detail:'/drama/{series_id}', alleps:'', genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}', genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'' },
  netshort:  { list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}', detail:'/drama/{series_id}', alleps:'', genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}', genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'/watch/{series_id}/{ep}' },
};
function _subVars(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars && vars[k];
    return v == null || v === '' ? '' : encodeURIComponent(String(v));
  });
}
// pathFor(source, endpoint, vars) → '/list?page=1&page_size=50' (substituted)
// เลือก template จาก SOURCE_REG[source].endpoints → fallback preset ของ adapter → fallback dramabox
function pathFor(source, endpoint, vars) {
  const reg = SOURCE_REG[source];
  let tpl = reg?.endpoints?.[endpoint];
  if (!tpl) {
    const adapter = reg?.adapter || source;
    tpl = (_FALLBACK_ENDPOINTS[adapter] || _FALLBACK_ENDPOINTS.dramabox)[endpoint] || '';
  }
  return _subVars(tpl, vars || {});
}
function _appendLocaleParam(path, localeParam, locale) {
  if (!localeParam || !locale) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${encodeURIComponent(localeParam)}=${encodeURIComponent(locale)}`;
}
function _isListLikePath(path) {
  return /[?&]page=/.test(path) || /\/(list|search|genres?)(\?|$)/.test(path);
}
const PAGE_SIZE = 40;
const BRAND = 'MKW Movies';

// NEW badge — populated after /api/books/ingest (per source, bookIds ที่เป็น NEW)
const _newBookIds = {};
async function ingestAndMarkNew(res) {
  try {
    const buckets = res?._multi && Array.isArray(res._buckets) ? res._buckets : null;
    const items = pickList(res);
    const perSource = {};
    if (buckets) {
      // multi mode — group items by __source
      for (const it of items) {
        const s = it.__source;
        if (!s) continue;
        (perSource[s] = perSource[s] || []).push(it);
      }
    } else {
      // single source mode — ใช้ source ปัจจุบัน
      const s = getSource();
      if (s !== 'all') perSource[s] = items;
    }
    await Promise.all(Object.entries(perSource).map(async ([src, list]) => {
      const payload = list.slice(0, 50).map(x => ({
        bookId: String(x.series_id || x.bookId || x.id || ''),
        bookName: x.title || x.bookName || '',
        cover: x.cover || x.coverWap || '',
      })).filter(x => x.bookId);
      if (!payload.length) return;
      const r = await fetch('/api/books/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: src, items: payload }),
      });
      if (!r.ok) return;
      const j = await r.json();
      _newBookIds[src] = new Set(j.newBookIds || []);
    }));
  } catch { /* เงียบ — NEW badge optional */ }
}

function getSource() {
  const s = localStorage.getItem('mkw_source') || 'all';
  return (s === 'all' || API_SOURCES.includes(s)) ? s : 'all';
}
function setSource(s) {
  if (s === 'all' || API_SOURCES.includes(s)) localStorage.setItem('mkw_source', s);
}
function apiBase(source) {
  return `/proxy/api/platform/${source || 'dramabox'}`;
}

// ---------- Auth state ----------
const auth = {
  get token() { return localStorage.getItem('mkw_token'); },
  set token(v) { if (v) localStorage.setItem('mkw_token', v); else localStorage.removeItem('mkw_token'); },
  user: null,
  async refresh() {
    // Token-based first
    if (this.token) {
      try {
        const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + this.token } });
        if (r.ok) { const d = await r.json(); this.user = d.user; return this.user; }
        this.token = null;
      } catch {}
    }
    // Auto-login จาก remember-me credentials
    const saved = (() => { try { return JSON.parse(localStorage.getItem('mkw_remember') || 'null'); } catch { return null; } })();
    if (saved && saved.username && saved.password) {
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saved),
        });
        if (r.ok) {
          const d = await r.json();
          this.token = d.token;
          this.user = d.user;
          return this.user;
        } else {
          localStorage.removeItem('mkw_remember');
        }
      } catch {}
    }
    this.user = null;
    return null;
  },
  async logout() {
    if (this.token) {
      await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + this.token } }).catch(() => {});
    }
    this.token = null;
    this.user = null;
    localStorage.removeItem('mkw_remember');
    location.href = '/';
  },
  headers() { return this.token ? { Authorization: 'Bearer ' + this.token } : {}; },
};

// ---------- Online Points ticker (นับเฉพาะตอนวิดีโอเล่นจริงๆ — currentTime ต้องขยับ) ----------
// ทุก 60 วิของการเล่นจะส่งไป backend → +10 พ้อย (cap วันละ 10000)
const pointsTicker = {
  intervalId: null,
  accumSec: 0,
  video: null,
  lastTime: 0,
  attach(video) {
    this.detach();
    if (!auth.user) return;
    this.video = video;
    this.lastTime = video.currentTime || 0;
    this.intervalId = setInterval(() => this._onSecond(), 1000);
  },
  detach() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    this.video = null;
    this.accumSec = 0;
    this.lastTime = 0;
    updatePointsUi();
  },
  _onSecond() {
    const v = this.video;
    let counted = false;
    // ถ้าครบ cap วันนี้แล้ว — หยุดนับ + ไม่หมุน ring (รอ midnight reset)
    const u = auth.user;
    const today = u?.pointsToday || 0;
    const cap = u?.pointsDailyCap || 10000;
    const capped = today >= cap && cap > 0;
    if (!capped && v && !v.paused && !v.ended && !v.seeking && !document.hidden) {
      const t = v.currentTime;
      const dt = t - this.lastTime;
      this.lastTime = t;
      if (dt >= 0.5 && dt <= 1.5) {
        this.accumSec++;
        counted = true;
      }
    } else if (v) {
      // sync lastTime ตอน paused/capped กันกระโดดวินาทีเมื่อกลับมาเล่น
      this.lastTime = v.currentTime;
    }
    updatePointsUi();
    if (counted && this.accumSec >= 60) this._flush();
  },
  async _flush() {
    if (!auth.user) { this.accumSec = 0; return; }
    const seconds = this.accumSec;
    this.accumSec = 0;
    try {
      const r = await backendPost('/api/user/points/tick', { seconds });
      auth.user.points = r.points;
      auth.user.pointsToday = r.pointsToday;
      updatePointsUi();
    } catch { /* เงียบ — accumSec reset แล้ว */ }
  },
};

function updatePointsUi() {
  const u = auth.user;
  if (!u) return;
  const pts = u.points || 0;
  const today = u.pointsToday || 0;
  const cap = u.pointsDailyCap || 10000;
  const capped = today >= cap && cap > 0;
  const accum = pointsTicker.accumSec || 0;
  const remaining = 60 - accum;
  const tickPct = Math.min(100, Math.round(accum / 60 * 100));
  const dailyPct = Math.min(100, Math.round(today / cap * 100));

  // Header pill
  const hp = document.getElementById('headerPoints');
  if (hp) hp.textContent = pts.toLocaleString();

  // Popup (full)
  const pt = document.getElementById('popupPointsToday');
  const pb = document.getElementById('popupPointsTotal');
  const pCd = document.getElementById('popupCountdown');
  const pBar = document.getElementById('popupTickBar');
  if (pt) pt.textContent = `${today.toLocaleString()}/${cap.toLocaleString()}`;
  if (pb) pb.textContent = pts.toLocaleString();
  if (pCd) {
    pCd.textContent = capped
      ? '🎯 ครบโควตาวันนี้แล้ว (รีเซ็ตเที่ยงคืน)'
      : pointsTicker.video ? `+10 พ้อยในอีก ${remaining} วิ` : 'ยังไม่ได้เล่นวิดีโอ';
  }
  if (pBar) pBar.style.width = (capped ? 100 : tickPct) + '%';

  // Mini circle — outer ring = tick progress (60s), inner ring = daily progress
  const mini = document.getElementById('pointsMini');
  if (mini) {
    if (capped) {
      // ครบโควตา → ring เต็มสีเขียว + ไม่หมุน
      mini.style.background = `conic-gradient(#10b981 100%, #10b981 100%)`;
    } else {
      // ring แสดง tick progress (กำลังนับวิ) — สีทองหมุนเต็มทุก 60 วิ
      mini.style.background = `conic-gradient(#fbbf24 ${tickPct}%, #3f3f46 ${tickPct}%)`;
    }
    const lblNum = mini.querySelector('.miniNum');
    if (lblNum) lblNum.textContent = capped ? '✓' : (pointsTicker.video ? remaining + 's' : '⏸');
    const lblPts = mini.querySelector('.miniPts');
    if (lblPts) lblPts.textContent = pts >= 1000 ? Math.floor(pts / 1000) + 'k' : pts;
    // อัปเดต title แสดง daily progress
    mini.title = capped
      ? `🎯 ครบโควตาวันนี้แล้ว ${today.toLocaleString()}/${cap.toLocaleString()} • คงเหลือ ${pts.toLocaleString()} • รีเซ็ตเที่ยงคืน`
      : `วันนี้ ${today.toLocaleString()}/${cap.toLocaleString()} (${dailyPct}%) • คงเหลือ ${pts.toLocaleString()} • แตะเพื่อขยาย • กดค้างลากได้`;
  }
}

// ---------- Online Points popup state machine ----------
// State: 'mini' (default) | 'popup' | 'hidden'
// flow: เริ่ม = mini → กด mini = popup → กด ✕ ใน popup = ย่อกลับ mini → ✕ ใน mini = hidden
const POINTS_POS_KEY = 'mkw_points_pos';
const POINTS_HIDDEN_KEY = 'mkw_points_popup_hidden';

function _pointsRemoveAll() {
  const popup = document.getElementById('pointsPopup');
  const mini = document.getElementById('pointsMini');
  if (popup) { _pointsCleanupFs(popup); popup.remove(); }
  if (mini) { _pointsCleanupFs(mini); mini.remove(); }
}
function _pointsCleanupFs(el) {
  if (!el?._moveOnFs) return;
  document.removeEventListener('fullscreenchange', el._moveOnFs);
  document.removeEventListener('webkitfullscreenchange', el._moveOnFs);
  el._moveOnFs = null;
}
function _pointsKeepInFs(el) {
  const moveOnFs = () => {
    // ถ้า element ถูก remove ไปแล้ว (เช่น zombie ที่ cleanup ไม่ทัน) — ข้ามและ cleanup listener ซะเลย
    if (!el.isConnected && el.parentElement == null) {
      document.removeEventListener('fullscreenchange', moveOnFs);
      document.removeEventListener('webkitfullscreenchange', moveOnFs);
      return;
    }
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    const target = fsEl || document.body;
    if (el.parentElement !== target) target.appendChild(el);
  };
  document.addEventListener('fullscreenchange', moveOnFs);
  document.addEventListener('webkitfullscreenchange', moveOnFs);
  el._moveOnFs = moveOnFs;
  // ★ FIX: เรียกทันทีเพื่อ reparent ตอนสร้างถ้าอยู่ใน fullscreen (ก่อนหน้านี้ปุ่มกดไม่ได้ใน fullscreen)
  moveOnFs();
}
function _restorePointsPos(el) {
  try {
    const p = JSON.parse(localStorage.getItem(POINTS_POS_KEY) || 'null');
    if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) {
      // ตรวจอย่าให้หลุดขอบจอ
      const maxL = window.innerWidth - 60;
      const maxT = window.innerHeight - 60;
      const left = Math.max(4, Math.min(maxL, p.left));
      const top = Math.max(4, Math.min(maxT, p.top));
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }
  } catch {}
}
function _enableDrag(el) {
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false, pid = null;
  const onDown = e => {
    if (e.target.closest('button, a')) return;
    const rect = el.getBoundingClientRect();
    ox = rect.left; oy = rect.top;
    sx = e.clientX; sy = e.clientY;
    dragging = true; moved = false; pid = e.pointerId;
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = ox + 'px'; el.style.top = oy + 'px';
    el.style.cursor = 'grabbing';
    try { el.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  };
  const onMove = e => {
    if (!dragging || e.pointerId !== pid) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;  // dead zone — กันลั่นคลิก
    moved = true;
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.max(4, Math.min(window.innerWidth - w - 4, ox + dx));
    const y = Math.max(4, Math.min(window.innerHeight - h - 4, oy + dy));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  };
  const onUp = e => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = '';
    try { el.releasePointerCapture(e.pointerId); } catch {}
    if (moved) {
      try {
        localStorage.setItem(POINTS_POS_KEY, JSON.stringify({
          left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10),
        }));
      } catch {}
      // ป้องกัน click event ลั่นหลังลาก
      el._justDragged = true;
      setTimeout(() => { el._justDragged = false; }, 50);
    }
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

function showPointsCircle() {
  if (!auth.user) return;
  if (localStorage.getItem(POINTS_HIDDEN_KEY) === '1') return;
  _pointsRemoveAll();
  const u = auth.user;
  const today = u.pointsToday || 0;
  const cap = u.pointsDailyCap || 10000;
  const pts = u.points || 0;

  const mini = document.createElement('div');
  mini.id = 'pointsMini';
  mini.className = 'fixed right-3 bottom-20 z-[9999] w-14 h-14 rounded-full shadow-2xl select-none';
  mini.style.touchAction = 'none';
  mini.style.cursor = 'grab';
  mini.style.background = `conic-gradient(#fbbf24 0%, #3f3f46 0%)`;
  mini.innerHTML = `
    <div class="absolute inset-1 rounded-full bg-black/90 flex flex-col items-center justify-center pointer-events-none">
      <span class="text-amber-300 text-[9px] leading-none">⭐</span>
      <span class="miniNum text-amber-400 text-[11px] font-black leading-none mt-0.5">⏸</span>
      <span class="miniPts text-zinc-400 text-[8px] leading-none mt-0.5">${pts >= 1000 ? Math.floor(pts / 1000) + 'k' : pts}</span>
    </div>
    <button id="closePointsMini" class="absolute -top-1 -right-1 w-5 h-5 bg-zinc-800 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] leading-none shadow z-10" aria-label="ซ่อน">✕</button>
  `;
  document.body.appendChild(mini);
  _restorePointsPos(mini);
  _pointsKeepInFs(mini);
  _enableDrag(mini);
  // คลิกที่วงกลม (ไม่ใช่ปุ่ม X / ไม่ใช่หลังลาก) → ขยายเป็น popup
  mini.addEventListener('click', e => {
    if (mini._justDragged) return;
    if (e.target.closest('#closePointsMini')) return;
    showPointsPanel();
  });
  mini.querySelector('#closePointsMini').onclick = e => {
    e.stopPropagation();
    _pointsRemoveAll();
    localStorage.setItem(POINTS_HIDDEN_KEY, '1');
  };
  updatePointsUi();
}

function showPointsPanel() {
  if (!auth.user) return;
  _pointsRemoveAll();
  const u = auth.user;
  const today = u.pointsToday || 0;
  const cap = u.pointsDailyCap || 10000;
  const pts = u.points || 0;

  const popup = document.createElement('div');
  popup.id = 'pointsPopup';
  popup.className = 'fixed right-3 bottom-20 z-[9999] w-[230px] bg-black/90 backdrop-blur-sm border border-amber-500/40 rounded-xl p-3 shadow-2xl text-xs';
  popup.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="font-bold text-amber-300 text-sm">⭐ พ้อยออนไลน์</span>
      <button id="closePointsPopup" class="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white text-base leading-none rounded hover:bg-zinc-800" aria-label="ย่อกลับ" title="ย่อกลับเป็นวงกลม">✕</button>
    </div>
    <div class="space-y-1.5">
      <div class="flex items-center justify-between"><span class="text-zinc-400">วันนี้:</span><span id="popupPointsToday" class="font-bold text-amber-300">${today.toLocaleString()}/${cap.toLocaleString()}</span></div>
      <div class="flex items-center justify-between"><span class="text-zinc-400">คงเหลือ:</span><span id="popupPointsTotal" class="font-bold text-amber-400">${pts.toLocaleString()}</span></div>
      <div class="pt-2 border-t border-zinc-800">
        <div id="popupCountdown" class="text-[11px] text-zinc-300 text-center mb-1">ยังไม่ได้เล่นวิดีโอ</div>
        <div class="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div id="popupTickBar" class="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all" style="width:0%"></div>
        </div>
      </div>
      <div class="text-[10px] text-zinc-500 text-center pt-1">1 นาที = 10 พ้อย • 100 พ้อย = 1 MKW</div>
      <a href="/topup" class="block mt-1 text-center text-[11px] text-amber-300 hover:text-amber-200 underline">แลกเป็น MKW →</a>
    </div>
  `;
  document.body.appendChild(popup);
  _pointsKeepInFs(popup);
  // ✕ → ย่อกลับเป็น mini circle (ไม่ใช่ซ่อน)
  popup.querySelector('#closePointsPopup').onclick = () => {
    _pointsRemoveAll();
    showPointsCircle();
  };
  updatePointsUi();
}

// เปิดจากปุ่ม ⭐ ใน player → ล้าง flag hidden แล้วแสดง mini (default state)
function reopenPointsPopup() {
  localStorage.removeItem(POINTS_HIDDEN_KEY);
  showPointsCircle();
}

// ---------- API clients ----------
async function apiGet(path, source) {
  const src = source || 'dramabox';
  // Netshort: pin locale=th — upstream แปล title/desc เป็นไทย (ไม่กระทบ videoUrl/subtitles)
  let finalPath = path;
  if (src === 'netshort' && !/[?&]locale=/.test(path)) {
    finalPath = path + (path.includes('?') ? '&' : '?') + 'locale=th';
  }
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);  // 15s timeout/attempt — กัน upstream ค้าง
    try {
      const res = await fetch(apiBase(src) + finalPath, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res.json();
      const body = await res.text().catch(() => '');
      lastErr = new Error(`HTTP ${res.status} — [${src}] ${finalPath}`);
      lastErr.status = res.status; lastErr.endpoint = finalPath; lastErr.source = src; lastErr.body = body.slice(0, 400);
      // Retry เฉพาะ 5xx (อัปสตรีมล่มชั่วคราว เช่น DramaWave 503 "Sistem sedang sibuk")
      if (res.status < 500 || res.status >= 600 || attempt === 2) throw lastErr;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        lastErr = new Error(`Timeout 15s — [${src}] ${finalPath}`);
        lastErr.status = 0; lastErr.source = src; lastErr.endpoint = finalPath;
        if (attempt === 2) throw lastErr;
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Tag every drama item with __source สำหรับ render badge + URL
function tagSource(payload, src) {
  if (Array.isArray(payload)) return payload.map(x => ({ ...x, __source: src }));
  if (payload && Array.isArray(payload.items)) {
    return { ...payload, items: payload.items.map(x => ({ ...x, __source: src })) };
  }
  return payload;
}

// ---------- Source adapters: map endpoint + response shape ของ Melolo → DramaBox shape ----------
// DramaBox: GET /detail?bookId=X      → object {bookId, bookName, coverWap, chapterCount, introduction, tagV3s, ...}
//           GET /allepisode?bookId=X  → array  [{chapterIndex, isCharge, "1080p", videoUrl, "540p"}, ...]
// Melolo:   GET /detail/{id}          → {id, title, cover, episodes:N, intro, videos:[{episode, vid, duration}, ...]}
//           GET /video?id=X&ep=N      → {videoUrl, qualityList:[{label,url}], locked, ...}  (per-episode URL)
const SOURCE_ADAPTERS = {
  dramabox: {
    detailPath: id => pathFor('dramabox', 'detail', { series_id: id }),
    episodesPath: id => pathFor('dramabox', 'alleps', { series_id: id }),
    normalizeDetail: r => r,        // identity
    normalizeEpisodes: r => Array.isArray(r) ? r : [],
    extractEpisodesFromDetail: () => null,  // DramaBox ต้อง fetch /allepisode แยก
    fetchVideoUrl: null,                    // DramaBox ส่ง URL พร้อมใน /allepisode แล้ว
  },
  melolo: {
    detailPath: id => pathFor('melolo', 'detail', { series_id: id }),
    episodesPath: null,  // Melolo ไม่มี endpoint นี้ — ใช้ extractEpisodesFromDetail แทน
    normalizeDetail: r => {
      if (!r) return null;
      return {
        bookId: String(r.id || ''),
        bookName: r.title || '(ไม่ทราบชื่อ)',
        coverWap: r.cover || '',
        cover: r.cover || '',
        chapterCount: typeof r.episodes === 'number' ? r.episodes : (Array.isArray(r.videos) ? r.videos.length : 0),
        introduction: r.intro || '',
        tagV3s: [],
        playCount: '',
        shelfTime: '',
        corner: null,
      };
    },
    normalizeEpisodes: () => [],   // ไม่ใช้ — extract จาก detail แทน
    extractEpisodesFromDetail: r => {
      const videos = Array.isArray(r?.videos) ? r.videos : [];
      return videos.map(v => ({
        chapterIndex: Number(v.episode || v.ep || 0),
        isCharge: false,           // Melolo ไม่มี info เรื่องนี้ — ปล่อย locked เช็คตอน /video
        videoUrl: '',              // Lazy — fetch ตอน playEpisode
        '1080p': '',
        '540p': '',
        _vid: v.vid,
        _duration: v.duration,
      })).sort((a, b) => a.chapterIndex - b.chapterIndex);
    },
    fetchVideoUrl: async (bookId, ep) => {
      const v = await apiGet(pathFor('melolo', 'video', { series_id: bookId, ep }), 'melolo');
      const list = Array.isArray(v.qualityList) ? v.qualityList : [];
      const q1080 = list.find(x => x.label === '1080p')?.url || '';
      const q720 = list.find(x => x.label === '720p')?.url || '';
      const q540 = list.find(x => x.label === '540p')?.url || '';
      return {
        videoUrl: v.videoUrl || q1080 || q720 || q540 || '',
        '1080p': q1080,
        '720p': q720,
        '540p': q540,
        locked: !!v.locked,
      };
    },
  },
  // ShortMax — detail flat shape, /alleps wrap ใน {data:{episodes:[...]}}
  // Episode: {episode, locked, video:{video_720, video_1080, video_480}}
  shortmax: {
    detailPath: id => pathFor('shortmax', 'detail', { series_id: id }),
    episodesPath: id => pathFor('shortmax', 'alleps', { series_id: id }),
    normalizeDetail: r => {
      if (!r) return null;
      const d = r.data || r;
      return {
        bookId: String(d.id || d.bookId || ''),
        bookName: d.title || d.name || d.bookName || '(ไม่ทราบชื่อ)',
        coverWap: d.cover || d.coverWap || '',
        cover: d.cover || '',
        chapterCount: typeof d.episodes === 'number' ? d.episodes : (d.totalEpisodes || d.chapterCount || 0),
        introduction: d.summary || d.introduction || d.intro || '',
        tagV3s: Array.isArray(d.tags) ? d.tags.map(t => ({ tagName: String(t) })) : [],
        playCount: '',
        shelfTime: '',
        corner: null,
      };
    },
    normalizeEpisodes: r => {
      const eps = Array.isArray(r?.data?.episodes) ? r.data.episodes
                : Array.isArray(r?.episodes) ? r.episodes
                : Array.isArray(r) ? r : [];
      return eps.map(e => {
        const v = e.video || {};
        return {
          chapterIndex: Number(e.episode || e.chapterIndex || 0),
          isCharge: !!e.locked,
          videoUrl: v.video_1080 || v.video_720 || v.video_480 || e.videoUrl || '',
          '1080p': v.video_1080 || '',
          '720p': v.video_720 || '',
          '540p': v.video_480 || '',
        };
      }).sort((a, b) => a.chapterIndex - b.chapterIndex);
    },
    extractEpisodesFromDetail: () => null,
    fetchVideoUrl: null,
  },
  // DramaWave — /drama/{id} wrap ใน {code, data:{cover, episode_count, items:[...]}}
  // ไม่มี title ระดับ series → ใช้ items[0].name แทน. URL อยู่ใน item ครบทุกตอนแล้ว ไม่ต้อง /video
  dramawave: {
    detailPath: id => pathFor('dramawave', 'detail', { series_id: id }),
    episodesPath: null,  // extract จาก detail
    normalizeDetail: r => {
      if (!r) return null;
      const d = r.data || r;
      const items = Array.isArray(d.items) ? d.items : [];
      return {
        bookId: String(d.bookId || d.id || d.series_id || ''),
        bookName: items[0]?.name || d.title || d.bookName || '(ไม่ทราบชื่อ)',
        coverWap: d.cover || items[0]?.cover || '',
        cover: d.cover || '',
        chapterCount: d.episode_count || d.chapterCount || items.length || 0,
        introduction: d.description || d.summary || d.introduction || '',
        tagV3s: [],
        playCount: '',
        shelfTime: '',
        corner: null,
      };
    },
    normalizeEpisodes: () => [],
    extractEpisodesFromDetail: r => {
      const d = r?.data || r || {};
      const items = Array.isArray(d.items) ? d.items : [];
      return items.map(e => ({
        chapterIndex: Number(e.serial_number || e.episode || e.chapterIndex || 0),
        isCharge: e.video_type === 'charge',
        videoUrl: e['1080p_mp4'] || e['720p_mp4'] || e['540p_mp4'] || e.m3u8_path || '',
        '1080p': e['1080p_mp4'] || '',
        '720p': e['720p_mp4'] || '',
        '540p': e['540p_mp4'] || '',
      })).filter(x => x.chapterIndex > 0).sort((a, b) => a.chapterIndex - b.chapterIndex);
    },
    fetchVideoUrl: null,  // URL ฝังใน detail response แล้ว
  },
  // Netshort — flat detail (ไม่มี data wrapper / ไม่มี items array)
  // field map: shortPlayId, shortPlayName, shortPlayCover, totalEpisode, shotIntroduce, shortPlayLabels[]
  // ใช้ /watch/{id}/{ep} แยก fetch URL ตอนเล่น (lazy เหมือน Melolo)
  netshort: {
    detailPath: id => pathFor('netshort', 'detail', { series_id: id }),
    episodesPath: null,
    normalizeDetail: r => {
      if (!r) return null;
      const d = r.data || r;
      const count = Number(d.totalEpisode ?? d.episode_count ?? d.chapterCount ?? d.totalEpisodes ?? d.total_episodes ?? d.total ?? 0) || 0;
      const labels = Array.isArray(d.shortPlayLabels) ? d.shortPlayLabels : (Array.isArray(d.tags) ? d.tags : []);
      return {
        bookId: String(d.shortPlayId || d.bookId || d.id || d.series_id || ''),
        bookName: d.shortPlayName || d.title || d.name || d.bookName || '(ไม่ทราบชื่อ)',
        coverWap: d.shortPlayCover || d.cover || d.coverWap || '',
        cover: d.shortPlayCover || d.cover || '',
        chapterCount: count,
        introduction: d.shotIntroduce || d.shortIntroduce || d.description || d.summary || d.introduction || d.intro || '',
        tagV3s: labels.map(t => ({ tagName: String(t) })),
        playCount: '',
        shelfTime: '',
        corner: null,
      };
    },
    normalizeEpisodes: () => [],
    extractEpisodesFromDetail: r => {
      const d = r?.data || r || {};
      const count = Number(d.totalEpisode ?? d.episode_count ?? d.chapterCount ?? d.totalEpisodes ?? d.total_episodes ?? d.total ?? 0) || 0;
      if (count <= 0) return [];
      // Synthesize [1..N] — URL fetch lazy ตอนเล่นผ่าน /watch/{id}/{ep}
      return Array.from({ length: count }, (_, i) => ({
        chapterIndex: i + 1,
        isCharge: false,
        videoUrl: '',
        '1080p': '',
        '540p': '',
      }));
    },
    fetchVideoUrl: async (bookId, ep) => {
      const v = await apiGet(pathFor('netshort', 'video', { series_id: bookId, ep }), 'netshort');
      const d = v?.data || v || {};
      const q1080 = d['1080p_mp4'] || d['1080p'] || d.video_1080 || '';
      const q720  = d['720p_mp4']  || d['720p']  || d.video_720  || '';
      const q540  = d['540p_mp4']  || d['540p']  || d.video_480 || d.video_540 || '';
      const main  = d.videoUrl || d.url || d.video || d.m3u8_path || d.playUrl || d.videoPlayUrl || q1080 || q720 || q540 || '';
      if (Array.isArray(d.qualityList)) {
        const q = k => d.qualityList.find(x => x.label === k)?.url || '';
        return {
          videoUrl: main || q('1080p') || q('720p') || q('540p') || '',
          '1080p': q1080 || q('1080p'),
          '720p': q720 || q('720p'),
          '540p': q540 || q('540p'),
          locked: !!d.locked,
        };
      }
      return { videoUrl: main, '1080p': q1080, '720p': q720, '540p': q540, locked: !!d.locked };
    },
  },
};
// Generic adapter สำหรับ source ใหม่ที่ user เพิ่มเอง (adapter key ไม่ตรงกับ 5 ตัวข้างบน)
// ใช้ shape dramabox-like → ถ้า API response shape ไม่ตรง user ต้องเลือก adapter ที่ใกล้สุดในฟอร์ม
function _genericAdapter(sourceKey) {
  return {
    detailPath: id => pathFor(sourceKey, 'detail', { series_id: id }),
    episodesPath: id => { const tpl = SOURCE_REG[sourceKey]?.endpoints?.alleps; return tpl ? pathFor(sourceKey, 'alleps', { series_id: id }) : null; },
    normalizeDetail: r => r,
    normalizeEpisodes: r => Array.isArray(r) ? r : (Array.isArray(r?.items) ? r.items : []),
    extractEpisodesFromDetail: () => null,
    fetchVideoUrl: null,
  };
}
function getAdapter(source) {
  if (SOURCE_ADAPTERS[source]) return SOURCE_ADAPTERS[source];
  // Fallback: ใช้ adapter ที่ registry ระบุไว้ (อาจ map หลาย source เข้า adapter ตัวเดียว) หรือ generic
  const adapterKey = SOURCE_REG[source]?.adapter;
  if (adapterKey && SOURCE_ADAPTERS[adapterKey]) return SOURCE_ADAPTERS[adapterKey];
  return _genericAdapter(source);
}
async function apiGetDetail(bookId, source) {
  const a = getAdapter(source);
  const raw = await apiGet(a.detailPath(bookId), source);
  return a.normalizeDetail(raw);
}
// คืน {detail, episodes, detailErr, epsErr} — Melolo ใช้ 1 fetch, DramaBox ใช้ 2 fetch parallel
async function fetchDetailAndEpisodes(bookId, source) {
  const a = getAdapter(source);
  if (a.extractEpisodesFromDetail && !a.episodesPath) {
    // Single-fetch source (Melolo): ดึง detail แล้ว extract episodes จากนั้นเลย
    try {
      const raw = await apiGet(a.detailPath(bookId), source);
      return {
        detail: a.normalizeDetail(raw),
        episodes: a.extractEpisodesFromDetail(raw) || [],
        detailErr: null, epsErr: null,
      };
    } catch (e) {
      return { detail: null, episodes: [], detailErr: e, epsErr: e };
    }
  }
  // Two-fetch source (DramaBox): parallel
  const [d, e] = await Promise.allSettled([
    apiGet(a.detailPath(bookId), source),
    apiGet(a.episodesPath(bookId), source),
  ]);
  return {
    detail: d.status === 'fulfilled' ? a.normalizeDetail(d.value) : null,
    episodes: e.status === 'fulfilled' ? a.normalizeEpisodes(e.value) : [],
    detailErr: d.status === 'rejected' ? d.reason : null,
    epsErr: e.status === 'rejected' ? e.reason : null,
  };
}
// Lazy URL fetch — ใช้ตอนจะเล่น ep ที่ยังไม่มี URL (เฉพาะ Melolo)
async function ensureEpisodeUrl(ep, bookId, source) {
  if (ep.videoUrl || ep['1080p'] || ep['540p']) return ep;  // มีอยู่แล้ว
  const a = getAdapter(source);
  if (!a.fetchVideoUrl) return ep;
  const r = await a.fetchVideoUrl(bookId, ep.chapterIndex);
  ep.videoUrl = r.videoUrl;
  ep['1080p'] = r['1080p'];
  ep['720p'] = r['720p'] || '';
  ep['540p'] = r['540p'];
  return ep;
}

// ดึง list endpoint จาก source ที่ active — 'all' = parallel ทั้ง 2 + interleave
// path อาจเป็น string (เหมือนกันทั้ง 2 source) หรือ spec { dramabox, melolo, filter? }
// Locale fan-out: ถ้า source มี localeParam + locales.mode==='selected' + allowed.length → fan-out per-locale + interleave
async function _fetchWithLocaleFanout(path, source) {
  const reg = SOURCE_REG[source];
  if (reg?.localeParam && reg?.locales?.mode === 'selected' && Array.isArray(reg.locales.allowed) && reg.locales.allowed.length && _isListLikePath(path)) {
    const results = await Promise.allSettled(reg.locales.allowed.map(loc => apiGet(_appendLocaleParam(path, reg.localeParam, loc), source)));
    const merged = [];
    let total = 0;
    const seen = new Set();
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const items = pickList(r.value) || [];
      total += r.value?.total || items.length;
      for (const it of items) {
        const id = String(it?.series_id || it?.bookId || it?.id || '');
        const key = id + '|' + reg.locales.allowed[i];
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        merged.push({ ...it, __locale: reg.locales.allowed[i] });
      }
    });
    return { items: merged, total };
  }
  return apiGet(path, source);
}

async function apiGetList(pathOrSpec) {
  const isSpec = typeof pathOrSpec === 'object' && pathOrSpec !== null;
  const getPath = s => isSpec ? pathOrSpec[s] : pathOrSpec;
  const getFilter = s => isSpec ? pathOrSpec.filter?.[s] : null;

  const src = getSource();
  if (src !== 'all') {
    const path = getPath(src);
    if (!path) {
      // No endpoint for selected source → empty (UI shows "ไม่มีรายการ")
      return { items: [], total: 0, _multi: true, _buckets: API_SOURCES.map(s => ({ source: s, count: 0, skipped: !getPath(s) || s !== src })) };
    }
    const data = await _fetchWithLocaleFanout(path, src);
    let payload = tagSource(data, src);
    const ff = getFilter(src);
    if (ff) {
      const items = pickList(payload).filter(ff);
      payload = { ...payload, items, total: items.length };
    }
    return payload;
  }
  // 'all' mode — fetch แต่ละ source ที่มี endpoint
  const targets = API_SOURCES.map(s => ({ source: s, path: getPath(s) }));
  const fetchable = targets.filter(t => t.path);
  const results = await Promise.allSettled(fetchable.map(t => _fetchWithLocaleFanout(t.path, t.source)));
  const buckets = results.map((r, i) => {
    const source = fetchable[i].source;
    if (r.status !== 'fulfilled') return { source, items: [], total: 0, err: r.reason };
    let items = pickList(r.value).map(x => ({ ...x, __source: source }));
    const ff = getFilter(source);
    if (ff) items = items.filter(ff);
    return { source, items, total: r.value?.total ?? items.length };
  });
  // เพิ่ม skipped buckets สำหรับ source ที่ไม่มี endpoint (เช่น chip "การ์ตูน" ที่ Melolo ไม่มีหมวด)
  for (const t of targets) {
    if (!t.path) buckets.push({ source: t.source, items: [], total: 0, skipped: true });
  }
  const ok = buckets.filter(b => !b.err && !b.skipped);
  if (!ok.length) throw (buckets.find(b => b.err)?.err) || new Error('No source available');
  // Interleave round-robin (เลี่ยง bias ไป source ใดเดียว)
  const merged = [];
  const max = Math.max(0, ...buckets.map(b => b.items.length));
  for (let i = 0; i < max; i++) for (const b of buckets) if (b.items[i]) merged.push(b.items[i]);
  const total = buckets.reduce((s, b) => s + (b.total || 0), 0);
  return { items: merged, total, _multi: true, _buckets: buckets.map(b => ({ source: b.source, count: b.items.length, total: b.total || 0, err: b.err?.message || null, skipped: !!b.skipped })) };
}

let _sessionReplacedShown = false;
function _handleSessionReplaced(data) {
  if (_sessionReplacedShown) return;
  _sessionReplacedShown = true;
  try { localStorage.removeItem('mkw_token'); } catch {}
  try { localStorage.removeItem('mkw_remember'); } catch {}
  auth.user = null;
  alert(data?.error || 'พบการ login จากเครื่องอื่น — คุณถูก logout จากเครื่องนี้');
  location.href = '/login';
}

async function backendGet(path, opts = {}) {
  const { timeoutMs } = opts;
  const ctrl = timeoutMs ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(path, { headers: auth.headers(), signal: ctrl?.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && data.reason === 'session_replaced') _handleSessionReplaced(data);
      if (res.status === 403 && data.error === 'ip_banned') showIpBanned(data);
      const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') { const te = new Error('หมดเวลาเชื่อมต่อ (timeout)'); te.status = 0; throw te; }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function backendPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { ...auth.headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.reason === 'session_replaced') _handleSessionReplaced(data);
    if (res.status === 403 && data.error === 'ip_banned') showIpBanned(data);
    const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e;
  }
  return data;
}

async function backendDelete(path) {
  const res = await fetch(path, { method: 'DELETE', headers: auth.headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.reason === 'session_replaced') _handleSessionReplaced(data);
    if (res.status === 403 && data.error === 'ip_banned') showIpBanned(data);
    const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e;
  }
  return data;
}

function showIpBanned(data) {
  if (document.getElementById('ipBannedOverlay')) return;
  const until = data?.until ? new Date(data.until) : null;
  const untilStr = until && !isNaN(until.getTime()) ? until.toLocaleString('th-TH') : '';
  const msg = data?.message || 'ทำผิดกฎของเว็บไซต์';
  const overlay = document.createElement('div');
  overlay.id = 'ipBannedOverlay';
  overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
  overlay.style.background = 'rgba(0,0,0,0.95)';
  overlay.innerHTML = `
    <div class="max-w-md w-full bg-zinc-900 border-2 border-red-600 rounded-2xl p-6 text-center shadow-2xl">
      <div class="text-6xl mb-3">🚫</div>
      <h2 class="text-2xl font-black text-red-400 mb-2">IP ของคุณถูกระงับ</h2>
      <p class="text-zinc-300 mb-3">${escapeHtml(msg)}</p>
      ${untilStr ? `<div class="text-xs text-zinc-500">ระงับถึง: <span class="text-amber-300">${escapeHtml(untilStr)}</span></div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
}

// ---------- Public site config (freeMode promo ฯลฯ) ----------
const publicConfig = {
  data: null,
  async load() {
    if (this.data) return this.data;
    try {
      const r = await fetch('/api/public-config');
      if (r.ok) this.data = await r.json();
    } catch {}
    if (!this.data) this.data = { freeMode: { enabled: false, message: '' }, announcement: { enabled: false }, maintenance: { enabled: false }, hiddenBooks: [] };
    // Overwrite source registry จาก server (admin จัดการได้)
    if (Array.isArray(this.data.apiSources) && this.data.apiSources.length) {
      const list = this.data.apiSources;
      API_SOURCES = list.map(s => s.key);
      // Clear & refill (object refs unchanged → dependent code ที่อ้างอิงตรงๆ ยังทำงานได้)
      Object.keys(SOURCE_LABELS).forEach(k => delete SOURCE_LABELS[k]);
      Object.keys(SOURCE_BADGE_CLS).forEach(k => delete SOURCE_BADGE_CLS[k]);
      Object.keys(SOURCE_REG).forEach(k => delete SOURCE_REG[k]);
      for (const s of list) {
        SOURCE_LABELS[s.key] = s.label || s.key;
        SOURCE_BADGE_CLS[s.key] = s.badgeClass || 'bg-zinc-700';
        SOURCE_REG[s.key] = {
          key: s.key,
          adapter: s.adapter || s.key,
          endpoints: s.endpoints || _FALLBACK_ENDPOINTS[s.adapter || s.key] || _FALLBACK_ENDPOINTS.dramabox,
          localeParam: s.localeParam || '',
          locales: s.locales || { mode: 'all', allowed: [] },
        };
      }
    }
    return this.data;
  },
  async reload() {
    // Force refetch — ใช้โดย source-switcher poller เพื่อ detect admin แก้ API sources
    this.data = null;
    this._hbSet = null;
    return this.load();
  },
  isFreeMode() { return !!this.data?.freeMode?.enabled; },
  freeMessage() { return this.data?.freeMode?.message || ''; },
  isMaintenance() { return !!this.data?.maintenance?.enabled; },
  maintenanceMsg() { return this.data?.maintenance?.message || ''; },
  hiddenBookSet() {
    if (!this._hbSet) this._hbSet = new Set(this.data?.hiddenBooks || []);
    return this._hbSet;
  },
};

// คืน icon สำหรับแต่ละ ep ตาม role + freeMode + roleLimits
// '' = ดูได้, '🔒' = ต้อง login/อัปเกรด VIP, '💰' = ตอน charged (upstream paywall)
function epLockIcon(i, isCharge, user) {
  const role = user?.role;
  if (role === 'admin' || role === 'vip') return '';
  if (publicConfig.isFreeMode()) {
    if (!user) return '🔒';
    return '';
  }
  const limits = publicConfig.data?.roleLimits || {};
  const guestEps = Number.isFinite(limits.guestEps) ? limits.guestEps : 0;
  const userEps  = Number.isFinite(limits.userEps)  ? limits.userEps  : 10;
  if (!user) {
    if (i > guestEps) return '🔒';
  } else {
    if (i > userEps) return '🔒';
  }
  if (isCharge) return '💰';
  return '';
}

function maybeShowPromoPopup() {
  if (!publicConfig.isFreeMode()) return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('mkw_promo_dismiss') === today) return;
  if (document.getElementById('promoPopup')) return;

  const fm = publicConfig.data?.freeMode || {};
  const customMsg = fm.message || '';
  const defaultMsg = 'ตอนนี้อยู่ในช่วงโปรโมชั่น <strong>ดูฟรีทั้งแอป</strong> — ทุกเรื่อง ทุกตอน ไม่ต้องใช้เหรียญ ไม่ต้อง VIP';
  const msg = customMsg ? escapeHtml(customMsg) : defaultMsg;

  // แสดงช่วงเวลา ถ้าตั้งไว้
  const fmtDT = iso => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const sText = fmtDT(fm.startAt);
  const eText = fmtDT(fm.endAt);
  let rangeHtml = '';
  if (sText || eText) {
    rangeHtml = `
      <div class="mt-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
        <div class="font-bold mb-1">⏰ ช่วงกิจกรรม</div>
        <div>${sText ? `<span class="text-zinc-400">เริ่ม:</span> ${escapeHtml(sText)}` : '<span class="text-zinc-400">เริ่มแล้ว</span>'}</div>
        <div>${eText ? `<span class="text-zinc-400">สิ้นสุด:</span> ${escapeHtml(eText)}` : '<span class="text-zinc-400">ไม่มีวันสิ้นสุด</span>'}</div>
      </div>
    `;
  }

  const overlay = document.createElement('div');
  overlay.id = 'promoPopup';
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4';
  overlay.style.background = 'rgba(0,0,0,0.75)';
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.innerHTML = `
    <div class="bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-emerald-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl" style="animation: slide-up 0.3s ease-out">
      <div class="text-center mb-4">
        <div class="text-6xl mb-3">🎉</div>
        <h3 class="text-2xl font-black text-emerald-400 mb-2">โปรโมชั่นพิเศษ!</h3>
        <p class="text-sm text-zinc-300 leading-relaxed">${msg}</p>
        ${rangeHtml}
      </div>
      <label class="flex items-center gap-2 text-sm cursor-pointer select-none mb-4 px-3 py-2 bg-zinc-800/50 rounded-lg hover:bg-zinc-800">
        <input id="promoHideToday" type="checkbox" class="w-4 h-4 accent-emerald-500"/>
        <span class="text-zinc-300">ไม่แสดงทั้งหมดภายในวันนี้</span>
      </label>
      <button id="promoCloseBtn" class="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-lg font-bold">ปิด</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    if (document.getElementById('promoHideToday')?.checked) {
      localStorage.setItem('mkw_promo_dismiss', today);
    }
    overlay.remove();
  };
  document.getElementById('promoCloseBtn').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

// ---------- Announcement banner (อยู่ใต้ header) ----------
function renderAnnouncementBanner() {
  const an = publicConfig.data?.announcement;
  if (!an?.enabled || !an.text) return;
  if (document.getElementById('siteAnnouncement')) return;
  const colorMap = {
    blue:    'bg-blue-600/90 border-blue-400',
    amber:   'bg-amber-500/90 border-amber-300 text-black',
    red:     'bg-red-600/90 border-red-400',
    emerald: 'bg-emerald-600/90 border-emerald-400',
  };
  const cls = colorMap[an.color] || colorMap.blue;
  const div = document.createElement('div');
  div.id = 'siteAnnouncement';
  div.className = `${cls} border-b text-sm`;
  // ปลอดภัย: รองรับเฉพาะ <b> และ <a href>
  const safeHtml = String(an.text)
    .replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
    .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>')
    .replace(/&lt;a\s+href=&quot;([^&]+?)&quot;&gt;(.*?)&lt;\/a&gt;/g, '<a href="$1" class="underline">$2</a>');
  div.innerHTML = `<div class="max-w-[1600px] mx-auto px-4 py-2 flex items-center gap-2"><span>📢</span><span class="flex-1">${safeHtml}</span></div>`;
  document.body.insertBefore(div, document.body.firstChild);
}

// ---------- Maintenance gate (admin ผ่านได้) ----------
function maintenanceGate() {
  if (!publicConfig.isMaintenance()) return false;
  if (auth.user?.role === 'admin') return false;
  // อนุญาตเฉพาะหน้า login เพื่อให้ admin เข้ามา manage ได้
  const allowed = ['/login', '/register'];
  if (allowed.includes(location.pathname)) return false;
  document.body.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-6 bg-black text-white">
      <div class="max-w-md w-full text-center">
        <div class="text-7xl mb-4">🚧</div>
        <h1 class="text-3xl font-black mb-3">กำลังปรับปรุงระบบ</h1>
        <p class="text-zinc-400 mb-6 leading-relaxed">${escapeHtml(publicConfig.maintenanceMsg() || 'ขออภัยในความไม่สะดวก กลับมาในไม่ช้า')}</p>
        <a href="/login" class="inline-block px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm">Admin login</a>
      </div>
    </div>
  `;
  return true;
}

// ---------- Heartbeat (อัปเดต lastSeenAt ทุก 60 วิ + poll inbox unread) ----------
let _heartbeatTimer = null;
function startHeartbeat() {
  // Initial inbox fetch — ทำทันทีถ้า login อยู่
  if (auth.token) refreshInboxBadge();
  if (_heartbeatTimer || !auth.token) return;
  // ถ้า admin ปิด tracking → ข้าม heartbeat ทั้งหมด (ลดภาระ server)
  if (publicConfig.data?.trackingDisabled) return;
  _heartbeatTimer = setInterval(() => {
    if (!auth.token) return;
    if (publicConfig.data?.trackingDisabled) return;  // respect toggle ระหว่าง session
    fetch('/api/auth/heartbeat', { method: 'POST', headers: auth.headers() }).catch(() => {});
    refreshInboxBadge();
  }, 60_000);
}

// ---------- Inbox (กล่องจดหมาย) ----------
const inbox = {
  unread: 0,
  messages: null,  // lazy load ตอนเปิด modal
};
async function refreshInboxBadge() {
  if (!auth.token) return;
  try {
    const r = await fetch('/api/user/inbox/unread', { headers: auth.headers() });
    if (!r.ok) return;
    const d = await r.json();
    inbox.unread = Number(d.unread || 0);
    updateInboxBadgeDom();
  } catch {}
}
function updateInboxBadgeDom() {
  const badge = document.getElementById('inboxBadge');
  if (!badge) return;
  if (inbox.unread > 0) {
    badge.textContent = inbox.unread > 99 ? '99+' : String(inbox.unread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
async function openInboxModal() {
  if (document.getElementById('inboxModal')) return;  // already open
  const overlay = document.createElement('div');
  overlay.id = 'inboxModal';
  overlay.className = 'fixed inset-0 z-[100] flex items-start justify-center p-2 sm:p-4 pt-12 sm:pt-20';
  overlay.style.background = 'rgba(0,0,0,0.75)';
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-zinc-800">
        <div>
          <h3 class="font-black text-lg">📬 กล่องจดหมาย</h3>
          <div id="inboxCount" class="text-xs text-zinc-500 mt-0.5">กำลังโหลด...</div>
        </div>
        <div class="flex items-center gap-2">
          <button id="inboxSendAdmin" class="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white font-bold">✉️ ส่งถึงแอดมิน</button>
          <button id="inboxReadAll" class="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded">อ่านทั้งหมด</button>
          <button id="inboxClose" class="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-300">✕</button>
        </div>
      </div>
      <div id="inboxList" class="flex-1 overflow-y-auto p-3 space-y-2">
        <div class="text-center text-zinc-500 py-10">กำลังโหลด...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) closeInboxModal(); };
  document.getElementById('inboxClose').onclick = closeInboxModal;
  document.getElementById('inboxSendAdmin').onclick = openSendAdminModal;
  document.getElementById('inboxReadAll').onclick = async () => {
    try {
      await backendPost('/api/user/inbox/read-all', {});
      (inbox.messages || []).forEach(m => { m.read = true; });
      inbox.unread = 0;
      updateInboxBadgeDom();
      renderInboxList();
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  };
  try {
    const d = await backendGet('/api/user/inbox');
    inbox.messages = Array.isArray(d.messages) ? d.messages : [];
    inbox.unread = Number(d.unread || 0);
    updateInboxBadgeDom();
    renderInboxList();
  } catch (e) {
    document.getElementById('inboxList').innerHTML = errorBanner(e, { title: 'โหลดจดหมายไม่สำเร็จ' });
  }
}
function closeInboxModal() {
  document.getElementById('inboxModal')?.remove();
}
function renderInboxList() {
  const listEl = document.getElementById('inboxList');
  const countEl = document.getElementById('inboxCount');
  if (!listEl || !countEl) return;
  const msgs = inbox.messages || [];
  countEl.textContent = `ทั้งหมด ${msgs.length} ฉบับ • ยังไม่อ่าน ${msgs.filter(m => !m.read).length} ฉบับ`;
  if (!msgs.length) {
    listEl.innerHTML = `<div class="text-center py-16 text-zinc-500"><div class="text-5xl mb-3">📭</div><p>ยังไม่มีจดหมาย</p></div>`;
    return;
  }
  listEl.innerHTML = msgs.map(m => {
    const dt = new Date(m.at);
    const dateStr = isNaN(dt.getTime()) ? '' : dt.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const unreadDot = m.read ? '' : '<span class="w-2 h-2 rounded-full bg-red-500 inline-block mr-2"></span>';
    const fromColor = m.from === 'admin' ? 'text-red-300' : (m.from === 'system' ? 'text-emerald-300' : 'text-zinc-400');
    const giftBadge = m.gift
      ? (m.gift.claimed
          ? '<span class="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded ml-2">🎁 เปิดแล้ว</span>'
          : '<span class="text-[10px] px-1.5 py-0.5 bg-amber-500 text-black rounded font-bold ml-2 animate-pulse">🎁 ของขวัญ!</span>')
      : '';
    return `
      <div data-id="${escapeHtml(m.id)}" class="msg-item group ${m.read ? 'bg-zinc-950/50' : 'bg-zinc-800/50 border-red-500/30'} ${m.gift && !m.gift.claimed ? 'border-amber-500/50 bg-amber-500/5' : ''} border border-zinc-800 rounded-lg p-3 cursor-pointer hover:bg-zinc-800">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 text-xs mb-1 flex-wrap">
              ${unreadDot}
              <span class="font-bold ${fromColor}">${escapeHtml(m.from || 'system')}</span>
              <span class="text-zinc-600">•</span>
              <span class="text-zinc-500">${escapeHtml(dateStr)}</span>
              ${giftBadge}
            </div>
            <div class="font-bold text-sm text-zinc-100 truncate">${escapeHtml(m.subject || '(ไม่มีหัวข้อ)')}</div>
            <div class="text-xs text-zinc-400 truncate mt-1">${escapeHtml(m.body || '')}</div>
          </div>
          <button data-del="${escapeHtml(m.id)}" class="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs text-zinc-500 hover:text-red-400" title="ลบ">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
  listEl.querySelectorAll('.msg-item').forEach(el => {
    el.onclick = async e => {
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.del;
        if (!confirm('ลบจดหมายฉบับนี้?')) return;
        try {
          await backendDelete(`/api/user/inbox/${encodeURIComponent(id)}`);
          inbox.messages = (inbox.messages || []).filter(m => m.id !== id);
          inbox.unread = (inbox.messages || []).filter(m => !m.read).length;
          updateInboxBadgeDom();
          renderInboxList();
        } catch (ex) { alert('ลบไม่สำเร็จ: ' + ex.message); }
        return;
      }
      const id = el.dataset.id;
      const m = (inbox.messages || []).find(x => x.id === id);
      if (!m) return;
      if (!m.read) {
        backendPost(`/api/user/inbox/${encodeURIComponent(id)}/read`, {}).then(() => {
          m.read = true;
          inbox.unread = (inbox.messages || []).filter(x => !x.read).length;
          updateInboxBadgeDom();
        }).catch(() => {});
      }
      openMessageDetail(m);
    };
  });
}
function openMessageDetail(m) {
  const dt = new Date(m.at);
  const dateStr = isNaN(dt.getTime()) ? '' : dt.toLocaleString('th-TH');
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[110] flex items-center justify-center p-4';
  overlay.style.background = 'rgba(0,0,0,0.7)';

  const hasUnclaimedGift = m.gift && !m.gift.claimed;
  const giftBox = m.gift ? (m.gift.claimed
    ? `<div class="mt-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 text-xs text-zinc-400">
         <div class="flex items-center gap-2 mb-1"><span>🎁</span><span class="font-bold">ของขวัญที่ได้รับแล้ว</span></div>
         ${m.gift.coins > 0 ? `<div>💰 +${m.gift.coins} MKW coins</div>` : ''}
         ${m.gift.vipDays > 0 ? `<div>👑 VIP +${m.gift.vipDays} วัน</div>` : ''}
       </div>`
    : `<div id="giftPanel" class="mt-4 p-5 rounded-xl bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-amber-500/20 border-2 border-amber-500/50 text-center">
         <div id="giftIcon" class="text-7xl mb-2" style="animation: giftWobble 1.2s ease-in-out infinite">🎁</div>
         <div class="text-amber-300 font-black text-lg mb-1">คุณได้รับของขวัญ!</div>
         <div class="text-xs text-zinc-300 mb-3">
           ${m.gift.coins > 0 ? `<span class="inline-block px-2 py-0.5 bg-amber-500/20 rounded mx-1">💰 ${m.gift.coins} MKW</span>` : ''}
           ${m.gift.vipDays > 0 ? `<span class="inline-block px-2 py-0.5 bg-amber-500/20 rounded mx-1">👑 VIP ${m.gift.vipDays} วัน</span>` : ''}
         </div>
         <button id="claimGiftBtn" class="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black rounded-lg shadow-lg">✨ เปิดของขวัญ</button>
         <div id="giftMsg" class="text-xs mt-2"></div>
       </div>`) : '';

  overlay.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl">
      <div class="p-4 border-b border-zinc-800">
        <div class="text-xs text-zinc-500 mb-1">จาก <span class="font-bold ${m.from === 'admin' ? 'text-red-300' : 'text-emerald-300'}">${escapeHtml(m.from || 'system')}</span> • ${escapeHtml(dateStr)}</div>
        <h4 class="font-black text-lg">${escapeHtml(m.subject || '(ไม่มีหัวข้อ)')}</h4>
      </div>
      <div class="flex-1 overflow-y-auto p-4 text-sm text-zinc-200 whitespace-pre-line leading-relaxed">${escapeHtml(m.body || '(ไม่มีข้อความ)')}${giftBox}</div>
      <div class="p-3 border-t border-zinc-800 text-right">
        <button class="closeDetail px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm rounded">ปิด</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('.closeDetail').onclick = () => overlay.remove();

  if (hasUnclaimedGift) {
    const btn = overlay.querySelector('#claimGiftBtn');
    const icon = overlay.querySelector('#giftIcon');
    const msgEl = overlay.querySelector('#giftMsg');
    const panel = overlay.querySelector('#giftPanel');
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'กำลังเปิด...';
      icon.style.animation = 'giftShake 0.4s ease-in-out 3';
      try {
        const r = await backendPost('/api/user/inbox/claim-gift', { messageId: m.id });
        // sync auth.user จาก response
        if (auth.user) {
          if (typeof r.coins === 'number') auth.user.coins = r.coins;
          if (r.role) auth.user.role = r.role;
          if (r.vipExpires !== undefined) auth.user.vipExpires = r.vipExpires;
          if (typeof updatePointsUi === 'function') updatePointsUi();
        }
        // mark local
        m.gift.claimed = true;
        m.gift.claimedAt = Date.now();
        // burst animation
        icon.textContent = '🎉';
        icon.style.animation = 'giftBurst 0.6s ease-out';
        const rewards = [];
        if (r.coinsAdded > 0) rewards.push(`<div class="text-amber-300 font-black">💰 +${r.coinsAdded} MKW</div>`);
        if (r.vipDaysAdded > 0) rewards.push(`<div class="text-amber-300 font-black">👑 VIP +${r.vipDaysAdded} วัน</div>`);
        msgEl.innerHTML = `<div class="space-y-1 mt-2">${rewards.join('')}<div class="text-emerald-400 mt-1">✓ ได้รับเรียบร้อย</div></div>`;
        btn.style.display = 'none';
        renderInboxList();
      } catch (ex) {
        msgEl.innerHTML = `<span class="text-red-400">เปิดไม่สำเร็จ: ${escapeHtml(ex.message)}</span>`;
        btn.disabled = false;
        btn.textContent = '✨ เปิดของขวัญ';
      }
    };
  }
}

function openSendAdminModal() {
  if (document.getElementById('sendAdminModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'sendAdminModal';
  overlay.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4';
  overlay.style.background = 'rgba(0,0,0,0.75)';
  overlay.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-zinc-800">
        <h4 class="font-black text-lg">✉️ ส่งข้อความถึงแอดมิน</h4>
        <button id="sendAdmClose" class="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-300">✕</button>
      </div>
      <form id="sendAdmForm" class="p-4 space-y-3">
        <div>
          <label class="text-xs text-zinc-400">หัวข้อ</label>
          <input id="sendAdmSubject" type="text" maxlength="200" required placeholder="เช่น แจ้งปัญหาเล่นวิดีโอไม่ได้" class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-red-500"/>
        </div>
        <div>
          <label class="text-xs text-zinc-400">เนื้อหา <span id="sendAdmCount" class="text-zinc-600">0/3000</span></label>
          <textarea id="sendAdmBody" maxlength="3000" rows="6" required placeholder="กรอกข้อความ..." class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-red-500 resize-none"></textarea>
        </div>
        <div class="text-[11px] text-zinc-500 leading-relaxed">
          ⚠️ ระบบจะบันทึก IP ของคุณไว้เพื่อตรวจสอบในกรณีรายงานปัญหา / สงสัยพฤติกรรมไม่เหมาะสม
        </div>
        <div id="sendAdmMsg" class="text-xs"></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" id="sendAdmCancel" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm rounded">ยกเลิก</button>
          <button type="submit" id="sendAdmSubmit" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded">📤 ส่ง</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  document.getElementById('sendAdmClose').onclick = close;
  document.getElementById('sendAdmCancel').onclick = close;
  const bodyEl = document.getElementById('sendAdmBody');
  const countEl = document.getElementById('sendAdmCount');
  bodyEl.oninput = () => { countEl.textContent = `${bodyEl.value.length}/3000`; };
  document.getElementById('sendAdmForm').onsubmit = async e => {
    e.preventDefault();
    const subject = document.getElementById('sendAdmSubject').value.trim();
    const body = bodyEl.value.trim();
    const msgEl = document.getElementById('sendAdmMsg');
    const btn = document.getElementById('sendAdmSubmit');
    if (!subject && !body) { msgEl.innerHTML = '<span class="text-red-400">กรอกหัวข้อหรือเนื้อหาก่อน</span>'; return; }
    btn.disabled = true; btn.textContent = 'กำลังส่ง...';
    try {
      await backendPost('/api/user/send-to-admin', { subject, body });
      msgEl.innerHTML = '<span class="text-emerald-400">✓ ส่งสำเร็จ</span>';
      setTimeout(close, 800);
    } catch (ex) {
      msgEl.innerHTML = `<span class="text-red-400">ส่งไม่สำเร็จ: ${escapeHtml(ex.message)}</span>`;
      btn.disabled = false; btn.textContent = '📤 ส่ง';
    }
  };
}

function pickList(res) {
  if (Array.isArray(res)) return res;
  return res?.items || [];
}

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const qs = name => new URLSearchParams(location.search).get(name);

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function roleBadge(role) {
  const map = {
    admin: { label: 'ADMIN', cls: 'bg-red-600 text-white' },
    vip:   { label: 'VIP',   cls: 'bg-amber-500 text-black' },
    user:  { label: 'USER',  cls: 'bg-zinc-700 text-zinc-200' },
  };
  const m = map[role] || map.user;
  return `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${m.cls}">${m.label}</span>`;
}

// ---------- UI primitives ----------
function renderHeader(active) {
  const links = [
    { href: '/',          label: 'หน้าแรก',  key: 'home' },
    { href: '/vip',       label: 'VIP',      key: 'vip' },
    { href: '/recommend', label: 'แนะนำ',     key: 'recommend' },
    { href: '/category',  label: 'หมวดหมู่', key: 'category' },
    { href: '/search',    label: 'ค้นหา',    key: 'search' },
  ];
  const u = auth.user;
  const initial = u ? (u.username[0] || '?').toUpperCase() : '?';
  const vipDate = (u?.role === 'vip' && u?.vipExpires) ? new Date(u.vipExpires).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';

  const userButton = u ? `
    <button id="userBtn" class="flex items-center gap-2 pl-1 pr-2 sm:pr-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-full transition-colors">
      <span class="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center font-bold text-xs text-white">${escapeHtml(initial)}</span>
      <span class="hidden sm:inline text-sm font-medium max-w-[120px] truncate">${escapeHtml(u.username)}</span>
      ${roleBadge(u.role)}
      <svg class="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
    </button>
    <div id="userMenu" class="hidden absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
      <div class="p-4 border-b border-zinc-800">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center font-bold text-white">${escapeHtml(initial)}</span>
          <div class="flex-1 min-w-0">
            <div class="font-bold truncate">${escapeHtml(u.username)}</div>
            <div class="text-xs text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap">${roleBadge(u.role)} ${vipDate ? `<span class="text-amber-300">หมด ${vipDate}</span>` : ''}</div>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded p-2">
          <span class="text-xs text-zinc-400">เหรียญ MKW</span>
          <span class="font-bold text-amber-400">🪙 ${(u.coins || 0).toLocaleString()}</span>
        </div>
      </div>
      <div class="py-2 text-sm">
        <a href="/profile" class="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800"><span>👤</span><span>โปรไฟล์ / รหัสผ่าน</span></a>
        <a href="/history" class="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800"><span>🕐</span><span>ประวัติการดู</span></a>
        <a href="/topup" class="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800"><span>💰</span><span>แลกพ้อย / เติมเงิน / VIP</span></a>
        ${u.role === 'admin' ? `<a href="/admin" class="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 text-red-300"><span>⚙</span><span>Admin Dashboard</span></a>` : ''}
      </div>
      <div class="border-t border-zinc-800 py-2">
        <button onclick="auth.logout()" class="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 text-zinc-400 text-sm"><span>🚪</span><span>ออกจากระบบ</span></button>
      </div>
    </div>` : `
    <a href="/login" class="text-sm px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold whitespace-nowrap">เข้าสู่ระบบ</a>
  `;

  return `
    <header class="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-900">
      <div class="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
        <a href="/" class="flex items-center gap-2 shrink-0">
          <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center font-black text-white text-base shadow-lg">M</div>
          <div class="hidden sm:block">
            <h1 class="font-black text-sm leading-tight tracking-tight">${BRAND}</h1>
            <p class="text-[10px] text-zinc-500 -mt-0.5">ดูซีรีส์สั้น</p>
          </div>
        </a>
        <nav class="hidden md:flex items-center gap-4 text-sm text-zinc-400 ml-3">
          ${links.map(l => `<a href="${l.href}" class="nav-link ${active === l.key ? 'active' : ''}">${escapeHtml(l.label)}</a>`).join('')}
        </nav>
        <div class="flex-1"></div>
        ${u ? `<a href="/topup" class="hidden sm:inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-zinc-900 border border-amber-500/30 hover:border-amber-500 rounded-lg text-amber-300 font-bold whitespace-nowrap shrink-0" title="พ้อยสะสม (คลิกเพื่อแลกเป็น MKW)">⭐<span id="headerPoints">${(u.points || 0).toLocaleString()}</span></a>` : ''}
        <a href="/topup" class="text-xs px-2.5 sm:px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold whitespace-nowrap shrink-0">💰<span class="hidden sm:inline ml-1">แลกพ้อย/เติมเงิน</span></a>
        ${u ? `
        <button id="inboxBtn" class="relative shrink-0 w-9 h-9 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-full transition-colors" aria-label="กล่องจดหมาย" title="กล่องจดหมาย">
          <svg class="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          <span id="inboxBadge" class="${inbox.unread > 0 ? '' : 'hidden'} absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow">${inbox.unread > 99 ? '99+' : (inbox.unread || '')}</span>
        </button>` : ''}
        <div class="relative shrink-0">${userButton}</div>
        <button id="burgerBtn" class="md:hidden p-1.5 text-zinc-300 shrink-0" aria-label="เมนู">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
      <div id="mobileMenu" class="hidden md:hidden border-t border-zinc-900 bg-black/95">
        <div class="px-3 py-2 flex flex-col gap-1">
          ${links.map(l => `<a href="${l.href}" class="px-3 py-2 rounded text-sm ${active === l.key ? 'bg-red-600 text-white font-bold' : 'text-zinc-300 hover:bg-zinc-800'}">${escapeHtml(l.label)}</a>`).join('')}
        </div>
      </div>
    </header>`;
}

function attachHeaderEvents() {
  // kept for backwards compatibility but global delegation below does the work
}

// Source switcher — inline (วางคู่กับ h2 page title), responsive flex-wrap
function renderSourceSwitcherInline() {
  const cur = getSource();
  const opts = [
    { key: 'all', label: 'ทั้งหมด' },
    ...API_SOURCES.map(s => ({ key: s, label: SOURCE_LABELS[s] || s })),
  ];
  return `
    <div class="source-switcher inline-flex items-center gap-1.5 flex-wrap">
      <span class="text-xs text-zinc-500">แหล่ง:</span>
      ${opts.map(o => `
        <button data-src="${o.key}" class="src-btn px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${cur === o.key ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}">${escapeHtml(o.label)}</button>
      `).join('')}
    </div>`;
}
function attachSourceSwitcherEvents() {
  document.querySelectorAll('.source-switcher .src-btn').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.src;
      if (getSource() === k) return;
      setSource(k);
      location.reload();
    };
  });
}

// Live source-switcher polling — detect admin แก้ API sources แล้ว re-render switcher บนทุกหน้า
// โดยไม่ต้อง reload (30s interval, global singleton)
let _srcSwitcherPollTimer = null;
let _srcSwitcherSig = '';
function _sourcesSignature() {
  return API_SOURCES.map(s => `${s}:${SOURCE_LABELS[s] || ''}:${SOURCE_BADGE_CLS[s] || ''}`).join('|');
}
function startSourceSwitcherPolling() {
  if (_srcSwitcherPollTimer) return;
  _srcSwitcherSig = _sourcesSignature();
  _srcSwitcherPollTimer = setInterval(async () => {
    try {
      await publicConfig.reload();
      const newSig = _sourcesSignature();
      if (newSig === _srcSwitcherSig) return;
      _srcSwitcherSig = newSig;
      // Source ปัจจุบันถูกลบ → reset กลับ 'all'
      const cur = getSource();
      if (cur !== 'all' && !API_SOURCES.includes(cur)) setSource('all');
      document.querySelectorAll('.source-switcher').forEach(el => {
        el.outerHTML = renderSourceSwitcherInline();
      });
      attachSourceSwitcherEvents();
    } catch {}
  }, 30_000);
}

// Global click delegation — one registration for all pages/renders
document.addEventListener('click', e => {
  const um = document.getElementById('userMenu');
  const mm = document.getElementById('mobileMenu');
  if (e.target.closest('#inboxBtn')) {
    e.stopPropagation();
    openInboxModal();
    return;
  }
  if (e.target.closest('#userBtn')) {
    e.stopPropagation();
    um?.classList.toggle('hidden');
    return;
  }
  if (e.target.closest('#burgerBtn')) {
    e.stopPropagation();
    mm?.classList.toggle('hidden');
    return;
  }
  // Click outside → close dropdowns
  if (um && !e.target.closest('#userMenu')) um.classList.add('hidden');
});

function renderFooter() {
  return `
    <footer class="max-w-[1600px] mx-auto px-6 py-10 text-center text-xs text-zinc-600 border-t border-zinc-900 mt-10">
      <div class="flex items-center justify-center gap-4 flex-wrap mb-2">
        <a href="/privacy" class="hover:text-zinc-300 transition-colors">นโยบายความเป็นส่วนตัว</a>
        <span class="text-zinc-700">·</span>
        <a href="/terms" class="hover:text-zinc-300 transition-colors">ข้อกำหนดการใช้งาน</a>
      </div>
      <p>&copy; 2026 KTCMKW</p>
    </footer>`;
}

function errorBanner(err, opts = {}) {
  const ep = err?.endpoint || opts.endpoint || '';
  const status = err?.status ? `HTTP ${err.status}` : 'error';
  const body = err?.body ? `<details class="text-xs mt-2 opacity-70"><summary class="cursor-pointer">response body</summary><pre class="mt-1 bg-black/40 p-2 rounded overflow-auto max-h-40">${escapeHtml(err.body)}</pre></details>` : '';
  return `
    <div class="error-banner rounded-lg p-4 my-4 fade-in">
      <div class="font-bold mb-1">⚠️ ${escapeHtml(opts.title || 'โหลดไม่สำเร็จ')}</div>
      <div class="text-sm">${escapeHtml(err?.message || String(err))}</div>
      ${ep ? `<div class="text-xs mt-1 font-mono opacity-70">endpoint: ${escapeHtml(ep)}</div>` : ''}
      <div class="text-xs mt-1 opacity-70">status: ${escapeHtml(status)}</div>
      ${body}
      ${opts.retryId ? `<button id="${opts.retryId}" class="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm">ลองใหม่</button>` : ''}
    </div>`;
}

function skeletonGrid(n = 12) {
  let html = '';
  for (let i = 0; i < n; i++) html += `<div><div class="skeleton card-img rounded-lg mb-2"></div><div class="skeleton h-3 w-3/4 rounded mb-1"></div><div class="skeleton h-3 w-1/2 rounded"></div></div>`;
  return html;
}

// Shared "ภาษาไทย" detector — ใช้ทั้ง badge บนปก + filter chip (กัน drift)
function isThaiDubKeyword(title) {
  const t = String(title || '');
  return /พากย์/.test(t) || t.toLowerCase().includes('thai dub');
}

function dramaCard(d) {
  const rawId = String(d.series_id || d.bookId || '');
  // ซ่อนซีรีส์ที่ admin ตั้ง hidden ไว้ (admin ยังเห็นจาก backend แต่ frontend filter หมดทุก role)
  if (publicConfig.data && publicConfig.hiddenBookSet().has(rawId) && auth.user?.role !== 'admin') return '';
  const id = encodeURIComponent(rawId);
  const src = d.__source || 'dramabox';
  const srcQ = src === 'dramabox' ? '' : `&src=${encodeURIComponent(src)}`;
  const title = d.title || d.bookName || '';
  const cover = d.cover || d.coverWap || '';
  const n = d.episode_count || d.chapterCount || d.totalEpisode || 0;
  const firstGenre = (d.genre || '').split(',')[0].trim();
  const tLower = title.toLowerCase();
  // "พากย์ไทย" (DramaBox: เต็มคำ / Melolo: prefix "(พากย์)") + "thai dub"
  // DramaWave/ShortMax = แพลตฟอร์ม "ซับไทย" — title มี Thai chars = SUBTHAI (ไม่ใช่พากย์)
  const hasThaiChars = /[฀-๿]/.test(title);
  const nativeSubThaiSource = (src === 'dramawave' || src === 'shortmax') && hasThaiChars;
  const isThaiDub = isThaiDubKeyword(title);
  const isSubThai = !isThaiDub && (nativeSubThaiSource || tLower.includes('subthai') || tLower.includes('sub thai') || tLower.includes('ซับไทย'));
  const isNew = _newBookIds[src]?.has(rawId);
  const newBadge = isNew
    ? '<div class="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-black rounded shadow-lg animate-pulse z-10">🆕 NEW</div>'
    : '';
  const langTop = isNew ? 'top-9' : 'top-2';
  const langBadge = isThaiDub
    ? `<div class="absolute ${langTop} left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded shadow">พากย์ไทย</div>`
    : isSubThai
      ? `<div class="absolute ${langTop} left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded shadow">SUBTHAI</div>`
      : '';
  const srcBadge = `<div class="absolute top-2 right-2 px-2 py-0.5 ${SOURCE_BADGE_CLS[src] || 'bg-zinc-700'} text-white text-[10px] font-bold rounded shadow">${escapeHtml(SOURCE_LABELS[src] || src.toUpperCase())}</div>`;
  const hideCount = src === 'netshort' && !n;
  const metaLine = hideCount
    ? (firstGenre ? `<div class="text-[11px] mt-0.5 glow-text text-zinc-300">${escapeHtml(firstGenre)}</div>` : '')
    : `<div class="text-[11px] mt-0.5 glow-text"><span class="text-amber-300 font-bold">🎬 ${n}</span><span class="text-zinc-300"> ตอน${firstGenre ? ' • ' + escapeHtml(firstGenre) : ''}</span></div>`;
  return `
    <a href="/detail?bookId=${id}${n ? `&n=${n}` : ''}${srcQ}" class="card cursor-pointer block">
      <div class="relative card-img rounded-lg overflow-hidden bg-zinc-900">
        <img src="${escapeHtml(cover)}" alt="" loading="lazy" class="w-full h-full object-cover" onerror="this.style.opacity=0"/>
        <div class="absolute inset-0 gradient-fade"></div>
        ${newBadge}
        ${langBadge}
        ${srcBadge}
        <div class="absolute bottom-2 left-2 right-2">
          <div class="text-white font-bold text-sm leading-tight glow-text line-clamp-2">${escapeHtml(title)}</div>
          ${metaLine}
        </div>
      </div>
    </a>`;
}

function renderGrid(container, list) {
  if (!list || !list.length) {
    container.innerHTML = `<div class="text-center py-20 text-zinc-500 col-span-full"><div class="text-5xl mb-3">🎭</div><p>ไม่มีรายการ</p></div>`;
    return;
  }
  container.innerHTML = list.map(dramaCard).join('');
}

// Pagination "1 2 3 ... last" smart truncation
function renderPagination(current, totalPages, basePath, sep) {
  if (totalPages <= 1) return '';
  const s = sep || '?';
  const pages = [];
  const add = p => pages.push(p);
  const range = (a, b) => { for (let i = a; i <= b; i++) add(i); };

  if (totalPages <= 9) {
    range(1, totalPages);
  } else {
    add(1);
    if (current > 4) add('...');
    const a = Math.max(2, current - 2);
    const b = Math.min(totalPages - 1, current + 2);
    range(a, b);
    if (current < totalPages - 3) add('...');
    add(totalPages);
  }

  const link = (p, label, cls) => {
    if (p === '...') return `<span class="px-2 text-zinc-600">…</span>`;
    const active = p === current;
    return `<a href="${basePath}${s}page=${p}" class="px-3 py-1.5 rounded text-sm font-medium ${active ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}">${label || p}</a>`;
  };

  let html = '<div class="flex items-center justify-center gap-1 flex-wrap mt-8">';
  if (current > 1) html += link(current - 1, '←');
  pages.forEach(p => html += link(p));
  if (current < totalPages) html += link(current + 1, '→');
  html += `<span class="ml-3 text-xs text-zinc-500">หน้า ${current} / ${totalPages}</span>`;
  html += '</div>';
  return html;
}

async function mountPage(headerKey, mainHtml, mainClass) {
  await auth.refresh();
  await publicConfig.load();
  if (maintenanceGate()) return null;  // maintenance mode → replace body + หยุด
  document.body.insertAdjacentHTML('afterbegin', renderHeader(headerKey));
  renderAnnouncementBanner();
  const main = document.createElement('main');
  main.className = mainClass || 'max-w-[1600px] mx-auto px-4 sm:px-6 py-6 sm:py-8';
  main.innerHTML = mainHtml;
  document.body.appendChild(main);
  document.body.insertAdjacentHTML('beforeend', renderFooter());
  attachHeaderEvents();
  attachSourceSwitcherEvents();
  startHeartbeat();
  startSourceSwitcherPolling();
  return main;
}

// ============================================================
// Browse pages
// ============================================================

async function initBrowsePage(opts) {
  const showSwitcher = opts.showSwitcher !== false;
  const filterBarHtml = opts.filterBar ? `
    <div class="flex gap-2 flex-wrap mb-4">
      ${opts.filterBar.items.map(f => `
        <a href="${opts.filterBar.basePath}?filter=${f.key}" class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${f.key === opts.filterBar.active ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}">${escapeHtml(f.label)}</a>
      `).join('')}
    </div>` : '';
  await mountPage(opts.active, `
    <div class="flex items-center gap-3 flex-wrap mb-1">
      <h2 class="text-2xl sm:text-3xl font-black tracking-tight">${escapeHtml(opts.title)}</h2>
      ${showSwitcher ? renderSourceSwitcherInline() : ''}
    </div>
    <p class="text-sm text-zinc-500 mb-4">${escapeHtml(opts.subtitle || '')}</p>
    ${filterBarHtml}
    <div id="msg"></div>
    <div id="grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"></div>
    <div id="pagination"></div>
  `);
  attachSourceSwitcherEvents();
  const grid = $('#grid');
  grid.innerHTML = skeletonGrid();
  try {
    const res = await apiGetList(opts.endpoint);
    const list = pickList(res);
    await ingestAndMarkNew(res);
    renderGrid(grid, list);
    const total = res?.total ? ` จากทั้งหมด ${res.total.toLocaleString()}` : '';
    let bucketsNote = '';
    if (res?._multi && res._buckets) {
      const parts = res._buckets.map(b => {
        if (b.skipped) return `<span class="text-zinc-600">${SOURCE_LABELS[b.source] || b.source}: —</span>`;
        if (b.err)     return `<span class="text-red-400">${SOURCE_LABELS[b.source] || b.source}: ✕</span>`;
        return `<span>${SOURCE_LABELS[b.source] || b.source}: ${b.count}</span>`;
      });
      bucketsNote = ` • ${parts.join(' / ')}`;
    }
    $('#msg').innerHTML = `<div class="text-sm text-zinc-500 mb-3">${list.length} เรื่อง${total}${bucketsNote}</div>`;
    if (opts.pagination) {
      // 'all' mode: ใช้ max total ของ buckets เป็นฐาน (DramaBox มักใหญ่กว่า → user navigate ผ่าน page เดียวได้)
      const basis = res._multi
        ? Math.max(0, ...(res._buckets || []).map(b => b.total || 0))
        : (res.total || 0);
      const totalPages = Math.ceil(basis / opts.pagination.size);
      if (totalPages > 1) {
        $('#pagination').innerHTML = renderPagination(opts.pagination.page, totalPages, opts.pagination.basePath, opts.pagination.basePathSep);
      }
    }
  } catch (e) {
    grid.innerHTML = '';
    $('#msg').innerHTML = errorBanner(e, { title: `โหลด ${opts.title} ไม่สำเร็จ`, retryId: 'retryBtn' });
    const btn = $('#retryBtn'); if (btn) btn.onclick = () => location.reload();
  }
}

async function initHomePage() {
  const page = Math.max(1, parseInt(qs('page') || '1', 10));
  const filter = qs('filter') || 'all';
  const size = 50;
  // Per-source endpoint mapping — ใช้ template จาก SOURCE_REG (admin แก้ได้หลังบ้าน)
  const listPath = (s, p) => pathFor(s, 'list', { page: p, page_size: size });
  const searchPath = (s, kw, p) => pathFor(s, 'search', { keyword: kw, page: p, page_size: size });
  const dThaiKeyword = 'พากย์';
  const dChineseKeyword = 'จีน';
  const dKoreanKeyword = 'เกาหลี';
  const dJapaneseKeyword = 'ญี่ปุ่น';
  const thaiTitleFilter = it => {
    const t = it.title || it.bookName || '';
    if (isThaiDubKeyword(t)) return true;
    // native Thai-title sources: title เป็นไทย → include ใน filter (แม้ไม่มี "พากย์" คีย์เวิร์ด)
    if (['dramawave', 'shortmax', 'netshort'].includes(it.__source) && /[฀-๿]/.test(t)) return true;
    return false;
  };
  const chineseTitleFilter = it => /จีน|chinese|中国|中文/i.test(it.title || it.bookName || '');
  const koreanTitleFilter = it => /เกาหลี|korean|한국/i.test(it.title || it.bookName || '');
  const japaneseTitleFilter = it => /ญี่ปุ่น|japanese|日本/i.test(it.title || it.bookName || '');
  const filters = [
    { key: 'all',    label: 'ทั้งหมด',
      spec: p => Object.fromEntries(API_SOURCES.map(s => [s, listPath(s, p)])) },
    { key: 'thai',   label: '🇹🇭 พากย์ไทย',
      spec: p => {
        const out = Object.fromEntries(API_SOURCES.map(s => [s, listPath(s, p)]));
        if (API_SOURCES.includes('dramabox')) out.dramabox = searchPath('dramabox', dThaiKeyword, p);
        const filter = {};
        for (const s of API_SOURCES) if (s !== 'dramabox') filter[s] = thaiTitleFilter;
        return { ...out, filter };
      } },
    { key: 'chinese', label: '🇨🇳 จีน',
      spec: p => {
        const out = Object.fromEntries(API_SOURCES.map(s => [s, listPath(s, p)]));
        if (API_SOURCES.includes('dramabox')) out.dramabox = searchPath('dramabox', dChineseKeyword, p);
        const filter = {};
        for (const s of API_SOURCES) if (s !== 'dramabox') filter[s] = chineseTitleFilter;
        return { ...out, filter };
      } },
    { key: 'korean', label: '🇰🇷 เกาหลี',
      spec: p => {
        const out = Object.fromEntries(API_SOURCES.map(s => [s, listPath(s, p)]));
        if (API_SOURCES.includes('dramabox')) out.dramabox = searchPath('dramabox', dKoreanKeyword, p);
        const filter = {};
        for (const s of API_SOURCES) if (s !== 'dramabox') filter[s] = koreanTitleFilter;
        return { ...out, filter };
      } },
    { key: 'japanese', label: '🇯🇵 ญี่ปุ่น',
      spec: p => {
        const out = Object.fromEntries(API_SOURCES.map(s => [s, listPath(s, p)]));
        if (API_SOURCES.includes('dramabox')) out.dramabox = searchPath('dramabox', dJapaneseKeyword, p);
        const filter = {};
        for (const s of API_SOURCES) if (s !== 'dramabox') filter[s] = japaneseTitleFilter;
        return { ...out, filter };
      } },
    { key: 'anime',  label: '🎌 การ์ตูน',
      spec: p => Object.fromEntries(API_SOURCES.map(s => [s, s === 'dramabox' ? pathFor('dramabox', 'genre', { genre_id: 3744, page: p, page_size: size }) : null])) },
    { key: 'vip',    label: '💎 VIP',
      spec: p => Object.fromEntries(API_SOURCES.map(s => [s, s === 'dramabox' ? pathFor('dramabox', 'genre', { genre_id: 1265, page: p, page_size: size }) : null])) },
  ];
  const active = filters.find(f => f.key === filter) || filters[0];

  await initBrowsePage({
    active: 'home', title: 'หน้าแรก', subtitle: `ซีรีส์ ${active.label} • หน้าละ ${size} เรื่อง (เรียงใหม่→เก่า)`,
    endpoint: active.spec(page),
    pagination: { page, size, basePath: `/?filter=${active.key}`, basePathSep: '&' },
    filterBar: { items: filters, active: active.key, basePath: '/' },
  });

  // Mobile search box — โผล่เฉพาะมือถือ (desktop ใช้ nav "ค้นหา" ใน header)
  const main = document.querySelector('main');
  const subtitleEl = main?.querySelector('p.text-sm.text-zinc-500');
  if (subtitleEl && !document.getElementById('homeMobileSearch')) {
    subtitleEl.insertAdjacentHTML('afterend', `
      <form id="homeMobileSearch" class="md:hidden flex gap-2 mb-4" role="search">
        <input id="homeSearchInput" type="search" placeholder="🔍 ค้นหาซีรีส์..." class="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white placeholder-zinc-500 text-sm"/>
        <button class="px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold">ค้นหา</button>
      </form>
    `);
    document.getElementById('homeMobileSearch').onsubmit = e => {
      e.preventDefault();
      const q = document.getElementById('homeSearchInput').value.trim();
      if (q) location.href = `/search?q=${encodeURIComponent(q)}`;
    };
  }

  await publicConfig.load();
  maybeShowPromoPopup();
}
function initVipPage() {
  const spec = Object.fromEntries(API_SOURCES.map(s => [s, pathFor(s, 'search', { keyword: 'Billionaire', page: 1, page_size: PAGE_SIZE })]));
  return initBrowsePage({ active: 'vip', title: 'VIP / ท่านประธาน', subtitle: 'ซีรีส์แนว Billionaire / CEO',
    endpoint: spec });
}
function initRecommendPage() {
  const spec = Object.fromEntries(API_SOURCES.map(s => [s, pathFor(s, 'search', { keyword: 'Romance', page: 1, page_size: PAGE_SIZE })]));
  return initBrowsePage({ active: 'recommend', title: 'แนะนำสำหรับคุณ', subtitle: 'ซีรีส์โรแมนซ์ยอดนิยม',
    endpoint: spec });
}

// ============================================================
// Search page
// ============================================================

async function initSearchPage() {
  const initialQ = qs('q') || '';
  await mountPage('search', `
    <div class="flex items-center gap-3 flex-wrap mb-1">
      <h2 class="text-2xl sm:text-3xl font-black tracking-tight">ค้นหาซีรีส์</h2>
      ${renderSourceSwitcherInline()}
    </div>
    <p class="text-sm text-zinc-500 mb-5">พิมพ์ชื่อ, แนว หรือคำค้นหา (รองรับ TH / EN)</p>
    <form id="searchForm" class="flex gap-2 mb-6">
      <input id="searchInput" type="text" value="${escapeHtml(initialQ)}" placeholder="เช่น love, ความรัก, ซีอีโอ..." class="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white placeholder-zinc-500"/>
      <button class="px-6 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">ค้นหา</button>
    </form>
    <div id="msg"></div>
    <div id="grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"></div>
  `);
  attachSourceSwitcherEvents();
  $('#searchForm').onsubmit = e => { e.preventDefault(); doSearch($('#searchInput').value.trim()); };
  if (initialQ) doSearch(initialQ);
}

async function doSearch(q) {
  const grid = $('#grid');
  const msg = $('#msg');
  if (!q) { grid.innerHTML = ''; msg.innerHTML = ''; return; }
  history.replaceState(null, '', `/search?q=${encodeURIComponent(q)}`);
  grid.innerHTML = skeletonGrid(8);
  msg.innerHTML = '';
  try {
    // DramaBox: /search?keyword=Q (รองรับ Thai)
    // Melolo: /search ไม่รับ Thai → ใช้ /list + client filter ที่ title.includes(Q)
    // ShortMax / DramaWave: ใช้ /search?keyword= ตาม spec — ถ้าไม่รับ Thai ก็จะคืน 0 รายการ (ไม่เป็นไร, source อื่นยังตอบ)
    const qLower = q.toLowerCase();
    const spec = {};
    const filter = {};
    for (const s of API_SOURCES) {
      const reg = SOURCE_REG[s];
      const adapter = reg?.adapter || s;
      // Melolo /search ไม่รับ Thai → fallback /list + client filter (adapter-based ไม่ hardcode key)
      if (adapter === 'melolo') {
        spec[s] = pathFor(s, 'list', { page: 1, page_size: PAGE_SIZE });
        filter[s] = it => String(it.title || it.bookName || '').toLowerCase().includes(qLower);
      } else {
        spec[s] = pathFor(s, 'search', { keyword: q, page: 1, page_size: PAGE_SIZE });
      }
    }
    const res = await apiGetList({ ...spec, filter });
    const list = pickList(res);
    const total = res?.total ? ` จากทั้งหมด ${res.total.toLocaleString()}` : '';
    let bucketsNote = '';
    if (res?._multi && res._buckets) {
      const parts = res._buckets.map(b => {
        if (b.skipped) return `<span class="text-zinc-600">${SOURCE_LABELS[b.source] || b.source}: —</span>`;
        if (b.err)     return `<span class="text-red-400">${SOURCE_LABELS[b.source] || b.source}: ✕</span>`;
        return `<span>${SOURCE_LABELS[b.source] || b.source}: ${b.count}</span>`;
      });
      bucketsNote = ` • ${parts.join(' / ')}`;
    }
    msg.innerHTML = `<div class="text-sm text-zinc-500 mb-3">พบ ${list.length} เรื่อง${total}${bucketsNote} สำหรับ "${escapeHtml(q)}"</div>`;
    renderGrid(grid, list);
  } catch (e) {
    grid.innerHTML = '';
    msg.innerHTML = errorBanner(e, { title: `ค้นหา "${q}" ไม่สำเร็จ`, retryId: 'retryBtn' });
    const btn = $('#retryBtn'); if (btn) btn.onclick = () => doSearch(q);
  }
}

// ============================================================
// Category page
// ============================================================

async function initCategoryPage() {
  await mountPage('category', `
    <div class="flex items-center gap-3 flex-wrap mb-1">
      <h2 class="text-2xl sm:text-3xl font-black tracking-tight">หมวดหมู่</h2>
      ${renderSourceSwitcherInline()}
    </div>
    <p class="text-sm text-zinc-500 mb-5">เลือกแนวที่ชอบ</p>
    <div id="catBar" class="space-y-3 pb-2 mb-5"></div>
    <div id="msg"></div>
    <div id="grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"></div>
  `);
  attachSourceSwitcherEvents();
  const bar = $('#catBar');
  bar.innerHTML = '<div class="flex gap-2 flex-wrap"><div class="skeleton h-8 w-20 rounded-full"></div></div>'.repeat(2);

  // โหลด genres ตาม source ปัจจุบัน — 'all' = ทั้งสอง group, อื่น = group เดียว
  const src = getSource();
  const sourcesToLoad = src === 'all' ? API_SOURCES.slice() : [src];
  const groups = [];  // { source, cats[] | err }
  const results = await Promise.allSettled(sourcesToLoad.map(s => apiGet(pathFor(s, 'genres'), s)));
  results.forEach((r, i) => {
    const source = sourcesToLoad[i];
    if (r.status === 'fulfilled') {
      const cats = (Array.isArray(r.value) ? r.value : []).map(c => ({ ...c, __source: source }));
      cats.sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));
      groups.push({ source, cats });
    } else {
      groups.push({ source, cats: [], err: r.reason });
    }
  });
  const allCats = groups.flatMap(g => g.cats);
  if (!allCats.length) {
    bar.innerHTML = '';
    $('#msg').innerHTML = errorBanner(groups[0]?.err || new Error('no genres'), { title: 'โหลดหมวดหมู่ไม่สำเร็จ', retryId: 'retryBtn' });
    const btn = $('#retryBtn'); if (btn) btn.onclick = () => location.reload();
    return;
  }

  const initialId = qs('id');
  const initialSrc = qs('src') || (initialId ? null : groups[0].source);
  let activeCat = initialId
    ? allCats.find(c => String(c.id) === String(initialId) && (!initialSrc || c.__source === initialSrc))
      || allCats.find(c => String(c.id) === String(initialId))
    : groups[0].cats[0];

  bar.innerHTML = groups.map(g => {
    if (!g.cats.length) {
      return `<div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs px-2 py-0.5 rounded ${SOURCE_BADGE_CLS[g.source]} text-white font-bold">${escapeHtml(SOURCE_LABELS[g.source] || g.source)}</span>
        <span class="text-xs text-red-400">โหลดไม่สำเร็จ${g.err?.message ? ': ' + escapeHtml(g.err.message) : ''}</span>
      </div>`;
    }
    return `
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs px-2 py-0.5 rounded ${SOURCE_BADGE_CLS[g.source]} text-white font-bold">${escapeHtml(SOURCE_LABELS[g.source] || g.source)}</span>
          <span class="text-xs text-zinc-500">${g.cats.length} หมวด</span>
        </div>
        <div class="flex gap-2 flex-wrap">
          ${g.cats.map(c => {
            const isActive = activeCat && String(c.id) === String(activeCat.id) && c.__source === activeCat.__source;
            return `<button data-id="${escapeHtml(String(c.id))}" data-src="${escapeHtml(c.__source)}" class="chip cat-btn px-3 py-1.5 text-sm rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-medium ${isActive ? 'active' : ''}">${escapeHtml(c.name)}</button>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  $$('.cat-btn').forEach(b => b.onclick = () => {
    const cat = allCats.find(c => String(c.id) === b.dataset.id && c.__source === b.dataset.src);
    if (cat) loadCategory(cat, allCats);
  });
  if (activeCat) loadCategory(activeCat, allCats);
}

async function loadCategory(cat, allCats) {
  const id = cat.id;
  const source = cat.__source;
  history.replaceState(null, '', `/category?id=${encodeURIComponent(id)}&src=${encodeURIComponent(source)}`);
  $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.id === String(id) && b.dataset.src === source));
  const grid = $('#grid');
  const msg = $('#msg');
  grid.innerHTML = skeletonGrid();
  msg.innerHTML = '';
  try {
    const res = await apiGet(pathFor(source, 'genre', { genre_id: id, page: 1, page_size: PAGE_SIZE }), source);
    const list = pickList(tagSource(res, source));
    const total = res?.total ? ` (ทั้งหมด ${res.total.toLocaleString()})` : '';
    msg.innerHTML = `<div class="text-sm text-zinc-500 mb-3"><span class="text-xs px-2 py-0.5 rounded ${SOURCE_BADGE_CLS[source]} text-white font-bold mr-2">${escapeHtml(SOURCE_LABELS[source] || source)}</span><strong class="text-zinc-200">${escapeHtml(cat.name || '')}</strong> • ${list.length} เรื่อง${total}</div>`;
    renderGrid(grid, list);
  } catch (e) {
    grid.innerHTML = '';
    msg.innerHTML = errorBanner(e, { title: 'โหลดหมวด ' + id + ' ไม่สำเร็จ', retryId: 'retryBtn' });
    const btn = $('#retryBtn'); if (btn) btn.onclick = () => loadCategory(cat, allCats);
  }
}

// ============================================================
// Detail page
// ============================================================

async function initDetailPage() {
  await auth.refresh();
  await publicConfig.load();
  if (maintenanceGate()) return;
  document.body.insertAdjacentHTML('afterbegin', renderHeader(''));
  renderAnnouncementBanner();
  startHeartbeat();
  const main = document.createElement('main');
  main.className = 'max-w-[1200px] mx-auto px-6 py-8';
  main.innerHTML = `<div id="content"></div>`;
  document.body.appendChild(main);
  document.body.insertAdjacentHTML('beforeend', renderFooter());

  const bookId = qs('bookId');
  const source = qs('src') || 'dramabox';
  if (!bookId) {
    $('#content').innerHTML = errorBanner({ message: 'URL ต้องมี ?bookId=xxx' }, { title: 'พารามิเตอร์ไม่ครบ' });
    return;
  }

  // Hidden book — admin ยังดูได้, user ทั่วไปเจอ message
  if (publicConfig.hiddenBookSet().has(bookId) && auth.user?.role !== 'admin') {
    $('#content').innerHTML = `
      <div class="text-center py-20">
        <div class="text-6xl mb-4">🚫</div>
        <div class="font-bold text-zinc-200 text-xl mb-2">ซีรีส์นี้ไม่พร้อมให้บริการ</div>
        <div class="text-sm text-zinc-500 mb-6">เรื่องนี้ถูกซ่อนชั่วคราว</div>
        <a href="/" class="inline-block px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">กลับหน้าแรก</a>
      </div>`;
    return;
  }

  $('#content').innerHTML = `
    <div class="skeleton w-full aspect-[16/9] rounded-2xl mb-6"></div>
    <div class="skeleton h-8 w-2/3 rounded mb-3"></div>
    <div class="skeleton h-4 w-1/2 rounded mb-2"></div>`;

  const { detail, episodes, detailErr, epsErr } = await fetchDetailAndEpisodes(bookId, source);

  const fallbackN = parseInt(qs('n') || '0', 10);
  const d = detail || { bookId, bookName: '(ไม่ทราบชื่อ)', chapterCount: 0 };
  if (!d.chapterCount) d.chapterCount = episodes.length || fallbackN;

  const cover = d.coverWap || d.cover || '';
  const tags = d.tagV3s?.length
    ? d.tagV3s.map(t => `<span class="label-pill" title="${escapeHtml(t.tagEnName || '')}">${escapeHtml(t.tagName)}</span>`).join('')
    : (d.tags || []).map(t => `<span class="label-pill">${escapeHtml(t)}</span>`).join('');
  const count = d.chapterCount || 0;

  // ซ่อน 💰 สำหรับ admin/vip หรือเมื่อเปิดโปรโมชั่นดูฟรีทั้งเว็บ
  const hidePaywallIcon = publicConfig.isFreeMode() || (auth.user && (auth.user.role === 'admin' || auth.user.role === 'vip'));
  const srcQ = source === 'dramabox' ? '' : `&src=${encodeURIComponent(source)}`;
  let chaptersHtml = '';
  if (count > 0) {
    let buttons = '';
    for (let i = 1; i <= count; i++) {
      const ep = episodes.find(e => e.chapterIndex === i);
      const icon = epLockIcon(i, ep?.isCharge, auth.user);
      const iconHtml = icon === '🔒'
        ? '<span class="absolute top-0.5 right-1 text-[10px]">🔒</span>'
        : (icon === '💰' && !hidePaywallIcon ? '<span class="absolute top-0.5 right-1 text-[9px]">💰</span>' : '');
      const dimCls = icon === '🔒' ? 'opacity-60' : '';
      buttons += `<a href="/play?bookId=${encodeURIComponent(bookId)}&index=${i}&n=${count}${srcQ}" class="relative px-3 py-2 bg-zinc-800 hover:bg-red-600 hover:text-white rounded text-sm text-center transition-colors ${dimCls}">EP ${i}${iconHtml}</a>`;
    }
    chaptersHtml = `<div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">${buttons}</div>`;
  } else {
    chaptersHtml = `<div class="warn-banner rounded-lg p-3 text-sm">⚠️ ไม่ทราบจำนวนตอน</div>`;
  }

  // ตรวจ history → resume button
  let resumeHtml = '';
  if (auth.user) {
    try {
      const h = await backendGet(`/api/history/latest?bookId=${encodeURIComponent(bookId)}`);
      if (h.entry?.index) {
        resumeHtml = `<a href="/play?bookId=${encodeURIComponent(bookId)}&index=${h.entry.index}${count ? `&n=${count}` : ''}${srcQ}" class="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black py-2.5 rounded-lg font-bold text-center">▶ ดูต่อ EP ${h.entry.index}</a>`;
      }
    } catch {}
  }

  $('#content').innerHTML = `
    ${detailErr ? errorBanner(detailErr, { title: 'detail ตอบ error' }) : ''}
    ${epsErr ? errorBanner(epsErr, { title: 'episodes ตอบ error' }) : ''}
    <div class="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 slide-up">
      <div class="relative">
        <div class="aspect-[16/9] bg-zinc-950 overflow-hidden">
          <img src="${escapeHtml(cover)}" class="w-full h-full object-cover blur-xl opacity-40 scale-110" onerror="this.style.display='none'"/>
        </div>
        <div class="absolute -bottom-16 left-6 w-28 sm:w-36 aspect-[3/5] rounded-lg overflow-hidden shadow-2xl border-2 border-zinc-900">
          <img src="${escapeHtml(cover)}" class="w-full h-full object-cover" onerror="this.style.opacity=0.3"/>
        </div>
        ${d.corner?.name ? `<div class="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold text-white" style="background:${escapeHtml(d.corner.color || '#ef4444')}">${escapeHtml(d.corner.name)}</div>` : ''}
      </div>
      <div class="pt-20 sm:pt-24 px-6 pb-6">
        <h2 class="text-2xl font-black mb-1">${escapeHtml(d.bookName || '')}</h2>
        <div class="flex flex-wrap items-center gap-3 text-sm mb-4">
          <span class="text-zinc-400">${count} ตอน</span>
          ${d.playCount ? `<span class="text-zinc-400">👥 ${escapeHtml(d.playCount)}</span>` : ''}
          ${d.shelfTime ? `<span class="text-zinc-500 text-xs">📅 ${escapeHtml(d.shelfTime)}</span>` : ''}
        </div>
        ${tags ? `<div class="flex flex-wrap gap-1.5 mb-5">${tags}</div>` : ''}
        <p class="text-zinc-300 text-sm leading-relaxed mb-5 whitespace-pre-line">${escapeHtml(d.introduction || 'ไม่มีเรื่องย่อ')}</p>
        ${auth.user?.role === 'admin' ? `
        <div class="grid grid-cols-2 gap-3 mb-5 text-xs">
          <div class="bg-zinc-800/50 rounded p-3">
            <div class="text-zinc-500">Book ID <span class="text-red-400">(admin)</span></div>
            <div class="font-mono text-zinc-200 break-all">${escapeHtml(bookId)}</div>
            <div class="text-[10px] text-zinc-500 mt-1">source: <span class="${SOURCE_BADGE_CLS[source]} text-white px-1.5 py-0.5 rounded font-bold">${escapeHtml(SOURCE_LABELS[source] || source)}</span></div>
          </div>
          <div class="bg-zinc-800/50 rounded p-3">
            <div class="text-zinc-500">ตอนทั้งหมด</div>
            <div class="text-zinc-200">${count} ตอน</div>
          </div>
        </div>` : ''}
        <div class="flex gap-2 mb-6">
          ${resumeHtml}
          <a href="/play?bookId=${encodeURIComponent(bookId)}&index=1${count > 0 ? `&n=${count}` : ''}${srcQ}" class="flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white py-2.5 rounded-lg font-semibold text-center">▶ เล่น EP1</a>
          ${auth.user?.role === 'admin' ? `<button id="copyIdBtn" class="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">📋 คัดลอก ID</button>` : ''}
        </div>
        <h3 class="font-bold text-lg mb-3">เลือกตอน</h3>
        ${chaptersHtml}
      </div>
    </div>`;

  const copyBtn = $('#copyIdBtn');
  if (copyBtn) copyBtn.onclick = () => {
    navigator.clipboard.writeText(bookId).then(() => {
      copyBtn.textContent = '✓ คัดลอกแล้ว';
      setTimeout(() => copyBtn.textContent = '📋 คัดลอก ID', 1500);
    });
  };
}

// ============================================================
// Player page — with access control
// ============================================================

async function initPlayPage() {
  await auth.refresh();
  await publicConfig.load();
  if (maintenanceGate()) return;
  // Guest ดูได้ถ้า freeMode ON — backend /api/access จะ allow (freeMode override)
  // ถ้าไม่ใช่ freeMode → ยังต้อง login (เช็คตอน access gate หลังเลือก ep)
  document.body.insertAdjacentHTML('afterbegin', renderHeader(''));
  renderAnnouncementBanner();
  startHeartbeat();
  const main = document.createElement('main');
  main.className = 'max-w-[1400px] mx-auto px-6 py-8';
  document.body.appendChild(main);
  document.body.insertAdjacentHTML('beforeend', renderFooter());

  const bookId = qs('bookId');
  const source = qs('src') || 'dramabox';
  const index = parseInt(qs('index') || '1', 10);

  if (!bookId || isNaN(index) || index < 1) {
    main.innerHTML = errorBanner({ message: 'URL ต้องมี ?bookId=xxx&index=1' }, { title: 'พารามิเตอร์ไม่ครบ' });
    return;
  }

  const srcQ = source === 'dramabox' ? '' : `&src=${encodeURIComponent(source)}`;

  main.innerHTML = `
    <a href="/detail?bookId=${encodeURIComponent(bookId)}${srcQ}" class="text-sm text-zinc-400 hover:text-white mb-4 inline-block">← กลับหน้ารายละเอียด</a>
    <div class="video-wrap mb-4 fade-in" id="videoWrap">
      <div class="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
        <div class="text-center">
          <div class="animate-spin w-8 h-8 border-2 border-zinc-700 border-t-red-500 rounded-full mx-auto mb-3"></div>
          กำลังตรวจสิทธิ์...
        </div>
      </div>
    </div>
    <div id="meta" class="mb-4"></div>
    <div id="msg"></div>
    <div class="mt-6">
      <h3 id="navHeader" class="text-sm text-zinc-500 mb-2 hidden">เลือกตอน</h3>
      <div id="navEp" class="flex gap-2 flex-wrap"></div>
    </div>
  `;

  // 1) Fetch detail + episodes (Melolo: 1 fetch / DramaBox: 2 fetches parallel)
  const { detail, episodes, epsErr } = await fetchDetailAndEpisodes(bookId, source);
  const bookName = detail?.bookName || '(ไม่ทราบชื่อ)';
  const isAdmin = auth.user?.role === 'admin';
  const u = auth.user;

  // user status block (มุมขวาของ meta)
  const userStatusHtml = u ? `
    <div class="ml-auto flex items-center gap-2 text-xs flex-wrap">
      ${roleBadge(u.role)}
      ${u.role === 'vip' && u.vipExpires ? `<span class="text-amber-300">หมดอายุ ${new Date(u.vipExpires).toLocaleDateString('th-TH')}</span>` : ''}
      <span class="text-amber-400 font-bold">🪙 ${(u.coins || 0).toLocaleString()} MKW</span>
      <span class="text-zinc-400">@${escapeHtml(u.username)}</span>
    </div>
  ` : `<div class="ml-auto text-xs text-zinc-500">ยังไม่ได้ login • <a href="/login?next=${encodeURIComponent(location.pathname + location.search)}" class="text-red-400 hover:underline">เข้าสู่ระบบ</a></div>`;

  $('#meta').innerHTML = `
    <div class="flex items-center gap-3 flex-wrap">
      <h2 class="text-xl sm:text-2xl font-black">EP ${index} — <span class="text-zinc-300">${escapeHtml(bookName)}</span></h2>
      ${userStatusHtml}
    </div>
    ${isAdmin ? `<div class="text-xs text-zinc-500 font-mono mt-1">bookId: ${escapeHtml(bookId)} <span class="text-red-400">(admin)</span> <span class="ml-2 ${SOURCE_BADGE_CLS[source]} text-white px-1.5 py-0.5 rounded font-bold">${escapeHtml(SOURCE_LABELS[source] || source)}</span></div>` : ''}
  `;

  if (epsErr) {
    showPlayerError('โหลดรายการตอนไม่สำเร็จ', epsErr.message || '');
    return;
  }

  const ep = episodes.find(e => e.chapterIndex === index);
  const total = episodes.length || parseInt(qs('n') || '0', 10);

  // Ep navigation — ซ่อน 💰 จาก vip/admin หรือเมื่อเปิดโปรโมชั่นดูฟรีทั้งเว็บ
  const hidePaywallIcon = publicConfig.isFreeMode() || (u && (u.role === 'admin' || u.role === 'vip'));
  if (total > 1) {
    $('#navHeader').classList.remove('hidden');
    let html = '';
    for (let i = 1; i <= total; i++) {
      const e = episodes.find(x => x.chapterIndex === i);
      const icon = epLockIcon(i, e?.isCharge, u);
      const iconHtml = icon === '🔒'
        ? '<span class="text-[9px] ml-0.5">🔒</span>'
        : (icon === '💰' && !hidePaywallIcon ? '<span class="text-[9px] text-amber-400 ml-0.5">💰</span>' : '');
      const dimCls = icon === '🔒' && i !== index ? 'opacity-60' : '';
      const cls = i === index ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300';
      html += `<a href="/play?bookId=${encodeURIComponent(bookId)}&index=${i}&n=${total}${srcQ}" data-idx="${i}" class="${cls} ${dimCls} px-3 py-1.5 rounded text-sm font-medium">${i}${iconHtml}</a>`;
    }
    $('#navEp').innerHTML = html;
    $$('#navEp a').forEach(a => a.onclick = ev => {
      ev.preventDefault();
      epChangeWithCooldown(parseInt(a.dataset.idx, 10), { bookId, source, total, episodes, detail }, a);
    });
  }

  if (!ep) { showPlayerError(`ไม่พบ EP ${index}`, `มีทั้งหมด ${episodes.length} ตอน`); return; }

  // Popstate (back/forward) → transition in place
  window.addEventListener('popstate', () => {
    const newIdx = parseInt(qs('index') || '1', 10);
    goToEpisode(newIdx, { bookId, source, total, episodes, detail });
  });

  // 2) Access check (server-side) — timeout 10s
  let access;
  try {
    access = await backendGet(`/api/access?bookId=${encodeURIComponent(bookId)}&index=${index}`, { timeoutMs: 10000 });
  } catch (e) {
    showPlayerError('ตรวจสิทธิ์ไม่ได้', e.message);
    return;
  }

  // 3) Combined check — API's isCharge ก็ถือเป็น "ต้องการ coin/VIP"
  //    ถ้า user เป็น admin/vip → บังคับให้ผ่าน (override isCharge ด้วย)
  //    เชื่อ access.allowed จาก backend เป็นหลัก (รวมถึง freeMode/role-limit gating)
  const isFree = access.freeMode || publicConfig.isFreeMode();
  const effectivelyLocked = !isFree && (!access.allowed || (ep.isCharge && !(u && (u.role === 'admin' || u.role === 'vip'))));

  if (access.allowed && !effectivelyLocked) {
    // Log history ก่อนเล่น (ต้อง login)
    if (u) {
      backendPost('/api/history/log', {
        bookId, source, index: ep.chapterIndex,
        bookName: detail?.bookName || '',
        cover: detail?.coverWap || detail?.cover || '',
      }).catch(() => {});
    }
    return playEpisode(ep, { bookId, source, total, episodes, detail });
  }

  // 4) Show gate (login / upgrade / pay)
  return renderAccessGate(bookId, index, ep, access, u, source);
}

// EP click cooldown — กันกดถี่ๆ (5 วิ) นอก fullscreen
// Cover ทั้ง grid #navEp a และปุ่ม #prevEpBtn / #nextEpBtn — sourceBtn คือปุ่มที่ user กด (โชว์ countdown ที่ปุ่มนั้น)
let _epCooldownActive = false;
function epChangeWithCooldown(targetIdx, ctx, sourceBtn) {
  if (_epCooldownActive) return;
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) return goToEpisode(targetIdx, ctx);
  const links = $$('#navEp a');
  const prevBtn = $('#prevEpBtn');
  const nextBtn = $('#nextEpBtn');
  const navTarget = links.find(a => parseInt(a.dataset.idx, 10) === targetIdx);
  const target = sourceBtn || navTarget;
  if (!target) return goToEpisode(targetIdx, ctx);
  _epCooldownActive = true;
  const orig = new Map();
  const all = [...links];
  if (prevBtn) all.push(prevBtn);
  if (nextBtn) all.push(nextBtn);
  all.forEach(el => {
    orig.set(el, { className: el.className, html: el.innerHTML, disabled: el.disabled });
    if (el !== target) {
      el.classList.add('opacity-30', 'pointer-events-none', 'grayscale');
      if ('disabled' in el) el.disabled = true;
    } else if (el.tagName === 'A') {
      el.classList.add('ring-2', 'ring-amber-400');
    } else {
      el.classList.add('ring-2', 'ring-amber-300');
    }
  });
  let s = 5;
  const restore = () => {
    all.forEach(el => {
      const o = orig.get(el);
      if (!o) return;
      el.className = o.className;
      el.innerHTML = o.html;
      if ('disabled' in el) el.disabled = o.disabled;
    });
    _epCooldownActive = false;
  };
  const baseLabel = target.tagName === 'A'
    ? String(targetIdx)
    : (target.id === 'prevEpBtn' ? `◀ EP ${targetIdx}` : `EP ${targetIdx} ▶`);
  const tick = () => {
    target.innerHTML = `${baseLabel} <span class="ml-1 text-amber-300 font-black">${s}s</span>`;
    if (s <= 0) {
      clearInterval(timer);
      restore();
      goToEpisode(targetIdx, ctx);
      return;
    }
    s--;
  };
  tick();
  const timer = setInterval(tick, 1000);
}

// In-place ตอนถัดไป — ไม่โหลดหน้าใหม่ (TikTok-style smooth transition)
async function goToEpisode(newIndex, ctx) {
  const { bookId, source, total, episodes, detail } = ctx;
  // หยุดนับพ้อยทันที — รอ playEpisode ของ ep ใหม่ค่อย attach กลับ
  pointsTicker.detach();
  const src = source || 'dramabox';
  const srcQ = src === 'dramabox' ? '' : `&src=${encodeURIComponent(src)}`;
  const ep = episodes.find(e => e.chapterIndex === newIndex);
  if (!ep) return;

  // Update URL ไม่ reload
  const newUrl = `/play?bookId=${encodeURIComponent(bookId)}&index=${newIndex}&n=${total}${srcQ}`;
  if (location.pathname + location.search !== newUrl) {
    history.pushState({ index: newIndex }, '', newUrl);
  }

  const u = auth.user;
  const isAdmin = u?.role === 'admin';
  const bookName = detail?.bookName || '';
  const userStatusHtml = u ? `
    <div class="ml-auto flex items-center gap-2 text-xs flex-wrap">
      ${roleBadge(u.role)}
      ${u.role === 'vip' && u.vipExpires ? `<span class="text-amber-300">หมดอายุ ${new Date(u.vipExpires).toLocaleDateString('th-TH')}</span>` : ''}
      <span class="text-amber-400 font-bold">🪙 ${(u.coins || 0).toLocaleString()} MKW</span>
      <span class="text-zinc-400">@${escapeHtml(u.username)}</span>
    </div>
  ` : `<div class="ml-auto text-xs text-zinc-500">ยังไม่ได้ login • <a href="/login?next=${encodeURIComponent(location.pathname + location.search)}" class="text-red-400 hover:underline">เข้าสู่ระบบ</a></div>`;

  $('#meta').innerHTML = `
    <div class="flex items-center gap-3 flex-wrap">
      <h2 class="text-xl sm:text-2xl font-black">EP ${newIndex} — <span class="text-zinc-300">${escapeHtml(bookName)}</span></h2>
      ${userStatusHtml}
    </div>
    ${isAdmin ? `<div class="text-xs text-zinc-500 font-mono mt-1">bookId: ${escapeHtml(bookId)} <span class="text-red-400">(admin)</span> <span class="ml-2 ${SOURCE_BADGE_CLS[src]} text-white px-1.5 py-0.5 rounded font-bold">${escapeHtml(SOURCE_LABELS[src] || src)}</span></div>` : ''}
  `;

  // Update nav highlight
  $$('#navEp a').forEach(a => {
    const i = parseInt(a.dataset.idx, 10);
    const cls = i === newIndex ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300';
    a.className = `${cls} px-3 py-1.5 rounded text-sm font-medium`;
  });

  // Access check ตอนใหม่
  let access;
  try {
    access = await backendGet(`/api/access?bookId=${encodeURIComponent(bookId)}&index=${newIndex}`, { timeoutMs: 10000 });
  } catch (e) {
    showPlayerError('ตรวจสิทธิ์ไม่ได้', e.message);
    return;
  }
  const isFree = access.freeMode || publicConfig.isFreeMode();
  const effectivelyLocked = !isFree && (!access.allowed || (ep.isCharge && !(u && (u.role === 'admin' || u.role === 'vip'))));
  if (access.allowed && !effectivelyLocked) {
    if (u) {
      backendPost('/api/history/log', {
        bookId, source: src, index: newIndex,
        bookName, cover: detail?.coverWap || detail?.cover || '',
      }).catch(() => {});
    }
    return playEpisode(ep, ctx);
  }
  return renderAccessGate(bookId, newIndex, ep, access, u, src);
}

function showPlayerError(title, detail) {
  pointsTicker.detach();
  $('#videoWrap').innerHTML = `
    <div class="w-full h-full flex items-center justify-center text-center p-6">
      <div>
        <div class="text-5xl mb-3">⚠️</div>
        <div class="font-bold text-zinc-200 mb-1">${escapeHtml(title)}</div>
        <div class="text-xs text-zinc-500 mt-1">${escapeHtml(detail || '')}</div>
        <button onclick="location.reload()" class="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm">ลองใหม่</button>
      </div>
    </div>`;
}

function renderAccessGate(bookId, index, ep, access, user, source) {
  const reason = access.reason || (ep.isCharge ? 'need_coin' : 'unknown');
  const src = source || 'dramabox';
  const srcQ = src === 'dramabox' ? '' : `&src=${encodeURIComponent(src)}`;

  if (reason === 'hidden') {
    $('#videoWrap').innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-center p-6">
        <div>
          <div class="text-5xl mb-3">🚫</div>
          <div class="font-bold text-zinc-200 mb-2">ซีรีส์นี้ไม่พร้อมให้บริการ</div>
          <div class="text-sm text-zinc-400 mb-4">เรื่องนี้ถูกซ่อนชั่วคราว</div>
          <a href="/" class="inline-block px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">กลับหน้าแรก</a>
        </div>
      </div>`;
    return;
  }

  if (reason === 'maintenance') {
    $('#videoWrap').innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-center p-6">
        <div>
          <div class="text-5xl mb-3">🚧</div>
          <div class="font-bold text-zinc-200 mb-2">ระบบกำลังปรับปรุง</div>
          <div class="text-sm text-zinc-400 mb-4">${escapeHtml(publicConfig.maintenanceMsg() || 'กรุณากลับมาภายหลัง')}</div>
        </div>
      </div>`;
    return;
  }

  if (reason === 'need_login' || !user) {
    const hint = access.freeMode && access.guestLimit
      ? `โหมดดูฟรี: guest ดูได้แค่ ${access.guestLimit} ตอนแรก — สมัคร/login เพื่อดูต่อ`
      : 'ต้อง login ก่อนถึงดูได้';
    $('#videoWrap').innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-center p-6">
        <div>
          <div class="text-5xl mb-3">🔒</div>
          <div class="font-bold text-zinc-200 mb-2">EP ${index} ล็อกไว้</div>
          <div class="text-sm text-zinc-400 mb-4">${hint}</div>
          <a href="/login?next=${encodeURIComponent(location.pathname + location.search)}" class="inline-block px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">เข้าสู่ระบบ</a>
          <a href="/register" class="inline-block ml-2 px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold">สมัคร</a>
        </div>
      </div>`;
    return;
  }

  if (reason === 'need_vip') {
    const limit = access.userLimit || 0;
    $('#videoWrap').innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-center p-6">
        <div>
          <div class="text-5xl mb-3">⭐</div>
          <div class="font-bold text-zinc-200 mb-2">EP ${index} สำหรับ VIP</div>
          <div class="text-sm text-zinc-400 mb-4">โหมดดูฟรี: สมาชิกทั่วไปดูได้ ${limit} ตอนแรก — อัปเกรด VIP เพื่อดูทุกตอน</div>
          <a href="/topup" class="inline-block px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black rounded-lg font-bold">อัปเกรด VIP</a>
        </div>
      </div>`;
    return;
  }

  if (reason === 'need_coin') {
    const cost = access.cost || 1;
    const haveEnough = (user.coins || 0) >= cost;
    $('#videoWrap').innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-center p-6">
        <div>
          <div class="text-5xl mb-3">🪙</div>
          <div class="font-bold text-zinc-200 mb-1">EP ${index} ต้องปลดล็อก</div>
          <div class="text-sm text-zinc-400 mb-1">ราคา: <strong class="text-amber-400">${cost} MKW Coin</strong></div>
          <div class="text-xs text-zinc-500 mb-4">เหรียญของคุณ: ${(user.coins || 0).toLocaleString()} MKW</div>
          ${haveEnough
            ? `<button id="unlockBtn" class="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black rounded-lg font-bold">ปลดล็อกด้วย ${cost} coin</button>`
            : `<a href="/topup" class="inline-block px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">เติมเหรียญ</a>`
          }
          <div class="mt-3 text-xs text-zinc-600">หรือ <a href="/topup" class="text-amber-400 hover:underline">อัพเกรด VIP</a> เพื่อดูฟรีทุกตอน</div>
        </div>
      </div>`;
    const btn = $('#unlockBtn');
    if (btn) btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'กำลังปลดล็อก...';
      try {
        const r = await backendPost('/api/unlock', { bookId, index });
        // Refresh auth + play
        await auth.refresh();
        playEpisode(ep);
        // update navbar
        $$('header').forEach(h => h.remove());
        document.body.insertAdjacentHTML('afterbegin', renderHeader(''));
      } catch (e) {
        btn.disabled = false; btn.textContent = `ปลดล็อกด้วย ${cost} coin`;
        alert('ปลดล็อกไม่สำเร็จ: ' + e.message);
      }
    };
    return;
  }

  showPlayerError('เข้าถึงไม่ได้', reason);
}

async function playEpisode(ep, ctx) {
  // Lazy-fetch URL สำหรับ source ที่ไม่ส่ง URL พร้อมใน episode list (Melolo)
  if (ctx?.source && !ep.videoUrl && !ep['1080p'] && !ep['540p']) {
    try {
      await ensureEpisodeUrl(ep, ctx.bookId, ctx.source);
    } catch (e) {
      showPlayerError('โหลด URL วิดีโอไม่สำเร็จ', e.message);
      return;
    }
  }

  const qualities = getQualityOptions(ep);
  if (!qualities.length) {
    showPlayerError('ไม่พบ URL วิดีโอ', '');
    return;
  }
  let currentQuality = pickPreferredQuality(qualities);

  const wrap = $('#videoWrap');
  let video = wrap.querySelector('#player');
  const firstTime = !video;
  if (firstTime) {
    wrap.classList.add('relative');
    wrap.innerHTML = `<video id="player" playsinline disablepictureinpicture class="absolute inset-0 w-full h-full bg-black" oncontextmenu="return false"></video>`;
    video = wrap.querySelector('#player');
    buildCustomControls(video, wrap);
  } else if (video._ctrl) {
    video._ctrl.abort();
  }

  const ctrl = new AbortController();
  video._ctrl = ctrl;

  let attemptIdx = 0;
  const fallbackOrder = [currentQuality, ...qualities.filter(q => q !== currentQuality)];

  function tryPlay() {
    if (attemptIdx >= fallbackOrder.length) {
      $('#msg').innerHTML = `<div class="error-banner rounded-lg p-3 text-sm">เล่นไม่ได้ — ลองทุก URL แล้ว</div>`;
      return;
    }
    currentQuality = fallbackOrder[attemptIdx];
    video.src = currentQuality.url;
    video.play().catch(() => {/* autoplay อาจโดน block */});
  }
  video.addEventListener('error', () => {
    if (video._switchingQuality) return;
    attemptIdx++;
    if (attemptIdx < fallbackOrder.length) tryPlay();
  }, { signal: ctrl.signal });

  function changeQuality(label) {
    const q = qualities.find(x => x.label === label);
    if (!q || q.url === video.src) return;

    const savedTime = video.currentTime;
    const wasPlaying = !video.paused;
    const prev = currentQuality;

    video._switchingQuality = true;

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      video._switchingQuality = false;
    };
    const onLoaded = () => {
      cleanup();
      try { if (!isNaN(savedTime) && isFinite(savedTime)) video.currentTime = savedTime; } catch {}
      if (wasPlaying) video.play().catch(() => {});
    };
    const onError = () => {
      cleanup();
      currentQuality = prev;
      video.src = prev.url;
      video.addEventListener('loadedmetadata', () => {
        try { if (!isNaN(savedTime) && isFinite(savedTime)) video.currentTime = savedTime; } catch {}
        if (wasPlaying) video.play().catch(() => {});
      }, { once: true });
      $('#msg').insertAdjacentHTML('afterbegin', `<div class="warn-banner rounded-lg p-2 text-xs mb-2">⚠️ คุณภาพ ${label} เล่นไม่ได้ — กลับไป ${prev.label}</div>`);
      setTimeout(() => { const w = $('#msg .warn-banner'); if (w) w.remove(); }, 3000);
    };

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });

    currentQuality = q;
    localStorage.setItem('mkw_quality', label);
    video.src = q.url;
    video.load();
  }

  // Bind controls หลัง changeQuality พร้อมแล้ว
  const playerOpts = {
    qualities,
    getCurrentQuality: () => currentQuality,
    changeQuality,
  };
  bindCustomControls(video, wrap, ctrl, playerOpts);

  tryPlay();

  // Auto-next + next ep button + swipe
  setupAutoNext(ep, video, ctx, ctrl, playerOpts);

  // Online Points — นับเฉพาะตอนวิดีโอเล่น + แสดง mini circle (default)
  pointsTicker.attach(video);
  showPointsCircle();
}

function buildCustomControls(video, wrap) {
  // Center play button (โชว์เมื่อ pause)
  const centerBtn = document.createElement('button');
  centerBtn.id = 'centerPlay';
  centerBtn.className = 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-black/70 text-white text-4xl rounded-full flex items-center justify-center z-30 shadow-xl backdrop-blur-sm pointer-events-auto';
  centerBtn.textContent = '▶';
  centerBtn.style.display = 'none';
  centerBtn.setAttribute('aria-label', 'play');
  wrap.appendChild(centerBtn);

  // Seek feedback toast (double-tap ±10s, swipe detect)
  const seekFb = document.createElement('div');
  seekFb.id = 'seekFb';
  seekFb.className = 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/85 text-white text-2xl font-bold px-5 py-3 rounded-2xl pointer-events-none z-40 transition-opacity duration-200';
  seekFb.style.opacity = '0';
  wrap.appendChild(seekFb);

  // Overlay wrapper
  const overlay = document.createElement('div');
  overlay.id = 'ctrlOverlay';
  overlay.className = 'absolute inset-0 z-20 transition-opacity duration-300';
  overlay.innerHTML = `
    <!-- 3 tap zones (ซ้าย=double-tap -10s / กลาง=play-pause / ขวา=double-tap +10s) -->
    <div class="absolute inset-0 flex">
      <div id="zoneL" class="flex-1 pointer-events-auto"></div>
      <div id="zoneC" class="flex-[2] pointer-events-auto"></div>
      <div id="zoneR" class="flex-1 pointer-events-auto"></div>
    </div>

    <!-- Top bar: quality menu -->
    <div class="absolute top-0 right-0 p-2 pointer-events-auto">
      <button id="qualityBtn" class="bg-black/60 hover:bg-black/80 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
        <span id="qualityLabel">Auto</span>
        <span class="text-[9px]">▾</span>
      </button>
      <div id="qMenu" class="hidden mt-1 bg-black/95 border border-white/20 rounded-lg overflow-hidden shadow-2xl min-w-[90px]"></div>
    </div>

    <!-- Bottom bar: seek + controls -->
    <div id="bottomBar" class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent select-none pointer-events-auto">
      <input id="seekBar" type="range" min="0" max="1000" value="0" step="1" class="w-full h-1 accent-red-500 cursor-pointer mb-2"/>
      <div class="flex items-center justify-between text-white text-xs">
        <div class="flex items-center gap-3">
          <button id="playPauseBtn" class="w-8 h-8 flex items-center justify-center text-lg" aria-label="play/pause">▶</button>
          <span class="tabular-nums"><span id="curTime">0:00</span> / <span id="totTime">0:00</span></span>
        </div>
        <div class="flex items-center gap-2">
          <button id="muteBtn" class="w-8 h-8 flex items-center justify-center text-lg" aria-label="mute">🔊</button>
          <button id="pointsBtn" class="w-8 h-8 flex items-center justify-center text-lg" aria-label="พ้อยออนไลน์" title="พ้อยออนไลน์">⭐</button>
          <button id="fsBtn" class="w-8 h-8 flex items-center justify-center text-lg" aria-label="fullscreen">⛶</button>
        </div>
      </div>
    </div>
  `;
  wrap.appendChild(overlay);
}

function bindCustomControls(video, wrap, ctrl, playerOpts) {
  const overlay = wrap.querySelector('#ctrlOverlay');
  const centerBtn = wrap.querySelector('#centerPlay');
  const seekFb = wrap.querySelector('#seekFb');
  if (!overlay || !centerBtn) return;

  const q = sel => overlay.querySelector(sel);
  const seekBar = q('#seekBar'), curTime = q('#curTime'), totTime = q('#totTime');
  const playPauseBtn = q('#playPauseBtn'), fsBtn = q('#fsBtn'), muteBtn = q('#muteBtn'), pointsBtn = q('#pointsBtn');
  const zoneL = q('#zoneL'), zoneC = q('#zoneC'), zoneR = q('#zoneR');
  const qualityBtn = q('#qualityBtn'), qualityLabel = q('#qualityLabel'), qMenu = q('#qMenu');

  const pad = n => String(Math.floor(n)).padStart(2, '0');
  const fmt = s => {
    if (!s || isNaN(s) || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };

  const showFb = text => {
    seekFb.textContent = text;
    seekFb.style.opacity = '1';
    clearTimeout(seekFb._t);
    seekFb._t = setTimeout(() => { seekFb.style.opacity = '0'; }, 600);
  };

  let hideTimer = null;
  const showCtrls = () => {
    overlay.style.opacity = '1';
    clearTimeout(hideTimer);
    if (!video.paused) hideTimer = setTimeout(() => { overlay.style.opacity = '0'; }, 3000);
  };
  showCtrls();

  let seekDragging = false;
  const opts = { signal: ctrl.signal };

  // ---- 3-zone tap handling ----
  // Double-tap ซ้าย = -10s, Double-tap ขวา = +10s, Single-tap กลาง = play/pause + show controls
  let lastTap = 0, lastZone = null, singleTapTimer = null;
  const toggleFs = async () => {
    try {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      } else {
        await (wrap.requestFullscreen?.() || wrap.webkitRequestFullscreen?.() || video.webkitEnterFullscreen?.());
      }
    } catch {}
  };
  const handleTap = zone => {
    const now = Date.now();
    const dt = now - lastTap;
    clearTimeout(singleTapTimer);
    if (dt < 350 && lastZone === zone) {
      if (zone === 'L' || zone === 'R') {
        const delta = zone === 'L' ? -10 : 10;
        video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + delta));
        showFb(zone === 'L' ? '◀◀ -10s' : '+10s ▶▶');
        showCtrls();
      } else if (zone === 'C') {
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        showFb(fsEl ? '⤢ ออก' : '⤢ เต็มจอ');
        toggleFs();
      }
      lastTap = 0; lastZone = null;
      return;
    }
    lastTap = now; lastZone = zone;
    // Delay single-tap action เพื่อรอ double-tap
    singleTapTimer = setTimeout(() => {
      if (zone === 'C') {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      }
      showCtrls();
      lastTap = 0; lastZone = null;
    }, 280);
  };
  zoneL.addEventListener('click', e => { e.stopPropagation(); handleTap('L'); }, opts);
  zoneC.addEventListener('click', e => { e.stopPropagation(); handleTap('C'); }, opts);
  zoneR.addEventListener('click', e => { e.stopPropagation(); handleTap('R'); }, opts);
  centerBtn.addEventListener('click', e => { e.stopPropagation(); video.play().catch(() => {}); }, opts);
  playPauseBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    showCtrls();
  }, opts);

  // ---- Video state → UI ----
  video.addEventListener('play', () => {
    playPauseBtn.textContent = '⏸';
    centerBtn.style.display = 'none';
    showCtrls();
  }, opts);
  video.addEventListener('pause', () => {
    playPauseBtn.textContent = '▶';
    centerBtn.style.display = 'flex';
    clearTimeout(hideTimer);
    overlay.style.opacity = '1';
  }, opts);
  video.addEventListener('loadedmetadata', () => {
    totTime.textContent = fmt(video.duration);
    seekBar.max = Math.max(1, Math.floor(video.duration * 1000));
  }, opts);
  video.addEventListener('timeupdate', () => {
    if (!seekDragging) {
      seekBar.value = Math.floor(video.currentTime * 1000);
      curTime.textContent = fmt(video.currentTime);
    }
  }, opts);

  // ---- Seek drag ----
  seekBar.addEventListener('input', e => {
    e.stopPropagation();
    seekDragging = true;
    curTime.textContent = fmt(seekBar.value / 1000);
    showCtrls();
  }, opts);
  seekBar.addEventListener('change', e => {
    e.stopPropagation();
    video.currentTime = seekBar.value / 1000;
    seekDragging = false;
    showCtrls();
  }, opts);

  // ---- Mute ----
  const updateMuteUI = () => { muteBtn.textContent = video.muted || video.volume === 0 ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    video.muted = !video.muted;
    updateMuteUI();
    showCtrls();
  }, opts);
  video.addEventListener('volumechange', updateMuteUI, opts);
  updateMuteUI();

  // ---- OnlinePoint button → เปิด popup กลับมา (ล้าง flag hidden) ----
  if (pointsBtn) {
    if (!auth.user) pointsBtn.style.display = 'none';
    else pointsBtn.addEventListener('click', e => {
      e.stopPropagation();
      reopenPointsPopup();
      showCtrls();
    }, opts);
  }

  // ---- Fullscreen (on WRAP — swipe + popup ใช้ได้ใน fullscreen) ----
  fsBtn.addEventListener('click', async e => {
    e.stopPropagation();
    try {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      } else {
        await (wrap.requestFullscreen?.() || wrap.webkitRequestFullscreen?.() || video.webkitEnterFullscreen?.());
      }
    } catch {}
  }, opts);
  const onFsChange = () => { showCtrls(); };
  document.addEventListener('fullscreenchange', onFsChange, opts);
  document.addEventListener('webkitfullscreenchange', onFsChange, opts);

  // ---- Quality menu ----
  const qualities = playerOpts?.qualities || [];
  const getCurQ = playerOpts?.getCurrentQuality;
  if (qualities.length && getCurQ) {
    const renderMenu = () => {
      const cur = getCurQ();
      qualityLabel.textContent = cur.label;
      qMenu.innerHTML = qualities.map(qq =>
        `<button data-q="${qq.label}" class="qopt block w-full text-left px-3 py-2 text-xs font-semibold ${qq.label === cur.label ? 'bg-red-600 text-white' : 'text-zinc-200 hover:bg-white/10'}">${qq.label}</button>`
      ).join('');
      qMenu.querySelectorAll('.qopt').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const label = b.dataset.q;
        if (playerOpts.changeQuality) playerOpts.changeQuality(label);
        qMenu.classList.add('hidden');
        renderMenu();
      }, opts));
    };
    renderMenu();
    qualityBtn.addEventListener('click', e => {
      e.stopPropagation();
      qMenu.classList.toggle('hidden');
      showCtrls();
    }, opts);
    // Close menu when clicking outside
    overlay.addEventListener('click', e => {
      if (!qualityBtn.contains(e.target) && !qMenu.contains(e.target)) qMenu.classList.add('hidden');
    }, opts);
    // Sync UI เมื่อ quality เปลี่ยนจาก revert
    video.addEventListener('loadedmetadata', renderMenu, opts);
  } else {
    qualityBtn.style.display = 'none';
  }

  // Show controls on any touch
  wrap.addEventListener('touchstart', () => showCtrls(), { passive: true, signal: ctrl.signal });
  wrap.addEventListener('mousemove', () => showCtrls(), { passive: true, signal: ctrl.signal });
}

function getQualityOptions(ep) {
  const opts = [];
  if (ep['1080p']) opts.push({ label: '1080p', url: ep['1080p'] });
  if (ep['720p']) opts.push({ label: '720p', url: ep['720p'] });
  if (ep['540p']) opts.push({ label: '540p', url: ep['540p'] });
  if (!opts.length && ep.videoUrl) opts.push({ label: 'Auto', url: ep.videoUrl });
  // เพิ่ม Auto เป็น fallback ถ้า videoUrl ต่างจาก quality specific
  if (ep.videoUrl && !opts.some(o => o.url === ep.videoUrl)) {
    opts.push({ label: 'Auto', url: ep.videoUrl });
  }
  return opts;
}

function pickPreferredQuality(opts) {
  const pref = localStorage.getItem('mkw_quality') || '1080p';
  return opts.find(o => o.label === pref) || opts[0];
}

function showEpChangeConfirm(currentIdx, targetIdx, onConfirm) {
  const existing = document.getElementById('epConfirmPopup');
  if (existing) existing.remove();

  const isNext = targetIdx > currentIdx;
  const dirLabel = isNext ? '▲ ตอนถัดไป' : '▼ ตอนก่อนหน้า';
  const dirColor = isNext ? 'text-red-400' : 'text-amber-400';

  const popup = document.createElement('div');
  popup.id = 'epConfirmPopup';
  // ลอยกลางจอ ไม่มี backdrop เต็มจอ → video controls ข้างใต้ยังกดได้ video ไม่ pause
  popup.className = 'fixed left-1/2 top-1/3 -translate-x-1/2 z-[9998] w-[280px] max-w-[90vw] transition-opacity';
  popup.innerHTML = `
    <div class="bg-black/90 backdrop-blur-sm border border-white/20 rounded-2xl p-5 text-center shadow-2xl">
      <div class="text-xs font-bold ${dirColor} mb-1">${dirLabel}</div>
      <div class="text-xl font-black text-white mb-1">EP ${currentIdx} → EP ${targetIdx}</div>
      <div class="text-xs text-zinc-400 mb-4">ต้องการเปลี่ยนตอนหรือไม่?</div>
      <div class="flex gap-2">
        <button id="epCancel" class="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold">ยกเลิก</button>
        <button id="epConfirm" class="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold">ตกลง</button>
      </div>
      <div class="text-[10px] text-zinc-600 mt-2">ปิดอัตโนมัติใน 5 วิ</div>
    </div>
  `;
  document.body.appendChild(popup);
  // ถ้าอยู่ใน fullscreen ต้อง move popup เข้า fullscreen element ไม่งั้นถูกซ่อน
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) fsEl.appendChild(popup);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    popup.style.opacity = '0';
    setTimeout(() => popup.remove(), 200);
  };
  popup.querySelector('#epCancel').onclick = close;
  popup.querySelector('#epConfirm').onclick = () => { close(); onConfirm(); };
  const timer = setTimeout(close, 5000);
}

function setupAutoNext(ep, video, ctx, ctrl, playerOpts) {
  if (!ctx) return;
  const { bookId, source, total, episodes } = ctx;
  const nextEp = episodes.find(e => e.chapterIndex === ep.chapterIndex + 1);
  const prevEp = episodes.find(e => e.chapterIndex === ep.chapterIndex - 1);
  let autoNext = localStorage.getItem('mkw_autonext') !== '0'; // default on
  // Preload วิดีโอตอนถัดไปไว้ใน browser cache → swap แล้วเริ่มเล่นได้ทันที
  if (nextEp) {
    const setupPreload = () => {
      const nextUrl = nextEp['1080p'] || nextEp.videoUrl || nextEp['540p'];
      if (!nextUrl) return;
      let pre = document.getElementById('preloadNext');
      if (!pre) {
        pre = document.createElement('video');
        pre.id = 'preloadNext';
        pre.style.display = 'none';
        pre.preload = 'auto';
        pre.muted = true;
        document.body.appendChild(pre);
      }
      if (pre.src !== nextUrl) pre.src = nextUrl;
    };
    if (nextEp.videoUrl || nextEp['1080p'] || nextEp['540p']) {
      setupPreload();
    } else if (source) {
      // Lazy fetch URL ของ next ep แล้ว preload (เฉพาะ Melolo)
      ensureEpisodeUrl(nextEp, bookId, source).then(setupPreload).catch(() => {});
    }
  }

  $('#msg').innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
      <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input id="autoNextCb" type="checkbox" ${autoNext ? 'checked' : ''} class="w-4 h-4 accent-red-500"/>
        <span>เล่นตอนถัดไปอัตโนมัติ</span>
      </label>
      <div class="flex items-center gap-2">
        ${prevEp ? `<button id="prevEpBtn" class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm">◀ EP ${prevEp.chapterIndex}</button>` : ''}
        ${nextEp ? `<button id="nextEpBtn" class="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold">EP ${nextEp.chapterIndex} ▶</button>` : '<span class="text-zinc-500 text-sm">ตอนสุดท้ายแล้ว</span>'}
      </div>
    </div>
    <div id="countdown" class="text-sm text-amber-300 mt-2 text-center hidden"></div>
  `;

  $('#autoNextCb').onchange = e => {
    autoNext = e.target.checked;
    localStorage.setItem('mkw_autonext', autoNext ? '1' : '0');
  };
  if (prevEp && $('#prevEpBtn')) $('#prevEpBtn').onclick = () => epChangeWithCooldown(prevEp.chapterIndex, ctx, $('#prevEpBtn'));
  if (nextEp && $('#nextEpBtn')) $('#nextEpBtn').onclick = () => epChangeWithCooldown(nextEp.chapterIndex, ctx, $('#nextEpBtn'));

  // Swipe gesture (pointer events — ใช้ได้ทุก input type + fullscreen)
  // ขึ้น=ep ก่อนหน้า / ลง=ep ถัดไป → popup ยืนยัน (video เล่นต่อปกติ)
  const wrap = $('#videoWrap');
  if ((nextEp || prevEp) && wrap) {
    let sy = 0, sx = 0, active = false, pid = null, fired = false;
    const isOnControls = tgt => tgt && tgt.closest && tgt.closest('#bottomBar, #qualityBtn, #qMenu, #centerPlay');

    const onDown = e => {
      if (isOnControls(e.target)) { active = false; return; }
      sy = e.clientY; sx = e.clientX; active = true; fired = false; pid = e.pointerId;
      try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = e => {
      if (!active || fired || e.pointerId !== pid) return;
      const dy = e.clientY - sy;
      const dx = e.clientX - sx;
      if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx)) return;
      fired = true;
      active = false;
      const fb = wrap.querySelector('#seekFb');
      if (dy < 0 && prevEp) {
        if (fb) { fb.textContent = `↑ EP ${prevEp.chapterIndex}`; fb.style.opacity = '1'; setTimeout(() => { fb.style.opacity = '0'; }, 400); }
        showEpChangeConfirm(ep.chapterIndex, prevEp.chapterIndex, () => goToEpisode(prevEp.chapterIndex, ctx));
      } else if (dy > 0 && nextEp) {
        if (fb) { fb.textContent = `↓ EP ${nextEp.chapterIndex}`; fb.style.opacity = '1'; setTimeout(() => { fb.style.opacity = '0'; }, 400); }
        showEpChangeConfirm(ep.chapterIndex, nextEp.chapterIndex, () => goToEpisode(nextEp.chapterIndex, ctx));
      }
    };
    const onEnd = () => { active = false; };
    wrap.addEventListener('pointerdown', onDown, { signal: ctrl?.signal });
    wrap.addEventListener('pointermove', onMove, { signal: ctrl?.signal });
    wrap.addEventListener('pointerup', onEnd, { signal: ctrl?.signal });
    wrap.addEventListener('pointercancel', onEnd, { signal: ctrl?.signal });
  }

  if (!nextEp) return;

  let cdTimer = null;
  let cancelled = false;
  video.addEventListener('ended', () => {
    if (!autoNext || cancelled) return;
    let s = 3; // นับถอย 3 วิ (สั้นกว่าเดิมเพราะ preload แล้ว)
    const cd = $('#countdown');
    cd.classList.remove('hidden');
    const tick = () => {
      if (cancelled) return;
      cd.innerHTML = `▶ เล่น EP ${nextEp.chapterIndex} ใน <span class="font-bold">${s}</span> วิ — <button id="cancelNextBtn" class="underline hover:text-white">ยกเลิก</button>`;
      $('#cancelNextBtn').onclick = () => {
        cancelled = true;
        clearInterval(cdTimer);
        cd.classList.add('hidden');
      };
      if (s <= 0) {
        clearInterval(cdTimer);
        cd.classList.add('hidden');
        goToEpisode(nextEp.chapterIndex, ctx);
        return;
      }
      s--;
    };
    tick();
    cdTimer = setInterval(tick, 1000);
  }, { signal: ctrl?.signal });
}

// ============================================================
// Login / Register / Topup / (Admin in admin.js)
// ============================================================

async function initLoginPage() {
  await auth.refresh();
  if (auth.user) { location.href = qs('next') || '/'; return; }
  const saved = (() => { try { return JSON.parse(localStorage.getItem('mkw_remember') || 'null'); } catch { return null; } })();
  await mountPage('', `
    <div class="max-w-md mx-auto">
      <h2 class="text-2xl font-black mb-1 text-center">เข้าสู่ระบบ</h2>
      <p class="text-sm text-zinc-500 mb-6 text-center">${BRAND}</p>
      <form id="loginForm" class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">Username</label>
          <input id="u" type="text" required value="${escapeHtml(saved?.username || '')}" class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white"/>
        </div>
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">Password</label>
          <input id="p" type="password" required value="${escapeHtml(saved?.password || '')}" class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white"/>
        </div>
        <label class="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
          <input id="remember" type="checkbox" ${saved ? 'checked' : 'checked'} class="w-4 h-4 accent-red-500"/>
          <span>จดจำฉันไว้ (login อัตโนมัติครั้งหน้า)</span>
        </label>
        <div id="err" class="text-sm text-red-400 hidden"></div>
        <button type="submit" class="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">เข้าสู่ระบบ</button>
        <div class="flex items-center gap-2 text-xs text-zinc-500"><div class="flex-1 border-t border-zinc-800"></div><span>หรือ</span><div class="flex-1 border-t border-zinc-800"></div></div>
        <button type="button" id="googleBtn" class="w-full py-2.5 bg-white hover:bg-zinc-100 text-zinc-900 rounded-lg font-semibold flex items-center justify-center gap-2">
          <svg class="w-5 h-5" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 9.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.18 29.93 1 24 1 15.4 1 7.96 5.93 4.34 13.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
          เข้าสู่ระบบด้วย Google
        </button>
        <p class="text-center text-sm text-zinc-500">ยังไม่มีบัญชี? <a href="/register" class="text-red-400 hover:underline">สมัครที่นี่</a></p>
      </form>
    </div>
  `, 'max-w-[1600px] mx-auto px-6 py-12');

  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#err'); err.classList.add('hidden');
    const username = $('#u').value.trim();
    const password = $('#p').value;
    const remember = $('#remember').checked;
    try {
      const r = await backendPost('/api/auth/login', { username, password });
      auth.token = r.token;
      auth.user = r.user;
      if (remember) localStorage.setItem('mkw_remember', JSON.stringify({ username, password }));
      else localStorage.removeItem('mkw_remember');
      location.href = qs('next') || '/';
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  };

  $('#googleBtn').onclick = async () => {
    try {
      const r = await backendGet('/api/auth/google/url');
      location.href = r.url;
    } catch (ex) {
      const err = $('#err');
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  };
}

async function initRegisterPage() {
  await auth.refresh();
  if (auth.user) { location.href = '/'; return; }
  await mountPage('', `
    <div class="max-w-md mx-auto">
      <h2 class="text-2xl font-black mb-1 text-center">สมัครสมาชิก</h2>
      <p class="text-sm text-zinc-500 mb-6 text-center">${BRAND}</p>
      <form id="regForm" class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">Username (a-z 0-9 _ ยาว 3-20)</label>
          <input id="u" type="text" required class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white"/>
        </div>
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">Password</label>
          <input id="p" type="password" required minlength="3" class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white"/>
        </div>
        <div id="err" class="text-sm text-red-400 hidden"></div>
        <button type="submit" class="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">สมัคร</button>
        <div class="flex items-center gap-2 text-xs text-zinc-500"><div class="flex-1 border-t border-zinc-800"></div><span>หรือ</span><div class="flex-1 border-t border-zinc-800"></div></div>
        <button type="button" id="googleBtn" class="w-full py-2.5 bg-white hover:bg-zinc-100 text-zinc-900 rounded-lg font-semibold flex items-center justify-center gap-2">
          <svg class="w-5 h-5" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 9.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.18 29.93 1 24 1 15.4 1 7.96 5.93 4.34 13.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
          สมัคร / เข้าสู่ระบบด้วย Google
        </button>
        <p class="text-center text-sm text-zinc-500">มีบัญชีอยู่แล้ว? <a href="/login" class="text-red-400 hover:underline">เข้าสู่ระบบ</a></p>
      </form>
    </div>
  `, 'max-w-[1600px] mx-auto px-6 py-12');

  $('#regForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#err'); err.classList.add('hidden');
    try {
      const r = await backendPost('/api/auth/register', { username: $('#u').value.trim(), password: $('#p').value });
      auth.token = r.token;
      auth.user = r.user;
      location.href = '/';
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  };

  $('#googleBtn').onclick = async () => {
    try {
      const r = await backendGet('/api/auth/google/url');
      location.href = r.url;
    } catch (ex) {
      const err = $('#err');
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  };
}

async function initTopupPage() {
  await auth.refresh();
  if (!auth.user) { location.href = '/login?next=/topup'; return; }
  const u = auth.user;
  const vipText = (u.role === 'vip' && u.vipExpires)
    ? `<span class="text-amber-300 text-sm">● VIP หมดอายุ ${new Date(u.vipExpires).toLocaleString('th-TH')}</span>`
    : (u.role === 'admin' ? `<span class="text-red-400 text-sm">● Admin (ดูได้ทุกอย่างฟรี)</span>` : `<span class="text-zinc-500 text-sm">● ยังไม่ได้สมัคร VIP</span>`);

  await mountPage('', `
    <div class="max-w-4xl mx-auto">
      <h2 class="text-2xl sm:text-3xl font-black mb-1">เติมเงิน / แลก VIP</h2>
      <p class="text-sm text-zinc-500 mb-6">1 บาท = 1 MKW Coin • ปลดล็อกตอนละ 1 coin • หรือสมัคร VIP ดูฟรีทุกตอน</p>

      <div class="grid sm:grid-cols-2 gap-3 mb-8">
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div class="text-sm text-zinc-400">เหรียญของคุณ</div>
          <div class="text-3xl font-black text-amber-400">${(u.coins || 0).toLocaleString()} <span class="text-base">MKW</span></div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div class="text-sm text-zinc-400">สถานะสมาชิก</div>
          <div class="mt-1 flex items-center gap-2 flex-wrap">${roleBadge(u.role)} ${vipText}</div>
        </div>
      </div>

      <h3 class="font-bold text-lg mb-3">⭐ แลก VIP ด้วยเหรียญ</h3>
      <p class="text-xs text-zinc-500 mb-3">VIP ดูทุกตอนฟรีตลอดอายุสมาชิก (ต่ออายุได้)</p>
      <div id="vipPackages" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"></div>

      <h3 class="font-bold text-lg mb-3">💰 เติม MKW Coin</h3>
      <p class="text-xs text-zinc-500 mb-3">เลือกจำนวนที่ต้องการเติม → ระบบจะกรอกยอดในช่องสลิปให้ → โอนเงินแล้วแนบสลิปด้านล่าง</p>
      <div id="packages" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8"></div>

      <h3 class="font-bold text-lg mb-3">📷 อัพโหลดสลิป (admin ตรวจสอบก่อนเติม)</h3>
      <p class="text-xs text-zinc-500 mb-3">📌 ระบบ verify QR code อัตโนมัติยังไม่เปิดใช้งาน — admin จะตรวจสลิปและเติมเหรียญให้ภายหลัง</p>
      <form id="slipForm" class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">จำนวนเงินที่โอน (บาท)</label>
            <input id="slipAmount" type="number" min="1" required class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          </div>
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">หมายเหตุ (option)</label>
            <input id="slipNote" type="text" placeholder="เช่น โอนผ่าน K+ เวลา 14:30" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          </div>
        </div>
        <div class="mt-3">
          <label class="text-xs text-zinc-400 mb-1 block">ภาพสลิป / QR (สูงสุด 5MB)</label>
          <input id="slipFile" type="file" accept="image/*" required class="w-full text-sm text-zinc-400 file:mr-3 file:px-4 file:py-2 file:rounded file:border-0 file:bg-amber-500 file:text-black file:font-bold file:cursor-pointer hover:file:bg-amber-400"/>
          <div id="slipPreview" class="mt-3 hidden"><img id="slipImg" class="max-h-48 rounded border border-zinc-800"/></div>
        </div>
        <button class="mt-4 w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold">ส่งสลิปให้ admin</button>
      </form>

      <h3 class="font-bold text-lg mb-3">⭐ แลกพ้อยออนไลน์เป็น MKW Coin</h3>
      <p class="text-xs text-zinc-500 mb-3">ดูวิดีโอเพื่อรับพ้อย: 1 นาที = 10 พ้อย (วันละสูงสุด 10,000 พ้อย) • อัตราแลก 100 พ้อย = 1 MKW Coin</p>
      <div class="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 mb-8">
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div class="text-xs text-zinc-400">พ้อยคงเหลือ</div>
            <div class="text-3xl font-black text-amber-300">${(u.points || 0).toLocaleString()}</div>
          </div>
          <div>
            <div class="text-xs text-zinc-400">พ้อยวันนี้</div>
            <div class="text-base font-bold text-zinc-200">${(u.pointsToday || 0).toLocaleString()} <span class="text-xs text-zinc-500">/ ${(u.pointsDailyCap || 10000).toLocaleString()}</span></div>
          </div>
        </div>
        <form id="redeemForm" class="flex gap-2">
          <input id="redeemAmt" type="number" min="100" step="100" placeholder="จำนวนพ้อย (ขั้นต่ำ 100)" class="flex-1 px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-amber-500 text-white"/>
          <button class="px-5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold">แลก</button>
        </form>
        <div class="mt-2 flex gap-2 flex-wrap text-xs">
          <button type="button" data-r="100" class="redeem-preset px-2.5 py-1 bg-zinc-800 hover:bg-amber-500/20 rounded">100 → 1 MKW</button>
          <button type="button" data-r="500" class="redeem-preset px-2.5 py-1 bg-zinc-800 hover:bg-amber-500/20 rounded">500 → 5 MKW</button>
          <button type="button" data-r="1000" class="redeem-preset px-2.5 py-1 bg-zinc-800 hover:bg-amber-500/20 rounded">1000 → 10 MKW</button>
          <button type="button" data-r="max" class="redeem-preset px-2.5 py-1 bg-zinc-800 hover:bg-amber-500/20 rounded">สูงสุด</button>
        </div>
      </div>

      <h3 class="font-bold text-lg mb-3">🎁 แลก Gift Card</h3>
      <form id="giftForm" class="flex gap-2 mb-8">
        <input id="giftCode" type="text" placeholder="ใส่โค้ด gift card" class="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white uppercase"/>
        <button class="px-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold">แลก</button>
      </form>

      <div id="msg"></div>
    </div>
  `);

  const allPkg = await backendGet('/api/topup/packages').catch(() => ({ packages: [], vipPackages: [] }));
  const pkgs = allPkg.packages || [];
  const vipPkgs = allPkg.vipPackages || [];

  // VIP packages
  $('#vipPackages').innerHTML = vipPkgs.map(p => `
    <button data-id="${p.id}" class="vip-btn bg-gradient-to-br from-amber-500/10 to-orange-500/5 hover:from-amber-500/20 border-2 border-amber-500/30 hover:border-amber-500 rounded-xl p-4 text-left transition-all">
      <div class="text-xs text-amber-400 font-bold uppercase tracking-wider mb-1">${escapeHtml(p.label || '')}</div>
      <div class="text-3xl font-black text-amber-300">${p.days}<span class="text-base font-normal opacity-70"> วัน</span></div>
      <div class="mt-2 pt-2 border-t border-amber-500/20 flex items-center justify-between">
        <span class="text-xs text-zinc-400">ใช้</span>
        <span class="font-bold text-amber-400">🪙 ${p.coins.toLocaleString()}</span>
      </div>
    </button>
  `).join('');
  $$('.vip-btn').forEach(b => b.onclick = async () => {
    const id = b.dataset.id;
    if (!confirm('แลก VIP จะตัดเหรียญทันที — ดำเนินการต่อ?')) return;
    b.disabled = true;
    try {
      const r = await backendPost('/api/user/buy-vip', { packageId: id });
      $('#msg').innerHTML = `<div class="info-banner rounded-lg p-4"><div class="font-bold mb-1">⭐ สมัคร VIP สำเร็จ</div><div class="text-sm">+${r.daysAdded} วัน • หมดอายุ ${new Date(r.vipExpires).toLocaleString('th-TH')} • เหรียญคงเหลือ ${r.coins.toLocaleString()}</div></div>`;
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      $('#msg').innerHTML = `<div class="error-banner rounded-lg p-3 text-sm">${escapeHtml(e.message)}</div>`;
      b.disabled = false;
    }
  });

  // Topup packages — เลือก = pre-fill ช่อง amount ใน slip form (ไม่เติม coin ตรงๆ)
  $('#packages').innerHTML = pkgs.map(p => `
    <button data-id="${p.id}" data-price="${p.price}" data-coins="${p.coins}" class="pkg-btn bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 hover:border-amber-500 rounded-xl p-4 text-left transition-all">
      <div class="text-xs text-zinc-500 mb-1">${escapeHtml(p.label || '')}</div>
      <div class="text-2xl font-black text-amber-400 mb-1">${p.coins.toLocaleString()}</div>
      <div class="text-xs text-zinc-400">MKW Coin</div>
      <div class="mt-2 pt-2 border-t border-zinc-800 text-sm font-bold">฿${p.price.toLocaleString()}</div>
    </button>
  `).join('');
  $$('.pkg-btn').forEach(b => b.onclick = () => {
    $$('.pkg-btn').forEach(x => x.classList.remove('border-amber-500', 'bg-amber-500/10'));
    b.classList.add('border-amber-500', 'bg-amber-500/10');
    const price = parseInt(b.dataset.price, 10);
    const coins = parseInt(b.dataset.coins, 10);
    const amt = $('#slipAmount');
    amt.value = price;
    $('#slipNote').value = `เติม ${coins.toLocaleString()} MKW Coin`;
    document.getElementById('slipForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    amt.focus();
  });

  // Slip upload
  let slipDataUrl = null;
  $('#slipFile').onchange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) { alert('ไฟล์ใหญ่เกิน 5MB'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      slipDataUrl = ev.target.result;
      $('#slipImg').src = slipDataUrl;
      $('#slipPreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  };
  $('#slipForm').onsubmit = async e => {
    e.preventDefault();
    if (!slipDataUrl) { alert('กรุณาเลือกภาพสลิป'); return; }
    const amount = parseInt($('#slipAmount').value, 10);
    const note = $('#slipNote').value.trim();
    try {
      const r = await backendPost('/api/user/upload-slip', { image: slipDataUrl, amount, note });
      $('#msg').innerHTML = `<div class="info-banner rounded-lg p-4"><div class="font-bold mb-1">📨 ส่งสลิปแล้ว (id: ${escapeHtml(r.id)})</div><div class="text-sm">รอ admin ตรวจสอบและเติมเหรียญให้ — ${amount} บาท</div></div>`;
      $('#slipForm').reset();
      $('#slipPreview').classList.add('hidden');
      slipDataUrl = null;
    } catch (ex) {
      $('#msg').innerHTML = `<div class="error-banner rounded-lg p-3 text-sm">${escapeHtml(ex.message)}</div>`;
    }
  };

  // Redeem points → MKW
  $$('.redeem-preset').forEach(b => b.onclick = () => {
    const r = b.dataset.r;
    const v = r === 'max' ? Math.floor((auth.user?.points || 0) / 100) * 100 : parseInt(r, 10);
    $('#redeemAmt').value = v;
  });
  $('#redeemForm').onsubmit = async e => {
    e.preventDefault();
    const points = parseInt($('#redeemAmt').value, 10) || 0;
    if (points < 100) { alert('ขั้นต่ำ 100 พ้อย (100 พ้อย = 1 MKW Coin)'); return; }
    try {
      const r = await backendPost('/api/user/redeem-points', { points });
      $('#msg').innerHTML = `<div class="info-banner rounded-lg p-4"><div class="font-bold mb-1">⭐ แลกพ้อยสำเร็จ</div><div class="text-sm">+${r.coinsAdded} MKW Coin • ยอดรวม ${r.newBalance.toLocaleString()} MKW • พ้อยคงเหลือ ${r.points.toLocaleString()}</div></div>`;
      setTimeout(() => location.reload(), 1500);
    } catch (ex) {
      $('#msg').innerHTML = `<div class="error-banner rounded-lg p-3 text-sm">${escapeHtml(ex.message)}</div>`;
    }
  };

  // Giftcard
  $('#giftForm').onsubmit = async e => {
    e.preventDefault();
    const code = $('#giftCode').value.trim().toUpperCase();
    if (!code) return;
    try {
      const r = await backendPost('/api/giftcard/redeem', { code });
      if (r.type === 'vip') {
        const expires = r.vipExpires ? new Date(r.vipExpires).toLocaleString('th-TH') : '';
        $('#msg').innerHTML = `<div class="info-banner rounded-lg p-4"><div class="font-bold mb-1">⭐ แลก Gift Card VIP สำเร็จ</div><div class="text-sm">+${r.daysAdded} วัน${expires ? ` • หมดอายุ ${expires}` : ''}</div></div>`;
      } else {
        $('#msg').innerHTML = `<div class="info-banner rounded-lg p-4"><div class="font-bold mb-1">🎁 แลก Gift Card สำเร็จ</div><div class="text-sm">+${(r.coinsAdded || 0).toLocaleString()} MKW Coin • ยอดรวม ${(r.newBalance || 0).toLocaleString()} MKW</div></div>`;
      }
      setTimeout(() => location.reload(), 1500);
    } catch (ex) {
      $('#msg').innerHTML = `<div class="error-banner rounded-lg p-3 text-sm">${escapeHtml(ex.message)}</div>`;
    }
  };
}

// ============================================================
// History page
// ============================================================

async function initHistoryPage() {
  await auth.refresh();
  if (!auth.user) { location.href = '/login?next=/history'; return; }
  await mountPage('', `
    <div class="flex items-center justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black">ประวัติการดู</h2>
        <p class="text-sm text-zinc-500">เรื่องที่คุณเปิดดูล่าสุด — กดเพื่อเล่นต่อจากตอนล่าสุด</p>
      </div>
      <button id="clearBtn" class="text-sm px-3 py-1.5 bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-300 rounded-lg">ล้างประวัติทั้งหมด</button>
    </div>
    <div id="histList"></div>
  `);

  $('#clearBtn').onclick = async () => {
    if (!confirm('ล้างประวัติทั้งหมด?')) return;
    try {
      await backendDelete('/api/history');
      renderHistoryList();
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  };

  renderHistoryList();
}

async function renderHistoryList() {
  const list = $('#histList');
  if (!list) return;
  list.innerHTML = `<div class="text-zinc-500 text-center py-10">กำลังโหลด...</div>`;

  let history = [];
  try {
    const r = await backendGet('/api/history');
    history = r.history || [];
  } catch (e) {
    list.innerHTML = errorBanner(e, { title: 'โหลดประวัติไม่สำเร็จ' });
    return;
  }

  if (!history.length) {
    list.innerHTML = `<div class="text-center py-20 text-zinc-500"><div class="text-5xl mb-3">🕐</div><p>ยังไม่มีประวัติการดู</p><a href="/" class="inline-block mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold">ไปดูซีรีส์</a></div>`;
    return;
  }

  list.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      ${history.map(h => {
        const src = h.source || 'dramabox';
        const srcQ = src === 'dramabox' ? '' : `&src=${encodeURIComponent(src)}`;
        const srcBadge = `<div class="absolute top-2 right-2 px-2 py-0.5 ${SOURCE_BADGE_CLS[src] || 'bg-zinc-700'} text-white text-[10px] font-bold rounded shadow">${escapeHtml(SOURCE_LABELS[src] || src.toUpperCase())}</div>`;
        return `
        <div class="relative group">
          <a href="/play?bookId=${encodeURIComponent(h.bookId)}&index=${h.index}${srcQ}" class="card block">
            <div class="relative card-img rounded-lg overflow-hidden bg-zinc-900">
              <img src="${escapeHtml(h.cover || '')}" class="w-full h-full object-cover" loading="lazy" onerror="this.style.opacity=0"/>
              <div class="absolute inset-0 gradient-fade"></div>
              <div class="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-black text-[11px] font-bold rounded">EP ${h.index}</div>
              ${srcBadge}
              <div class="absolute bottom-2 left-2 right-2">
                <div class="text-white font-bold text-sm leading-tight glow-text line-clamp-2">${escapeHtml(h.bookName || '(ไม่ทราบชื่อ)')}</div>
                <div class="text-zinc-300 text-[11px] mt-0.5 glow-text">${escapeHtml((h.at || '').slice(0, 10))}</div>
              </div>
            </div>
          </a>
          <button class="del-hist absolute top-10 right-2 w-7 h-7 bg-black/70 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-70" data-bid="${escapeHtml(h.bookId)}" data-name="${escapeHtml(h.bookName || '')}" title="ลบจากประวัติ">✕</button>
        </div>`;
      }).join('')}
    </div>
  `;

  $$('.del-hist').forEach(b => b.onclick = async () => {
    if (!confirm(`ลบ "${b.dataset.name || b.dataset.bid}" ออกจากประวัติ?`)) return;
    try {
      await backendDelete(`/api/history/${encodeURIComponent(b.dataset.bid)}`);
      renderHistoryList();
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
}

// ============================================================
// Profile page — change password + account info
// ============================================================

async function initProfilePage() {
  await auth.refresh();
  if (!auth.user) { location.href = '/login?next=/profile'; return; }
  const u = auth.user;
  const vipText = (u.role === 'vip' && u.vipExpires)
    ? `VIP หมดอายุ ${new Date(u.vipExpires).toLocaleString('th-TH')}`
    : (u.role === 'admin' ? 'Admin (ดูได้ทุกอย่างฟรี)' : 'สมาชิกทั่วไป');

  await mountPage('', `
    <div class="max-w-2xl mx-auto">
      <h2 class="text-2xl sm:text-3xl font-black mb-1">โปรไฟล์</h2>
      <p class="text-sm text-zinc-500 mb-6">ข้อมูลบัญชีของ ${escapeHtml(u.username)}</p>

      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center font-black text-2xl text-white">${escapeHtml((u.username[0] || '?').toUpperCase())}</div>
          <div>
            <div class="text-xl font-black">${escapeHtml(u.username)}</div>
            <div class="mt-1 flex items-center gap-2 flex-wrap">${roleBadge(u.role)} <span class="text-xs text-zinc-400">${escapeHtml(vipText)}</span></div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-amber-500/10 border border-amber-500/30 rounded p-3">
            <div class="text-xs text-zinc-400">เหรียญ MKW</div>
            <div class="font-black text-amber-400 text-xl">${(u.coins || 0).toLocaleString()}</div>
          </div>
          <div class="bg-zinc-800/50 rounded p-3">
            <div class="text-xs text-zinc-400">ปลดล็อกแล้ว</div>
            <div class="font-bold text-zinc-200 text-xl">${u.unlocked || 0} ตอน</div>
          </div>
        </div>
      </div>

      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold">📜 ประวัติการเติมเงิน / VIP</h3>
          <button id="purchaseRefreshBtn" class="text-xs text-zinc-400 hover:text-white">🔄 รีเฟรช</button>
        </div>
        <div id="purchaseList" class="text-sm">
          <div class="text-center py-6 text-zinc-500 text-xs">กำลังโหลด...</div>
        </div>
      </div>

      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h3 class="font-bold mb-4">🔑 เปลี่ยนรหัสผ่าน</h3>
        <form id="pwForm" class="space-y-4">
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">รหัสผ่านปัจจุบัน</label>
            <input id="cur" type="password" required class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white"/>
          </div>
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">รหัสผ่านใหม่ (ขั้นต่ำ 3 ตัว)</label>
            <input id="new1" type="password" required minlength="3" class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white"/>
          </div>
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">ยืนยันรหัสผ่านใหม่</label>
            <input id="new2" type="password" required minlength="3" class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white"/>
          </div>
          <div id="pwMsg" class="text-sm hidden"></div>
          <button type="submit" class="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">บันทึกรหัสผ่านใหม่</button>
          <p class="text-xs text-zinc-500 text-center">หมายเหตุ: เปลี่ยนรหัสแล้วจะ logout จากอุปกรณ์อื่นทั้งหมด (เครื่องนี้ยังใช้ได้)</p>
        </form>
      </div>
    </div>
  `, 'max-w-[1600px] mx-auto px-4 sm:px-6 py-8');

  $('#pwForm').onsubmit = async e => {
    e.preventDefault();
    const cur = $('#cur').value;
    const n1 = $('#new1').value;
    const n2 = $('#new2').value;
    const msg = $('#pwMsg');
    msg.classList.remove('hidden', 'text-emerald-400', 'text-red-400');
    if (n1 !== n2) { msg.textContent = 'รหัสใหม่ทั้งสองช่องไม่ตรงกัน'; msg.classList.add('text-red-400'); return; }
    try {
      await backendPost('/api/user/change-password', { currentPassword: cur, newPassword: n1 });
      msg.textContent = '✓ เปลี่ยนรหัสผ่านสำเร็จ';
      msg.classList.add('text-emerald-400');
      // อัปเดต remember-me ถ้าเคยติ๊กไว้
      const saved = JSON.parse(localStorage.getItem('mkw_remember') || 'null');
      if (saved && saved.username === auth.user.username) {
        localStorage.setItem('mkw_remember', JSON.stringify({ username: saved.username, password: n1 }));
      }
      $('#pwForm').reset();
    } catch (ex) {
      msg.textContent = ex.message;
      msg.classList.add('text-red-400');
    }
  };

  // Purchase history
  const loadPurchase = async () => {
    const el = $('#purchaseList');
    el.innerHTML = `<div class="text-center py-6 text-zinc-500 text-xs">กำลังโหลด...</div>`;
    try {
      const d = await backendGet('/api/user/purchase-history');
      renderPurchaseHistory(el, d);
    } catch (e) {
      el.innerHTML = errorBanner(e, { title: 'โหลดประวัติไม่สำเร็จ' });
    }
  };
  $('#purchaseRefreshBtn').onclick = loadPurchase;
  loadPurchase();
}

function renderPurchaseHistory(container, d) {
  const topups = (d.topups || []).slice().reverse();  // newest first
  const vip = (d.vip || []).slice().reverse();
  const slips = (d.slips || []).slice().reverse();
  const fmt = iso => {
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? '' : dt.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const statusBadge = s => {
    const map = {
      pending:  'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
    };
    const label = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ถูกปฏิเสธ' }[s] || s;
    return `<span class="text-[10px] font-bold px-2 py-0.5 rounded ${map[s] || 'bg-zinc-700 text-zinc-300'}">${label}</span>`;
  };
  const totalCoin = topups.reduce((s, t) => s + (t.coins || 0), 0);
  const totalSpent = topups.reduce((s, t) => s + (t.pricePaid || 0), 0);
  const totalVipCoins = vip.reduce((s, v) => s + (v.coinsPaid || 0), 0);
  const totalVipDays = vip.reduce((s, v) => s + (v.days || 0), 0);

  let html = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      <div class="bg-zinc-800/50 rounded p-2 text-center">
        <div class="text-[10px] text-zinc-500">เติมสะสม</div>
        <div class="text-lg font-black text-amber-400">${totalCoin.toLocaleString()}</div>
        <div class="text-[10px] text-zinc-500">MKW</div>
      </div>
      <div class="bg-zinc-800/50 rounded p-2 text-center">
        <div class="text-[10px] text-zinc-500">จ่ายจริง</div>
        <div class="text-lg font-black text-zinc-200">฿${totalSpent.toLocaleString()}</div>
      </div>
      <div class="bg-zinc-800/50 rounded p-2 text-center">
        <div class="text-[10px] text-zinc-500">ซื้อ VIP</div>
        <div class="text-lg font-black text-purple-300">${vip.length}</div>
        <div class="text-[10px] text-zinc-500">ครั้ง</div>
      </div>
      <div class="bg-zinc-800/50 rounded p-2 text-center">
        <div class="text-[10px] text-zinc-500">รวม VIP</div>
        <div class="text-lg font-black text-purple-300">${totalVipDays}</div>
        <div class="text-[10px] text-zinc-500">วัน</div>
      </div>
    </div>
  `;

  // Slips (pending/approved/rejected)
  if (slips.length) {
    html += `<div class="mb-3">
      <div class="text-xs text-zinc-500 mb-1.5 font-bold">📋 สลิปที่อัพโหลด (${slips.length})</div>
      <div class="space-y-1.5">
        ${slips.map(s => `
          <div class="bg-zinc-950/50 border border-zinc-800 rounded px-3 py-2 flex items-center gap-2 text-xs">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                ${statusBadge(s.status)}
                <span class="font-bold text-amber-400">+${(s.amount || 0).toLocaleString()} MKW</span>
                <span class="text-zinc-500">${fmt(s.uploadedAt)}</span>
              </div>
              ${s.note ? `<div class="text-zinc-400 mt-0.5">${escapeHtml(s.note)}</div>` : ''}
              ${s.status === 'rejected' && s.rejectReason ? `<div class="text-red-400 mt-0.5">เหตุผล: ${escapeHtml(s.rejectReason)}</div>` : ''}
              ${s.status !== 'pending' && s.approvedAt ? `<div class="text-zinc-600 text-[10px] mt-0.5">ดำเนินการ: ${fmt(s.approvedAt)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  // Topup history (approved/auto)
  if (topups.length) {
    html += `<div class="mb-3">
      <div class="text-xs text-zinc-500 mb-1.5 font-bold">💰 ประวัติเหรียญที่ได้รับ (${topups.length})</div>
      <div class="space-y-1">
        ${topups.slice(0, 20).map(t => `
          <div class="flex items-center justify-between text-xs px-3 py-1.5 bg-zinc-950/50 border border-zinc-800/50 rounded">
            <span class="text-zinc-500">${fmt(t.at)}</span>
            <span class="text-zinc-400 flex-1 mx-2 truncate">${escapeHtml(String(t.packageId || ''))}</span>
            <span class="font-bold text-amber-400">+${(t.coins || 0).toLocaleString()} MKW</span>
          </div>
        `).join('')}
        ${topups.length > 20 ? `<div class="text-[10px] text-zinc-600 text-center pt-1">แสดง 20 รายการล่าสุดจาก ${topups.length}</div>` : ''}
      </div>
    </div>`;
  }

  // VIP purchase history
  if (vip.length) {
    html += `<div>
      <div class="text-xs text-zinc-500 mb-1.5 font-bold">👑 ประวัติ VIP (${vip.length})</div>
      <div class="space-y-1">
        ${vip.map(v => `
          <div class="flex items-center justify-between text-xs px-3 py-1.5 bg-purple-950/20 border border-purple-900/50 rounded">
            <span class="text-zinc-500">${fmt(v.at)}</span>
            <span class="text-purple-200 flex-1 mx-2 truncate">${escapeHtml(v.packageLabel || v.packageId || '')} (${v.days} วัน)</span>
            <span class="font-bold text-purple-300">-${(v.coinsPaid || 0).toLocaleString()} MKW</span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  if (!topups.length && !vip.length && !slips.length) {
    html = `<div class="text-center py-8 text-zinc-500"><div class="text-4xl mb-2">💳</div><p class="text-sm">ยังไม่มีประวัติการเติมเงินหรือซื้อ VIP</p><a href="/topup" class="inline-block mt-3 text-xs text-red-400 hover:underline">ไปหน้าเติมเงิน →</a></div>`;
  }
  container.innerHTML = html;
}

// ============================================================
//
// ============================================================

async function initPrivacyPage() {
  await mountPage('', `
    <article class="max-w-3xl mx-auto prose-invert">
      <h1 class="text-3xl sm:text-4xl font-black mb-2">นโยบายความเป็นส่วนตัว</h1>
      <p class="text-sm text-zinc-500 mb-1">${BRAND}</p>
      <p class="text-xs text-zinc-600 mb-8">อัปเดตล่าสุด: 2 พฤษภาคม 2569</p>

      <p class="text-sm text-zinc-300 leading-relaxed mb-6">${BRAND} (โดย KTCMKW) ให้ความสำคัญกับความเป็นส่วนตัวของผู้ใช้ เอกสารนี้อธิบายวิธีที่เราเก็บ ใช้ เปิดเผย และปกป้องข้อมูลของท่าน โดยอ้างอิงตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) ของประเทศไทย</p>

      <h2 class="text-xl font-bold mt-8 mb-3">1. ข้อมูลที่เราเก็บ</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li><strong class="text-zinc-100">ข้อมูลบัญชี:</strong> username, รหัสผ่าน (เก็บแบบ hash), อีเมล Google (กรณี login ผ่าน OAuth)</li>
        <li><strong class="text-zinc-100">ข้อมูลการใช้งาน:</strong> ประวัติการรับชม รายการที่ปลดล็อก ตอนล่าสุดที่ดูค้างไว้</li>
        <li><strong class="text-zinc-100">ข้อมูลธุรกรรม:</strong> การเติม MKW Coin, การซื้อ VIP, สลิปโอนเงินที่อัพโหลดให้ admin ตรวจ</li>
        <li><strong class="text-zinc-100">ข้อมูลทางเทคนิค:</strong> IP address, User-Agent, เวลาเข้าใช้งาน (สำหรับตรวจการใช้งานผิดปกติ)</li>
        <li><strong class="text-zinc-100">Local Storage:</strong> token เข้าสู่ระบบ, การตั้งค่าแหล่งซีรีส์ (DramaBox / Melolo), ค่าจดจำการเล่นอัตโนมัติ</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">2. วัตถุประสงค์การใช้ข้อมูล</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li>ให้บริการรับชมซีรีส์และบันทึกความคืบหน้าการดู</li>
        <li>ยืนยันตัวตนผ่าน username/password หรือ Google OAuth</li>
        <li>ดำเนินธุรกรรมเหรียญ MKW และสมาชิก VIP</li>
        <li>ปรับปรุงคุณภาพบริการและประสบการณ์การใช้งาน</li>
        <li>ป้องกันการใช้งานผิดปกติ การโจรกรรมบัญชี และการละเมิดข้อกำหนด</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">3. การแชร์ข้อมูลกับบุคคลที่สาม</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li><strong class="text-zinc-100">Google:</strong> เฉพาะข้อมูลที่จำเป็นสำหรับ OAuth login (อีเมล + ชื่อโปรไฟล์)</li>
        <li><strong class="text-zinc-100">ผู้ให้บริการแหล่งซีรีส์ :</strong> ส่งคำขอแบบไม่ระบุตัวตน — ผู้ให้บริการต้นทางจะไม่ทราบว่าเป็นผู้ใช้คนใดของเรา</li>
        <li><strong class="text-zinc-100">หน่วยงานราชการ:</strong> เปิดเผยตามที่กฎหมายไทยกำหนดเท่านั้น</li>
      </ul>
      <p class="text-sm text-zinc-300 mt-3"><strong class="text-zinc-100">เราไม่ขายข้อมูลของท่านให้ผู้ใด</strong></p>

      <h2 class="text-xl font-bold mt-8 mb-3">4. สิทธิของเจ้าของข้อมูล</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li>ขอเข้าถึงและขอสำเนาข้อมูลของท่าน</li>
        <li>ขอแก้ไขข้อมูลที่ไม่ถูกต้อง (ผ่านหน้า /profile)</li>
        <li>ขอให้ลบข้อมูล / บัญชี (Right to be Forgotten)</li>
        <li>ขอให้ระงับหรือคัดค้านการประมวลผล</li>
        <li>เพิกถอนความยินยอมเมื่อใดก็ได้</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">5. ระยะเวลาเก็บข้อมูล</h2>
      <p class="text-sm text-zinc-300 leading-relaxed">ข้อมูลบัญชีจะถูกเก็บตราบเท่าที่บัญชียังใช้งาน หรือจนกว่าผู้ใช้จะขอให้ลบ ข้อมูลธุรกรรมจะเก็บตามที่กฎหมายภาษีกำหนด หลังจากนั้นจะถูกลบออก</p>

      <h2 class="text-xl font-bold mt-8 mb-3">6. การรักษาความปลอดภัย</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li>การเชื่อมต่อเข้ารหัสด้วย HTTPS / TLS</li>
        <li>รหัสผ่านเก็บในรูปแบบ hash (ไม่ใช่ plain text)</li>
        <li>Session token หมดอายุได้ — admin บังคับ logout จากเครื่องอื่นได้</li>
        <li>จำกัดการเข้าถึงข้อมูลเฉพาะ admin ของระบบ</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">7. ติดต่อ</h2>
      <p class="text-sm text-zinc-300 leading-relaxed">หากมีคำถามเกี่ยวกับข้อมูลส่วนบุคคลหรือต้องการใช้สิทธิตาม PDPA กรุณาติดต่อ admin ผ่านช่องทางที่ระบุในเว็บไซต์ ทีมงานจะตอบกลับภายใน 30 วัน</p>

      <div class="mt-12 pt-6 border-t border-zinc-800 text-xs text-zinc-500">
      </div>
    </article>
  `, 'max-w-[1600px] mx-auto px-4 sm:px-6 py-8 sm:py-12');
}

async function initTermsPage() {
  await mountPage('', `
    <article class="max-w-3xl mx-auto">
      <h1 class="text-3xl sm:text-4xl font-black mb-2">ข้อกำหนดการใช้งาน</h1>
      <p class="text-sm text-zinc-500 mb-1">${BRAND}</p>
      <p class="text-xs text-zinc-600 mb-8">อัปเดตล่าสุด: 2 พฤษภาคม 2569</p>

      <h2 class="text-xl font-bold mt-8 mb-3">1. การยอมรับข้อกำหนด</h2>
      <p class="text-sm text-zinc-300 leading-relaxed">การสมัครสมาชิก เข้าสู่ระบบ หรือใช้งาน ${BRAND} ในรูปแบบใดก็ตาม ถือว่าท่านได้อ่านและยอมรับข้อกำหนดทั้งหมดในเอกสารนี้ หากไม่ยอมรับ กรุณาหยุดใช้บริการทันที</p>

      <h2 class="text-xl font-bold mt-8 mb-3">2. คุณสมบัติผู้ใช้</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li>อายุขั้นต่ำ 13 ปี (อายุต่ำกว่า 18 ปีต้องได้รับความยินยอมจากผู้ปกครอง)</li>
        <li>ห้ามใช้งานหากบัญชีของท่านถูกระงับหรือยกเลิก</li>
        <li>ต้องให้ข้อมูลที่ถูกต้องและเป็นปัจจุบัน</li>
        <li>ผู้ใช้รับผิดชอบความปลอดภัยของบัญชีตนเอง — ห้ามแชร์รหัสผ่าน</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">3. เนื้อหาและการรับชม</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li>เว็บไซต์รวบรวมซีรีส์จากหลายแพลตฟอร์ม (DramaBox, Melolo) ผ่าน API ที่ได้รับอนุญาต</li>
        <li>บางตอนรับชมได้ฟรี ส่วนที่เหลือต้องใช้ MKW Coin หรือสมาชิก VIP</li>
        <li>เราสงวนสิทธิ์เปลี่ยนแปลง เพิ่ม หรือถอนเนื้อหาได้ตลอดเวลาโดยไม่แจ้งล่วงหน้า</li>
        <li>ห้ามบันทึก คัดลอก ทำซ้ำ หรือเผยแพร่เนื้อหาในเชิงพาณิชย์</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">4. MKW Coin และการชำระเงิน</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li>1 บาท = 1 MKW Coin (ใช้ปลดล็อกตอนละ 1 coin หรือซื้อ VIP)</li>
        <li>ชำระเงินผ่านการโอนและอัพโหลดสลิปให้ admin ตรวจสอบก่อนเติมเหรียญ</li>
        <li>เหรียญที่ซื้อแล้วไม่สามารถขอคืนเงินได้ ยกเว้นกรณีที่ระบบมีข้อผิดพลาด</li>
        <li>เหรียญและสมาชิก VIP ใช้ได้เฉพาะในเว็บไซต์นี้ ห้ามโอนหรือขายต่อ</li>
        <li>ตอนที่ปลดล็อกแล้วจะเข้าถึงได้ตราบที่บัญชียังใช้งาน</li>
        <li>ราคาแพ็กเกจและโปรโมชั่นอาจเปลี่ยนแปลงได้โดยไม่แจ้งล่วงหน้า</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">5. พฤติกรรมที่ห้าม</h2>
      <ul class="list-disc list-inside space-y-1 text-sm text-zinc-300">
        <li>ใช้บริการเพื่อกระทำผิดกฎหมายหรือละเมิดสิทธิของผู้อื่น</li>
        <li>ใช้ bot, scraper, หรือเครื่องมืออัตโนมัติเพื่อโกงระบบ</li>
        <li>สร้างบัญชีปลอม ใช้บัญชีของผู้อื่น หรือแชร์บัญชีกับบุคคลที่สาม</li>
        <li>ขายต่อบัญชี เหรียญ MKW หรือสมาชิก VIP</li>
        <li>ละเมิดลิขสิทธิ์ หรือเผยแพร่เนื้อหาผิดศีลธรรม</li>
      </ul>

      <h2 class="text-xl font-bold mt-8 mb-3">6. การระงับและยกเลิกบัญชี</h2>
      <p class="text-sm text-zinc-300 leading-relaxed">เราสงวนสิทธิ์ระงับหรือยกเลิกบัญชีของท่านได้ทันทีโดยไม่แจ้งล่วงหน้า หากตรวจพบการละเมิดข้อกำหนด เหรียญและสิทธิ์ต่างๆ ในบัญชีจะถูกยกเลิกโดยไม่คืนเงิน</p>

      <h2 class="text-xl font-bold mt-8 mb-3">7. ข้อจำกัดความรับผิด</h2>
      <p class="text-sm text-zinc-300 leading-relaxed">บริการให้ "ตามสภาพ" (As-is) เราไม่รับผิดต่อความเสียหายโดยอ้อม การหยุดชะงักของบริการ การสูญเสียข้อมูล หรือเนื้อหาที่ถูกแก้ไข/ระงับโดยแพลตฟอร์มต้นทาง ความรับผิดรวมจำกัดไม่เกินจำนวนเงินที่ผู้ใช้ชำระภายใน 12 เดือนล่าสุด</p>

      <h2 class="text-xl font-bold mt-8 mb-3">8. การเปลี่ยนแปลงข้อกำหนด</h2>
      <p class="text-sm text-zinc-300 leading-relaxed">เราอาจปรับปรุงข้อกำหนดได้ตามความเหมาะสม โดยจะประกาศบนเว็บไซต์ การใช้งานต่อหลังจากนั้นถือว่าท่านยอมรับฉบับใหม่</p>

      <h2 class="text-xl font-bold mt-8 mb-3">9. กฎหมายที่ใช้บังคับ</h2>
      <p class="text-sm text-zinc-300 leading-relaxed">ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย ข้อพิพาทใดๆ ให้ดำเนินการที่ศาลไทยเท่านั้น</p>

      <div class="mt-12 pt-6 border-t border-zinc-800 text-xs text-zinc-500">
      </div>
    </article>
  `, 'max-w-[1600px] mx-auto px-4 sm:px-6 py-8 sm:py-12');
}
