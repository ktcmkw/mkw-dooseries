// ============================================================
// MKW - dooseries — assets/app.js
// API: seriesjeen (via /proxy/*) + local backend (/api/*)
// ============================================================

const API_BASE = '/proxy/api/platform/dramabox';
const PAGE_SIZE = 40;
const BRAND = 'MKW - dooseries';

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

// ---------- API clients ----------
async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} — ${path}`);
    err.status = res.status; err.endpoint = path; err.body = body.slice(0, 400);
    throw err;
  }
  return res.json();
}

async function backendGet(path) {
  const res = await fetch(path, { headers: auth.headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

async function backendPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { ...auth.headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

async function backendDelete(path) {
  const res = await fetch(path, { method: 'DELETE', headers: auth.headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
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
    return this.data;
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

// ---------- Heartbeat (อัปเดต lastSeenAt ทุก 60 วิ) ----------
let _heartbeatTimer = null;
function startHeartbeat() {
  if (_heartbeatTimer || !auth.token) return;
  // ถ้า admin ปิด tracking → ข้าม heartbeat ทั้งหมด (ลดภาระ server)
  if (publicConfig.data?.trackingDisabled) return;
  _heartbeatTimer = setInterval(() => {
    if (!auth.token) return;
    if (publicConfig.data?.trackingDisabled) return;  // respect toggle ระหว่าง session
    fetch('/api/auth/heartbeat', { method: 'POST', headers: auth.headers() }).catch(() => {});
  }, 60_000);
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
          <span class="text-xs text-zinc-400">เหรียญ NSV</span>
          <span class="font-bold text-amber-400">🪙 ${(u.coins || 0).toLocaleString()}</span>
        </div>
      </div>
      <div class="py-2 text-sm">
        <a href="/profile" class="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800"><span>👤</span><span>โปรไฟล์ / รหัสผ่าน</span></a>
        <a href="/history" class="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800"><span>🕐</span><span>ประวัติการดู</span></a>
        <a href="/topup" class="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800"><span>💰</span><span>เติมเงิน / VIP</span></a>
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
        <a href="/topup" class="text-xs px-2.5 sm:px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold whitespace-nowrap shrink-0">💰<span class="hidden sm:inline ml-1">เติมเงิน</span></a>
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

// Global click delegation — one registration for all pages/renders
document.addEventListener('click', e => {
  const um = document.getElementById('userMenu');
  const mm = document.getElementById('mobileMenu');
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
      <p>${BRAND}</p>
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

function dramaCard(d) {
  const rawId = String(d.series_id || d.bookId || '');
  // ซ่อนซีรีส์ที่ admin ตั้ง hidden ไว้ (admin ยังเห็นจาก backend แต่ frontend filter หมดทุก role)
  if (publicConfig.data && publicConfig.hiddenBookSet().has(rawId) && auth.user?.role !== 'admin') return '';
  const id = encodeURIComponent(rawId);
  const title = d.title || d.bookName || '';
  const cover = d.cover || d.coverWap || '';
  const n = d.episode_count || d.chapterCount || 0;
  const firstGenre = (d.genre || '').split(',')[0].trim();
  const tLower = title.toLowerCase();
  const isThaiDub = title.includes('พากย์ไทย') || tLower.includes('thai dub');
  const isSubThai = !isThaiDub && (tLower.includes('subthai') || tLower.includes('sub thai') || tLower.includes('ซับไทย'));
  const langBadge = isThaiDub
    ? '<div class="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded shadow">พากย์ไทย</div>'
    : isSubThai
      ? '<div class="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded shadow">SUBTHAI</div>'
      : '';
  return `
    <a href="/detail?bookId=${id}${n ? `&n=${n}` : ''}" class="card cursor-pointer block">
      <div class="relative card-img rounded-lg overflow-hidden bg-zinc-900">
        <img src="${escapeHtml(cover)}" alt="" loading="lazy" class="w-full h-full object-cover" onerror="this.style.opacity=0"/>
        <div class="absolute inset-0 gradient-fade"></div>
        ${langBadge}
        <div class="absolute bottom-2 left-2 right-2">
          <div class="text-white font-bold text-sm leading-tight glow-text line-clamp-2">${escapeHtml(title)}</div>
          <div class="text-zinc-300 text-[11px] mt-0.5 glow-text">${n} ตอน${firstGenre ? ' • ' + escapeHtml(firstGenre) : ''}</div>
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
  startHeartbeat();
  return main;
}

// ============================================================
// Browse pages
// ============================================================

async function initBrowsePage(opts) {
  const filterBarHtml = opts.filterBar ? `
    <div class="flex gap-2 flex-wrap mb-4">
      ${opts.filterBar.items.map(f => `
        <a href="${opts.filterBar.basePath}?filter=${f.key}" class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${f.key === opts.filterBar.active ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}">${escapeHtml(f.label)}</a>
      `).join('')}
    </div>` : '';
  await mountPage(opts.active, `
    <h2 class="text-2xl sm:text-3xl font-black tracking-tight mb-1">${escapeHtml(opts.title)}</h2>
    <p class="text-sm text-zinc-500 mb-4">${escapeHtml(opts.subtitle || '')}</p>
    ${filterBarHtml}
    <div id="msg"></div>
    <div id="grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"></div>
    <div id="pagination"></div>
  `);
  const grid = $('#grid');
  grid.innerHTML = skeletonGrid();
  try {
    const res = await apiGet(opts.endpoint);
    const list = pickList(res);
    renderGrid(grid, list);
    const total = res?.total ? ` จากทั้งหมด ${res.total.toLocaleString()}` : '';
    $('#msg').innerHTML = `<div class="text-sm text-zinc-500 mb-3">${list.length} เรื่อง${total}</div>`;
    if (opts.pagination && res.total) {
      const totalPages = Math.ceil(res.total / opts.pagination.size);
      $('#pagination').innerHTML = renderPagination(opts.pagination.page, totalPages, opts.pagination.basePath, opts.pagination.basePathSep);
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
  const filters = [
    { key: 'all',    label: 'ทั้งหมด',    endpoint: p => `/list?page=${p}&page_size=${size}` },
    { key: 'thai',   label: 'พากย์ไทย',   endpoint: p => `/search?keyword=${encodeURIComponent('พากย์ไทย')}&page=${p}&page_size=${size}` },
    { key: 'anime',  label: 'การ์ตูน',     endpoint: p => `/genre/3744?page=${p}&page_size=${size}` },
    { key: 'vip',    label: 'VIP',        endpoint: p => `/genre/1265?page=${p}&page_size=${size}` },
  ];
  const active = filters.find(f => f.key === filter) || filters[0];

  await initBrowsePage({
    active: 'home', title: 'หน้าแรก', subtitle: `ซีรีส์ ${active.label} • หน้าละ ${size} เรื่อง (เรียงใหม่→เก่า)`,
    endpoint: active.endpoint(page),
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
  return initBrowsePage({ active: 'vip', title: 'VIP / ท่านประธาน', subtitle: 'ซีรีส์แนว Billionaire / CEO',
    endpoint: `/search?keyword=Billionaire&page=1&page_size=${PAGE_SIZE}` });
}
function initRecommendPage() {
  return initBrowsePage({ active: 'recommend', title: 'แนะนำสำหรับคุณ', subtitle: 'ซีรีส์โรแมนซ์ยอดนิยม',
    endpoint: `/search?keyword=Romance&page=1&page_size=${PAGE_SIZE}` });
}

// ============================================================
// Search page
// ============================================================

async function initSearchPage() {
  const initialQ = qs('q') || '';
  await mountPage('search', `
    <h2 class="text-2xl sm:text-3xl font-black tracking-tight mb-1">ค้นหาซีรีส์</h2>
    <p class="text-sm text-zinc-500 mb-5">พิมพ์ชื่อ, แนว หรือคำค้นหา (รองรับ TH / EN)</p>
    <form id="searchForm" class="flex gap-2 mb-6">
      <input id="searchInput" type="text" value="${escapeHtml(initialQ)}" placeholder="เช่น love, ความรัก, ซีอีโอ..." class="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-red-500 text-white placeholder-zinc-500"/>
      <button class="px-6 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">ค้นหา</button>
    </form>
    <div id="msg"></div>
    <div id="grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"></div>
  `);
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
    const res = await apiGet(`/search?keyword=${encodeURIComponent(q)}&page=1&page_size=${PAGE_SIZE}`);
    const list = pickList(res);
    const total = res?.total ? ` จากทั้งหมด ${res.total.toLocaleString()}` : '';
    msg.innerHTML = `<div class="text-sm text-zinc-500 mb-3">พบ ${list.length} เรื่อง${total} สำหรับ "${escapeHtml(q)}"</div>`;
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
    <h2 class="text-2xl sm:text-3xl font-black tracking-tight mb-1">หมวดหมู่</h2>
    <p class="text-sm text-zinc-500 mb-5">เลือกแนวที่ชอบ</p>
    <div id="catBar" class="flex gap-2 flex-wrap pb-2 mb-5"></div>
    <div id="msg"></div>
    <div id="grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"></div>
  `);
  const bar = $('#catBar');
  bar.innerHTML = '<div class="skeleton h-8 w-20 rounded-full"></div>'.repeat(12);

  let cats = [];
  try { cats = await apiGet('/genres'); }
  catch (e) {
    bar.innerHTML = '';
    $('#msg').innerHTML = errorBanner(e, { title: 'โหลดหมวดหมู่ไม่สำเร็จ', retryId: 'retryBtn' });
    const btn = $('#retryBtn'); if (btn) btn.onclick = () => location.reload();
    return;
  }
  cats.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const initialId = qs('id') || (cats[0]?.id);
  bar.innerHTML = cats.map(c =>
    `<button data-id="${c.id}" class="chip cat-btn px-3 py-1.5 text-sm rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-medium ${String(c.id) === String(initialId) ? 'active' : ''}">${escapeHtml(c.name)}</button>`
  ).join('');
  $$('.cat-btn').forEach(b => b.onclick = () => loadCategory(b.dataset.id, cats));
  if (initialId) loadCategory(initialId, cats);
}

async function loadCategory(id, cats) {
  history.replaceState(null, '', `/category?id=${encodeURIComponent(id)}`);
  $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.id === String(id)));
  const grid = $('#grid');
  const msg = $('#msg');
  grid.innerHTML = skeletonGrid();
  msg.innerHTML = '';
  try {
    const res = await apiGet(`/genre/${encodeURIComponent(id)}?page=1&page_size=${PAGE_SIZE}`);
    const list = pickList(res);
    const cat = cats.find(c => String(c.id) === String(id));
    const total = res?.total ? ` (ทั้งหมด ${res.total.toLocaleString()})` : '';
    msg.innerHTML = `<div class="text-sm text-zinc-500 mb-3"><strong class="text-zinc-200">${escapeHtml(cat?.name || '')}</strong> • ${list.length} เรื่อง${total}</div>`;
    renderGrid(grid, list);
  } catch (e) {
    grid.innerHTML = '';
    msg.innerHTML = errorBanner(e, { title: 'โหลดหมวด ' + id + ' ไม่สำเร็จ', retryId: 'retryBtn' });
    const btn = $('#retryBtn'); if (btn) btn.onclick = () => loadCategory(id, cats);
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

  const [detailRes, episodesRes] = await Promise.allSettled([
    apiGet(`/detail?bookId=${encodeURIComponent(bookId)}`),
    apiGet(`/allepisode?bookId=${encodeURIComponent(bookId)}`),
  ]);

  const detail = detailRes.status === 'fulfilled' ? detailRes.value : null;
  const detailErr = detailRes.status === 'rejected' ? detailRes.reason : null;
  const episodes = episodesRes.status === 'fulfilled' ? (Array.isArray(episodesRes.value) ? episodesRes.value : []) : [];
  const epsErr = episodesRes.status === 'rejected' ? episodesRes.reason : null;

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
  let chaptersHtml = '';
  if (count > 0) {
    let buttons = '';
    for (let i = 1; i <= count; i++) {
      const ep = episodes.find(e => e.chapterIndex === i);
      const charge = (!hidePaywallIcon && ep?.isCharge) ? '<span class="absolute top-0.5 right-1 text-[9px]">💰</span>' : '';
      buttons += `<a href="/play?bookId=${encodeURIComponent(bookId)}&index=${i}&n=${count}" class="relative px-3 py-2 bg-zinc-800 hover:bg-red-600 hover:text-white rounded text-sm text-center transition-colors">EP ${i}${charge}</a>`;
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
        resumeHtml = `<a href="/play?bookId=${encodeURIComponent(bookId)}&index=${h.entry.index}${count ? `&n=${count}` : ''}" class="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black py-2.5 rounded-lg font-bold text-center">▶ ดูต่อ EP ${h.entry.index}</a>`;
      }
    } catch {}
  }

  $('#content').innerHTML = `
    ${detailErr ? errorBanner(detailErr, { title: '/detail ตอบ error' }) : ''}
    ${epsErr ? errorBanner(epsErr, { title: '/allepisode ตอบ error' }) : ''}
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
          </div>
          <div class="bg-zinc-800/50 rounded p-3">
            <div class="text-zinc-500">ตอนทั้งหมด</div>
            <div class="text-zinc-200">${count} ตอน</div>
          </div>
        </div>` : ''}
        <div class="flex gap-2 mb-6">
          ${resumeHtml}
          <a href="/play?bookId=${encodeURIComponent(bookId)}&index=1${count > 0 ? `&n=${count}` : ''}" class="flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white py-2.5 rounded-lg font-semibold text-center">▶ เล่น EP1</a>
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
  document.body.insertAdjacentHTML('afterbegin', renderHeader(''));
  renderAnnouncementBanner();
  startHeartbeat();
  const main = document.createElement('main');
  main.className = 'max-w-[1400px] mx-auto px-6 py-8';
  document.body.appendChild(main);
  document.body.insertAdjacentHTML('beforeend', renderFooter());

  const bookId = qs('bookId');
  const index = parseInt(qs('index') || '1', 10);

  if (!bookId || isNaN(index) || index < 1) {
    main.innerHTML = errorBanner({ message: 'URL ต้องมี ?bookId=xxx&index=1' }, { title: 'พารามิเตอร์ไม่ครบ' });
    return;
  }

  main.innerHTML = `
    <a href="/detail?bookId=${encodeURIComponent(bookId)}" class="text-sm text-zinc-400 hover:text-white mb-4 inline-block">← กลับหน้ารายละเอียด</a>
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

  // 1) Fetch detail (for bookName) + episode list parallel
  const [detailRes, episodesRes] = await Promise.allSettled([
    apiGet(`/detail?bookId=${encodeURIComponent(bookId)}`),
    apiGet(`/allepisode?bookId=${encodeURIComponent(bookId)}`),
  ]);
  const detail = detailRes.status === 'fulfilled' ? detailRes.value : null;
  const bookName = detail?.bookName || '(ไม่ทราบชื่อ)';
  const isAdmin = auth.user?.role === 'admin';
  const u = auth.user;

  // user status block (มุมขวาของ meta)
  const userStatusHtml = u ? `
    <div class="ml-auto flex items-center gap-2 text-xs flex-wrap">
      ${roleBadge(u.role)}
      ${u.role === 'vip' && u.vipExpires ? `<span class="text-amber-300">หมดอายุ ${new Date(u.vipExpires).toLocaleDateString('th-TH')}</span>` : ''}
      <span class="text-amber-400 font-bold">🪙 ${(u.coins || 0).toLocaleString()} NSV</span>
      <span class="text-zinc-400">@${escapeHtml(u.username)}</span>
    </div>
  ` : `<div class="ml-auto text-xs text-zinc-500">ยังไม่ได้ login • <a href="/login?next=${encodeURIComponent(location.pathname + location.search)}" class="text-red-400 hover:underline">เข้าสู่ระบบ</a></div>`;

  $('#meta').innerHTML = `
    <div class="flex items-center gap-3 flex-wrap">
      <h2 class="text-xl sm:text-2xl font-black">EP ${index} — <span class="text-zinc-300">${escapeHtml(bookName)}</span></h2>
      ${userStatusHtml}
    </div>
    ${isAdmin ? `<div class="text-xs text-zinc-500 font-mono mt-1">bookId: ${escapeHtml(bookId)} <span class="text-red-400">(admin)</span></div>` : ''}
  `;

  if (episodesRes.status === 'rejected') {
    showPlayerError('โหลดรายการตอนไม่สำเร็จ', episodesRes.reason?.message || '');
    return;
  }
  const episodes = Array.isArray(episodesRes.value) ? episodesRes.value : [];

  const ep = episodes.find(e => e.chapterIndex === index);
  const total = episodes.length || parseInt(qs('n') || '0', 10);

  // Ep navigation — ซ่อน 💰 จาก vip/admin หรือเมื่อเปิดโปรโมชั่นดูฟรีทั้งเว็บ
  const hidePaywallIcon = publicConfig.isFreeMode() || (u && (u.role === 'admin' || u.role === 'vip'));
  if (total > 1) {
    $('#navHeader').classList.remove('hidden');
    let html = '';
    for (let i = 1; i <= total; i++) {
      const e = episodes.find(x => x.chapterIndex === i);
      const charge = (!hidePaywallIcon && e?.isCharge) ? '<span class="text-[9px] text-amber-400 ml-0.5">💰</span>' : '';
      const cls = i === index ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300';
      html += `<a href="/play?bookId=${encodeURIComponent(bookId)}&index=${i}&n=${total}" data-idx="${i}" class="${cls} px-3 py-1.5 rounded text-sm font-medium">${i}${charge}</a>`;
    }
    $('#navEp').innerHTML = html;
    $$('#navEp a').forEach(a => a.onclick = ev => {
      ev.preventDefault();
      goToEpisode(parseInt(a.dataset.idx, 10), { bookId, total, episodes, detail });
    });
  }

  if (!ep) { showPlayerError(`ไม่พบ EP ${index}`, `มีทั้งหมด ${episodes.length} ตอน`); return; }

  // Popstate (back/forward) → transition in place
  window.addEventListener('popstate', () => {
    const newIdx = parseInt(qs('index') || '1', 10);
    goToEpisode(newIdx, { bookId, total, episodes, detail });
  });

  // 2) Access check (server-side)
  let access;
  try {
    access = await backendGet(`/api/access?bookId=${encodeURIComponent(bookId)}&index=${index}`);
  } catch (e) {
    showPlayerError('ตรวจสิทธิ์ไม่ได้', e.message);
    return;
  }

  // 3) Combined check — API's isCharge ก็ถือเป็น "ต้องการ coin/VIP"
  //    ถ้า user เป็น admin/vip → บังคับให้ผ่าน (override isCharge ด้วย)
  //    ถ้า freeMode ON → ผ่านหมด (override ทุกเงื่อนไข)
  const isFree = access.freeMode || publicConfig.isFreeMode();
  const effectivelyLocked = !isFree && (!access.allowed || (ep.isCharge && !(u && (u.role === 'admin' || u.role === 'vip'))));

  if ((access.allowed && !effectivelyLocked) || isFree) {
    // Log history ก่อนเล่น (ต้อง login)
    if (u) {
      backendPost('/api/history/log', {
        bookId, index: ep.chapterIndex,
        bookName: detail?.bookName || '',
        cover: detail?.coverWap || detail?.cover || '',
      }).catch(() => {});
    }
    return playEpisode(ep, { bookId, total, episodes, detail });
  }

  // 4) Show gate (login / upgrade / pay)
  return renderAccessGate(bookId, index, ep, access, u);
}

// In-place ตอนถัดไป — ไม่โหลดหน้าใหม่ (TikTok-style smooth transition)
async function goToEpisode(newIndex, ctx) {
  const { bookId, total, episodes, detail } = ctx;
  const ep = episodes.find(e => e.chapterIndex === newIndex);
  if (!ep) return;

  // Update URL ไม่ reload
  const newUrl = `/play?bookId=${encodeURIComponent(bookId)}&index=${newIndex}&n=${total}`;
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
      <span class="text-amber-400 font-bold">🪙 ${(u.coins || 0).toLocaleString()} NSV</span>
      <span class="text-zinc-400">@${escapeHtml(u.username)}</span>
    </div>
  ` : `<div class="ml-auto text-xs text-zinc-500">ยังไม่ได้ login • <a href="/login?next=${encodeURIComponent(location.pathname + location.search)}" class="text-red-400 hover:underline">เข้าสู่ระบบ</a></div>`;

  $('#meta').innerHTML = `
    <div class="flex items-center gap-3 flex-wrap">
      <h2 class="text-xl sm:text-2xl font-black">EP ${newIndex} — <span class="text-zinc-300">${escapeHtml(bookName)}</span></h2>
      ${userStatusHtml}
    </div>
    ${isAdmin ? `<div class="text-xs text-zinc-500 font-mono mt-1">bookId: ${escapeHtml(bookId)} <span class="text-red-400">(admin)</span></div>` : ''}
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
    access = await backendGet(`/api/access?bookId=${encodeURIComponent(bookId)}&index=${newIndex}`);
  } catch (e) {
    showPlayerError('ตรวจสิทธิ์ไม่ได้', e.message);
    return;
  }
  const isFree = access.freeMode || publicConfig.isFreeMode();
  const effectivelyLocked = !isFree && (!access.allowed || (ep.isCharge && !(u && (u.role === 'admin' || u.role === 'vip'))));
  if ((access.allowed && !effectivelyLocked) || isFree) {
    if (u) {
      backendPost('/api/history/log', {
        bookId, index: newIndex,
        bookName, cover: detail?.coverWap || detail?.cover || '',
      }).catch(() => {});
    }
    return playEpisode(ep, ctx);
  }
  return renderAccessGate(bookId, newIndex, ep, access, u);
}

function showPlayerError(title, detail) {
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

function renderAccessGate(bookId, index, ep, access, user) {
  const reason = access.reason || (ep.isCharge ? 'need_coin' : 'unknown');

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
    $('#videoWrap').innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-center p-6">
        <div>
          <div class="text-5xl mb-3">🔒</div>
          <div class="font-bold text-zinc-200 mb-2">EP ${index} ล็อกไว้</div>
          <div class="text-sm text-zinc-400 mb-4">ต้อง login ก่อนถึงดูได้</div>
          <a href="/login?next=${encodeURIComponent(location.pathname + location.search)}" class="inline-block px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold">เข้าสู่ระบบ</a>
          <a href="/register" class="inline-block ml-2 px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold">สมัคร</a>
        </div>
      </div>`;
    return;
  }

  if (reason === 'need_coin') {
    const cost = access.cost || 50;
    const haveEnough = (user.coins || 0) >= cost;
    $('#videoWrap').innerHTML = `
      <div class="w-full h-full flex items-center justify-center text-center p-6">
        <div>
          <div class="text-5xl mb-3">🪙</div>
          <div class="font-bold text-zinc-200 mb-1">EP ${index} ต้องปลดล็อก</div>
          <div class="text-sm text-zinc-400 mb-1">ราคา: <strong class="text-amber-400">${cost} NSV Coin</strong></div>
          <div class="text-xs text-zinc-500 mb-4">เหรียญของคุณ: ${(user.coins || 0).toLocaleString()} NSV</div>
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
  // ลอง URL ตามลำดับ — ไม่แสดง URL/quality ให้ user เห็น (ป้องกัน copy/download)
  const urls = [ep['1080p'], ep.videoUrl, ep['540p']].filter(Boolean);
  if (!urls.length) {
    showPlayerError('ไม่พบ URL วิดีโอ', '');
    return;
  }

  const wrap = $('#videoWrap');
  let video = wrap.querySelector('#player');
  if (!video) {
    wrap.innerHTML = `<video id="player" controls playsinline class="w-full h-full" controlslist="nodownload" oncontextmenu="return false"></video>`;
    video = wrap.querySelector('#player');
  } else if (video._ctrl) {
    // ยกเลิก listeners เก่า — ไม่ replace element เพื่อรักษา fullscreen state
    video._ctrl.abort();
  }

  const ctrl = new AbortController();
  video._ctrl = ctrl;
  let attemptIdx = 0;

  function tryPlay() {
    if (attemptIdx >= urls.length) {
      $('#msg').innerHTML = `<div class="error-banner rounded-lg p-3 text-sm">เล่นไม่ได้ — ลองทุก URL แล้ว</div>`;
      return;
    }
    video.src = urls[attemptIdx];
    video.play().catch(() => {/* autoplay อาจโดน block */});
  }
  video.addEventListener('error', () => {
    attemptIdx++;
    if (attemptIdx < urls.length) tryPlay();
  }, { signal: ctrl.signal });
  tryPlay();

  // Auto-next + next ep button
  setupAutoNext(ep, video, ctx, ctrl);
}

function setupAutoNext(ep, video, ctx, ctrl) {
  if (!ctx) return;
  const { bookId, total, episodes } = ctx;
  const nextEp = episodes.find(e => e.chapterIndex === ep.chapterIndex + 1);
  const prevEp = episodes.find(e => e.chapterIndex === ep.chapterIndex - 1);
  let autoNext = localStorage.getItem('mkw_autonext') !== '0'; // default on

  // Preload วิดีโอตอนถัดไปไว้ใน browser cache → swap แล้วเริ่มเล่นได้ทันที
  if (nextEp) {
    const nextUrl = nextEp['1080p'] || nextEp.videoUrl || nextEp['540p'];
    if (nextUrl) {
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
  if (prevEp && $('#prevEpBtn')) $('#prevEpBtn').onclick = () => goToEpisode(prevEp.chapterIndex, ctx);
  if (nextEp && $('#nextEpBtn')) $('#nextEpBtn').onclick = () => goToEpisode(nextEp.chapterIndex, ctx);

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
      <p class="text-sm text-zinc-500 mb-6">1 บาท = 1 NSV Coin • ปลดล็อกตอนละ 50 coin • หรือสมัคร VIP ดูฟรีทุกตอน</p>

      <div class="grid sm:grid-cols-2 gap-3 mb-8">
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div class="text-sm text-zinc-400">เหรียญของคุณ</div>
          <div class="text-3xl font-black text-amber-400">${(u.coins || 0).toLocaleString()} <span class="text-base">NSV</span></div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div class="text-sm text-zinc-400">สถานะสมาชิก</div>
          <div class="mt-1 flex items-center gap-2 flex-wrap">${roleBadge(u.role)} ${vipText}</div>
        </div>
      </div>

      <h3 class="font-bold text-lg mb-3">⭐ แลก VIP ด้วยเหรียญ</h3>
      <p class="text-xs text-zinc-500 mb-3">VIP ดูทุกตอนฟรีตลอดอายุสมาชิก (ต่ออายุได้)</p>
      <div id="vipPackages" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"></div>

      <h3 class="font-bold text-lg mb-3">💰 เติม NSV Coin</h3>
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
      <div class="text-xs text-zinc-400">NSV Coin</div>
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
    $('#slipNote').value = `เติม ${coins.toLocaleString()} NSV Coin`;
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

  // Giftcard
  $('#giftForm').onsubmit = async e => {
    e.preventDefault();
    const code = $('#giftCode').value.trim().toUpperCase();
    if (!code) return;
    try {
      const r = await backendPost('/api/giftcard/redeem', { code });
      $('#msg').innerHTML = `<div class="info-banner rounded-lg p-4"><div class="font-bold mb-1">🎁 แลก Gift Card สำเร็จ</div><div class="text-sm">+${r.coinsAdded.toLocaleString()} NSV Coin • ยอดรวม ${r.newBalance.toLocaleString()} NSV</div></div>`;
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
      ${history.map(h => `
        <div class="relative group">
          <a href="/play?bookId=${encodeURIComponent(h.bookId)}&index=${h.index}" class="card block">
            <div class="relative card-img rounded-lg overflow-hidden bg-zinc-900">
              <img src="${escapeHtml(h.cover || '')}" class="w-full h-full object-cover" loading="lazy" onerror="this.style.opacity=0"/>
              <div class="absolute inset-0 gradient-fade"></div>
              <div class="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-black text-[11px] font-bold rounded">EP ${h.index}</div>
              <div class="absolute bottom-2 left-2 right-2">
                <div class="text-white font-bold text-sm leading-tight glow-text line-clamp-2">${escapeHtml(h.bookName || '(ไม่ทราบชื่อ)')}</div>
                <div class="text-zinc-300 text-[11px] mt-0.5 glow-text">${escapeHtml((h.at || '').slice(0, 10))}</div>
              </div>
            </div>
          </a>
          <button class="del-hist absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-70" data-bid="${escapeHtml(h.bookId)}" data-name="${escapeHtml(h.bookName || '')}" title="ลบจากประวัติ">✕</button>
        </div>
      `).join('')}
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
            <div class="text-xs text-zinc-400">เหรียญ NSV</div>
            <div class="font-black text-amber-400 text-xl">${(u.coins || 0).toLocaleString()}</div>
          </div>
          <div class="bg-zinc-800/50 rounded p-3">
            <div class="text-xs text-zinc-400">ปลดล็อกแล้ว</div>
            <div class="font-bold text-zinc-200 text-xl">${u.unlocked || 0} ตอน</div>
          </div>
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
}
