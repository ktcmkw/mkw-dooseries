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
      <button data-tab="messages"  class="tab-btn px-4 py-2 text-sm rounded-t-lg">📬 ส่งข้อความ</button>
      <button data-tab="usermsg"   class="tab-btn px-4 py-2 text-sm rounded-t-lg">📥 ข้อความจาก user</button>
      <button data-tab="site"      class="tab-btn px-4 py-2 text-sm rounded-t-lg">🌐 ระบบ</button>
      <button data-tab="register"  class="tab-btn px-4 py-2 text-sm rounded-t-lg">📝 สมัครสมาชิก</button>
      <button data-tab="points"    class="tab-btn px-4 py-2 text-sm rounded-t-lg">💎 Point & แพ็กเกจ</button>
      <button data-tab="loginlog"  class="tab-btn px-4 py-2 text-sm rounded-t-lg">🔐 Login Log</button>
      <button data-tab="seenbooks" class="tab-btn px-4 py-2 text-sm rounded-t-lg">🆕 หนังใหม่</button>
      <button data-tab="apisources" class="tab-btn px-4 py-2 text-sm rounded-t-lg">🎬 API Sources</button>
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
    if (tab === 'messages')  return renderMessagesTab(c);
    if (tab === 'usermsg')   return renderUserMessagesTab(c);
    if (tab === 'site')      return renderSiteTab(c);
    if (tab === 'register')  return renderRegisterTab(c);
    if (tab === 'points')    return renderPointsTab(c);
    if (tab === 'loginlog')  return renderLoginLogTab(c);
    if (tab === 'seenbooks') return renderSeenBooksTab(c);
    if (tab === 'apisources') return renderApiSourcesTab(c);
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
                    <button class="act-purchase text-xs px-3 py-1.5 hover:bg-amber-500/20 text-amber-200 rounded text-left">ดูเติมเงิน</button>
                    <button class="act-inbox text-xs px-3 py-1.5 hover:bg-blue-500/20 text-blue-200 rounded text-left">ดูจดหมาย</button>
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
  $$('.act-purchase').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    try {
      const d = await backendGet(`/api/admin/user/${encodeURIComponent(username)}/purchase-history`);
      const fmt = iso => {
        const dt = new Date(iso);
        return isNaN(dt.getTime()) ? '' : dt.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      };
      const topups = (d.topups || []).slice().reverse();
      const vip = (d.vip || []).slice().reverse();
      const slips = (d.slips || []).slice().reverse();
      const totalCoin = topups.reduce((s, t) => s + (t.coins || 0), 0);
      const totalSpent = topups.reduce((s, t) => s + (t.pricePaid || 0), 0);
      const totalVipDays = vip.reduce((s, v) => s + (v.days || 0), 0);
      const statusBadge = s => {
        const map = { pending: 'bg-amber-500/20 text-amber-300', approved: 'bg-emerald-500/20 text-emerald-300', rejected: 'bg-red-500/20 text-red-300' };
        const lbl = { pending: 'รออนุมัติ', approved: 'อนุมัติ', rejected: 'ปฏิเสธ' }[s] || s;
        return `<span class="text-[10px] font-bold px-2 py-0.5 rounded ${map[s] || 'bg-zinc-700 text-zinc-300'}">${lbl}</span>`;
      };
      let body = `
        <div class="grid grid-cols-3 gap-2 mb-4">
          <div class="bg-zinc-800/50 rounded p-2 text-center"><div class="text-[10px] text-zinc-500">เติมสะสม</div><div class="text-lg font-black text-amber-400">${totalCoin.toLocaleString()} MKW</div></div>
          <div class="bg-zinc-800/50 rounded p-2 text-center"><div class="text-[10px] text-zinc-500">จ่ายจริง</div><div class="text-lg font-black text-zinc-200">฿${totalSpent.toLocaleString()}</div></div>
          <div class="bg-zinc-800/50 rounded p-2 text-center"><div class="text-[10px] text-zinc-500">VIP รวม</div><div class="text-lg font-black text-purple-300">${totalVipDays} วัน</div></div>
        </div>`;
      if (slips.length) {
        body += `<div class="mb-3"><div class="text-xs font-bold text-zinc-400 mb-1.5">📋 สลิป (${slips.length})</div>` +
          slips.map(s => `<div class="bg-zinc-950/50 border border-zinc-800 rounded px-3 py-2 text-xs mb-1 flex items-center gap-2 flex-wrap">${statusBadge(s.status)}<span class="font-bold text-amber-400">+${(s.amount || 0).toLocaleString()}</span><span class="text-zinc-500">${fmt(s.uploadedAt)}</span>${s.note ? `<span class="text-zinc-400 w-full">${escapeHtml(s.note)}</span>` : ''}${s.status === 'rejected' && s.rejectReason ? `<span class="text-red-400 w-full">เหตุผล: ${escapeHtml(s.rejectReason)}</span>` : ''}</div>`).join('') +
          `</div>`;
      }
      if (topups.length) {
        body += `<div class="mb-3"><div class="text-xs font-bold text-zinc-400 mb-1.5">💰 ประวัติเหรียญ (${topups.length})</div>` +
          topups.slice(0, 50).map(t => `<div class="flex items-center justify-between text-xs px-3 py-1.5 bg-zinc-950/50 border border-zinc-800/50 rounded mb-1"><span class="text-zinc-500">${fmt(t.at)}</span><span class="text-zinc-400 flex-1 mx-2 truncate">${escapeHtml(String(t.packageId || ''))}</span><span class="font-bold text-amber-400">+${(t.coins || 0).toLocaleString()}</span></div>`).join('') +
          `</div>`;
      }
      if (vip.length) {
        body += `<div><div class="text-xs font-bold text-zinc-400 mb-1.5">👑 VIP (${vip.length})</div>` +
          vip.map(v => `<div class="flex items-center justify-between text-xs px-3 py-1.5 bg-purple-950/20 border border-purple-900/50 rounded mb-1"><span class="text-zinc-500">${fmt(v.at)}</span><span class="text-purple-200 flex-1 mx-2 truncate">${escapeHtml(v.packageLabel || v.packageId || v.source || '')} (${v.days} วัน)</span><span class="font-bold text-purple-300">${v.coinsPaid ? '-' + v.coinsPaid.toLocaleString() : v.source === 'giftcard' ? 'gift' : ''}</span></div>`).join('') +
          `</div>`;
      }
      if (!slips.length && !topups.length && !vip.length) body = `<div class="text-center py-8 text-zinc-500 text-sm">ยังไม่มีประวัติเติมเงิน</div>`;
      $('#userModal').innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.8);backdrop-filter:blur(4px)" id="puOverlay">
          <div class="bg-zinc-900 border border-zinc-700 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h3 class="font-bold">💳 ประวัติเติมเงินของ <span class="font-mono text-amber-400">${escapeHtml(username)}</span></h3>
              <button id="puClose" class="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div class="overflow-auto p-4">${body}</div>
          </div>
        </div>`;
      $('#puClose').onclick = () => $('#userModal').innerHTML = '';
      $('#puOverlay').onclick = ev => { if (ev.target.id === 'puOverlay') $('#userModal').innerHTML = ''; };
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });

  $$('.act-inbox').forEach(b => b.onclick = async () => {
    const username = tr(b).dataset.u;
    try {
      const { inbox } = await backendGet(`/api/admin/user/${encodeURIComponent(username)}/inbox`);
      const fmt = iso => {
        const dt = new Date(iso);
        return isNaN(dt.getTime()) ? '' : dt.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      };
      const list = (inbox || []).slice().reverse();
      const body = list.length ? list.map(m => {
        const deleted = !!m.deletedAt;
        return `<div class="border ${deleted ? 'border-red-900/50 bg-red-950/10' : (m.read ? 'border-zinc-800 bg-zinc-950/50' : 'border-amber-500/30 bg-amber-500/5')} rounded p-3 mb-2 text-xs">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            ${deleted ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300">ลบโดย user</span>' : (m.read ? '<span class="text-[10px] text-zinc-500">อ่านแล้ว</span>' : '<span class="text-[10px] font-bold text-amber-300">● ยังไม่อ่าน</span>')}
            <span class="text-zinc-500">${fmt(m.at)}</span>
            <span class="text-zinc-600 ml-auto font-mono text-[10px]">${escapeHtml(m.id || '')}</span>
          </div>
          ${m.subject ? `<div class="font-bold text-zinc-200 mb-1">${escapeHtml(m.subject)}</div>` : ''}
          <div class="text-zinc-300 whitespace-pre-wrap">${escapeHtml(m.body || '')}</div>
          ${m.from ? `<div class="text-[10px] text-zinc-500 mt-1">จาก: ${escapeHtml(m.from)}</div>` : ''}
          ${deleted ? `<div class="text-[10px] text-red-400 mt-1">ลบเมื่อ: ${fmt(m.deletedAt)}</div>` : ''}
        </div>`;
      }).join('') : `<div class="text-center py-8 text-zinc-500 text-sm">ยังไม่มีจดหมาย</div>`;
      $('#userModal').innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.8);backdrop-filter:blur(4px)" id="ibOverlay">
          <div class="bg-zinc-900 border border-zinc-700 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h3 class="font-bold">📬 จดหมายของ <span class="font-mono text-amber-400">${escapeHtml(username)}</span> <span class="text-xs text-zinc-500 font-normal">(${list.length} ฉบับ — รวมที่ user ลบแล้ว)</span></h3>
              <button id="ibClose" class="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div class="overflow-auto p-4">${body}</div>
          </div>
        </div>`;
      $('#ibClose').onclick = () => $('#userModal').innerHTML = '';
      $('#ibOverlay').onclick = ev => { if (ev.target.id === 'ibOverlay') $('#userModal').innerHTML = ''; };
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
  const [locksRes, fmRes, rlRes, hbRes] = await Promise.all([
    backendGet('/api/admin/locks'),
    backendGet('/api/admin/freemode'),
    backendGet('/api/admin/role-limits'),
    backendGet('/api/admin/hidden-books'),
  ]);
  const { locks } = locksRes;
  const fm = fmRes.freeMode || { enabled: false, message: '', startAt: null, endAt: null };
  const rl = rlRes.roleLimits || { guestEps: 0, userEps: 10 };
  const rlGuestEps = Number.isFinite(rl.guestEps) ? rl.guestEps : 0;
  const rlUserEps = Number.isFinite(rl.userEps) ? rl.userEps : 10;
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
          <p class="text-xs text-zinc-500 mt-0.5">เปิด = <strong class="text-amber-300">user ที่ login ทุกคนดูฟรีทุกตอน</strong> + popup โผล่หน้าแรก • <strong class="text-red-400">guest ต้อง login ก่อน (ดูไม่ได้แม้ตอนเดียว)</strong> • VIP/admin ดูได้ไม่จำกัด • ตั้งช่วงเวลาได้</p>
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
      <div class="flex items-center gap-3 mt-3 flex-wrap">
        <button id="fmSave" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold">บันทึก</button>
        <span class="text-xs ${statusCls}">
          ${statusLabel}${fmtRange()}
          ${fm.setBy ? ` • โดย ${escapeHtml(fm.setBy)} • ${escapeHtml((fm.setAt || '').slice(0, 19).replace('T', ' '))}` : ''}
        </span>
      </div>
    </div>

    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
      <div class="flex items-start gap-3 mb-3">
        <div class="text-2xl">🎫</div>
        <div class="flex-1">
          <h3 class="font-bold">จำกัดจำนวนตอนตาม Role (เมื่อ freeMode ปิด)</h3>
          <p class="text-xs text-zinc-500 mt-0.5">ใช้งานเฉพาะตอนที่ freeMode ปิดอยู่ • VIP / admin ดูได้ทุกตอนเสมอ • VIP หมดอายุ → กลับเป็น user → อยู่ภายใต้ limit นี้</p>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">guest (ไม่ login) ดูได้กี่ตอน</label>
          <input id="rlGuestEps" type="number" min="0" max="999" value="${rlGuestEps}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          <p class="text-[10px] text-zinc-500 mt-1">เกินจำนวนนี้ → ต้อง login/สมัคร • ตั้ง 0 = บังคับ login ตั้งแต่ตอนแรก</p>
        </div>
        <div>
          <label class="text-xs text-zinc-400 mb-1 block">user (login แล้ว, ไม่ใช่ VIP) ดูได้กี่ตอน</label>
          <input id="rlUserEps" type="number" min="0" max="999" value="${rlUserEps}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          <p class="text-[10px] text-zinc-500 mt-1">เกินจำนวนนี้ → ต้องอัปเกรด VIP</p>
        </div>
      </div>
      <button id="rlSave" class="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold">บันทึก Role Limits</button>
      ${rl.setBy ? `<span class="ml-3 text-xs text-zinc-500">โดย ${escapeHtml(rl.setBy)} • ${escapeHtml((rl.setAt || '').slice(0, 19).replace('T', ' '))}</span>` : ''}
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
    if (enabled && !confirm('เปิดโหมด "ดูฟรีทั้งเว็บ" — user ที่ login ดูฟรีทุกตอน / guest ต้อง login ก่อน (ดูไม่ได้แม้ตอนเดียว) — ยืนยัน?')) return;
    try {
      await backendPost('/api/admin/freemode', { enabled, message, startAt, endAt });
      renderLocksTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };

  $('#rlSave').onclick = async () => {
    const guestEps = parseInt($('#rlGuestEps').value, 10);
    const userEps = parseInt($('#rlUserEps').value, 10);
    try {
      await backendPost('/api/admin/role-limits', { guestEps, userEps });
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
      <form id="gForm" class="space-y-3">
        <div class="flex gap-3 flex-wrap">
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="gType" value="coin" checked class="accent-amber-500"/>
            <span class="text-amber-300 font-bold">💰 เหรียญ MKW</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="gType" value="vip" class="accent-purple-500"/>
            <span class="text-purple-300 font-bold">👑 VIP (กำหนดวัน)</span>
          </label>
        </div>
        <div class="grid sm:grid-cols-3 gap-3">
          <input id="gCode" type="text" required placeholder="CODE (เช่น NSV2026)" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm uppercase font-mono"/>
          <input id="gCoins" type="number" min="1" placeholder="จำนวน coin" class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          <button class="px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold">สร้าง</button>
        </div>
        <div id="gVipBox" class="hidden bg-purple-950/20 border border-purple-900/40 rounded p-3">
          <div class="text-xs text-purple-300 mb-2 font-bold">เลือกจำนวนวัน VIP</div>
          <div class="flex gap-2 flex-wrap mb-2">
            <button type="button" data-d="1"  class="vip-preset px-3 py-1.5 bg-zinc-800 hover:bg-purple-600 text-xs rounded">1 วัน</button>
            <button type="button" data-d="7"  class="vip-preset px-3 py-1.5 bg-zinc-800 hover:bg-purple-600 text-xs rounded">7 วัน</button>
            <button type="button" data-d="15" class="vip-preset px-3 py-1.5 bg-zinc-800 hover:bg-purple-600 text-xs rounded">15 วัน</button>
            <button type="button" data-d="30" class="vip-preset px-3 py-1.5 bg-zinc-800 hover:bg-purple-600 text-xs rounded">30 วัน</button>
          </div>
          <input id="gVipDays" type="number" min="1" max="3650" placeholder="หรือพิมพ์เอง (วัน)" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          <p class="text-[10px] text-zinc-500 mt-1">นับเวลาตั้งแต่ user แลก code (ถ้ายัง VIP อยู่ จะต่ออายุจากวันหมดอายุเดิม)</p>
        </div>
        <div class="bg-zinc-950 border border-zinc-800 rounded p-3">
          <label class="text-xs text-zinc-400 mb-1 block">จำนวนคนที่ใช้ได้ (1-999)</label>
          <div class="flex gap-2 flex-wrap items-center">
            <button type="button" data-n="1"   class="use-preset px-3 py-1.5 bg-zinc-800 hover:bg-emerald-600 text-xs rounded">1 คน</button>
            <button type="button" data-n="5"   class="use-preset px-3 py-1.5 bg-zinc-800 hover:bg-emerald-600 text-xs rounded">5 คน</button>
            <button type="button" data-n="10"  class="use-preset px-3 py-1.5 bg-zinc-800 hover:bg-emerald-600 text-xs rounded">10 คน</button>
            <button type="button" data-n="100" class="use-preset px-3 py-1.5 bg-zinc-800 hover:bg-emerald-600 text-xs rounded">100 คน</button>
            <input id="gMaxUses" type="number" min="1" max="999" value="1" class="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-sm w-24"/>
          </div>
          <p class="text-[10px] text-zinc-500 mt-1">user แต่ละคนใช้โค้ดเดียวกันได้ครั้งเดียว (กันใช้ซ้ำคนเดิม)</p>
        </div>
      </form>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr><th class="px-4 py-3 text-left">Code</th><th class="px-4 py-3 text-left">ประเภท</th><th class="px-4 py-3 text-right">มูลค่า</th><th class="px-4 py-3 text-center">ใช้แล้ว</th><th class="px-4 py-3 text-left">สถานะ</th><th class="px-4 py-3 text-right"></th></tr>
        </thead>
        <tbody>
          ${entries.length ? entries.map(([code, g]) => {
            const isVip = g.type === 'vip';
            const max = Number.isFinite(g.maxUses) && g.maxUses > 0 ? g.maxUses : 1;
            const usedCount = Array.isArray(g.uses) ? g.uses.length : (g.used ? 1 : 0);
            const full = usedCount >= max;
            return `
            <tr class="border-t border-zinc-800">
              <td class="px-4 py-3 font-mono">${escapeHtml(code)}</td>
              <td class="px-4 py-3 text-xs">${isVip ? '<span class="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">👑 VIP</span>' : '<span class="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded">💰 Coin</span>'}</td>
              <td class="px-4 py-3 text-right font-bold ${isVip ? 'text-purple-300' : 'text-amber-400'}">${isVip ? `${g.vipDays || 0} วัน` : `${(g.coins || 0).toLocaleString()}`}</td>
              <td class="px-4 py-3 text-center"><button class="show-uses text-xs px-2 py-1 ${usedCount > 0 ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300' : 'bg-zinc-800 text-zinc-500'} rounded font-mono" data-code="${escapeHtml(code)}" ${usedCount === 0 ? 'disabled' : ''}>${usedCount}/${max}</button></td>
              <td class="px-4 py-3">${full ? '<span class="text-zinc-500 text-xs">✓ เต็มแล้ว</span>' : '<span class="text-emerald-400 text-xs">● ใช้ได้</span>'}</td>
              <td class="px-4 py-3 text-right"><button class="rm-gc text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded" data-code="${escapeHtml(code)}">ลบ</button></td>
            </tr>`;
          }).join('') : `<tr><td colspan="6" class="px-4 py-10 text-center text-zinc-500">ยังไม่มี gift card</td></tr>`}
        </tbody>
      </table>
    </div>
    <div id="gcModal"></div>
  `;

  const typeRadios = $$('input[name="gType"]');
  const coinInput = $('#gCoins');
  const vipBox = $('#gVipBox');
  const vipDaysInput = $('#gVipDays');
  const maxUsesInput = $('#gMaxUses');
  const updateForm = () => {
    const t = document.querySelector('input[name="gType"]:checked').value;
    if (t === 'vip') {
      coinInput.classList.add('hidden');
      coinInput.required = false;
      vipBox.classList.remove('hidden');
    } else {
      coinInput.classList.remove('hidden');
      coinInput.required = true;
      vipBox.classList.add('hidden');
    }
  };
  typeRadios.forEach(r => r.onchange = updateForm);
  updateForm();
  $$('.vip-preset').forEach(b => b.onclick = () => { vipDaysInput.value = b.dataset.d; });
  $$('.use-preset').forEach(b => b.onclick = () => { maxUsesInput.value = b.dataset.n; });

  $('#gForm').onsubmit = async e => {
    e.preventDefault();
    const type = document.querySelector('input[name="gType"]:checked').value;
    const code = $('#gCode').value.trim().toUpperCase();
    const maxUses = parseInt(maxUsesInput.value, 10);
    if (!maxUses || maxUses < 1 || maxUses > 999) { alert('จำนวนคนใช้ต้อง 1-999'); return; }
    const payload = { code, type, maxUses };
    if (type === 'vip') {
      const days = parseInt(vipDaysInput.value, 10);
      if (!days || days < 1 || days > 3650) { alert('กรุณาใส่จำนวนวัน VIP (1-3650)'); return; }
      payload.vipDays = days;
    } else {
      const coins = parseInt(coinInput.value, 10);
      if (!coins || coins < 1) { alert('กรุณาใส่จำนวน coin'); return; }
      payload.coins = coins;
    }
    try {
      await backendPost('/api/admin/giftcards', payload);
      renderGiftcardsTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  };
  $$('.rm-gc').forEach(b => b.onclick = async () => {
    if (!confirm(`ลบ gift card "${b.dataset.code}"?`)) return;
    try { await backendDelete(`/api/admin/giftcards/${encodeURIComponent(b.dataset.code)}`); renderGiftcardsTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.show-uses').forEach(b => b.onclick = () => {
    const code = b.dataset.code;
    const g = giftcards[code];
    if (!g) return;
    const uses = Array.isArray(g.uses) ? g.uses : (g.used && g.usedBy ? [{ username: g.usedBy, at: g.usedAt }] : []);
    const fmt = iso => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    const max = Number.isFinite(g.maxUses) && g.maxUses > 0 ? g.maxUses : 1;
    const rows = uses.length
      ? uses.slice().reverse().map((x, i) => `
        <tr class="border-t border-zinc-800">
          <td class="px-3 py-2 text-xs text-zinc-500 text-right">#${uses.length - i}</td>
          <td class="px-3 py-2 font-mono text-zinc-200">${escapeHtml(x.username)}</td>
          <td class="px-3 py-2 text-xs text-zinc-400">${fmt(x.at)}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" class="px-3 py-8 text-center text-zinc-500 text-sm">ยังไม่มีคนใช้</td></tr>`;
    $('#gcModal').innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.8);backdrop-filter:blur(4px)" id="gcOverlay">
        <div class="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 class="font-bold">📋 ประวัติการใช้ <span class="font-mono text-amber-400">${escapeHtml(code)}</span> <span class="text-xs text-zinc-500 font-normal">(${uses.length}/${max})</span></h3>
            <button id="gcClose" class="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
          </div>
          <div class="overflow-auto"><table class="w-full"><tbody>${rows}</tbody></table></div>
        </div>
      </div>`;
    $('#gcClose').onclick = () => $('#gcModal').innerHTML = '';
    $('#gcOverlay').onclick = ev => { if (ev.target.id === 'gcOverlay') $('#gcModal').innerHTML = ''; };
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
  const [anRes, mtRes, trRes, atRes] = await Promise.all([
    backendGet('/api/admin/announcement'),
    backendGet('/api/admin/maintenance'),
    backendGet('/api/admin/tracking'),
    backendGet('/api/admin/auth-toggle'),
  ]);
  const an = anRes.announcement || { enabled: false, text: '', color: 'blue' };
  const mt = mtRes.maintenance || { enabled: false, message: '' };
  const trackingOff = !!trRes.disableTracking;
  const at = atRes || { loginDisabled: false, registerDisabled: false, message: '' };
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

    <div class="bg-zinc-900 border ${(at.loginDisabled || at.registerDisabled) ? 'border-purple-500/50' : 'border-zinc-800'} rounded-xl p-5 mb-5">
      <div class="flex items-start gap-3 mb-3">
        <div class="text-2xl">🔐</div>
        <div class="flex-1">
          <h3 class="font-bold">ปิดระบบ Login / Register</h3>
          <p class="text-xs text-zinc-500 mt-0.5">
            ใช้กรณี: ป้องกันสมัครรัวๆ, ถูก spam, หรือกำลัง maintain DB
            • <strong class="text-purple-300">admin ยัง login ได้ปกติ</strong> ทุกกรณี
          </p>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 gap-3 mb-3">
        <label class="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded p-3 cursor-pointer">
          <div>
            <div class="font-bold text-sm">ปิดระบบ Login</div>
            <div class="text-[10px] text-zinc-500">user ทั่วไปจะ login ไม่ได้ (ยกเว้น admin)</div>
          </div>
          <input type="checkbox" id="atLoginToggle" class="sr-only peer" ${at.loginDisabled ? 'checked' : ''}/>
          <div class="relative w-12 h-7 bg-zinc-700 peer-checked:bg-purple-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-transform peer-checked:after:translate-x-5"></div>
        </label>
        <label class="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded p-3 cursor-pointer">
          <div>
            <div class="font-bold text-sm">ปิดสมัครสมาชิก</div>
            <div class="text-[10px] text-zinc-500">ปิด register form + Google OAuth สำหรับ user ใหม่</div>
          </div>
          <input type="checkbox" id="atRegisterToggle" class="sr-only peer" ${at.registerDisabled ? 'checked' : ''}/>
          <div class="relative w-12 h-7 bg-zinc-700 peer-checked:bg-purple-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-transform peer-checked:after:translate-x-5"></div>
        </label>
      </div>
      <div>
        <label class="text-xs text-zinc-400 mb-1 block">ข้อความที่แสดงให้ user (เมื่อพยายาม login/register)</label>
        <textarea id="atMsg" rows="2" placeholder="เช่น: ระบบสมัครสมาชิกปิดชั่วคราว — กลับมาวันที่ 5 พ.ค." class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm">${escapeHtml(at.message || '')}</textarea>
      </div>
      <button id="atSave" class="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-semibold">บันทึก</button>
      ${(at.loginDisabled || at.registerDisabled) ? `<span class="ml-3 text-xs text-purple-300">● ${at.loginDisabled ? 'Login ปิด ' : ''}${at.registerDisabled ? 'Register ปิด' : ''}</span>` : ''}
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

  $('#atSave').onclick = async () => {
    const loginDisabled = $('#atLoginToggle').checked;
    const registerDisabled = $('#atRegisterToggle').checked;
    const message = $('#atMsg').value.trim();
    if (loginDisabled && !confirm('ยืนยันปิด login? — user ทั่วไปทุกคนจะ login ไม่ได้ (admin ยังเข้าได้)')) return;
    try {
      await backendPost('/api/admin/auth-toggle', { loginDisabled, registerDisabled, message });
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

// ---------- Messages (ส่งข้อความถึง user) ----------
async function renderMessagesTab(c) {
  const { users } = await backendGet('/api/admin/users');
  users.sort((a, b) => a.username.localeCompare(b.username));
  c.innerHTML = `
    <div class="max-w-2xl">
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <h3 class="font-bold mb-3">📬 ส่งข้อความถึง User</h3>
        <p class="text-xs text-zinc-500 mb-4">ข้อความจะปรากฏในกล่องจดหมาย (📬) ของ user พร้อมแจ้งเตือนมุมขวาบน</p>
        <form id="msgForm" class="space-y-3">
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">ส่งถึง</label>
            <select id="msgTo" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm">
              <option value="*" class="font-bold">📢 ทั้งหมด (${users.length} คน) — broadcast</option>
              <option disabled>──────────────</option>
              ${users.map(u => `<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)} (${u.role})${u.googleEmail ? ' • ' + escapeHtml(u.googleEmail) : ''}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">หัวข้อ</label>
            <input id="msgSubject" type="text" maxlength="200" placeholder="เช่น โปรโมชั่นใหม่" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
          </div>
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">เนื้อความ</label>
            <textarea id="msgBody" rows="6" maxlength="3000" placeholder="เขียนข้อความที่อยากส่ง..." class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm resize-none"></textarea>
            <div class="text-[10px] text-zinc-600 mt-1 text-right"><span id="msgLen">0</span>/3000</div>
          </div>
          <div class="p-3 rounded-lg bg-amber-500/5 border border-amber-500/30">
            <label class="flex items-center gap-2 cursor-pointer select-none mb-2">
              <input id="msgGiftEnable" type="checkbox" class="w-4 h-4 accent-amber-500"/>
              <span class="text-sm font-bold text-amber-300">🎁 แนบของขวัญ</span>
              <span class="text-[10px] text-zinc-500">(user ต้องกดเปิดกล่องก่อน)</span>
            </label>
            <div id="msgGiftFields" class="grid grid-cols-2 gap-2 opacity-50 pointer-events-none">
              <div>
                <label class="text-[11px] text-zinc-400 mb-1 block">💰 MKW Coins</label>
                <input id="msgGiftCoins" type="number" min="0" max="100000" value="0" class="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
                <div class="flex gap-1 mt-1">
                  <button type="button" data-gift-coins="10" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">10</button>
                  <button type="button" data-gift-coins="50" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">50</button>
                  <button type="button" data-gift-coins="100" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">100</button>
                  <button type="button" data-gift-coins="500" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">500</button>
                </div>
              </div>
              <div>
                <label class="text-[11px] text-zinc-400 mb-1 block">👑 VIP (วัน)</label>
                <input id="msgGiftVipDays" type="number" min="0" max="365" value="0" class="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
                <div class="flex gap-1 mt-1">
                  <button type="button" data-gift-vip="1" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">1</button>
                  <button type="button" data-gift-vip="3" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">3</button>
                  <button type="button" data-gift-vip="7" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">7</button>
                  <button type="button" data-gift-vip="30" class="flex-1 text-[10px] px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">30</button>
                </div>
              </div>
            </div>
          </div>
          <div id="msgStatus" class="text-sm hidden"></div>
          <div class="flex gap-2">
            <button type="submit" class="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold">📤 ส่งข้อความ</button>
            <button type="button" id="msgReset" class="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded">ล้าง</button>
          </div>
        </form>
      </div>
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400">
        <div class="font-bold text-zinc-300 mb-2">💡 เคล็ดลับ</div>
        <ul class="list-disc list-inside space-y-1">
          <li>ระบบจะส่ง inbox อัตโนมัติอยู่แล้วเมื่อ: อนุมัติ/ปฏิเสธสลิป + ผู้ใช้ซื้อ VIP</li>
          <li>ใช้ broadcast "ทั้งหมด" สำหรับประกาศ ข่าวสาร โปรโมชั่น</li>
          <li>ข้อความจะถูก escape HTML (ปลอดภัยจาก XSS) — รองรับขึ้นบรรทัดใหม่</li>
          <li>Inbox ของ user คนหนึ่งเก็บได้สูงสุด 100 ฉบับ (เก่าสุดถูกลบอัตโนมัติ)</li>
        </ul>
      </div>
    </div>
  `;
  const body = $('#msgBody');
  const len = $('#msgLen');
  body.oninput = () => { len.textContent = body.value.length; };

  const giftEnable = $('#msgGiftEnable');
  const giftFields = $('#msgGiftFields');
  const giftCoinsEl = $('#msgGiftCoins');
  const giftVipEl = $('#msgGiftVipDays');
  giftEnable.onchange = () => {
    if (giftEnable.checked) giftFields.classList.remove('opacity-50', 'pointer-events-none');
    else giftFields.classList.add('opacity-50', 'pointer-events-none');
  };
  $$('[data-gift-coins]').forEach(b => b.onclick = () => { giftCoinsEl.value = b.dataset.giftCoins; });
  $$('[data-gift-vip]').forEach(b => b.onclick = () => { giftVipEl.value = b.dataset.giftVip; });

  $('#msgReset').onclick = () => {
    $('#msgForm').reset();
    len.textContent = '0';
    giftFields.classList.add('opacity-50', 'pointer-events-none');
  };

  $('#msgForm').onsubmit = async e => {
    e.preventDefault();
    const to = $('#msgTo').value;
    const subject = $('#msgSubject').value.trim();
    const bodyText = body.value.trim();
    const status = $('#msgStatus');
    status.classList.remove('hidden', 'text-emerald-400', 'text-red-400');
    if (!subject && !bodyText) {
      status.textContent = 'กรุณาใส่หัวข้อหรือเนื้อความอย่างน้อยหนึ่งอย่าง';
      status.classList.add('text-red-400');
      return;
    }
    const giftOn = giftEnable.checked;
    const coins = giftOn ? Math.max(0, parseInt(giftCoinsEl.value, 10) || 0) : 0;
    const vipDays = giftOn ? Math.max(0, parseInt(giftVipEl.value, 10) || 0) : 0;
    if (giftOn && coins === 0 && vipDays === 0) {
      status.textContent = 'ของขวัญต้องมี coins หรือ VIP อย่างน้อยหนึ่งอย่าง';
      status.classList.add('text-red-400');
      return;
    }
    if (to === '*' && !confirm(`ส่งข้อความถึง user ทั้งหมด ${users.length} คน${giftOn ? ` พร้อมของขวัญ (💰${coins} + 👑${vipDays}d)` : ''}?`)) return;
    try {
      const payload = { to, subject, body: bodyText };
      if (giftOn) { payload.coins = coins; payload.vipDays = vipDays; }
      const r = await backendPost('/api/admin/send-message', payload);
      status.textContent = `✓ ส่งสำเร็จ — ถึง ${r.sentTo} ${r.broadcast ? 'คน (broadcast)' : 'คน'}${giftOn ? ' พร้อมของขวัญ 🎁' : ''}`;
      status.classList.add('text-emerald-400');
      $('#msgForm').reset();
      len.textContent = '0';
      giftFields.classList.add('opacity-50', 'pointer-events-none');
    } catch (ex) {
      status.textContent = ex.message;
      status.classList.add('text-red-400');
    }
  };
}

// ---------- User → Admin messages (received) ----------
async function renderUserMessagesTab(c) {
  const { messages } = await backendGet('/api/admin/user-messages');
  const list = (messages || []).slice().reverse();
  const fmt = iso => {
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? '' : dt.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const unreadCount = list.filter(m => !m.read).length;
  c.innerHTML = `
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <h3 class="font-bold">📥 ข้อความที่ user ส่งหา admin</h3>
      <span class="text-xs text-zinc-500">ทั้งหมด <strong>${list.length}</strong> • ยังไม่อ่าน <strong class="text-amber-300">${unreadCount}</strong></span>
      ${list.length ? `<button id="umClearAll" class="ml-auto text-xs px-3 py-1.5 bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-300 rounded">ล้างทั้งหมด</button>` : ''}
    </div>
    <div class="space-y-2">
      ${list.length ? list.map(m => `
        <div class="bg-zinc-900 border ${m.read ? 'border-zinc-800' : 'border-amber-500/40'} rounded-lg p-4 text-sm" data-id="${escapeHtml(m.id)}">
          <div class="flex items-center gap-2 flex-wrap mb-2">
            ${m.read ? '<span class="text-[10px] text-zinc-500">อ่านแล้ว</span>' : '<span class="text-[10px] font-bold text-amber-300">● ใหม่</span>'}
            <span class="font-mono font-bold text-zinc-200">@${escapeHtml(m.fromUsername || '?')}</span>
            ${m.fromIp ? `<span class="text-[10px] text-zinc-500 font-mono">IP: ${escapeHtml(m.fromIp)}</span>` : ''}
            <span class="text-xs text-zinc-500">${fmt(m.at)}</span>
            <div class="ml-auto flex gap-1">
              ${!m.read ? `<button class="um-read text-[10px] px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded">✓ อ่านแล้ว</button>` : ''}
              <button class="um-reply text-[10px] px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded" data-user="${escapeHtml(m.fromUsername || '')}">↩ ตอบ</button>
              <button class="um-del text-[10px] px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded">ลบ</button>
            </div>
          </div>
          ${m.subject ? `<div class="font-bold text-zinc-100 mb-1">${escapeHtml(m.subject)}</div>` : ''}
          <div class="text-zinc-300 whitespace-pre-wrap text-sm">${escapeHtml(m.body || '')}</div>
        </div>
      `).join('') : `<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm">ยังไม่มีข้อความ</div>`}
    </div>
  `;

  $$('.um-read').forEach(b => b.onclick = async () => {
    const id = b.closest('[data-id]').dataset.id;
    try { await backendPost(`/api/admin/user-messages/${encodeURIComponent(id)}/read`, {}); renderUserMessagesTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.um-del').forEach(b => b.onclick = async () => {
    const id = b.closest('[data-id]').dataset.id;
    if (!confirm('ลบข้อความนี้?')) return;
    try { await backendDelete(`/api/admin/user-messages/${encodeURIComponent(id)}`); renderUserMessagesTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('.um-reply').forEach(b => b.onclick = () => {
    const username = b.dataset.user;
    if (!username) return;
    $$('.tab-btn').forEach(x => x.classList.toggle('active', x.dataset.tab === 'messages'));
    loadTab('messages').then(() => {
      setTimeout(() => {
        const sel = $('#msgTo');
        if (sel) sel.value = username;
        $('#msgSubject')?.focus();
      }, 50);
    });
  });
  const clearAll = $('#umClearAll');
  if (clearAll) clearAll.onclick = async () => {
    if (!confirm(`ลบข้อความทั้งหมด ${list.length} ฉบับ?`)) return;
    try { await backendDelete('/api/admin/user-messages'); renderUserMessagesTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  };
}

// ---------- Register / IP control ----------
async function renderRegisterTab(c) {
  const [wg, rs] = await Promise.all([
    backendGet('/api/admin/welcome-gift'),
    backendGet('/api/admin/register-settings'),
  ]);
  const gift = wg.welcomeGift || { enabled: false, coins: 0, vipDays: 0, message: '' };
  const settings = rs.registerSettings || { maxPerIp: 3, banHours: 24 };
  const ipLog = rs.registerIpLog || {};
  const banned = rs.bannedIps || {};
  const fmt = ts => {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('th-TH');
  };
  const bannedEntries = Object.entries(banned).sort((a, b) => (b[1].until || 0) - (a[1].until || 0));
  const logEntries = Object.entries(ipLog).sort((a, b) => (b[1].firstAt || 0) - (a[1].firstAt || 0)).slice(0, 50);

  c.innerHTML = `
    <div class="max-w-3xl space-y-4">
      <!-- Welcome gift -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="font-bold mb-3">🎁 ของขวัญต้อนรับสมาชิกใหม่</h3>
        <p class="text-xs text-zinc-500 mb-4">ส่งอัตโนมัติเข้า inbox ของ user เมื่อสมัครใหม่ (user ต้องกดเปิดกล่องเอง)</p>
        <form id="wgForm" class="space-y-3">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input id="wgEnabled" type="checkbox" class="w-4 h-4 accent-amber-500" ${gift.enabled ? 'checked' : ''}/>
            <span class="text-sm font-bold">เปิดใช้งาน</span>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-zinc-400 mb-1 block">💰 MKW Coins</label>
              <input id="wgCoins" type="number" min="0" max="100000" value="${gift.coins || 0}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
            </div>
            <div>
              <label class="text-xs text-zinc-400 mb-1 block">👑 VIP (วัน)</label>
              <input id="wgVipDays" type="number" min="0" max="365" value="${gift.vipDays || 0}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
            </div>
          </div>
          <div>
            <label class="text-xs text-zinc-400 mb-1 block">ข้อความต้อนรับ</label>
            <textarea id="wgMsg" rows="3" maxlength="1000" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm resize-none">${escapeHtml(gift.message || 'ยินดีต้อนรับสู่ MKW Movies!')}</textarea>
          </div>
          <div id="wgStatus" class="text-sm hidden"></div>
          <div class="flex gap-2 flex-wrap">
            <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-bold">💾 บันทึก</button>
            <button type="button" id="wgTestBtn" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm rounded">🧪 ทดสอบส่งให้ตัวเอง</button>
          </div>
          <div id="wgTestResult" class="text-xs hidden"></div>
        </form>
      </div>

      <!-- Register settings -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="font-bold mb-3">🛡️ ตั้งค่าการสมัครสมาชิก</h3>
        <p class="text-xs text-zinc-500 mb-4">จำกัดจำนวนการสมัครต่อ IP — หากเกินจะแบน IP ตามระยะเวลาที่ตั้งไว้</p>
        <form id="rsForm" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-zinc-400 mb-1 block">สูงสุดต่อ IP (ภายใน 24 ชม.)</label>
              <input id="rsMax" type="number" min="1" max="100" value="${settings.maxPerIp || 3}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
            </div>
            <div>
              <label class="text-xs text-zinc-400 mb-1 block">ระยะเวลาแบน (ชั่วโมง)</label>
              <input id="rsBan" type="number" min="1" max="8760" value="${settings.banHours || 24}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
            </div>
          </div>
          <div id="rsStatus" class="text-sm hidden"></div>
          <button type="submit" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-bold">💾 บันทึก</button>
        </form>
      </div>

      <!-- Banned IPs -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="font-bold mb-3">🚫 IP ที่ถูกแบน <span class="text-xs text-zinc-500 font-normal">(${bannedEntries.length})</span></h3>
        ${bannedEntries.length ? `
          <div class="space-y-2">
            ${bannedEntries.map(([ip, info]) => `
              <div class="flex items-center gap-2 p-2 bg-zinc-950 border border-red-500/30 rounded">
                <div class="flex-1 min-w-0">
                  <div class="font-mono text-sm">${escapeHtml(ip)}</div>
                  <div class="text-[10px] text-zinc-500">เหตุผล: ${escapeHtml(info.reason || '—')} • ถึง: ${fmt(info.until)}</div>
                </div>
                <button data-unban="${escapeHtml(ip)}" class="text-[11px] px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded">ปลดแบน</button>
              </div>
            `).join('')}
          </div>
        ` : `<div class="text-xs text-zinc-500 text-center py-4">ไม่มี IP ที่ถูกแบน</div>`}
      </div>

      <!-- IP log -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="font-bold mb-3">📊 บันทึก IP สมัครล่าสุด <span class="text-xs text-zinc-500 font-normal">(${logEntries.length} IPs)</span></h3>
        ${logEntries.length ? `
          <div class="space-y-1 text-xs">
            ${logEntries.map(([ip, info]) => {
              const n = info.count || 0;
              const over = n >= (settings.maxPerIp || 3);
              return `<div class="flex items-center gap-2 px-2 py-1.5 ${over ? 'bg-red-500/10' : 'bg-zinc-950'} rounded">
                <span class="font-mono flex-1 truncate">${escapeHtml(ip)}</span>
                <span class="${over ? 'text-red-400 font-bold' : 'text-zinc-400'}">${n} ครั้ง</span>
                <span class="text-zinc-600">${fmt(info.firstAt)}</span>
              </div>`;
            }).join('')}
          </div>
        ` : `<div class="text-xs text-zinc-500 text-center py-4">ยังไม่มีบันทึก</div>`}
      </div>
    </div>
  `;

  $('#wgForm').onsubmit = async e => {
    e.preventDefault();
    const st = $('#wgStatus');
    st.classList.remove('hidden', 'text-emerald-400', 'text-red-400');
    try {
      await backendPost('/api/admin/welcome-gift', {
        enabled: $('#wgEnabled').checked,
        coins: Math.max(0, parseInt($('#wgCoins').value, 10) || 0),
        vipDays: Math.max(0, parseInt($('#wgVipDays').value, 10) || 0),
        message: $('#wgMsg').value.trim(),
      });
      st.textContent = '✓ บันทึกสำเร็จ';
      st.classList.add('text-emerald-400');
    } catch (ex) {
      st.textContent = ex.message;
      st.classList.add('text-red-400');
    }
  };

  $('#wgTestBtn').onclick = async () => {
    const st = $('#wgTestResult');
    st.classList.remove('hidden', 'text-emerald-400', 'text-red-400', 'text-amber-400');
    st.classList.add('text-amber-400');
    st.textContent = '⏳ กำลังส่ง...';
    try {
      const r = await backendPost('/api/admin/welcome-gift/test', {});
      st.classList.remove('text-amber-400');
      st.classList.add('text-emerald-400');
      const g = r.gift || {};
      st.innerHTML = `✓ ส่งสำเร็จ → ${escapeHtml(r.deliveredTo || '')} (msgId: ${escapeHtml(String(r.messageId || ''))})<br>ของขวัญ: type=${escapeHtml(String(g.type || ''))} • coins=${g.coins || 0} • vipDays=${g.vipDays || 0}<br><span class="text-zinc-500">เปิดกล่องจดหมายของ admin เพื่อตรวจสอบ</span>`;
    } catch (ex) {
      st.classList.remove('text-amber-400');
      st.classList.add('text-red-400');
      st.textContent = '✗ ' + ex.message;
    }
  };

  $('#rsForm').onsubmit = async e => {
    e.preventDefault();
    const st = $('#rsStatus');
    st.classList.remove('hidden', 'text-emerald-400', 'text-red-400');
    try {
      await backendPost('/api/admin/register-settings', {
        maxPerIp: Math.max(1, parseInt($('#rsMax').value, 10) || 3),
        banHours: Math.max(1, parseInt($('#rsBan').value, 10) || 24),
      });
      st.textContent = '✓ บันทึกสำเร็จ';
      st.classList.add('text-emerald-400');
    } catch (ex) {
      st.textContent = ex.message;
      st.classList.add('text-red-400');
    }
  };

  $$('[data-unban]').forEach(b => b.onclick = async () => {
    const ip = b.dataset.unban;
    if (!confirm(`ปลดแบน IP ${ip}?`)) return;
    try {
      await backendDelete(`/api/admin/banned-ips/${encodeURIComponent(ip)}`);
      renderRegisterTab(c);
    } catch (ex) { alert('ไม่สำเร็จ: ' + ex.message); }
  });
}

// ---------- Points & Packages ----------
async function renderPointsTab(c) {
  const [pc, topup, vip] = await Promise.all([
    backendGet('/api/admin/points-config'),
    backendGet('/api/admin/topup-packages'),
    backendGet('/api/admin/vip-packages'),
  ]);
  const cfg = pc.pointsConfig || { pointsPerMinute: 10, dailyCap: 10000, redeemRate: 100 };
  const topupPkgs = topup.packages || [];
  const vipPkgs = vip.packages || [];

  const topupRow = (p, i) => `
    <tr data-idx="${i}" class="topup-row border-t border-zinc-800">
      <td class="p-2"><input class="tp-id w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono" value="${escapeHtml(p.id || '')}" maxlength="50"/></td>
      <td class="p-2"><input class="tp-coins w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-right" type="number" min="1" value="${p.coins || 0}"/></td>
      <td class="p-2"><input class="tp-price w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-right" type="number" min="1" value="${p.price || 0}"/></td>
      <td class="p-2"><input class="tp-label w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs" value="${escapeHtml(p.label || '')}" maxlength="100"/></td>
      <td class="p-2 text-center"><button type="button" class="tp-del text-red-400 hover:text-red-300 text-lg leading-none">×</button></td>
    </tr>`;
  const vipRow = (p, i) => `
    <tr data-idx="${i}" class="vip-row border-t border-zinc-800">
      <td class="p-2"><input class="vp-id w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono" value="${escapeHtml(p.id || '')}" maxlength="50"/></td>
      <td class="p-2"><input class="vp-days w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-right" type="number" min="1" value="${p.days || 0}"/></td>
      <td class="p-2"><input class="vp-coins w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-right" type="number" min="1" value="${p.coins || 0}"/></td>
      <td class="p-2"><input class="vp-label w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs" value="${escapeHtml(p.label || '')}" maxlength="100"/></td>
      <td class="p-2 text-center"><button type="button" class="vp-del text-red-400 hover:text-red-300 text-lg leading-none">×</button></td>
    </tr>`;

  c.innerHTML = `
    <div class="max-w-4xl space-y-4">

      <!-- Points config -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="font-bold mb-3">⭐ Online Point — ตั้งค่าระบบพ้อย</h3>
        <p class="text-xs text-zinc-500 mb-4">พ้อยที่ได้จากการดูวิดีโอ (1 นาที = X พ้อย) — cap ต่อวัน — อัตราแลกเหรียญ</p>
        <form id="pcForm" class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="text-xs text-zinc-400 mb-1 block">⏱️ Point ต่อนาที</label>
              <input id="pcPerMin" type="number" min="1" max="1000" value="${cfg.pointsPerMinute}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
              <div class="text-[10px] text-zinc-600 mt-1">ปัจจุบัน: 1 นาที = ${cfg.pointsPerMinute} point</div>
            </div>
            <div>
              <label class="text-xs text-zinc-400 mb-1 block">📅 Cap ต่อวัน</label>
              <input id="pcCap" type="number" min="0" max="1000000" value="${cfg.dailyCap}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
              <div class="text-[10px] text-zinc-600 mt-1">สูงสุด ${cfg.dailyCap.toLocaleString()} point/วัน</div>
            </div>
            <div>
              <label class="text-xs text-zinc-400 mb-1 block">💱 Redeem rate (Point → 1 Coin)</label>
              <input id="pcRate" type="number" min="1" max="100000" value="${cfg.redeemRate}" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm"/>
              <div class="text-[10px] text-zinc-600 mt-1">${cfg.redeemRate} point = 1 MKW Coin</div>
            </div>
          </div>
          <div id="pcStatus" class="text-sm hidden"></div>
          <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-bold">💾 บันทึก</button>
        </form>
      </div>

      <!-- Topup packages -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="font-bold mb-3">💰 แพ็กเกจเติม MKW Coin</h3>
        <p class="text-xs text-zinc-500 mb-4">user เห็นใน topup page — id ห้ามซ้ำ, coins = จำนวนเหรียญที่ได้, price = ราคาจ่ายเป็นบาท</p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-zinc-950 text-zinc-400">
              <tr>
                <th class="p-2 text-left w-24">ID</th>
                <th class="p-2 text-right w-24">Coins ที่ได้</th>
                <th class="p-2 text-right w-24">ราคา (บาท)</th>
                <th class="p-2 text-left">Label</th>
                <th class="p-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody id="topupTable">
              ${topupPkgs.map((p, i) => topupRow(p, i)).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex gap-2 flex-wrap mt-3">
          <button type="button" id="topupAdd" class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs rounded">+ เพิ่มแพ็กเกจ</button>
          <button type="button" id="topupSave" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold">💾 บันทึกทั้งหมด</button>
        </div>
        <div id="topupStatus" class="text-xs mt-2 hidden"></div>
      </div>

      <!-- VIP packages -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="font-bold mb-3">👑 แพ็กเกจ VIP (แลกด้วยเหรียญ)</h3>
        <p class="text-xs text-zinc-500 mb-4">user ซื้อ VIP ด้วย MKW Coin — id ห้ามซ้ำ, days = จำนวนวัน, coins = ราคาเหรียญ</p>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-zinc-950 text-zinc-400">
              <tr>
                <th class="p-2 text-left w-24">ID</th>
                <th class="p-2 text-right w-20">Days</th>
                <th class="p-2 text-right w-24">ราคา Coins</th>
                <th class="p-2 text-left">Label</th>
                <th class="p-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody id="vipTable">
              ${vipPkgs.map((p, i) => vipRow(p, i)).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex gap-2 flex-wrap mt-3">
          <button type="button" id="vipAdd" class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs rounded">+ เพิ่มแพ็กเกจ</button>
          <button type="button" id="vipSave" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold">💾 บันทึกทั้งหมด</button>
        </div>
        <div id="vipStatus" class="text-xs mt-2 hidden"></div>
      </div>

    </div>
  `;

  // Points config save
  $('#pcForm').onsubmit = async e => {
    e.preventDefault();
    const st = $('#pcStatus');
    st.classList.remove('hidden', 'text-emerald-400', 'text-red-400');
    try {
      await backendPost('/api/admin/points-config', {
        pointsPerMinute: parseInt($('#pcPerMin').value, 10),
        dailyCap: parseInt($('#pcCap').value, 10),
        redeemRate: parseInt($('#pcRate').value, 10),
      });
      st.textContent = '✓ บันทึกสำเร็จ — ค่าใหม่มีผลทันที (user ต้อง refresh เพื่อเห็น cap ใหม่)';
      st.classList.add('text-emerald-400');
    } catch (ex) {
      st.textContent = ex.message;
      st.classList.add('text-red-400');
    }
  };

  // Topup table
  const bindTopupDel = () => {
    $$('.tp-del').forEach(b => b.onclick = () => b.closest('tr').remove());
  };
  bindTopupDel();
  $('#topupAdd').onclick = () => {
    const idx = $$('.topup-row').length;
    $('#topupTable').insertAdjacentHTML('beforeend', topupRow({ id: 'p' + (idx + 1), coins: 100, price: 100, label: '' }, idx));
    bindTopupDel();
  };
  $('#topupSave').onclick = async () => {
    const st = $('#topupStatus');
    st.classList.remove('hidden', 'text-emerald-400', 'text-red-400');
    const packages = [];
    for (const row of $$('.topup-row')) {
      packages.push({
        id: row.querySelector('.tp-id').value.trim(),
        coins: parseInt(row.querySelector('.tp-coins').value, 10),
        price: parseInt(row.querySelector('.tp-price').value, 10),
        label: row.querySelector('.tp-label').value.trim(),
      });
    }
    try {
      await backendPost('/api/admin/topup-packages', { packages });
      st.textContent = '✓ บันทึกสำเร็จ';
      st.classList.add('text-emerald-400');
    } catch (ex) {
      st.textContent = ex.message;
      st.classList.add('text-red-400');
    }
  };

  // VIP table
  const bindVipDel = () => {
    $$('.vp-del').forEach(b => b.onclick = () => b.closest('tr').remove());
  };
  bindVipDel();
  $('#vipAdd').onclick = () => {
    const idx = $$('.vip-row').length;
    $('#vipTable').insertAdjacentHTML('beforeend', vipRow({ id: 'vip' + (idx + 1), days: 7, coins: 500, label: '' }, idx));
    bindVipDel();
  };
  $('#vipSave').onclick = async () => {
    const st = $('#vipStatus');
    st.classList.remove('hidden', 'text-emerald-400', 'text-red-400');
    const packages = [];
    for (const row of $$('.vip-row')) {
      packages.push({
        id: row.querySelector('.vp-id').value.trim(),
        days: parseInt(row.querySelector('.vp-days').value, 10),
        coins: parseInt(row.querySelector('.vp-coins').value, 10),
        label: row.querySelector('.vp-label').value.trim(),
      });
    }
    try {
      await backendPost('/api/admin/vip-packages', { packages });
      st.textContent = '✓ บันทึกสำเร็จ';
      st.classList.add('text-emerald-400');
    } catch (ex) {
      st.textContent = ex.message;
      st.classList.add('text-red-400');
    }
  };
}

// ---------- Seen books (NEW badge tracking — read-only log + clear) ----------
async function renderSeenBooksTab(c) {
  const [{ seenBooks }, pollStatus] = await Promise.all([
    backendGet('/api/admin/seen-books'),
    backendGet('/api/admin/poll-status').catch(() => ({ lastPollAt: {} })),
  ]);
  const lastPollAt = pollStatus.lastPollAt || {};
  const sources = ['dramabox', 'melolo', 'shortmax', 'dramawave', 'netshort'];
  const labels = { dramabox: 'DramaBox', melolo: 'Melolo', shortmax: 'ShortMax', dramawave: 'DramaWave', netshort: 'Netshort' };
  const fmt = iso => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const totals = sources.map(s => (seenBooks[s] || []).length);
  const newCounts = sources.map(s => (seenBooks[s] || []).filter(b => b.isNew).length);

  c.innerHTML = `
    <div class="space-y-4">
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 class="font-bold mb-2">🆕 ระบบติดตามหนังใหม่</h3>
        <p class="text-xs text-zinc-500 mb-3">
          ระบบบันทึก bookId ทุกเรื่องที่ frontend เห็นบนหน้าแรก/หน้า browse — เรื่องที่
          <strong class="text-red-400">เห็นครั้งแรกภายใน 7 วันล่าสุด + ติด top 10 ใหม่สุดของ source</strong>
          จะแสดง badge <span class="px-2 py-0.5 bg-red-600 text-white text-[10px] font-black rounded">🆕 NEW</span> บนหน้าปก
          จนกว่าจะมีเรื่องใหม่กว่ามาแทนที่ • <span class="text-amber-300">user ลบไม่ได้ — admin เท่านั้น</span>
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          ${sources.map((s, i) => `
            <div class="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded">
              <div class="font-bold text-zinc-200">${labels[s]}</div>
              <div class="text-zinc-500">บันทึก ${totals[i]} • <span class="text-red-400 font-bold">NEW ${newCounts[i]}</span></div>
            </div>
          `).join('')}
        </div>
        <div class="flex gap-2 mt-3 flex-wrap">
          <button id="sbPollNow" class="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded">🔄 Poll ตอนนี้ (active)</button>
          <button id="sbClearAll" class="text-xs px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-300 rounded">⚠ ล้างทั้งหมด (รีเซ็ต NEW ทุก source)</button>
        </div>
        <div class="mt-3 text-[11px] text-zinc-500 leading-relaxed">
          🕛 <strong class="text-zinc-300">Active polling เที่ยงคืนทุกวัน (เวลาประเทศไทย)</strong> — ระบบจะดึง /list หน้าแรกของทั้ง 5 ค่ายอัตโนมัติ เพิ่มหนังใหม่ที่ยังไม่เคยเห็น แต่ละค่ายแยกกัน fail-isolated (ค่ายหนึ่งล่มไม่กระทบอีกค่าย).
          <span class="block mt-1 text-zinc-600">Poll ล่าสุดต่อค่าย: ${sources.map(s => `${labels[s]}: <span class="text-zinc-300">${fmt(lastPollAt[s]) || '—'}</span>`).join(' • ')}</span>
        </div>
      </div>

      ${sources.map(s => {
        const list = seenBooks[s] || [];
        return `
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <h4 class="font-bold">${labels[s]}</h4>
              <span class="text-xs text-zinc-500">${list.length} เรื่อง • <span class="text-red-400 font-bold">${list.filter(b => b.isNew).length} NEW</span></span>
              ${list.length ? `<button data-clear-src="${s}" class="ml-auto text-[11px] px-2 py-1 bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-300 rounded">ล้าง ${labels[s]}</button>` : ''}
            </div>
            ${list.length ? `
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-zinc-950 text-zinc-400">
                    <tr>
                      <th class="p-2 text-left">ปก</th>
                      <th class="p-2 text-left">ชื่อเรื่อง</th>
                      <th class="p-2 text-left font-mono">bookId</th>
                      <th class="p-2 text-left">เห็นครั้งแรก</th>
                      <th class="p-2 text-center w-16">NEW</th>
                      <th class="p-2 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${list.slice(0, 100).map(b => `
                      <tr class="border-t border-zinc-800">
                        <td class="p-2">${b.cover ? `<img src="${escapeHtml(b.cover)}" class="w-8 h-12 object-cover rounded" onerror="this.style.display='none'"/>` : '<span class="text-zinc-600">—</span>'}</td>
                        <td class="p-2">${escapeHtml(b.bookName || '(ไม่ทราบชื่อ)')}</td>
                        <td class="p-2 font-mono text-zinc-500">${escapeHtml(b.bookId)}</td>
                        <td class="p-2 text-zinc-400">${fmt(b.firstSeenAt)}</td>
                        <td class="p-2 text-center">${b.isNew ? '<span class="px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-black rounded">NEW</span>' : '<span class="text-zinc-600">—</span>'}</td>
                        <td class="p-2 text-center"><button data-del-src="${s}" data-del-id="${escapeHtml(b.bookId)}" class="text-red-400 hover:text-red-300 text-lg leading-none">×</button></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                ${list.length > 100 ? `<div class="text-center text-[11px] text-zinc-500 py-2">แสดง 100 รายการล่าสุด (จากทั้งหมด ${list.length})</div>` : ''}
              </div>
            ` : `<div class="text-xs text-zinc-500 text-center py-6">ยังไม่มีบันทึก — รอ user เข้าหน้าแรก/browse</div>`}
          </div>
        `;
      }).join('')}
    </div>
  `;

  $('#sbClearAll').onclick = async () => {
    if (!confirm('ล้าง bookId ที่บันทึกไว้ทั้งหมดทุก source? — ทุกเรื่องจะถูก mark NEW อีกครั้งเมื่อ user เข้าเว็บ')) return;
    try { await backendDelete('/api/admin/seen-books'); renderSeenBooksTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  };
  $('#sbPollNow').onclick = async () => {
    const btn = $('#sbPollNow');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ กำลัง poll ทุก source...';
    try {
      const r = await backendPost('/api/admin/poll-now', {});
      const lines = (r.summary || []).map(s =>
        s.error ? `${s.source}: ✕ ${s.error}` : `${s.source}: +${s.added} ใหม่ / ${s.fetched} ดึง / รวม ${s.total}`
      );
      alert('Poll เสร็จ:\n\n' + lines.join('\n'));
      renderSeenBooksTab(c);
    } catch (e) {
      alert('Poll ไม่สำเร็จ: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  };
  $$('[data-clear-src]').forEach(b => b.onclick = async () => {
    const src = b.dataset.clearSrc;
    if (!confirm(`ล้างบันทึก ${labels[src]} ทั้งหมด?`)) return;
    try { await backendDelete(`/api/admin/seen-books?source=${encodeURIComponent(src)}`); renderSeenBooksTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('[data-del-id]').forEach(b => b.onclick = async () => {
    const src = b.dataset.delSrc;
    const bid = b.dataset.delId;
    if (!confirm(`ลบ bookId ${bid} ออกจากบันทึก?`)) return;
    try { await backendDelete(`/api/admin/seen-books/${encodeURIComponent(src)}/${encodeURIComponent(bid)}`); renderSeenBooksTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
}

// ---------- API Sources (registry สำหรับ admin จัดการ API หนังต่างๆ) ----------
const _ADAPTERS = ['dramabox', 'melolo', 'shortmax', 'dramawave', 'netshort'];
const _ENDPOINT_FIELDS = [
  { k: 'list',        label: 'list',        hint: 'รายการทั้งหมด (ใช้ใน home)', vars: '{page} {page_size} {locale}' },
  { k: 'search',      label: 'search',      hint: 'ค้นหา',                       vars: '{keyword} {page} {page_size} {locale}' },
  { k: 'detail',      label: 'detail',      hint: 'ข้อมูลซีรีส์',                  vars: '{series_id} {locale}' },
  { k: 'alleps',      label: 'alleps',      hint: 'list ตอนทั้งหมด (เว้นว่างถ้า extract จาก detail)', vars: '{series_id} {locale}' },
  { k: 'genres',      label: 'genres',      hint: 'list หมวดหมู่',                 vars: '{locale}' },
  { k: 'genre',       label: 'genre',       hint: 'list ตาม genre',              vars: '{genre_id} {page} {page_size} {locale}' },
  { k: 'genreSearch', label: 'genreSearch', hint: 'ค้นหาภายใน genre',            vars: '{genre_id} {keyword} {page} {page_size} {locale}' },
  { k: 'locales',     label: 'locales',     hint: 'list ภาษาที่มี (ใช้กับ locale picker)', vars: '(ไม่มี)' },
  { k: 'video',       label: 'video',       hint: 'URL ตอน (lazy fetch ตอนเล่น เว้นว่างถ้า URL อยู่ใน alleps แล้ว)', vars: '{series_id} {ep} {locale}' },
];
const _BADGE_OPTIONS = [
  { cls: 'bg-red-600',     label: 'แดง' },
  { cls: 'bg-orange-600',  label: 'ส้ม' },
  { cls: 'bg-amber-500',   label: 'เหลือง-ส้ม' },
  { cls: 'bg-yellow-500',  label: 'เหลือง' },
  { cls: 'bg-emerald-600', label: 'เขียว' },
  { cls: 'bg-teal-600',    label: 'เขียว-ฟ้า' },
  { cls: 'bg-blue-600',    label: 'น้ำเงิน' },
  { cls: 'bg-indigo-600',  label: 'ม่วง-น้ำเงิน' },
  { cls: 'bg-purple-600',  label: 'ม่วง' },
  { cls: 'bg-pink-600',    label: 'ชมพู' },
  { cls: 'bg-zinc-700',    label: 'เทา' },
];
// Preset templates (sync กับ DEFAULT_ENDPOINTS ใน serve.js — auto-fill ตอน admin เลือก adapter)
const _ENDPOINT_PRESETS = {
  dramabox: {
    list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:'/detail?bookId={series_id}', alleps:'/allepisode?bookId={series_id}',
    genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'' },
  melolo: {
    list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:'/detail/{series_id}', alleps:'',
    genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'/video?id={series_id}&ep={ep}' },
  shortmax: {
    list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:'/detail/{series_id}', alleps:'/alleps/{series_id}',
    genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'' },
  dramawave: {
    list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:'/drama/{series_id}', alleps:'',
    genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'' },
  netshort: {
    list:'/list?page={page}&page_size={page_size}', search:'/search?keyword={keyword}&page={page}&page_size={page_size}',
    detail:'/drama/{series_id}', alleps:'',
    genres:'/genres', genre:'/genre/{genre_id}?page={page}&page_size={page_size}',
    genreSearch:'/genre/{genre_id}/search?keyword={keyword}&page={page}&page_size={page_size}', locales:'/locales', video:'/watch/{series_id}/{ep}' },
};

// walk response → หา array ที่น่าเป็น locale list → [{id, name}]
function _parseLocales(payload) {
  const tryArr = (arr) => {
    if (!Array.isArray(arr)) return null;
    const items = arr.map(x => {
      if (typeof x === 'string') return { id: x, name: x };
      if (!x || typeof x !== 'object') return null;
      const id = x.id || x.code || x.locale || x.language || x.lang || x.key || x.value || '';
      const name = x.name || x.label || x.display || x.title || id;
      return id ? { id: String(id), name: String(name || id) } : null;
    }).filter(Boolean);
    return items.length ? items : null;
  };
  if (!payload) return [];
  const direct = tryArr(payload);
  if (direct) return direct;
  if (payload && typeof payload === 'object') {
    for (const k of ['data','items','list','result','locales','languages']) {
      const v = payload[k];
      const r = tryArr(v);
      if (r) return r;
      if (v && typeof v === 'object') {
        for (const kk of Object.keys(v)) { const rr = tryArr(v[kk]); if (rr) return rr; }
      }
    }
  }
  return [];
}

async function renderApiSourcesTab(c) {
  const { sources } = await backendGet('/api/admin/api-sources');
  c.innerHTML = `
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <div class="flex-1 min-w-0">
        <h3 class="font-bold text-zinc-200">🎬 API Sources Registry</h3>
        <p class="text-xs text-zinc-500 mt-1 leading-relaxed">
          จัดการ API หนังที่เว็บใช้ดึงข้อมูล — เปิด/ปิด แก้ไข หรือเพิ่ม source ใหม่ <strong class="text-zinc-300">เปลี่ยนแล้วมีผลทันที</strong> ไม่ต้อง redeploy<br/>
          <span class="text-amber-300">⚠ Token ต้องตั้งเป็น env var ใน Render dashboard เท่านั้น (ระบุชื่อ env ในฟอร์ม) — ไม่เก็บค่า token ใน data store</span>
        </p>
      </div>
      <button id="apiSrcAdd" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded shrink-0">+ เพิ่ม Source ใหม่</button>
    </div>
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table class="w-full text-sm min-w-[1000px]">
        <thead class="bg-zinc-800/50 text-zinc-400 text-xs">
          <tr>
            <th class="px-3 py-3 text-left">Key</th>
            <th class="px-3 py-3 text-left">Label / Badge</th>
            <th class="px-3 py-3 text-left">Host + basePath</th>
            <th class="px-3 py-3 text-left">Token env</th>
            <th class="px-3 py-3 text-left">Adapter</th>
            <th class="px-3 py-3 text-center">เปิด</th>
            <th class="px-3 py-3 text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${sources.length === 0
            ? `<tr><td colspan="7" class="px-3 py-10 text-center text-zinc-500">ยังไม่มี source — กดปุ่ม "+ เพิ่ม Source ใหม่"</td></tr>`
            : sources.map(s => `
            <tr class="border-t border-zinc-800" data-key="${escapeHtml(s.key)}">
              <td class="px-3 py-3 font-mono text-xs text-zinc-300">${escapeHtml(s.key)}</td>
              <td class="px-3 py-3">
                <span class="px-2 py-0.5 ${escapeHtml(s.badgeClass)} text-white text-[10px] font-bold rounded">${escapeHtml(s.label)}</span>
              </td>
              <td class="px-3 py-3 text-xs">
                <div class="text-zinc-300 font-mono">${escapeHtml(s.host)}</div>
                <div class="text-zinc-500 font-mono">${escapeHtml(s.basePath || '/')}</div>
              </td>
              <td class="px-3 py-3 text-xs">
                <span class="font-mono text-zinc-300">${escapeHtml(s.tokenEnv || '—')}</span>
                ${s.tokenAvailable
                  ? '<span class="ml-1 text-emerald-400" title="env มีค่า">✓</span>'
                  : '<span class="ml-1 text-red-400" title="env ว่าง">✕</span>'}
              </td>
              <td class="px-3 py-3 text-xs font-mono text-zinc-400">${escapeHtml(s.adapter)}</td>
              <td class="px-3 py-3 text-center">
                <label class="inline-flex items-center cursor-pointer">
                  <input type="checkbox" data-toggle-key="${escapeHtml(s.key)}" ${s.enabled ? 'checked' : ''} class="w-4 h-4 accent-emerald-500"/>
                </label>
              </td>
              <td class="px-3 py-3 text-right whitespace-nowrap">
                <button data-test-key="${escapeHtml(s.key)}" class="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded mr-1" title="ทดสอบ /list">🔌 Test</button>
                <button data-edit-key="${escapeHtml(s.key)}" class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded mr-1">✏ แก้</button>
                <button data-del-key="${escapeHtml(s.key)}" class="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded">🗑 ลบ</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div id="apiSrcResult" class="mt-3 text-xs"></div>
  `;

  $('#apiSrcAdd').onclick = () => openApiSourceForm(null, c);
  $$('[data-edit-key]').forEach(b => b.onclick = () => {
    const key = b.dataset.editKey;
    openApiSourceForm(sources.find(s => s.key === key) || null, c);
  });
  $$('[data-del-key]').forEach(b => b.onclick = async () => {
    const key = b.dataset.delKey;
    if (!confirm(`ลบ source "${key}" ออกจาก registry?\n(ไม่กระทบ data ตอนเก่าที่ดูค้างไว้ แต่เว็บจะไม่แสดง source นี้อีก)`)) return;
    try { await backendDelete(`/api/admin/api-sources/${encodeURIComponent(key)}`); renderApiSourcesTab(c); }
    catch (e) { alert('ไม่สำเร็จ: ' + e.message); }
  });
  $$('[data-toggle-key]').forEach(cb => cb.onchange = async () => {
    const key = cb.dataset.toggleKey;
    const src = sources.find(s => s.key === key);
    if (!src) return;
    try {
      await backendPost('/api/admin/api-sources', { ...src, enabled: cb.checked });
      $('#apiSrcResult').innerHTML = `<span class="text-emerald-400">✓ ${escapeHtml(key)} → ${cb.checked ? 'เปิด' : 'ปิด'} (มีผลทันที)</span>`;
    } catch (e) { alert('ไม่สำเร็จ: ' + e.message); cb.checked = !cb.checked; }
  });
  $$('[data-test-key]').forEach(b => b.onclick = async () => {
    const key = b.dataset.testKey;
    const orig = b.innerHTML;
    b.disabled = true; b.innerHTML = '⏳';
    try {
      const r = await backendPost(`/api/admin/api-sources/${encodeURIComponent(key)}/test`, {});
      const out = $('#apiSrcResult');
      if (r.ok) {
        out.innerHTML = `<span class="text-emerald-400">✓ ${escapeHtml(key)} ทำงานได้ (${r.durationMs}ms, ตัวอย่าง ${r.items} รายการ)</span>`;
      } else {
        out.innerHTML = `<span class="text-red-400">✕ ${escapeHtml(key)} ${escapeHtml(r.error || '')}: ${escapeHtml(r.message || '')}</span>`;
      }
    } catch (e) {
      $('#apiSrcResult').innerHTML = `<span class="text-red-400">✕ ${escapeHtml(e.message)}</span>`;
    } finally { b.disabled = false; b.innerHTML = orig; }
  });
}

function openApiSourceForm(source, c) {
  const isEdit = !!source;
  const defaultEps = { ..._ENDPOINT_PRESETS.dramabox };
  const cur = source || { key: '', label: '', badgeClass: 'bg-zinc-700', enabled: true,
    host: 'api.seriesjeen.online', basePath: '', tokenEnv: 'SERIESJEEN_TOKEN', adapter: 'dramabox',
    endpoints: defaultEps, localeParam: '', locales: { mode: 'all', allowed: [], discovered: [] } };
  const curEps = cur.endpoints && typeof cur.endpoints === 'object' ? cur.endpoints : { ..._ENDPOINT_PRESETS[cur.adapter] || defaultEps };
  const curLocales = cur.locales || { mode: 'all', allowed: [], discovered: [] };
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4';
  overlay.style.background = 'rgba(0,0,0,0.75)';
  overlay.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
        <h4 class="font-black text-lg">${isEdit ? '✏ แก้ไข' : '+ เพิ่ม'} API Source</h4>
        <button class="closeBtn w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-300">✕</button>
      </div>
      <form id="apiSrcForm" class="p-4 space-y-4 text-sm">
        <!-- ===== 1. Identity ===== -->
        <fieldset class="border border-zinc-800 rounded-lg p-3 space-y-3">
          <legend class="px-2 text-xs text-zinc-400 font-bold">① ข้อมูลทั่วไป</legend>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-zinc-400">Key (/proxy/&lt;key&gt;/...)</label>
              <input name="key" type="text" value="${escapeHtml(cur.key)}" ${isEdit ? 'readonly' : ''} required pattern="[a-z0-9_-]{2,30}"
                class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded font-mono ${isEdit ? 'opacity-60' : ''}"/>
              <p class="text-[10px] text-zinc-500 mt-0.5">a-z 0-9 _ - (2-30) แก้ไม่ได้หลังสร้าง</p>
            </div>
            <div>
              <label class="text-xs text-zinc-400">Label</label>
              <input name="label" type="text" value="${escapeHtml(cur.label)}" required maxlength="50"
                class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded"/>
            </div>
            <div>
              <label class="text-xs text-zinc-400">สี Badge</label>
              <select name="badgeClass" class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded">
                ${_BADGE_OPTIONS.map(o => `<option value="${o.cls}" ${o.cls === cur.badgeClass ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="text-xs text-zinc-400">Adapter (response shape)</label>
              <select name="adapter" class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded">
                ${_ADAPTERS.map(a => `<option value="${a}" ${a === cur.adapter ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
              <p class="text-[10px] text-zinc-500 mt-0.5">กำหนด response normalization + auto-fill endpoints preset</p>
            </div>
          </div>
          <label class="flex items-center gap-2 px-3 py-2 bg-zinc-950/50 rounded">
            <input name="enabled" type="checkbox" ${cur.enabled ? 'checked' : ''} class="w-4 h-4 accent-emerald-500"/>
            <span>เปิดใช้งาน (uncheck = ซ่อนจากเว็บ)</span>
          </label>
        </fieldset>

        <!-- ===== 2. Server / Token ===== -->
        <fieldset class="border border-zinc-800 rounded-lg p-3 space-y-3">
          <legend class="px-2 text-xs text-zinc-400 font-bold">② Host / Base / Token</legend>
          <div>
            <label class="text-xs text-zinc-400">Host</label>
            <input name="host" type="text" value="${escapeHtml(cur.host)}" required maxlength="200"
              class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded font-mono"/>
          </div>
          <div>
            <label class="text-xs text-zinc-400">Base Path (prefix prepend ก่อน endpoint)</label>
            <input name="basePath" type="text" value="${escapeHtml(cur.basePath)}" maxlength="200"
              placeholder="/api/platform/&lt;key&gt;"
              class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded font-mono"/>
            <p class="text-[10px] text-zinc-500 mt-0.5">Final URL = https://&lt;host&gt;&lt;basePath&gt;&lt;endpoint&gt;</p>
          </div>
          <div>
            <label class="text-xs text-zinc-400">Token env var (ต้องตั้งใน Render)</label>
            <input name="tokenEnv" type="text" value="${escapeHtml(cur.tokenEnv)}" maxlength="100" pattern="[A-Z0-9_]*"
              placeholder="SERIESJEEN_TOKEN"
              class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded font-mono"/>
          </div>
        </fieldset>

        <!-- ===== 3. Endpoint templates ===== -->
        <fieldset class="border border-zinc-800 rounded-lg p-3 space-y-2">
          <legend class="px-2 text-xs text-zinc-400 font-bold">③ Endpoint templates (placeholder ในวงเล็บ {} จะถูกแทนตอนเรียก)</legend>
          <div class="flex items-center gap-2 mb-1">
            <button type="button" id="apSrcResetEps" class="text-[11px] px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded">↺ รีเซ็ตตาม adapter ที่เลือก</button>
            <span class="text-[10px] text-zinc-500">ใช้ได้: {page} {page_size} {keyword} {series_id} {genre_id} {ep} {locale}</span>
          </div>
          <div class="space-y-2">
            ${_ENDPOINT_FIELDS.map(f => `
              <div class="grid grid-cols-[90px_1fr_auto] gap-2 items-start">
                <div class="pt-1.5">
                  <div class="text-xs font-mono text-emerald-300">${f.label}</div>
                  <div class="text-[10px] text-zinc-500 leading-tight">${escapeHtml(f.vars)}</div>
                </div>
                <div>
                  <input name="ep_${f.k}" type="text" value="${escapeHtml(curEps[f.k] || '')}" maxlength="500"
                    placeholder="${escapeHtml(f.hint)}"
                    class="ep-input w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded font-mono text-xs"/>
                </div>
                <button type="button" data-probe="${f.k}" class="px-2 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white rounded shrink-0" title="ทดสอบ endpoint นี้">🔍 Test</button>
              </div>
            `).join('')}
          </div>
        </fieldset>

        <!-- ===== 4. Locale filter ===== -->
        <fieldset class="border border-zinc-800 rounded-lg p-3 space-y-3">
          <legend class="px-2 text-xs text-zinc-400 font-bold">④ กรองตาม Locale / ภาษา</legend>
          <div>
            <label class="text-xs text-zinc-400">Locale query param (ถ้า API รองรับ)</label>
            <input name="localeParam" type="text" value="${escapeHtml(cur.localeParam || '')}" maxlength="40" pattern="[a-zA-Z0-9_]*"
              placeholder="locale"
              class="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded font-mono"/>
            <p class="text-[10px] text-zinc-500 mt-0.5">ระบบจะ append ?&lt;locale_param&gt;=&lt;id&gt; ตอน fetch. เว้นว่าง = API ไม่รองรับ locale filter</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <label class="flex items-center gap-1.5 text-xs"><input type="radio" name="localeMode" value="all" ${curLocales.mode !== 'selected' ? 'checked' : ''}/> ทั้งหมด (ไม่กรอง)</label>
            <label class="flex items-center gap-1.5 text-xs"><input type="radio" name="localeMode" value="selected" ${curLocales.mode === 'selected' ? 'checked' : ''}/> เลือกบางภาษา</label>
            <button type="button" id="apSrcProbeLocales" class="ml-auto px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold rounded">🔍 ทดสอบ /locales</button>
          </div>
          <div id="apSrcLocaleList" class="mt-2 p-2 bg-zinc-950/50 border border-zinc-800 rounded min-h-[60px]">
            ${_renderLocaleCheckboxes(curLocales.discovered || [], curLocales.allowed || [])}
          </div>
        </fieldset>

        <div id="apiSrcFormMsg" class="text-xs"></div>
        <div id="apiSrcProbeOut" class="text-xs hidden bg-zinc-950 border border-zinc-800 rounded p-2 max-h-60 overflow-auto"></div>
        <div class="flex gap-2 justify-end pt-2 sticky bottom-0 bg-zinc-900 pb-1">
          <button type="button" class="closeBtn px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded">ยกเลิก</button>
          <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded">${isEdit ? 'บันทึก' : 'เพิ่ม'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelectorAll('.closeBtn').forEach(b => b.onclick = close);

  const form = overlay.querySelector('#apiSrcForm');
  const msgEl = overlay.querySelector('#apiSrcFormMsg');
  const probeOutEl = overlay.querySelector('#apiSrcProbeOut');
  const showProbeOut = (title, obj) => {
    probeOutEl.classList.remove('hidden');
    probeOutEl.innerHTML = `<div class="text-zinc-400 mb-1">${escapeHtml(title)}</div><pre class="text-[10px] text-zinc-300 whitespace-pre-wrap break-all">${escapeHtml(JSON.stringify(obj, null, 2)).slice(0, 10000)}</pre>`;
  };

  // Adapter change → reset preset (confirm ก่อน ถ้ามีการแก้ endpoints ไปแล้ว)
  form.adapter.onchange = () => {
    const adapter = form.adapter.value;
    const preset = _ENDPOINT_PRESETS[adapter];
    if (!preset) return;
    const hasCustom = _ENDPOINT_FIELDS.some(f => {
      const cur = form.elements[`ep_${f.k}`].value.trim();
      const presetVal = preset[f.k] || '';
      return cur && cur !== presetVal;
    });
    if (hasCustom && !confirm(`เปลี่ยน adapter เป็น "${adapter}" — เขียนทับ endpoints ปัจจุบันด้วย preset?`)) return;
    _ENDPOINT_FIELDS.forEach(f => { form.elements[`ep_${f.k}`].value = preset[f.k] || ''; });
  };

  // Reset endpoints button
  overlay.querySelector('#apSrcResetEps').onclick = () => {
    const adapter = form.adapter.value;
    const preset = _ENDPOINT_PRESETS[adapter] || _ENDPOINT_PRESETS.dramabox;
    _ENDPOINT_FIELDS.forEach(f => { form.elements[`ep_${f.k}`].value = preset[f.k] || ''; });
  };

  // Collect current form state → body สำหรับ probe (ใช้ live ก่อน save)
  const collectBody = () => {
    const eps = {};
    _ENDPOINT_FIELDS.forEach(f => { eps[f.k] = form.elements[`ep_${f.k}`].value.trim(); });
    const allowed = Array.from(overlay.querySelectorAll('#apSrcLocaleList input[data-loc]:checked')).map(el => el.dataset.loc);
    return {
      key: form.key.value.trim().toLowerCase(),
      label: form.label.value.trim(),
      badgeClass: form.badgeClass.value,
      host: form.host.value.trim(),
      basePath: form.basePath.value.trim(),
      tokenEnv: form.tokenEnv.value.trim().toUpperCase(),
      adapter: form.adapter.value,
      enabled: form.enabled.checked,
      endpoints: eps,
      localeParam: form.localeParam.value.trim(),
      locales: { mode: form.localeMode.value, allowed, discovered: curLocales.discovered || [] },
    };
  };

  // Probe individual endpoint button
  overlay.querySelectorAll('[data-probe]').forEach(btn => btn.onclick = async () => {
    const k = btn.dataset.probe;
    const body = collectBody();
    const tpl = body.endpoints[k];
    if (!tpl) { showProbeOut(`endpoint "${k}" ยังว่าง`, { hint: 'ใส่ template ก่อน เช่น /list?page={page}' }); return; }
    const vars = k === 'detail' || k === 'alleps' || k === 'video'
      ? { series_id: prompt(`ทดสอบ "${k}" — ใส่ series_id ตัวอย่าง:`, '') || '', ep: 1 }
      : (k === 'genre' || k === 'genreSearch')
        ? { genre_id: prompt(`ทดสอบ "${k}" — ใส่ genre_id ตัวอย่าง:`, '') || '', keyword: '', page: 1, page_size: 5 }
        : (k === 'search' ? { keyword: prompt('ทดสอบ search — keyword:', 'drama') || '', page: 1, page_size: 5 } : { page: 1, page_size: 5 });
    btn.disabled = true; const orig = btn.innerHTML; btn.innerHTML = '⏳';
    try {
      const r = await backendPost(`/api/admin/api-sources/${encodeURIComponent(body.key || cur.key || 'new')}/probe`, {
        endpoint: k, template: tpl, vars,
        overrides: { host: body.host, basePath: body.basePath, tokenEnv: body.tokenEnv, adapter: body.adapter },
      });
      if (r.ok) showProbeOut(`✓ ${k} (${r.durationMs}ms) — GET ${r.path}`, r.payload);
      else showProbeOut(`✕ ${k} ${r.error || ''}: ${r.message || ''}`, { path: r.path });
    } catch (e) { showProbeOut(`✕ ${k} ${e.message}`, {}); }
    finally { btn.disabled = false; btn.innerHTML = orig; }
  });

  // Probe /locales → parse → render checkbox list
  overlay.querySelector('#apSrcProbeLocales').onclick = async () => {
    const body = collectBody();
    if (!body.endpoints.locales) { showProbeOut('endpoint "locales" ยังว่าง', { hint: 'ใส่ template เช่น /locales' }); return; }
    const btn = overlay.querySelector('#apSrcProbeLocales');
    btn.disabled = true; const orig = btn.innerHTML; btn.innerHTML = '⏳ กำลังเรียก...';
    try {
      const r = await backendPost(`/api/admin/api-sources/${encodeURIComponent(body.key || cur.key || 'new')}/probe`, {
        endpoint: 'locales', template: body.endpoints.locales,
        overrides: { host: body.host, basePath: body.basePath, tokenEnv: body.tokenEnv, adapter: body.adapter },
      });
      if (!r.ok) { showProbeOut(`✕ ${r.error || ''}: ${r.message || ''}`, { path: r.path }); return; }
      const discovered = _parseLocales(r.payload);
      curLocales.discovered = discovered;
      const listEl = overlay.querySelector('#apSrcLocaleList');
      if (!discovered.length) {
        listEl.innerHTML = `<div class="text-zinc-500 text-xs">Parser หา locale ไม่เจอ — ดู raw response ด้านล่าง แล้วใส่ locale ID ด้วยมือ</div>
          <input type="text" id="apSrcLocaleManual" placeholder="เช่น en,th,id (คั่นด้วย ,)" class="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded font-mono text-xs"/>`;
        showProbeOut(`raw /locales (${r.durationMs}ms)`, r.payload);
      } else {
        listEl.innerHTML = _renderLocaleCheckboxes(discovered, body.locales.allowed);
        showProbeOut(`✓ /locales (${r.durationMs}ms) — เจอ ${discovered.length} ภาษา`, r.payload);
      }
    } catch (e) { showProbeOut(`✕ ${e.message}`, {}); }
    finally { btn.disabled = false; btn.innerHTML = orig; }
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const body = collectBody();
    // ถ้า manual locale input ใช้ → merge
    const manual = overlay.querySelector('#apSrcLocaleManual');
    if (manual && manual.value.trim()) {
      const ids = manual.value.split(',').map(x => x.trim()).filter(Boolean);
      body.locales.allowed = ids;
      body.locales.discovered = ids.map(id => ({ id, name: id }));
    }
    try {
      const r = await backendPost('/api/admin/api-sources', body);
      msgEl.innerHTML = `<span class="text-emerald-400">✓ บันทึกสำเร็จ${r.tokenAvailable ? '' : ' — แต่ env ' + escapeHtml(body.tokenEnv) + ' ยังว่าง'}</span>`;
      setTimeout(() => { close(); renderApiSourcesTab(c); }, 600);
    } catch (ex) {
      msgEl.innerHTML = `<span class="text-red-400">✕ ${escapeHtml(ex.message)}</span>`;
    }
  };
}

function _renderLocaleCheckboxes(discovered, allowed) {
  if (!discovered.length) return `<div class="text-zinc-500 text-xs">กดปุ่ม "🔍 ทดสอบ /locales" ด้านบน เพื่อดึง list ภาษาจาก API</div>`;
  const allowedSet = new Set(allowed || []);
  return `
    <div class="flex items-center gap-2 mb-2">
      <button type="button" onclick="this.closest('#apSrcLocaleList').querySelectorAll('input[data-loc]').forEach(i=>i.checked=true)" class="text-[11px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">เลือกทั้งหมด</button>
      <button type="button" onclick="this.closest('#apSrcLocaleList').querySelectorAll('input[data-loc]').forEach(i=>i.checked=false)" class="text-[11px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">ล้าง</button>
      <span class="text-[10px] text-zinc-500">พบ ${discovered.length} ภาษา</span>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
      ${discovered.map(l => `
        <label class="flex items-center gap-1.5 text-xs px-2 py-1 bg-zinc-800/50 rounded hover:bg-zinc-800 cursor-pointer">
          <input type="checkbox" data-loc="${escapeHtml(l.id)}" ${allowedSet.has(l.id) ? 'checked' : ''} class="accent-emerald-500"/>
          <span class="font-mono text-zinc-300">${escapeHtml(l.id)}</span>
          ${l.name && l.name !== l.id ? `<span class="text-zinc-500 truncate">${escapeHtml(l.name)}</span>` : ''}
        </label>`).join('')}
    </div>`;
}
