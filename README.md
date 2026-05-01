# MKW - dooseries

เว็บดูซีรีส์สั้น — Node.js + Static HTML + Tailwind CDN

## Local development

```bash
node serve.js
```

เปิด http://localhost:8080/

Default admin account: `admin` / `admin` (แก้ได้ผ่าน env `ADMIN_PASSWORD`)

## Deploy to Render.com

### 1. Push ขึ้น GitHub

```bash
cd "C:\Users\ASUS\.claude\read file\nsv"
git init
git add .
git commit -m "initial commit"
# สร้าง repo บน github.com/new → แล้ว:
git remote add origin https://github.com/YOUR_USERNAME/mkw-dooseries.git
git branch -M main
git push -u origin main
```

### 2. สร้าง Web Service บน Render

1. ไป https://render.com → Sign up (ใช้ GitHub)
2. **New → Web Service** → เชื่อม GitHub repo
3. กรอก:
   - **Name**: `mkw-dooseries` (หรืออะไรก็ได้ — จะได้ URL `xxx.onrender.com`)
   - **Region**: Singapore (ใกล้ไทยสุด)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: (ว่าง)
   - **Start Command**: `node serve.js`
   - **Plan**: **Free**
4. **Environment Variables** — กดปุ่ม "Advanced" แล้วใส่:

   | Key | Value |
   |---|---|
   | `SERIESJEEN_TOKEN` | `seriesjeen_xxxxxxxxx` (token จริงของคุณ) |
   | `GOOGLE_CLIENT_ID` | `539680...apps.googleusercontent.com` |
   | `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` |
   | `GOOGLE_REDIRECT_URI` | `https://YOUR_APP.onrender.com/api/auth/google/callback` |
   | `ADMIN_PASSWORD` | รหัส admin ของคุณ (อย่าใช้ `admin`) |

5. กด **Create Web Service** → รอ build+deploy ~2-3 นาที
6. เปิด URL ที่ Render ให้ → เว็บพร้อมใช้งาน

### 3. อัปเดต Google OAuth redirect URI

หลังรู้ URL จริง (เช่น `https://mkw-dooseries.onrender.com`):

1. ไป https://console.cloud.google.com/apis/credentials
2. เข้า OAuth client → **Authorized redirect URIs** → เพิ่ม:
   ```
   https://YOUR_APP.onrender.com/api/auth/google/callback
   ```
3. Save

### 4. ป้องกัน Render free tier ไม่ให้ sleep (option)

Render free tier sleep หลังไม่ใช้ 15 นาที (ตื่นใช้เวลา 30 วินาที)

ถ้าไม่อยากให้ sleep:
- ใช้ https://uptimerobot.com (ฟรี) ตั้ง HTTP monitor ping URL ทุก 5 นาที

## ⚠️ ข้อจำกัด Render free tier

**Filesystem ephemeral** — `data.json` จะ reset เมื่อ:
- Service restart (หลัง sleep ตื่นบางครั้ง)
- Redeploy (ทุกครั้งที่ git push)
- Render ย้าย instance (บางครั้ง)

**ผลกระทบ:**
- User ที่สมัครใหม่ → หาย
- VIP ที่ซื้อ → หาย
- สลิปรอตรวจ → หาย
- Gift card / discount ที่ admin สร้าง → หาย (เหลือแต่ default)
- admin/admin login ได้เสมอ (hardcoded default)

**ถ้าต้องการเก็บข้อมูลจริง** ต้อง:
1. อัปเกรด Render เป็น Starter plan ($7/เดือน) เพื่อได้ **Persistent Disk**, หรือ
2. เพิ่ม external database (MongoDB Atlas ฟรีตลอด / Supabase / Neon Postgres) — ต้อง refactor readData/writeData (ผมทำให้ได้ ขอแจ้ง)

## โครงสร้างไฟล์

```
/
├── serve.js          # Node.js backend (http + proxy + api)
├── data.json         # persistent state (ephemeral บน Render free)
├── package.json
├── index.html        # หน้าแรก
├── vip.html, recommend.html, category.html, search.html
├── detail.html, play.html
├── login.html, register.html, topup.html
├── history.html, profile.html, admin.html
└── assets/
    ├── app.js        # frontend main
    ├── admin.js      # admin dashboard
    └── style.css
```

## Tech stack

- Backend: Node.js http + https (ไม่มี npm deps)
- Frontend: Vanilla JS + Tailwind CDN
- API proxy: /proxy/* → api.seriesjeen.online
- Auth: Bearer token (localStorage) + Google OAuth
- Storage: data.json (JSON file)
