# README_DB — การจัดเก็บข้อมูลสำหรับ MKW Movies

เอกสารนี้อธิบายตัวเลือกฐานข้อมูลภายนอก (external DB) ที่ใช้แทน `data.json` บน disk — จำเป็นมาก ถ้า deploy บน Render free tier / Vercel / Fly.io / Railway ที่ใช้ ephemeral disk

**ปัญหาปัจจุบัน**: Render free tier restart ทุก 15 นาที inactive → `data.json` หายเกลี้ยง → user/VIP/coin หายหมด

---

## สรุปตัวเลือก (Comparison)

| DB | Free Tier | ความเร็ว | ความง่าย | Code change | Best for |
|---|---|---|---|---|---|
| **MongoDB Atlas** ⭐ | 512 MB ตลอดชีพ | เร็ว (~10-30ms) | ง่ายสุด — **เปิดใช้งานได้เลยใน serve.js ปัจจุบัน** | 0 บรรทัด | เริ่มต้น, ทั่วไป |
| **Supabase Postgres** | 500 MB, 2 project | เร็วมาก | ต้องเขียน SQL | ~80 บรรทัด | ถ้าต้องการ SQL + realtime |
| **Neon Postgres** | 512 MB, 10 project | เร็วมาก (serverless) | ต้องเขียน SQL | ~80 บรรทัด | scale ใหญ่, branching |
| **Upstash Redis** | 10k commands/วัน | เร็วที่สุด (~1ms) | ง่ายสำหรับ key-value | ~40 บรรทัด | cache + session, ไม่เหมาะเก็บหลัก |
| **Turso (libSQL)** | 500 DB, 9GB | เร็ว (edge) | ต้องเขียน SQL | ~80 บรรทัด | edge deployment |
| **Render Persistent Disk** | ❌ ไม่มีใน free | — | เหมือนเดิม | 0 | ต้องอัปเกรด Standard $7/เดือน |
| **JSONBin.io / GitHub Gist** | ใช้ได้ | ช้า (~500ms-2s) | ง่าย — แต่ไม่เหมาะ production | ~30 บรรทัด | prototype เท่านั้น |

**คำแนะนำ**: เริ่มจาก **MongoDB Atlas** (คะแนน 1) — โค้ดรองรับอยู่แล้ว ไม่ต้องแก้อะไร แค่ตั้ง env

---

## 1. MongoDB Atlas ⭐ (แนะนำ)

**ข้อดี**: 512 MB ฟรีตลอดชีพ, โค้ด `serve.js` รองรับอยู่แล้ว (ตรวจ `USE_MONGO = !!process.env.MONGODB_URI`), Singapore region, schema-less ตรงกับ JSON

**ข้อเสีย**: หลัง inactive 60 วัน cluster จะ pause (data ไม่หาย แต่ต้อง resume)

### Setup
ดูรายละเอียดใน `README.md` หรือ chat session ล่าสุด — ขั้นตอน:
1. สมัคร https://www.mongodb.com/cloud/atlas/register (Google login)
2. Create M0 cluster — AWS Singapore
3. Database User → create (copy password)
4. Network Access → Allow 0.0.0.0/0 (Render ไม่มี static IP)
5. Connect → Drivers (Node.js 6.7+) → copy URI → แก้ `<db_password>` + เพิ่ม `/mkw` หลัง `.net/`
6. Render dashboard → service → Environment → add `MONGODB_URI` = URI ที่แก้แล้ว
7. รอ deploy → ดู log `MongoDB connected`

### Code (มีแล้วใน serve.js)
```js
const USE_MONGO = !!process.env.MONGODB_URI;
async function ensureMongo() {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  mongoColl = client.db(process.env.MONGODB_DB || 'mkw').collection('state');
}
// document shape: { _id: 'main', data: {...รวมทุกอย่าง...} }
```

### Limits ของ M0 ที่ควรรู้
- Storage: 512 MB (user ได้หลายพันคน)
- Connections: 500 concurrent (Render free = 1 instance = พอเหลือเฟือ)
- Bandwidth: ไม่จำกัด
- Pause หลัง 60 วัน inactive → ต้อง login Atlas → Resume cluster
- Backup: ไม่มี (ต้อง dump เองถ้าต้องการ)

---

## 2. Supabase Postgres

**ข้อดี**: SQL เต็มรูปแบบ, มี realtime subscriptions, มี auth/storage built-in, dashboard ดีมาก, fast  
**ข้อเสีย**: ต้อง refactor code (read/writeData) + design schema + เขียน migrations, free tier 500 MB + project inactive 7 วัน จะ pause (กู้ได้)

### Setup
1. https://supabase.com/dashboard → New project (ใช้ Singapore region)
2. Table Editor → create table `state`:
   ```sql
   create table state (
     id text primary key,
     data jsonb not null,
     updated_at timestamp default now()
   );
   insert into state (id, data) values ('main', '{}'::jsonb);
   ```
3. Settings → API → copy `URL` + `service_role key` (ไม่ใช่ anon)

### Code changes (serve.js)
```js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function readData() {
  if (!SUPABASE_URL) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const r = await fetch(`${SUPABASE_URL}/rest/v1/state?id=eq.main&select=data`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const rows = await r.json();
  return applyDefaults(rows[0]?.data || {});
}

async function writeData(data) {
  if (!SUPABASE_URL) return fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  await fetch(`${SUPABASE_URL}/rest/v1/state?id=eq.main`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
}
```

**เมื่อไรควรใช้**: ถ้าอยาก migrate ไป relational schema แบบจริงจัง (แยก table: users, inbox, topups, slips) + อยากใช้ SQL query / RLS / realtime

---

## 3. Neon Postgres (serverless)

**ข้อดี**: Serverless Postgres, scale-to-zero, branching (เหมือน git), 512 MB free, 10 projects  
**ข้อเสีย**: คล้าย Supabase — ต้อง refactor SQL

### Setup
1. https://neon.tech → sign up → create project (region Singapore)
2. SQL Editor:
   ```sql
   create table state (id text primary key, data jsonb);
   insert into state values ('main', '{}');
   ```
3. Copy connection string

### Code changes (ใช้ `pg` หรือ `@neondatabase/serverless`)
```bash
npm install @neondatabase/serverless
```
```js
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function readData() {
  const rows = await sql`select data from state where id = 'main'`;
  return applyDefaults(rows[0]?.data || {});
}
async function writeData(data) {
  await sql`update state set data = ${data} where id = 'main'`;
}
```

---

## 4. Upstash Redis (cache / session store)

**ข้อดี**: เร็วที่สุด (~1ms), REST API (ไม่ต้อง TCP), scale-to-zero, free 10k commands/day  
**ข้อเสีย**: ข้อมูลหลักไม่เหมาะ (in-memory, eviction policies), เหมาะเป็น cache layer

### Setup
1. https://upstash.com → create Redis DB (free tier)
2. Copy `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

### Code (simple get/set via REST)
```js
async function readData() {
  const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/mkw:state`, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  const { result } = await r.json();
  return applyDefaults(result ? JSON.parse(result) : {});
}
async function writeData(data) {
  await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/mkw:state`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(data),
  });
}
```

**เมื่อไรควรใช้**: ใช้ Upstash เป็น **session store** + MongoDB เป็น persistent store (hybrid)

---

## 5. Turso (libSQL — SQLite บน edge)

**ข้อดี**: SQLite API, edge replication (ใกล้ user เสมอ), free 500 DB + 9GB, HTTP API  
**ข้อเสีย**: ใหม่กว่าตัวอื่น, ecosystem เล็กกว่า

### Setup
```bash
npm install @libsql/client
```
```js
const { createClient } = require('@libsql/client');
const db = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN });

await db.execute("create table if not exists state (id text primary key, data text)");
async function readData() {
  const r = await db.execute({ sql: "select data from state where id = 'main'", args: [] });
  return applyDefaults(r.rows[0] ? JSON.parse(r.rows[0].data) : {});
}
async function writeData(data) {
  await db.execute({ sql: "insert or replace into state values ('main', ?)", args: [JSON.stringify(data)] });
}
```

---

## 6. Render Persistent Disk ($$)

**ข้อดี**: ไม่ต้องแก้ code เลย — data.json อยู่ถาวร  
**ข้อเสีย**: ไม่ฟรี — Standard plan $7/เดือน + disk 1GB $0.25/เดือน

เหมาะถ้า:
- ไม่อยากยุ่งกับ external DB
- user น้อย (<1000) ไม่ต้องการ concurrency
- อยาก deploy Render เฉยๆ

### Setup
1. Render dashboard → service → Settings → Upgrade to Starter/Standard
2. Settings → Disks → Add disk → `/app/data` (1 GB)
3. แก้ `DATA_FILE` ใน `serve.js`:
   ```js
   const DATA_FILE = process.env.DATA_DIR
     ? path.join(process.env.DATA_DIR, 'data.json')
     : path.join(ROOT, 'data.json');
   ```
4. Environment → add `DATA_DIR=/app/data`

---

## 7. JSONBin.io / GitHub Gist (prototype only)

**ไม่แนะนำสำหรับ production** — ช้า, rate limit, ไม่มี concurrency control

### JSONBin
```js
const BIN_ID = process.env.JSONBIN_ID;
const KEY = process.env.JSONBIN_KEY;
async function readData() {
  const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
    headers: { 'X-Master-Key': KEY },
  });
  const j = await r.json();
  return applyDefaults(j.record || {});
}
async function writeData(data) {
  await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': KEY },
    body: JSON.stringify(data),
  });
}
```

---

## แนวทาง Migrate ข้ามระบบ

ถ้าเปลี่ยน DB (เช่น MongoDB → Postgres) **ห้ามลบ data เดิมจนกว่าจะ verify ครบ**:

1. Export ข้อมูลจาก DB เก่า → ไฟล์ `backup.json`
2. Setup DB ใหม่ (env vars แยก เช่น `MONGODB_URI_NEW`)
3. เขียน script `migrate.js` อ่านจาก `backup.json` → เขียนเข้า DB ใหม่
4. Verify: login ด้วย user จริงใน staging
5. Switch `MONGODB_URI` → URI ใหม่ใน production
6. เก็บ backup ไว้ 30 วันก่อนลบ

---

## Best Practices

### 1. Environment variable management
- **อย่า** commit `.env` เข้า git
- ใช้ `.env.local` สำหรับ dev + `Environment` tab ใน Render/Vercel สำหรับ prod
- Rotate secrets ทุก 90 วัน หรือเมื่อสงสัย leak

### 2. Connection handling
- MongoDB: ใช้ singleton client (ไม่ connect ทุก request)
- Postgres: ใช้ connection pool (`pg-pool`) หรือ serverless driver
- Redis: REST API ไม่ต้องจัดการ pool

### 3. Caching (ลด DB load)
ตอนนี้ `serve.js` มี `mongoCache` — cache ทั้ง doc ใน RAM, read = 0 DB hit, write = update cache + DB

⚠️ **ข้อจำกัด**: multi-instance = cache ไม่ sync (Render free = 1 instance พอใช้ได้)  
→ ถ้าจะ scale หลาย instance ต้อง:
- ลบ cache, read ทุกครั้ง (slow)
- หรือใช้ Redis pub/sub แจ้ง invalidation
- หรือแยก state (session = Redis, เนื้อหาอื่น = Mongo)

### 4. Backup routine
```bash
# Cron job ทุกวัน dump MongoDB → S3/R2
mongodump --uri="$MONGODB_URI" --out=backup-$(date +%Y-%m-%d)
aws s3 sync backup-*  s3://mkw-backup/
```

### 5. Data schema versioning
เก็บ `schemaVersion` ใน data document:
```js
if (data.schemaVersion < 2) {
  // migrate...
  data.schemaVersion = 2;
}
```

---

## การพัฒนา Local (development)

### ใช้ DB นอกช่วง dev
ไฟล์ `.env.local`:
```
MONGODB_URI=mongodb+srv://...
PORT=8080
SERIESJEEN_TOKEN=...
```

Run:
```bash
# PowerShell
$env:MONGODB_URI="mongodb+srv://..."
node serve.js

# หรือใช้ dotenv ถ้าติดตั้ง
npm install dotenv
# เพิ่มใน serve.js ก่อน require อื่นๆ:
require('dotenv').config({ path: '.env.local' });
```

### แยก DB dev/prod
**สำคัญ**: อย่าใช้ MongoDB URI เดียวกันทั้ง dev + prod → จะเขียนทับ user จริง

```
MONGODB_URI (prod)   → mongodb+srv://.../mkw
MONGODB_URI (dev)    → mongodb+srv://.../mkw_dev
MONGODB_DB=mkw_dev   → override db name
```

### Export/Import ระหว่างสภาพแวดล้อม
```bash
# ดึงข้อมูลจาก prod → dev
mongodump --uri="$PROD_URI" --db=mkw --out=./dump
mongorestore --uri="$DEV_URI" --db=mkw_dev ./dump/mkw

# หรือผ่าน MongoDB Compass GUI — export collection เป็น JSON
```

---

## สรุป: ควรเลือกอะไร?

- **เริ่มต้น + ไม่อยากแก้ code**: MongoDB Atlas ✅
- **อยากใช้ SQL + realtime**: Supabase
- **Scale ใหญ่ + branching**: Neon
- **เน้น speed + เป็น cache**: Upstash Redis (คู่กับ DB อื่น)
- **Edge deployment**: Turso
- **มี budget + ไม่อยากยุ่ง external**: Render Persistent Disk

ทุกตัวยกเว้นข้อสุดท้าย **ต่อได้จากเครื่อง dev local** — แค่ใส่ URI ใน env แล้ว run `node serve.js` ก็ใช้งานได้ทันที
