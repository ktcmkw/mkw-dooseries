# MKW Movies — Project Context

บันทึกสถานะโปรเจค สำหรับ session ต่อๆ ไป

**Last updated:** 2026-05-02 (session 3 — admin features ครบ + security hardening เริ่มแต่ยังไม่เสร็จ)

---

## โปรเจคคืออะไร

เว็บดูซีรีส์สั้น (drama/shorts) สำหรับ @ktcmkw — brand name **"MKW Movies"** (เดิมชื่อ ShortDrama)

- Target user: คนดูซีรีส์ภาษาไทย + พากย์ไทย
- Monetization: เหรียญ NSV Coin (50 coin/ตอน ถ้าไม่ใช่ VIP/admin) + VIP subscription + gift cards + โค้ดส่วนลด
- Tier: admin > vip > user > guest

## Tech stack

- **Backend**: Node.js (`http` + `https` + `fs`) — ไม่มี external deps ยกเว้น `mongodb`
- **Frontend**: Vanilla JS + Tailwind CDN (ไม่มี build step)
- **Proxy**: `/proxy/*` → `api.seriesjeen.online/*` (inject Bearer token)
- **Auth**: Bearer token ใน localStorage (`mkw_token`) + auto-login via `mkw_remember` + Google OAuth
- **Storage**: MongoDB Atlas ถ้ามี env `MONGODB_URI` / fallback → `data.json` บน disk

## File structure

```
/
├── serve.js              # Node backend (proxy + auth + api + static)
├── data.json             # (gitignored) local state fallback
├── package.json          # deps: mongodb
├── .gitignore
├── README.md             # deploy guide
├── CONTEXT.md            # (this file)
├── index.html            # หน้าแรก (filter chips: ทั้งหมด/พากย์ไทย/การ์ตูน/VIP)
├── vip.html              # Billionaire list
├── recommend.html
├── category.html         # genre list
├── search.html
├── detail.html           # series detail + episode grid + resume button
├── play.html             # player (fullscreen-safe, auto-next, preload)
├── login.html            # + Google OAuth button + remember me
├── register.html         # + Google OAuth button
├── topup.html            # packages + VIP + slip upload + giftcard
├── history.html          # watch history (delete single/all)
├── profile.html          # change password
├── admin.html            # dashboard
├── assets/
│   ├── app.js            # frontend main (~1500 lines)
│   ├── admin.js          # admin dashboard
│   └── style.css
└── openapi.json          # (old Cyberasfe spec — deprecated reference only)
```

## API source

ปัจจุบันใช้ **seriesjeen** (api.seriesjeen.online)

Token อยู่ใน env `SERIESJEEN_TOKEN` — fallback hardcoded ใน serve.js

Endpoints ที่ใช้ (ผ่าน /proxy/api/platform/dramabox):
- `/list?page=N&page_size=50` — default catalog (เรียงใหม่→เก่า ไม่รองรับ sort param)
- `/search?keyword=X&page=N&page_size=50` — title search (พากย์ไทย→ keyword=`พากย์ไทย`)
- `/genres` — list genres `{id, name}` (Anime=3744, Billionaire=1265)
- `/genre/{id}?page=N&page_size=50`
- `/detail?bookId=X`
- `/allepisode?bookId=X` — list episodes with `{chapterIndex, isCharge, 1080p, videoUrl, 540p}`

## User roles & access

- **admin**: ดูได้ทุก ep ฟรี + `/admin` dashboard (6 tabs: Users/Locks/Giftcards/Discounts/Slips/History)
- **vip**: ดูได้ทุก ep ฟรี + มี `vipExpires` (auto-downgrade เป็น user เมื่อหมดอายุ)
- **user**: ดูฟรีเฉพาะ ep ที่ `isCharge=false` และไม่ติด admin lock / จ่าย 50 coin/ตอนเพื่อปลดล็อก
- **guest** (ไม่ login): ดูฟรีเฉพาะ ep ที่ `isCharge=false` และไม่ติด lock

ตรวจสิทธิ์: `GET /api/access?bookId=X&index=N` คืน `{allowed, reason, cost}`

## Environment variables

| Key | Required | Purpose |
|---|---|---|
| `PORT` | auto (Render) | HTTP port |
| `SERIESJEEN_TOKEN` | ✅ production | Bearer token for seriesjeen API |
| `ADMIN_PASSWORD` | optional | overrides default `admin` password |
| `MONGODB_URI` | ถ้าอยากให้ persist | MongoDB Atlas connection string |
| `MONGODB_DB` | optional | DB name (default `mkw`) |
| `GOOGLE_CLIENT_ID` | ถ้าเปิด Google login | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ถ้าเปิด Google login | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | optional | default `http://localhost:PORT/api/auth/google/callback` |

## Deployment

- **Production**: https://mkw-dooseries.onrender.com (Render free tier)
- **GitHub repo**: https://github.com/ktcmkw/mkw-dooseries (private)
- **Owner**: ktcmkw
- **Deploy trigger**: push to `main` branch

### Render settings
- Runtime: Node 18+
- Build: `npm install`
- Start: `node serve.js`
- Region: Singapore
- Plan: Free (sleep 15 min, 512MB RAM, ephemeral FS)

### Google OAuth
- Client ID: `539680278116-eue3f9b0p58j3c3h83c0b46vl76f3l07.apps.googleusercontent.com`
- Authorized redirect URIs (ต้องมีใน Google Cloud Console):
  - `http://localhost:8080/api/auth/google/callback` (local dev)
  - `https://mkw-dooseries.onrender.com/api/auth/google/callback` (production)
- Callback flow: exchange code → get profile → find/create user by `googleEmail` → set session token → redirect `/`

## Key implementation details

### Data store (serve.js)
- `readData()` / `writeData()` — async
- ถ้า `MONGODB_URI` → MongoDB collection `state` document `{_id: 'main', data: {...}}` + in-memory cache (single instance only)
- ถ้าไม่มี env → `data.json` บน disk (ephemeral บน Render free tier)
- `DEFAULT_DATA` มี admin user + default packages + NSVWELCOME giftcard + SAVE10 discount

### Player (assets/app.js)
- `initPlayPage` → access check → `playEpisode(ep, ctx)` ที่เก็บ `{bookId, total, episodes, detail}`
- `goToEpisode(newIndex, ctx)` — in-place transition ไม่ reload หน้า (TikTok-style):
  - `history.pushState` อัปเดต URL
  - swap `video.src` บน element เดิม (ไม่ clone → fullscreen state คงอยู่)
  - ใช้ `AbortController` reset old listeners
  - เรียก `/api/history/log`
- Preload ตอนถัดไปไว้ใน hidden `<video preload="auto">` → swap ได้ทันที
- Auto-next: countdown 3 วิหลัง `ended` → `goToEpisode(next)`
- Popstate รองรับ back/forward

### Hide details for non-admin
- bookId แสดงเฉพาะ admin
- 💰 icon ซ่อนจาก admin/vip (บน detail page + nav EP buttons)
- Video URL/quality labels ไม่แสดง + `controlslist="nodownload"` + disable right-click

### History
- `POST /api/history/log` — บันทึกตอนที่เปิดดู (max 100 รายการต่อ user, dedupe ตาม bookId)
- `GET /api/history` — list
- `DELETE /api/history` — clear all
- `DELETE /api/history/:bookId` — ลบรายการเดี่ยว
- `GET /api/history/latest?bookId=X` — ดึง ep ล่าสุด (ใช้ใน detail "ดูต่อ" button)

### Home filters
5 chips: ทั้งหมด (default `/list`) / พากย์ไทย (`/search?keyword=พากย์ไทย`) / การ์ตูน (`/genre/3744` Anime) / VIP (`/genre/1265` Billionaire)

**หมายเหตุ**: API ไม่รองรับ sort param (ทดสอบแล้ว) — `/list` default เป็น recent→old อยู่แล้ว เลยไม่มี chip "ใหม่ล่าสุด" (เพราะซ้ำกับ "ทั้งหมด")

### Language badge บนการ์ดปก
- **พากย์ไทย** (พื้นแดง) ถ้า title มี `พากย์ไทย` หรือ `thai dub`
- **SUBTHAI** (พื้นน้ำเงิน) ถ้า title มี `subthai`/`sub thai`/`ซับไทย`

## Known limitations

1. **Password plain text** — เก็บใน `data.json`/Mongo เป็น plain string (ควร bcrypt ก่อน production)
2. **No rate limiting** — /api/auth/login ไม่มี rate limit (brute force ได้)
3. **Session in DB/file** — ไม่ได้ใช้ JWT, ไม่ได้ set cookie HttpOnly → XSS risk ถ้ามี (แต่ input ทุก field escape)
4. **MongoDB cache** — `readData()` cache ทั้ง doc ใน memory → multi-instance จะไม่ sync (Render free = single instance, ok)
5. **Concurrent writes** — read-modify-write pattern → race condition ถ้ามี traffic สูง (personal site เลยข้าม)
6. **Render free tier sleep** — ตื่นครั้งแรกช้า ~30 วิ (แก้ด้วย UptimeRobot ping ทุก 5 นาที)

## Pending / future work (session 2 เก่า)

### 🚨 ต้องทำด่วน session 2

1. **Push `serve.js` updated** ขึ้น GitHub — ลบ hardcoded SERIESJEEN_TOKEN fallback ออกแล้ว (local file แก้แล้ว) แต่ยังไม่ push
   - แก้ผ่านเว็บ GitHub: https://github.com/ktcmkw/mkw-dooseries/blob/main/serve.js → edit → sync กับ local version
2. **ตรวจว่า repo private** (incognito → เข้าลิงก์ → ต้องเห็น 404)
3. **Rotate SERIESJEEN_TOKEN** — token เก่า `seriesjeen_e6d16e34...` leak ใน git history + chat เก่า → ขอใหม่จาก seriesjeen.online → update env Render
4. **Rotate GOOGLE_CLIENT_SECRET** — ที่ leak ในแชท (`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`) → Cloud Console → Reset secret → update env Render
5. (Optional) ลบ git history ถ้าต้องการ clean ทั้งหมด → Delete repo + recreate + push ไฟล์ใหม่ + reconnect Render

### 💾 Data persistence (ยังไม่ได้ทำ — session 2)

- [ ] **Setup MongoDB Atlas** → ใส่ `MONGODB_URI` ใน Render env
  - ขั้นตอนเขียนไว้ใน README.md (ส่วน MongoDB Atlas Setup) และในข้อความ chat
  - ถ้าไม่ทำ → ข้อมูล user/VIP/coin หายทุกครั้ง Render restart

### 🛡️ Production hardening (session 2)

- [ ] Hash password ด้วย bcrypt (ตอนนี้เก็บ plain)
- [ ] Rate limit `/api/auth/login` (ตอนนี้ brute force ได้)
- [ ] UptimeRobot ping ทุก 5 นาที → ไม่ sleep
- [ ] Custom domain (ถ้าซื้อ)
- [ ] (option) Refactor sessions → HttpOnly cookie

### 🎨 Feature ideas (session 2)

- [ ] เพิ่ม filter หน้าแรก: หนังจีน/เกาหลี/ญี่ปุ่น (ต้องหา keyword หรือ genre id)
- [ ] Continue watching row บนหน้าแรก (ใช้ `/api/history` ของ user)
- [ ] Search history / recent searches
- [ ] Notification เมื่อมี ep ใหม่ของเรื่องที่ user เคยดู

## Session 2 (2026-05-01) สรุปสิ่งที่ทำ

1. ✅ Deploy สำเร็จที่ https://mkw-dooseries.onrender.com
2. ✅ Render Web Service ฟรี — region Singapore, runtime Node, build `npm install`, start `node serve.js`
3. ✅ Env vars ตั้งใน Render: `SERIESJEEN_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ADMIN_PASSWORD`
4. ✅ ตรวจแล้ว: `HTTP 200` + `/api/topup/packages` ตอบถูก
5. ✅ Refactor readData/writeData → async + รองรับ MongoDB (ยังไม่เปิดใช้)
6. ✅ เพิ่ม `package.json` (dep: mongodb), `.gitignore`, `README.md`
7. ✅ เพิ่ม Google OAuth endpoints (`/api/auth/google/url`, `/api/auth/google/callback`)
8. ✅ เพิ่ม `/api/user/change-password` + `/profile` page
9. ✅ เพิ่ม history delete single item (`DELETE /api/history/:bookId`)
10. ✅ แก้ history page bug — header ซ้อนเมื่อกดลบ (แยก renderHistoryList)
11. ✅ Home filters 4 chips (ลบ "ใหม่ล่าสุด" เพราะ API ไม่รองรับ sort)
12. ✅ พากย์ไทย/SUBTHAI badge บนการ์ดปก
13. ✅ Seamless episode transition (fullscreen-safe, preload next, no reload)
14. ⚠️ ลบ SERIESJEEN_TOKEN hardcoded fallback จาก serve.js (local แก้แล้ว — ยังไม่ push)
15. ❌ ยังไม่ได้ setup MongoDB Atlas
16. ❌ ยังไม่ได้ rotate secrets ที่ leak

## Session 3 (2026-05-02) สรุปสิ่งที่ทำ

### 🎁 freeMode (ดูฟรีทั้งเว็บ)
- Schema: `freeMode: { enabled, message, startAt, endAt, setBy, setAt }`
- Helper `isFreeActive(data)` — เช็ค enabled + อยู่ในช่วง start/end
- `checkAccess` → ถ้า active → `{allowed:true, freeMode:true}` override ทุกอย่าง
- Admin UI: toggle + datetime-local inputs (start/end) + custom message + status 3 แบบ (ปิด/active/รออ้างถึงเวลา)
- Frontend popup: เด้งหน้าแรก + checkbox "ไม่แสดงทั้งหมดภายในวันนี้" → `localStorage.mkw_promo_dismiss = YYYY-MM-DD`
- Override `hidePaywallIcon` + `effectivelyLocked` ใน detail/play
- **Soft gate**: ใน freeMode guest browse ได้ปกติ แต่กด play → redirect ไป `/login?next=<url>` (login เสร็จดูฟรี)

### 💰 Topup page (ปรับ flow)
- ลบ `/api/user/topup` direct call + ลบ discount code input
- ปุ่ม package ตอนนี้ = pre-fill amount/note ใน slip form + scroll ไป → user แนบสลิป → admin ตรวจ
- Endpoint `/api/user/topup` ยังอยู่ใน serve.js (orphan — frontend ไม่เรียกแล้ว)

### 🔍 Mobile search box
- เพิ่ม form `md:hidden` ใต้ subtitle หน้าแรก → submit ไป `/search?q=...`

### 👥 Admin: Users tab ขยาย
- Search input + filter rows (`data-search` attribute)
- Dropdown menu ต่อ row (7 actions): +/- coin, change role, set VIP expiry (datetime หรือ +N days), reset password, view watch history (modal), force logout, delete
- แสดง: lastSeenAt (relative), activeSessions count, vipExpires (days left), historyCount/unlocked, googleEmail
- Endpoints ใหม่: `/api/admin/user/:u/reset-password`, `/vip-expires`, `/force-logout`, `/history`

### 🚫 Hidden books (ซ่อนซีรีส์ทั้งเรื่อง)
- Schema: `hiddenBooks[bookId] = { bookName, reason, hiddenBy, hiddenAt }`
- `checkAccess` reject `reason:'hidden'` ถ้า non-admin
- Frontend: `dramaCard` filter ออกจาก grid + `initDetailPage` block + `renderAccessGate` แสดง "🚫 ซีรีส์ไม่พร้อม"
- Endpoints: GET/POST `/api/admin/hidden-books`, DELETE `/api/admin/hidden-books/:bookId`
- Admin UI: section ใน Locks tab

### 📢 Announcement banner
- Schema: `announcement: { enabled, text, color, setBy, setAt }` — color = blue/amber/red/emerald
- รองรับ `<b>` และ `<a href>` (escape อื่นๆ ทั้งหมด)
- แสดงใต้ header ทุกหน้า
- Admin UI: ใน 🌐 ระบบ tab

### 🚧 Maintenance mode
- Schema: `maintenance: { enabled, message, setBy, setAt }`
- `maintenanceGate()` ฝั่ง frontend: ยึด body แสดงหน้า "กำลังปรับปรุง" — admin + path `/login`/`/register` ผ่านได้
- `checkAccess` reject `reason:'maintenance'` ถ้า non-admin
- Admin UI: ใน 🌐 ระบบ tab

### 🔐 Login Log + heartbeat
- Schema เปลี่ยน: `sessions[token] = { username, loginAt, lastSeenAt }` (เดิม = string username)
- Backward compat: `getAuthUser` รองรับทั้ง 2 form, password-change/delete-user iterate ทั้ง 2 form
- `closeSession(data, token, reason)` → push ไป `data.loginLog` (max 1000) พร้อม durationMs
- Heartbeat: frontend `setInterval 60s` → `POST /api/auth/heartbeat`
- Backend `getAuthUser` throttle write `lastSeenAt` ทุก 60s (เลี่ยง disk write ทุก request)
- Endpoint: `GET /api/admin/login-log` คืน `{active, historical}`, `DELETE` ล้าง historical
- Admin UI: 🔐 Login Log tab — Active list + per-user totals (sessions + total time) + historical (200 ล่าสุด)

### ⚡ Disable tracking toggle
- Schema: `disableTracking: false`
- เปิด = `getAuthUser` ข้าม lastSeenAt write + `closeSession` ข้าม loginLog push + frontend `startHeartbeat` ไม่เริ่ม timer (และ check ภายใน interval ด้วย)
- `/api/public-config` คืน `trackingDisabled` ให้ frontend รู้
- Endpoints: GET/POST `/api/admin/tracking`
- Admin UI: panel ที่ 3 ใน 🌐 ระบบ tab — toggle ส้ม

### 🔒 Security hardening (เริ่มแต่ยังไม่เสร็จ)
- เพิ่ม helpers ใน serve.js (ยังไม่ wire เข้า endpoints):
  - `hashPassword(plain)` / `verifyPassword(plain, stored)` — scrypt native (no deps), format `scrypt$<salt>$<hash>`
  - `isHashed(stored)` — เช็คว่าถูก hash แล้วหรือยัง
  - `rateLimit(key, max, windowMs)` — in-memory Map, GC ทุก 5 นาที
  - `clientIp(req)` — รองรับ `x-forwarded-for` (Render proxy)
  - `audit(data, user, action, details)` — push ไป `data.auditLog` (max 500)
- **ยังไม่ได้:**
  - Wire `verifyPassword` เข้า login + register + change-password + reset-password
  - Wire `rateLimit(clientIp(req), 5, 60_000)` เข้า `/api/auth/login`
  - Wire `audit()` เข้า admin endpoints ทุกตัว
  - เพิ่ม `auditLog: []` ใน DEFAULT_DATA
  - Auto-migrate plain password → hash ตอน login สำเร็จ
  - Admin tab "📋 Audit Log" สำหรับดู audit history

## Pending / future work

### 🚨 ต้องทำด่วน (session ต่อไปเริ่มจากนี้)

1. **ทำ security hardening Phase A ให้เสร็จ** (helpers พร้อมแล้วใน serve.js):
   - Wire scrypt password เข้า login/register/change-password/reset-password + auto-migrate
   - Wire rate limit เข้า /api/auth/login (5 ครั้ง/นาที/IP)
   - Wire audit() เข้า admin endpoints + เพิ่ม `auditLog: []` ใน DEFAULT_DATA + Admin tab ใหม่
2. **Phase B: 2FA TOTP** สำหรับ admin (RFC 6238 implement เอง, QR ผ่าน CDN lib)
3. **Phase C: HttpOnly cookie session** — แตะทุก fetch call เสี่ยงพัง ต้องทำหลัง verify Phase A+B
4. **Push session 3 changes ทั้งหมดขึ้น GitHub** (ตอนนี้ยังเป็น local) → Render auto-deploy
5. **Rotate SERIESJEEN_TOKEN + GOOGLE_CLIENT_SECRET** (ที่ leak ใน chat/git history)

### 💾 Data persistence (ยังไม่ได้ทำ)

- [ ] **Setup MongoDB Atlas** → ใส่ `MONGODB_URI` ใน Render env
  - ขั้นตอนเขียนไว้ใน README.md (ส่วน MongoDB Atlas Setup)
  - ถ้าไม่ทำ → ข้อมูล user/VIP/coin/loginLog/auditLog หายทุกครั้ง Render restart

### 🛡️ Production hardening (เพิ่มเติมจาก security)

- [ ] UptimeRobot ping ทุก 5 นาที → ไม่ sleep
- [ ] Custom domain (ถ้าซื้อ)

### 🎨 Feature ideas

- [ ] เพิ่ม filter หน้าแรก: หนังจีน/เกาหลี/ญี่ปุ่น (ต้องหา keyword หรือ genre id)
- [ ] Continue watching row บนหน้าแรก (ใช้ `/api/history` ของ user)
- [ ] Search history / recent searches
- [ ] Notification เมื่อมี ep ใหม่ของเรื่องที่ user เคยดู
- [ ] Featured banner / hero slider บนหน้าแรก

## Conventions ที่ user ชอบ (ยืนยันแล้ว session 3)

- ตอบสั้น กระชับ ภาษาไทย
- Explain tradeoffs ชัดๆ ก่อน implement (ขอบคุณที่เสนอทางเลือกก่อนทำใหญ่)
- Push back ถ้าเห็นข้อผิดพลาดใหญ่ + แสดงข้อจำกัดของ Render free tier ให้ชัด
- Surgical edits — ไม่ refactor code ที่ไม่ได้ขอ
- เมื่อขอ feature ใหญ่ — ทำ scaffolding + อธิบายขั้นตอนต่อให้ตัดสินใจ
- กังวลเรื่อง disk write/RAM บน Render free → ตั้ง heartbeat 60s (ไม่เอา 30s) + ใส่ admin toggle ปิด tracking ได้
