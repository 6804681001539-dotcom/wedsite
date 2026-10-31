# 📚 จัดเวลานักศึกษา (Student Planner)

เว็บช่วยนักศึกษาจัดเวลาเรียน / งานพาร์ทไทม์ / เวลาพักผ่อน ใช้งานบนมือถือได้สะดวก

## ฟีเจอร์
- ใส่ตารางเรียนและงาน (เพิ่ม / แก้ไข / ลบ) แล้วดู timeline รายวัน
- คำนวณเวลาว่างและแนะนำช่วงพักผ่อนอัตโนมัติ ตั้งเป้าต่อวันได้
- ปฏิทินรายปี เพิ่มสอบ / วันหยุด / ส่งงาน / กิจกรรม
- สรุปชั่วโมงต่อสัปดาห์
- แจ้งเตือนก่อนเริ่มคลาส
- สมัครสมาชิก / เข้าสู่ระบบด้วย JWT

## โครงสร้างโปรเจกต์
```
student-planner/
├── frontend/index.html     # หน้าเว็บ (ไฟล์เดียว เปิดได้เลย)
├── backend/                # REST API (Node.js + Express + JWT)
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── database/schema.sql     # ตาราง MySQL
```

## เปิดดูหน้าเว็บ (โหมดทดลอง)
เปิดไฟล์ `frontend/index.html` ในเบราว์เซอร์ได้เลย ไม่ต้องติดตั้งอะไร
กดปุ่ม "ใช้บัญชีทดสอบ" เพื่อเข้าสู่ระบบ

> **หมายเหตุ:** ตอนนี้หน้าเว็บจำลองระบบหลังบ้านด้วย `localStorage` ในเบราว์เซอร์
> (รหัสผ่านและ token ในโหมดนี้เป็นแค่ตัวอย่าง **ไม่ปลอดภัยจริง**)
> การเชื่อมหน้าเว็บกับ API จริงเป็นขั้นตอนต่อไป ดูหัวข้อ Roadmap

## รัน Backend
ต้องมี Node.js 18+ และ MySQL

```bash
# 1. สร้างฐานข้อมูล
mysql -u root -p < database/schema.sql

# 2. ติดตั้งและตั้งค่า
cd backend
npm install
cp .env.example .env
# สร้าง JWT_SECRET แบบสุ่ม แล้วใส่ใน .env
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 3. รัน
npm run dev
```
ตรวจสอบว่าทำงาน: `http://localhost:4000/health`

## API
ทุก endpoint (ยกเว้น `/auth/register`, `/auth/login`, `/health`) ต้องส่ง header
`Authorization: Bearer <token>`

| Method | Endpoint | หน้าที่ |
|---|---|---|
| POST | `/auth/register` | สมัครสมาชิก |
| POST | `/auth/login` | เข้าสู่ระบบ ได้ token |
| POST | `/auth/refresh` | ขอ token ใหม่ |
| GET | `/auth/me` | ดูข้อมูลตัวเอง |
| PUT | `/auth/password` | เปลี่ยนรหัสผ่าน |
| GET/POST | `/items` | ดึง / เพิ่มตารางเรียน-งาน |
| PATCH/DELETE | `/items/:id` | แก้ไข / ลบ |
| GET/POST | `/events?year=2026` | ดึง / เพิ่มกิจกรรมพิเศษ |
| DELETE | `/events/:id` | ลบกิจกรรม |
| GET/PUT | `/settings` | เป้าพักผ่อน / เวลาเตือน |
| GET | `/health` | เช็คสถานะ server |

## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express, JWT (`jsonwebtoken`), `bcrypt`
- Database: MySQL (`mysql2`)
- Security: `helmet`, `express-rate-limit`, CORS

## Roadmap
- [ ] เชื่อมหน้าเว็บกับ API จริง (แทน localStorage)
- [ ] Deploy (Vercel สำหรับหน้าเว็บ, Railway/Render สำหรับ backend)
- [ ] PWA ให้ติดตั้งบนมือถือได้

## License
MIT
