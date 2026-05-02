// ============================================================
// MKW Movies — assets/admin.js
// Admin dashboard (requires role=admin)
// ============================================================

async function initAdminPage() {
  await auth.refresh();
  if (!auth.user) { location.href = '/login?next=/admin'; return; }
  if (auth.user.role !== 'admin') {
    await mountPage('', `
      <div class="max-w-md mx-auto text-center py-20">
        <div class="text-5xl mb-3">🚫</div>
        <div class="font-bold text-zinc-200 mb-2">เฉพาะ admin</div>
        <div class="text-sm text-zinc-400 mb-4">บัญชีของคุณ (${escapeHtml(auth.user.username)}) role = ${escapeHtml(auth.user.role)}</div>
        <a href="/" class="inline-block px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg">กลับหน้าแรก</a>
      </div>
    `);
    return;
  }

  await mountPage('', `
    <h2 class="text-2xl sm:text-3xl font-black mb-1">Admin Dashboard</h2>
    <p class="text-sm text-zinc-500 mb-5">ระบบหลังบ้าน — ${BRAND}</p>
    <div class="flex gap-2 flex-wrap mb-6 border-b border-zinc-900 pb-2">
      <button data-tab="users"     class="tab-btn active px-4 py-2 text-sm rounded-t-lg">👥 ผู้ใช้</button>
      <button data-tab="locks"     class="tab-btn px-4 py-2 text-sm rounded-t-lg">🔒 Lock / ซ่อน</button>
      <button data-tab="giftcards" class="tab-btn px-4 py-2 text-sm rounded-t-lg">🎁 Gift Cards</button>
      <button data-tab="discounts" class="tab-btn px-4 py-2 text-sm rounded-t-lg">🏷️ ส่วนลด</button>
      <button data-tab="slips"     class="tab-btn px-4 py-2 text-sm rounded-t-lg">🧾 สลิปรอตรวจ</button>
      <button data-tab="history"   class="tab-btn px-4 py-2 text-sm rounded-t-lg">📊 ประวัติเติมเงิน</button>
      <button data-tab="site"      class="tab-btn px-4 py-2 text-sm rounded-t-lg">🌐 ระบบ</button>
      <button data-tab="loginlog"  class="tab-btn px-4 py-2 text-sm rounded-t-lg">🔐 Login Log</button>
    </div>
    <div id="tabContent"></div>
  `);

  // Tab style
  const style = document.createElement('style');
  style.textContent = `
    .tab-btn{background:#18181b;color:#a1a1aa}
    .tab-btn:hover{background:#27272a;color:#fff}
    .tab-btn.active{background:#ef4444;color:#fff}
  `;
  document.head.appendChild(style);

  $$('.tab-btn').forEach(b => b.onclick = () => {
    $$('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
    loadTab(b.dataset.tab);
  });
  loadTab('users');
}

async function loadTab(tab) {
  const c = $('#tabContent');
  c.innerHTML = `<div class="text-zinc-500 py-10 text-center">กำลังโหลด...</div>`;
  try {
    if (tab === 'users')     return renderUsersTab(c);
    if (tab === 'locks')     return renderLocksTab(c);
    if (tab === 'giftcards') return renderGiftcardsTab(c);
    if (tab === 'discounts') return renderDiscountsTab(c);
    if (tab === 'slips')     return renderSlipsTab(c);
    if (tab === 'history')   return renderHistoryTab(c);
    if (tab === 'site')      return renderSiteTab(c);
    if (tab === 'loginlog')  return renderLoginLogTab(c);
  } catch (e) {
    c.innerHTML = errorBanner(e, { title: 'โหลด tab ไม่สำเร็จ' });
  }
}

// ---------- Users ----------
async function renderUsersTab(c) {
  const { users } = await backendGet('/api/admin/users');
  const fmtRel = iso => {
    if (!iso) return '<span class="text-zinc-600">—</span>';
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return '<span class="text-zinc-600">—</span>';
    if (ms < 60_000) return '<span class="text-emerald-400">เพิ่งใช้งาน</span>';
    if (ms < 3_600_000) return `<span class="text-emerald-400">${Math.floor(ms / 60_000)} นาทีที่แล้ว</span>`;
    if (ms < 86_400_000) return `<span class="text-zinc-400">${Math.floor(ms / 3_600_000)} ชม.ที่แล้ว</span>`;
    return `<span class="text-zinc-500">${Math.floor(ms / 86_400_000)} วันที่แล้ว</span>`;
  };
  const fmtVip = (u) => {
    if (u.role === 'admin') return '<span class="text-red-400 text-xs">ตลอดชีพ</span>';
    if (!u.vipExpires) return '<span class="text-zinc-600 text-xs">—</span>';
    const left = u.vipExpires - Date.now();
    if (left <= 0) return '<span class="text-red-400 text-xs">หมดอายุ</span>';
    const days = Math.ceil(left / 86_400_000);
    return `<span class="text-amber-300 text-xs">${days} วัน</span>`;
  };

  c.innerHTML = `
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <input id="userSearch" type="search" placeholder="🔍 ค้นหา username / email / role..." class="flex-1 min-w-[200px] px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
      <span class="text-xs text-zinc-500"><strong id="userCount">${users.length}</strong> users • <strong id="userActive">${users.filter(u => u.activeSessions > 0).length}</strong> active</span>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table class="w-full text-sm min-w-[900px]">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr>
            <th class="px-3 py-3 text-left">User</th>
            <th class="px-3 py-3 text-left">Role / VIP</th>
            <th class="px-3 py-3 text-right">Coins</th>
            <th class="px-3 py-3 text-right">ดู / ปลด</th>
            <th class="px-3 py-3 text-left">Last seen</th>
            <th class="px-3 py-3 text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody id="userRows">
          ${users.map(u => `
            <tr class="border-t border-zinc-800 user-row" data-u="${escapeHtml(u.username)}" data-search="${escapeHtml((u.username + ' ' + (u.googleEmail || '') + ' ' + u.role).toLowerCase())}">
              <td class="px-3 py-3">
                <div class="font-mono">${escapeHtml(u.username)}</div>
                ${u.googleEmail ? `<div class="text-[10px] text-zinc-500">${escapeHtml(u.googleEmail)}</div>` : ''}
              </td>
              <td class="px-3 py-3">${roleBadge(u.role)}<div class="mt-0.5">${fmtVip(u)}</div></td>
              <td class="px-3 py-3 text-right font-bold text-amber-400">${(u.coins || 0).toLocaleString()}</td>
              <td class="px-3 py-3 text-right text-xs text-zinc-400">${u.historyCount || 0} / ${u.unlocked || 0}</td>
              <td class="px-3 py-3 text-xs">${fmtRel(u.lastSeenAt)}${u.activeSessions ? ` <span class="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px]">● ${u.activeSessions}</span>` : ''}</td>
              <td class="px-3 py-3 text-right whitespace-nowrap">
                <details class="inline-block">
                  <summary class="cursor-pointer text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded list-none">⚙ จัดการ ▾</summary>
                  <div class="absolute right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-1 z-20 flex flex-col text-left min-w-[170px]">
                    <button class="act-coins text-xs px-3 py-1.5 hover:bg-amber-500/20 text-amber-300 rounded text-left">+/- Coin</button>
                    <button class="act-role text-xs px-3 py-1.5 hover:bg-blue-500/20 text-blue-300 rounded text-left">เปลี่ยน Role</button>
                    <button class="act-vip text-xs px-3 py-1.5 hover:bg-amber-500/20 text-amber-300 rounded text-left">ตั้ง VIP หมดอายุ</button>
                    <button class="act-pw text-xs px-3 py-1.5 hover:bg-purple-500/20 text-purple-300 rounded text-left">รีเซ็ตรหัสผ่าน</button>
                    <button class="act-history text-xs px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 rounded text-left">ดูประวัติการดู</button>
                    <button class="act-logout text-xs px-3 py-1.5 hover:bg-orange-500/20 text-orange-300 rounded text-left">Force Logout</button>
                    ${u.username !== 'admin' ? `<button class="act-del text-xs px-3 py-1.5 hover:bg-red-500/20 text-red-300 rounded text-left">ลบ user</button>` : ''}
                  </div>
                </details>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div id="userModal"></div>
  `;

  // Search filter
  $('#userSearch').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    let visible = 0;
    $$('.user-row').forEach(r => {
      const match = !q || r.dataset.search.includes(q);
      r.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    $('#userCount').textContent = visible;
  };

  const tr = b => b.closest('tr');
  $$('.act-coins').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    const input = prompt(`เพิ่ม/ลด coin ของ ${username} (เช่น 100 หรือ -50):`);
    if (input === null) return;
    const delta = parseInt(input, 10);
    if (isNaN(delta)) { alert('ตัวเลขไม่ถูกต้อง'); return; }
    try { await backendPost(`/api/admin/user/${encodeURIComponent(username)}/coins`, { delta }); renderUsersTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.act-role').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    const role = prompt(`เปลี่ยน role ของ ${username} (admin / vip / user):`);
    if (!role) return;
    try { await backendPost(`/api/admin/user/${encodeURIComponent(username)}/role`, { role: role.toLowerCase() }); renderUsersTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.act-vip').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    const input = prompt(`ตั้งวันหมดอายุ VIP ของ ${username}\n— ใส่ YYYY-MM-DD (เช่น 2026-12-31)\n— เว้นว่าง = ยกเลิก VIP\n— ใส่ +N เพื่อต่อ N วันจากวันนี้:`);
    if (input === null) return;
    let vipExpires = null;
    if (input.trim() === '') vipExpires = null;
    else if (/^\+\d+$/.test(input.trim())) {
      const days = parseInt(input.trim().slice(1), 10);
      vipExpires = new Date(Date.now() + days * 86_400_000).toISOString();
    } else {
      const d = new Date(input.trim());
      if (isNaN(d.getTime())) { alert('รูปแบบวันที่ไม่ถูกต้อง'); return; }
      vipExpires = d.toISOString();
    }
    try { await backendPost(`/api/admin/user/${encodeURIComponent(username)}/vip-expires`, { vipExpires }); renderUsersTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.act-pw').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    const newPassword = prompt(`รีเซ็ตรหัสผ่านของ ${username} เป็น:\n(ขั้นต่ำ 3 ตัว — user จะถูก logout ทุก device)`);
    if (!newPassword) return;
    if (!confirm(`ยืนยันเปลี่ยนรหัสของ "${username}"?`)) return;
    try { await backendPost(`/api/admin/user/${encodeURIComponent(username)}/reset-password`, { newPassword }); alert('✓ เปลี่ยนรหัสสำเร็จ'); renderUsersTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.act-logout').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    if (!confirm(`Force logout ${username} จากทุก device?`)) return;
    try { const r = await backendPost(`/api/admin/user/${encodeURIComponent(username)}/force-logout`, {}); alert(`✓ ปิด ${r.closed} session`); renderUsersTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.act-history').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    try {
      const { history } = await backendGet(`/api/admin/user/${encodeURIComponent(username)}/history`);
      const rowsHtml = history.length
        ? history.map(h => {
            const src = h.source || 'dramabox';
            const srcQ = src === 'dramabox' ? '' : `&src=${encodeURIComponent(src)}`;
            return `
          <tr class="border-t border-zinc-800">
            <td class="px-3 py-2 text-xs text-zinc-400">${escapeHtml((h.at || '').replace('T', ' ').slice(0, 19))}</td>
            <td class="px-3 py-2 text-sm">${escapeHtml(h.bookName || '(ไม่ทราบชื่อ)')} <span class="ml-1 text-[10px] px-1 py-0.5 rounded bg-zinc-700 text-zinc-300">${escapeHtml(src)}</span></td>
            <td class="px-3 py-2 text-right"><span class="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs">EP ${h.index}</span></td>
            <td class="px-3 py-2 text-right text-xs"><a href="/play?bookId=${encodeURIComponent(h.bookId)}&index=${h.index}${srcQ}" target="_blank" class="text-red-400 hover:underline">เปิดดู →</a></td>
          </tr>`;
          }).join('')
        : `<tr><td colspan="4" class="px-3 py-10 text-center text-zinc-500 text-sm">ยังไม่มีประวัติการดู</td></tr>`;
      $('#userModal').innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.8);backdrop-filter:blur(4px)" id="histOverlay">
          <div class="bg-zinc-900 border border-zinc-700 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h3 class="font-bold">📊 ประวัติการดูของ <span class="font-mono text-amber-400">${escapeHtml(username)}</span> <span class="text-xs text-zinc-500 font-normal">(${history.length} รายการ)</span></h3>
              <button id="histClose" class="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div class="overflow-auto"><table class="w-full"><tbody>${rowsHtml}</tbody></table></div>
          </div>
        </div>`;
      $('#histClose').onclick = () => $('#userModal').innerHTML = '';
      $('#histOverlay').onclick = ev => { if (ev.target.id === 'histOverlay') $('#userModal').innerHTML = ''; };
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.act-del').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    if (!confirm(`ลบ user "${username}" แน่นะ?`)) return;
    try { await backendDelete(`/api/admin/user/${encodeURIComponent(username)}`); renderUsersTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
}

// ---------- Locks ----------
async function renderLocksTab(c) {
  const [locksRes, fmRes, hbRes] = await Promise.all([
    backendGet('/api/admin/locks'),
    backendGet('/api/admin/freemode'),
    backendGet('/api/admin/hidden-books'),
  ]);
  const { locks } = locksRes;
  const fm = fmRes.freeMode || { enabled: false, message: '', startAt: null, endAt: null, guestEps: 3, userEps: 10 };
  const fmGuestEps = Number.isFinite(fm.guestEps) ? fm.guestEps : 3;
  const fmUserEps = Number.isFinite(fm.userEps) ? fm.userEps : 10;
  const active = !!fmRes.active;
  const hiddenBooks = hbRes.hiddenBooks || {};
  const hbEntries = Object.entries(hiddenBooks);
  const entries = Object.entries(locks);

  // แปลง ISO → ค่าสำหรับ datetime-local input (YYYY-MM-DDTHH:MM, time ใน local timezone)
  const isoToLocalInput = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtRange = () => {
    const f = (iso) => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    if (!fm.startAt && !fm.endAt) return '';
    return ` • ช่วง ${f(fm.startAt)} → ${f(fm.endAt)}`;
  };

  let statusLabel, statusCls;
  if (!fm.enabled) { statusLabel = '○ ปิดอยู่'; statusCls = 'text-zinc-500'; }
  else if (active) { statusLabel = '● กำลังเปิดใช้งาน'; statusCls = 'text-emerald-400'; }
  else { statusLabel = '⏰ เปิดไว้ แต่ยังไม่อยู่ในช่วงเวลา'; statusCls = 'text-amber-400'; }

  c.innerHTML = `
    <div class="bg-zinc-900 border ${active ? 'border-emerald-500/50' : (fm.enabled ? 'border-amber-500/40' : 'border-zinc-800')} rounded-xl p-5 mb-5">
      <div class="flex items-start gap-3 mb-3">
        <div class="text-2xl">🎁</div>
        <div class="flex-1">
          <h3 class="font-bold">โปรโมชั่น "ดูฟรีทั้งเว็บ"</h3>
          <p class="text-xs text-zinc-500 mt-0.5">เปิด = ทุกคน (รวม guest) ดูทุกเรื่อง ทุก ep ฟรี + popup โผล่หน้าแรก • ตั้งช่วงเวลาได้ (เว้นว่าง = ตลอดเวลา)</p>
        </div>
        <label class="inline-flex items-center cursor-pointer">
          <input type="checkbox" id="fmToggle" class="sr-only peer" ${fm.enabled ? 'checked' : ''}/>
          <div class="relative w-12 h-7 bg-zinc-700 peer-checked:bg-emerald-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-transform peer-checked:after:translate-x-5"></div>
        </label>
      </div>
      <div class="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">เริ่มต้น (เว้นว่าง = ทันที)</label>
          <input id="fmStart" type="datetime-local" value="${isoToLocalInput(fm.startAt)}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
        </div>
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">สิ้นสุด (เว้นว่าง = ไม่มีวันสิ้นสุด)</label>
          <input id="fmEnd" type="datetime-local" value="${isoToLocalInput(fm.endAt)}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
        </div>
      </div>
      <div>
        <label class="text-xs text-zinc-400 mb-1 block">ข้อความบน popup (เว้นว่างเพื่อใช้ค่าเริ่มต้น)</label>
        <textarea id="fmMsg" rows="2" placeholder="เช่น: ฉลองครบรอบ! ดูทุกเรื่องฟรีถึง 31 ธ.ค." class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm">${escapeHtml(fm.message || '')}</textarea>
      </div>
      <div class="grid sm:grid-cols-2 gap-3 mt-3">
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">จำนวนตอนที่ guest (ไม่ login) ดูได้</label>
          <input id="fmGuestEps" type="number" min="0" max="999" value="${fmGuestEps}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          <p class="text-[10px] text-zinc-500 mt-1">เกินจำนวนนี้ → ต้อง login/สมัคร</p>
        </div>
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">จำนวนตอนที่ user (login แล้ว, ไม่ใช่ VIP) ดูได้</label>
          <input id="fmUserEps" type="number" min="0" max="999" value="${fmUserEps}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          <p class="text-[10px] text-zinc-500 mt-1">เกินจำนวนนี้ → ต้องอัปเกรด VIP • VIP/admin ดูได้ทุกตอน</p>
        </div>
      </div>
      <div class="flex items-center gap-3 mt-3 flex-wrap">
        <button id="fmSave" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold">บันทึก</button>
        <span class="text-xs ${statusCls}">
          ${statusLabel}${fmtRange()}
          ${fm.setBy ? ` • โดย ${escapeHtml(fm.setBy)} • ${escapeHtml((fm.setAt || '').slice(0, 19).replace('T', ' '))}` : ''}
        </span>
      </div>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
      <h3 class="font-bold mb-1">🚫 ซ่อนซีรีส์ทั้งเรื่อง</h3>
      <p class="text-xs text-zinc-500 mb-3">ผู้ใช้ทั่วไปจะมองไม่เห็นในหน้าแรก/ค้นหา + เข้าไม่ได้ (admin ยังดูได้)</p>
      <form id="hbForm" class="grid sm:grid-cols-4 gap-3 mb-3">
        <input id="hbBook" type="text" required placeholder="bookId" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono"/>
        <input id="hbName" type="text" placeholder="ชื่อเรื่อง (optional)" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
        <input id="hbReason" type="text" placeholder="เหตุผล (optional)" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
        <button class="px-4 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold">ซ่อน</button>
      </form>
      ${hbEntries.length ? `
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead class="text-zinc-400 text-xs">
            <tr><th class="px-2 py-2 text-left">bookId</th><th class="px-2 py-2 text-left">ชื่อเรื่อง</th><th class="px-2 py-2 text-left">เหตุผล</th><th class="px-2 py-2 text-left">ซ่อนเมื่อ</th><th class="px-2 py-2 text-right"></th></tr>
          </thead>
          <tbody>
            ${hbEntries.map(([bid, h]) => `
              <tr class="border-t border-zinc-800">
                <td class="px-2 py-2 font-mono text-xs">${escapeHtml(bid)}</td>
                <td class="px-2 py-2 text-xs">${escapeHtml(h.bookName || '—')}</td>
                <td class="px-2 py-2 text-xs text-zinc-400">${escapeHtml(h.reason || '—')}</td>
                <td class="px-2 py-2 text-xs text-zinc-500">${escapeHtml((h.hiddenAt || '').slice(0, 10))}</td>
                <td class="px-2 py-2 text-right"><button class="rm-hb text-xs px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded" data-bid="${escapeHtml(bid)}">เปิดอีกครั้ง</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      ` : `<div class="text-xs text-zinc-500 py-2">ยังไม่มีซีรีส์ที่ซ่อน</div>`}
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
      <h3 class="font-bold mb-3">เพิ่ม/แก้ไข Lock</h3>
      <form id="lockForm" class="grid sm:grid-cols-3 gap-3">
        <input id="lBook" type="text" required placeholder="bookId (เช่น 42000008046)" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm font-mono"/>
        <input id="lEps" type="text" required placeholder="ตอนที่ล็อก คั่นด้วย comma เช่น 3,4,5" class="sm:col-span-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
        <button class="px-4 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold">บันทึก</button>
      </form>
      <p class="text-xs text-zinc-500 mt-2">หมายเหตุ: ใส่ <code>[]</code> หรือเว้นว่างเพื่อปลดล็อกทุกตอนของ bookId นั้น</p>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-4 py-3 text-left">bookId</th><th class="px-4 py-3 text-left">ตอนที่ล็อก</th><th class="px-4 py-3 text-left">ตั้งโดย / เมื่อ</th><th class="px-4 py-3 text-right"></th></tr>
        </thead>
        <tbody>
          ${entries.length ? entries.map(([bid, l]) => `
            <tr class="border-t border-zinc-800">
              <td class="px-4 py-3 font-mono text-xs">${escapeHtml(bid)}</td>
              <td class="px-4 py-3">${(l.episodes || []).map(e => `<span class="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs mr-1">${e}</span>`).join('')}</td>
              <td class="px-4 py-3 text-xs text-zinc-500">${escapeHtml(l.setBy || '')} • ${escapeHtml((l.setAt || '').slice(0, 10))}</td>
              <td class="px-4 py-3 text-right"><button class="rm-lock text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded" data-bid="${escapeHtml(bid)}">ปลดทุกตอน</button></td>
            </tr>
          `).join('') : `<tr><td colspan="4" class="px-4 py-10 text-center text-zinc-500">ยังไม่มี lock</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  $('#lockForm').onsubmit = async e => {
    e.preventDefault();
    const bookId = $('#lBook').value.trim();
    const epsStr = $('#lEps').value.trim();
    const episodes = epsStr ? epsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0) : [];
    try {
      await backendPost('/api/admin/locks', { bookId, episodes });
      renderLocksTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };
  $$('.rm-lock').forEach(b => b.onclick = async () => {
    if (!confirm(`ปลด lock ของ ${b.dataset.bid}?`)) return;
    try { await backendPost('/api/admin/locks', { bookId: b.dataset.bid, episodes: [] }); renderLocksTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });

  $('#hbForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await backendPost('/api/admin/hidden-books', {
        bookId: $('#hbBook').value.trim(),
        bookName: $('#hbName').value.trim(),
        reason: $('#hbReason').value.trim(),
      });
      renderLocksTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };
  $$('.rm-hb').forEach(b => b.onclick = async () => {
    if (!confirm(`เปิดซีรีส์ ${b.dataset.bid} อีกครั้ง?`)) return;
    try { await backendDelete(`/api/admin/hidden-books/${encodeURIComponent(b.dataset.bid)}`); renderLocksTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });

  $('#fmSave').onclick = async () => {
    const enabled = $('#fmToggle').checked;
    const message = $('#fmMsg').value.trim();
    const startAt = $('#fmStart').value || null;
    const endAt = $('#fmEnd').value || null;
    const guestEps = parseInt($('#fmGuestEps').value, 10);
    const userEps = parseInt($('#fmUserEps').value, 10);
    if (enabled && !confirm('เปิดโหมด "ดูฟรีทั้งเว็บ" — ทุกคน (รวม guest) จะดูทุกเรื่องฟรีในช่วงเวลาที่กำหนด ยืนยัน?')) return;
    try {
      await backendPost('/api/admin/freemode', { enabled, message, startAt, endAt, guestEps, userEps });
      renderLocksTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };
}

// ---------- Giftcards ----------
async function renderGiftcardsTab(c) {
  const { giftcards } = await backendGet('/api/admin/giftcards');
  const entries = Object.entries(giftcards);
  c.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
      <h3 class="font-bold mb-3">สร้าง Gift Card</h3>
      <form id="gForm" class="grid sm:grid-cols-4 gap-3">
        <input id="gCode" type="text" required placeholder="CODE (เช่น NSV2026)" class="sm:col-span-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm uppercase font-mono"/>
        <input id="gCoins" type="number" required min="1" placeholder="จำนวน coin" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
        <button class="px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold">สร้าง</button>
      </form>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-4 py-3 text-left">Code</th><th class="px-4 py-3 text-right">Coins</th><th class="px-4 py-3 text-left">สถานะ</th><th class="px-4 py-3 text-left">ใช้โดย</th><th class="px-4 py-3 text-right"></th></tr>
        </thead>
        <tbody>
          ${entries.length ? entries.map(([code, g]) => `
            <tr class="border-t border-zinc-800">
              <td class="px-4 py-3 font-mono">${escapeHtml(code)}</td>
              <td class="px-4 py-3 text-right font-bold text-amber-400">${(g.coins || 0).toLocaleString()}</td>
              <td class="px-4 py-3">${g.used ? '<span class="text-zinc-500 text-xs">✓ ใช้แล้ว</span>' : '<span class="text-emerald-400 text-xs">● พร้อมใช้</span>'}</td>
              <td class="px-4 py-3 text-xs text-zinc-500">${escapeHtml(g.usedBy || '-')}</td>
              <td class="px-4 py-3 text-right"><button class="rm-gc text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded" data-code="${escapeHtml(code)}">ลบ</button></td>
            </tr>
          `).join('') : `<tr><td colspan="5" class="px-4 py-10 text-center text-zinc-500">ยังไม่มี gift card</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  $('#gForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await backendPost('/api/admin/giftcards', { code: $('#gCode').value.trim().toUpperCase(), coins: parseInt($('#gCoins').value, 10) });
      renderGiftcardsTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };
  $$('.rm-gc').forEach(b => b.onclick = async () => {
    if (!confirm(`ลบ gift card "${b.dataset.code}"?`)) return;
    try { await backendDelete(`/api/admin/giftcards/${encodeURIComponent(b.dataset.code)}`); renderGiftcardsTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
}

// ---------- Discounts ----------
async function renderDiscountsTab(c) {
  const { discounts } = await backendGet('/api/admin/discounts');
  const entries = Object.entries(discounts);
  c.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
      <h3 class="font-bold mb-3">สร้างโค้ดส่วนลด (ใช้กับหน้า topup)</h3>
      <form id="dForm" class="grid sm:grid-cols-3 gap-3">
        <input id="dCode" type="text" required placeholder="CODE" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm uppercase font-mono"/>
        <input id="dPct"  type="number" required min="1" max="99" placeholder="ส่วนลด % (1-99)" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
        <button class="px-4 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold">สร้าง</button>
      </form>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-4 py-3 text-left">Code</th><th class="px-4 py-3 text-right">ส่วนลด</th><th class="px-4 py-3 text-left">สร้างโดย</th><th class="px-4 py-3 text-right"></th></tr>
        </thead>
        <tbody>
          ${entries.length ? entries.map(([code, d]) => `
            <tr class="border-t border-zinc-800">
              <td class="px-4 py-3 font-mono">${escapeHtml(code)}</td>
              <td class="px-4 py-3 text-right font-bold text-blue-400">-${d.percent}%</td>
              <td class="px-4 py-3 text-xs text-zinc-500">${escapeHtml(d.createdBy || '-')}</td>
              <td class="px-4 py-3 text-right"><button class="rm-disc text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded" data-code="${escapeHtml(code)}">ลบ</button></td>
            </tr>
          `).join('') : `<tr><td colspan="4" class="px-4 py-10 text-center text-zinc-500">ยังไม่มีโค้ดส่วนลด</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  $('#dForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await backendPost('/api/admin/discounts', { code: $('#dCode').value.trim().toUpperCase(), percent: parseInt($('#dPct').value, 10) });
      renderDiscountsTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };
  $$('.rm-disc').forEach(b => b.onclick = async () => {
    if (!confirm(`ลบ discount "${b.dataset.code}"?`)) return;
    try { await backendDelete(`/api/admin/discounts/${encodeURIComponent(b.dataset.code)}`); renderDiscountsTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
}

// ---------- Slips (manual top-up review) ----------
async function renderSlipsTab(c) {
  const { slips } = await backendGet('/api/admin/slips');
  const pending = slips.filter(s => s.status === 'pending').reverse();
  const done = slips.filter(s => s.status !== 'pending').reverse();
  c.innerHTML = `
    <h3 class="font-bold mb-3 text-amber-300">รอตรวจสอบ (${pending.length})</h3>
    <div class="space-y-3 mb-8">
      ${pending.length ? pending.map(s => slipCardHtml(s)).join('') : `<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center text-zinc-500 text-sm">ยังไม่มีสลิปรอตรวจ</div>`}
    </div>
    <h3 class="font-bold mb-3 text-zinc-400">ประวัติ (${done.length})</h3>
    <div class="space-y-2">
      ${done.length ? done.map(s => `
        <div class="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-sm flex items-center gap-3">
          <span class="${s.status === 'approved' ? 'text-emerald-400' : 'text-red-400'}">${s.status === 'approved' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}</span>
          <span class="font-mono text-xs text-zinc-500">${escapeHtml(s.id)}</span>
          <span>${escapeHtml(s.username)}</span>
          <span class="text-amber-400">฿${s.amount}</span>
          <span class="text-xs text-zinc-500 ml-auto">${escapeHtml((s.approvedAt || '').slice(0, 19).replace('T', ' '))}</span>
        </div>
      `).join('') : ''}
    </div>
  `;

  $$('.slip-approve').forEach(b => b.onclick = async () => {
    if (!confirm('ยืนยันอนุมัติสลิปนี้? จะเติมเหรียญให้ user ทันที')) return;
    try { await backendPost(`/api/admin/slips/${encodeURIComponent(b.dataset.id)}/approve`, {}); renderSlipsTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.slip-reject').forEach(b => b.onclick = async () => {
    if (!confirm('ปฏิเสธสลิปนี้?')) return;
    try { await backendPost(`/api/admin/slips/${encodeURIComponent(b.dataset.id)}/reject`, {}); renderSlipsTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
}

function slipCardHtml(s) {
  return `
    <div class="bg-zinc-900 border border-amber-500/30 rounded-lg p-4 flex gap-4 flex-wrap">
      <img src="${escapeHtml(s.image)}" class="w-32 h-48 object-cover rounded border border-zinc-800 cursor-zoom-in" onclick="window.open('${escapeHtml(s.image)}','_blank')"/>
      <div class="flex-1 min-w-[200px]">
        <div class="text-xs text-zinc-500 mb-1">${escapeHtml(s.id)}</div>
        <div class="font-bold text-lg mb-1">${escapeHtml(s.username)}</div>
        <div class="text-2xl font-black text-amber-400 mb-2">฿${s.amount.toLocaleString()}</div>
        ${s.note ? `<div class="text-sm text-zinc-300 mb-2">"${escapeHtml(s.note)}"</div>` : ''}
        <div class="text-xs text-zinc-500 mb-3">${escapeHtml((s.uploadedAt || '').slice(0, 19).replace('T', ' '))}</div>
        <div class="flex gap-2">
          <button class="slip-approve px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold" data-id="${escapeHtml(s.id)}">✓ อนุมัติ +${s.amount} coin</button>
          <button class="slip-reject px-4 py-1.5 bg-zinc-800 hover:bg-red-500/30 text-zinc-300 hover:text-red-300 rounded text-sm" data-id="${escapeHtml(s.id)}">ปฏิเสธ</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- History ----------
async function renderHistoryTab(c) {
  const { history } = await backendGet('/api/admin/topup-history');
  const rows = [...history].reverse();
  c.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-4 py-3 text-left">เวลา</th><th class="px-4 py-3 text-left">User</th><th class="px-4 py-3 text-left">Package</th><th class="px-4 py-3 text-right">+Coins</th><th class="px-4 py-3 text-right">ชำระ</th><th class="px-4 py-3 text-left">Discount</th></tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(h => `
            <tr class="border-t border-zinc-800">
              <td class="px-4 py-3 text-xs text-zinc-400">${escapeHtml((h.at || '').replace('T', ' ').slice(0, 19))}</td>
              <td class="px-4 py-3 font-mono text-xs">${escapeHtml(h.username)}</td>
              <td class="px-4 py-3 text-xs">${escapeHtml(h.packageId || '')}</td>
              <td class="px-4 py-3 text-right font-bold text-amber-400">+${(h.coins || 0).toLocaleString()}</td>
              <td class="px-4 py-3 text-right">฿${(h.pricePaid || 0).toLocaleString()}</td>
              <td class="px-4 py-3 text-xs text-blue-400">${h.discount ? `${h.discount.code} (-${h.discount.percent}%)` : '-'}</td>
            </tr>
          `).join('') : `<tr><td colspan="6" class="px-4 py-10 text-center text-zinc-500">ยังไม่มีประวัติ</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Site (announcement + maintenance) ----------
async function renderSiteTab(c) {
  const [anRes, mtRes, trRes] = await Promise.all([
    backendGet('/api/admin/announcement'),
    backendGet('/api/admin/maintenance'),
    backendGet('/api/admin/tracking'),
  ]);
  const an = anRes.announcement || { enabled: false, text: '', color: 'blue' };
  const mt = mtRes.maintenance || { enabled: false, message: '' };
  const trackingOff = !!trRes.disableTracking;
  const colors = ['blue', 'amber', 'red', 'emerald'];

  c.innerHTML = `
    <div class="bg-zinc-900 border ${an.enabled ? 'border-blue-500/50' : 'border-zinc-800'} rounded-xl p-5 mb-5">
      <div class="flex items-start gap-3 mb-3">
        <div class="text-2xl">📢</div>
        <div class="flex-1">
          <h3 class="font-bold">ป้ายประกาศ (Announcement Banner)</h3>
          <p class="text-xs text-zinc-500 mt-0.5">แสดงเป็นแถบใต้ header ทุกหน้า — ใช้แจ้งข่าว/อัปเดต/ขอบคุณ ฯลฯ</p>
        </div>
        <label class="inline-flex items-center cursor-pointer">
          <input type="checkbox" id="anToggle" class="sr-only peer" ${an.enabled ? 'checked' : ''}/>
          <div class="relative w-12 h-7 bg-zinc-700 peer-checked:bg-blue-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-transform peer-checked:after:translate-x-5"></div>
        </label>
      </div>
      <div class="grid sm:grid-cols-4 gap-3 mb-3">
        <div class="sm:col-span-3">
          <label class="text-xs text-zinc-400 mb-1 block">ข้อความ (รองรับ HTML พื้นฐาน: &lt;b&gt;, &lt;a&gt;)</label>
          <textarea id="anText" rows="2" placeholder="เช่น: ระบบจะปิดปรับปรุงวันที่ 5 พ.ค. 22:00–23:00" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm">${escapeHtml(an.text || '')}</textarea>
        </div>
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">สี</label>
          <select id="anColor" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm">
            ${colors.map(co => `<option value="${co}" ${an.color === co ? 'selected' : ''}>${co}</option>`).join('')}
          </select>
        </div>
      </div>
      <button id="anSave" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold">บันทึกประกาศ</button>
      ${an.setBy ? `<span class="ml-3 text-xs text-zinc-500">โดย ${escapeHtml(an.setBy)} • ${escapeHtml((an.setAt || '').slice(0, 19).replace('T', ' '))}</span>` : ''}
    </div>

    <div class="bg-zinc-900 border ${mt.enabled ? 'border-red-500/60' : 'border-zinc-800'} rounded-xl p-5 mb-5">
      <div class="flex items-start gap-3 mb-3">
        <div class="text-2xl">🚧</div>
        <div class="flex-1">
          <h3 class="font-bold">โหมด Maintenance (ปิดเว็บชั่วคราว)</h3>
          <p class="text-xs text-zinc-500 mt-0.5">เมื่อเปิด: ผู้ใช้ทั่วไปจะดูซีรีส์ไม่ได้ — เห็นหน้า maintenance / admin ยังใช้งานได้ตามปกติ</p>
        </div>
        <label class="inline-flex items-center cursor-pointer">
          <input type="checkbox" id="mtToggle" class="sr-only peer" ${mt.enabled ? 'checked' : ''}/>
          <div class="relative w-12 h-7 bg-zinc-700 peer-checked:bg-red-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-transform peer-checked:after:translate-x-5"></div>
        </label>
      </div>
      <div>
        <label class="text-xs text-zinc-400 mb-1 block">ข้อความที่จะแสดงให้ user</label>
        <textarea id="mtMsg" rows="2" placeholder="เช่น: ขออภัยในความไม่สะดวก ระบบกำลังปรับปรุง — กลับมาในอีก 30 นาที" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm">${escapeHtml(mt.message || '')}</textarea>
      </div>
      <button id="mtSave" class="mt-3 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold">บันทึก Maintenance</button>
      ${mt.setBy ? `<span class="ml-3 text-xs text-zinc-500">โดย ${escapeHtml(mt.setBy)} • ${escapeHtml((mt.setAt || '').slice(0, 19).replace('T', ' '))}</span>` : ''}
    </div>

    <div class="bg-zinc-900 border ${trackingOff ? 'border-orange-500/50' : 'border-zinc-800'} rounded-xl p-5 mb-5">
      <div class="flex items-start gap-3 mb-2">
        <div class="text-2xl">⚡</div>
        <div class="flex-1">
          <h3 class="font-bold">ปิดการจัดเก็บสถานะ online ชั่วคราว</h3>
          <p class="text-xs text-zinc-500 mt-0.5">
            เปิด toggle นี้ = หยุดบันทึก <code>lastSeenAt</code> / <code>loginLog</code> / ปิด heartbeat ฝั่ง client
            → <strong class="text-orange-400">ลดภาระ disk write บน Render free</strong>
          </p>
          <p class="text-xs text-zinc-500 mt-1">ใช้เมื่อ: server ช้าผิดปกติ, traffic เยอะกะทันหัน, หรือกำลัง migrate ไป MongoDB</p>
        </div>
        <label class="inline-flex items-center cursor-pointer">
          <input type="checkbox" id="trToggle" class="sr-only peer" ${trackingOff ? 'checked' : ''}/>
          <div class="relative w-12 h-7 bg-zinc-700 peer-checked:bg-orange-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-transform peer-checked:after:translate-x-5"></div>
        </label>
      </div>
      <div class="flex items-center gap-3 mt-2 text-xs">
        <span class="${trackingOff ? 'text-orange-400' : 'text-emerald-400'}">
          ${trackingOff ? '⚡ ปิดอยู่ — Login Log จะไม่มีข้อมูลใหม่ + Active list อาจล้าสมัย' : '● ทำงานปกติ'}
        </span>
      </div>
    </div>
  `;

  $('#anSave').onclick = async () => {
    try {
      await backendPost('/api/admin/announcement', {
        enabled: $('#anToggle').checked,
        text: $('#anText').value.trim(),
        color: $('#anColor').value,
      });
      renderSiteTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };
  $('#mtSave').onclick = async () => {
    const enabled = $('#mtToggle').checked;
    if (enabled && !confirm('เปิด Maintenance Mode — ผู้ใช้ทั่วไปจะดูเว็บไม่ได้ ยืนยัน?')) return;
    try {
      await backendPost('/api/admin/maintenance', { enabled, message: $('#mtMsg').value.trim() });
      renderSiteTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };

  $('#trToggle').onchange = async e => {
    const disableTracking = e.target.checked;
    try {
      await backendPost('/api/admin/tracking', { disableTracking });
      renderSiteTab(c);
    } catch (ex) {
      alert('ไม่สำเร็จ: ' + ex.message);
      e.target.checked = !disableTracking;
    }
  };
}

// ---------- Login Log ----------
async function renderLoginLogTab(c) {
  const { active, historical } = await backendGet('/api/admin/login-log');
  const fmtDur = ms => {
    if (!ms || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s} วิ`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} นาที`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h < 24) return `${h} ชม. ${mm} นาที`;
    const d = Math.floor(h / 24);
    return `${d} วัน ${h % 24} ชม.`;
  };
  const fmtTime = iso => iso ? new Date(iso).toLocaleString('th-TH') : '—';

  // Aggregate per-user totals (จาก historical)
  const userTotals = {};
  for (const h of historical) {
    const u = userTotals[h.username] = userTotals[h.username] || { sessions: 0, totalMs: 0 };
    u.sessions++;
    u.totalMs += h.durationMs || 0;
  }
  const summary = Object.entries(userTotals).sort((a, b) => b[1].totalMs - a[1].totalMs);

  c.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div class="text-xs text-zinc-400">Active sessions</div>
        <div class="text-3xl font-black text-emerald-400">${active.length}</div>
      </div>
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div class="text-xs text-zinc-400">Total historical logins</div>
        <div class="text-3xl font-black text-blue-400">${historical.length}</div>
      </div>
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div class="text-xs text-zinc-400">Unique users (จากประวัติ)</div>
        <div class="text-3xl font-black text-amber-400">${summary.length}</div>
      </div>
    </div>

    <h3 class="font-bold mb-2 text-emerald-300">● กำลัง online (${active.length})</h3>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto mb-6">
      <table class="w-full text-sm min-w-[700px]">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-3 py-2 text-left">User</th><th class="px-3 py-2 text-left">Login</th><th class="px-3 py-2 text-left">Last seen</th><th class="px-3 py-2 text-right">ใช้เวลา</th><th class="px-3 py-2 text-left">Token</th></tr>
        </thead>
        <tbody>
          ${active.length ? active.map(s => `
            <tr class="border-t border-zinc-800">
              <td class="px-3 py-2 font-mono">${escapeHtml(s.username)}</td>
              <td class="px-3 py-2 text-xs text-zinc-400">${fmtTime(s.loginAt)}</td>
              <td class="px-3 py-2 text-xs text-zinc-400">${fmtTime(s.lastSeenAt)}</td>
              <td class="px-3 py-2 text-right text-emerald-300 text-xs font-bold">${fmtDur(s.durationMs)}</td>
              <td class="px-3 py-2 font-mono text-[10px] text-zinc-600">${escapeHtml(s.tokenPreview || '')}</td>
            </tr>
          `).join('') : `<tr><td colspan="5" class="px-3 py-8 text-center text-zinc-500">ไม่มี user online</td></tr>`}
        </tbody>
      </table>
    </div>

    <h3 class="font-bold mb-2 text-zinc-300">📊 สรุปต่อ user (เรียงตามเวลาสะสม)</h3>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto mb-6">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-3 py-2 text-left">User</th><th class="px-3 py-2 text-right">Sessions</th><th class="px-3 py-2 text-right">เวลาสะสม</th></tr>
        </thead>
        <tbody>
          ${summary.length ? summary.map(([u, s]) => `
            <tr class="border-t border-zinc-800">
              <td class="px-3 py-2 font-mono">${escapeHtml(u)}</td>
              <td class="px-3 py-2 text-right">${s.sessions}</td>
              <td class="px-3 py-2 text-right text-amber-300 font-bold">${fmtDur(s.totalMs)}</td>
            </tr>
          `).join('') : `<tr><td colspan="3" class="px-3 py-8 text-center text-zinc-500">ยังไม่มีประวัติ</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="flex items-center gap-3 mb-2">
      <h3 class="font-bold text-zinc-300">🕐 ประวัติ login (${historical.length})</h3>
      <button id="clearLogBtn" class="ml-auto text-xs px-3 py-1.5 bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-300 rounded">ล้างประวัติ</button>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table class="w-full text-sm min-w-[700px]">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-3 py-2 text-left">User</th><th class="px-3 py-2 text-left">Login</th><th class="px-3 py-2 text-left">Logout</th><th class="px-3 py-2 text-right">Duration</th><th class="px-3 py-2 text-left">Reason</th></tr>
        </thead>
        <tbody>
          ${historical.length ? historical.slice(0, 200).map(h => `
            <tr class="border-t border-zinc-800">
              <td class="px-3 py-2 font-mono">${escapeHtml(h.username)}</td>
              <td class="px-3 py-2 text-xs text-zinc-400">${fmtTime(h.loginAt)}</td>
              <td class="px-3 py-2 text-xs text-zinc-400">${fmtTime(h.logoutAt)}</td>
              <td class="px-3 py-2 text-right text-amber-300 text-xs">${fmtDur(h.durationMs)}</td>
              <td class="px-3 py-2 text-xs text-zinc-500">${escapeHtml(h.reason || 'logout')}</td>
            </tr>
          `).join('') : `<tr><td colspan="5" class="px-3 py-8 text-center text-zinc-500">ยังไม่มีประวัติ</td></tr>`}
        </tbody>
      </table>
      ${historical.length > 200 ? `<div class="text-center text-xs text-zinc-500 py-2">แสดง 200 รายการล่าสุด (จากทั้งหมด ${historical.length})</div>` : ''}
    </div>
  `;

  $('#clearLogBtn').onclick = async () => {
    if (!confirm('ล้างประวัติ login ทั้งหมด? (active sessions ไม่กระทบ)')) return;
    try { await backendDelete('/api/admin/login-log'); renderLoginLogTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  };
}
