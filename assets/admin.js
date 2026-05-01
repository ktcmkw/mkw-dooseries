// ============================================================
// MKW - dooseries — assets/admin.js
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
      <button data-tab="locks"     class="tab-btn px-4 py-2 text-sm rounded-t-lg">🔒 Lock ตอน</button>
      <button data-tab="giftcards" class="tab-btn px-4 py-2 text-sm rounded-t-lg">🎁 Gift Cards</button>
      <button data-tab="discounts" class="tab-btn px-4 py-2 text-sm rounded-t-lg">🏷️ ส่วนลด</button>
      <button data-tab="slips"     class="tab-btn px-4 py-2 text-sm rounded-t-lg">🧾 สลิปรอตรวจ</button>
      <button data-tab="history"   class="tab-btn px-4 py-2 text-sm rounded-t-lg">📊 ประวัติเติมเงิน</button>
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
  } catch (e) {
    c.innerHTML = errorBanner(e, { title: 'โหลด tab ไม่สำเร็จ' });
  }
}

// ---------- Users ----------
async function renderUsersTab(c) {
  const { users } = await backendGet('/api/admin/users');
  c.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr>
            <th class="px-4 py-3 text-left">Username</th>
            <th class="px-4 py-3 text-left">Role</th>
            <th class="px-4 py-3 text-right">Coins</th>
            <th class="px-4 py-3 text-right">ปลดล็อกแล้ว</th>
            <th class="px-4 py-3 text-left">สร้าง</th>
            <th class="px-4 py-3 text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr class="border-t border-zinc-800" data-u="${escapeHtml(u.username)}">
              <td class="px-4 py-3 font-mono">${escapeHtml(u.username)}</td>
              <td class="px-4 py-3">${roleBadge(u.role)}</td>
              <td class="px-4 py-3 text-right font-bold text-amber-400">${(u.coins || 0).toLocaleString()}</td>
              <td class="px-4 py-3 text-right text-zinc-400">${u.unlocked || 0}</td>
              <td class="px-4 py-3 text-zinc-500 text-xs">${escapeHtml(u.created || '')}</td>
              <td class="px-4 py-3 text-right space-x-1">
                <button class="edit-coins text-xs px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded">+/- Coin</button>
                <button class="edit-role text-xs px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded">เปลี่ยน Role</button>
                ${u.username !== 'admin' ? `<button class="del-user text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded">ลบ</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  $$('.edit-coins').forEach(b => b.onclick = async () => {
    const username = b.closest('tr').dataset.u;
    const input = prompt(`เพิ่ม/ลด coin ของ ${username} (ใส่ตัวเลข เช่น 100 หรือ -50):`);
    if (input === null) return;
    const delta = parseInt(input, 10);
    if (isNaN(delta)) { alert('ตัวเลขไม่ถูกต้อง'); return; }
    try {
      await backendPost(`/api/admin/user/${encodeURIComponent(username)}/coins`, { delta });
      renderUsersTab(c);
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });

  $$('.edit-role').forEach(b => b.onclick = async () => {
    const username = b.closest('tr').dataset.u;
    const role = prompt(`เปลี่ยน role ของ ${username} (admin / vip / user):`);
    if (!role) return;
    try {
      await backendPost(`/api/admin/user/${encodeURIComponent(username)}/role`, { role: role.toLowerCase() });
      renderUsersTab(c);
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });

  $$('.del-user').forEach(b => b.onclick = async () => {
    const username = b.closest('tr').dataset.u;
    if (!confirm(`ลบ user "${username}" แน่นะ?`)) return;
    try {
      await backendDelete(`/api/admin/user/${encodeURIComponent(username)}`);
      renderUsersTab(c);
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
}

// ---------- Locks ----------
async function renderLocksTab(c) {
  const { locks } = await backendGet('/api/admin/locks');
  const entries = Object.entries(locks);
  c.innerHTML = `
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
