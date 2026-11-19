# Meity Art — Web Booking Nail Art

Web booking untuk freelance nail art: pelanggan booking di slot yang dibuka artis, artis approve lewat dashboard.
Stack: **vanilla HTML/CSS/JS + Supabase + GitHub (+ Netlify)**. Tanpa build step.

## Struktur

```
index.html            Landing: layanan, portofolio, CTA booking
booking.html          Wizard booking 4 langkah (layanan → jadwal → data diri → konfirmasi)
cek-booking.html      Cek status & batalkan booking (wajib alasan, lanjut WA)
admin/                Area artis (login wajib)
  login.html  index.html (dashboard)  kalender.html  booking.html
  layanan.html  pelanggan.html  portofolio.html  pengaturan.html
css/style.css         Identitas visual Cherry Atelier
js/config.js          ← ISI URL & ANON KEY SUPABASE DI SINI
js/*.js, js/admin/*.js
supabase/schema.sql   Skema database lengkap (tabel, RLS, fungsi, storage)
supabase/cron.sql     Jadwal auto-cancel booking pending
```

## Setup (sekali saja)

### 1. Database
1. Supabase Dashboard → **SQL Editor** → New query → paste isi `supabase/schema.sql` → **Run**.
   File ini aman dijalankan ulang.
2. **Database → Extensions** → aktifkan `pg_cron`, lalu jalankan `supabase/cron.sql`.

### 2. Akun artis (admin)
1. **Authentication → Users → Add user** → isi email + password artis (centang *Auto Confirm*).
2. Salin **User UID**-nya, lalu jalankan di SQL Editor:
   ```sql
   insert into public.admins (user_id) values ('PASTE-USER-UID-DI-SINI');
   ```
3. **Authentication → Sign In / Providers → Email** → matikan **Allow new users to sign up**,
   supaya tidak ada orang lain yang bisa bikin akun.

### 3. Konfigurasi frontend
Buka `js/config.js`, isi dari **Project Settings → API**:
```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```
Anon key memang untuk frontend; semua data dilindungi Row Level Security.

### 4. GitHub + deploy
```bash
git init
git add .
git commit -m "Meity Art MVP"
git branch -M main
git remote add origin https://github.com/USERNAME/meity-art.git
git push -u origin main
```
Netlify → **Add new site → Import from GitHub** → pilih repo → build command kosong, publish directory `.` → Deploy.
Setiap `git push` otomatis deploy ulang.

### 5. Isi data awal (dari dashboard admin)
1. `/admin/login.html` → login.
2. **Pengaturan** → nomor WhatsApp artis, buffer, batas booking, dll.
3. **Layanan** → tambah layanan Nail Art (nama, durasi, fee jasa).
4. **Kalender** → tambah blok **Buka Booking** (bisa berulang tiap minggu). Tanpa blok ini, pelanggan tidak melihat slot apa pun.
5. **Portofolio** → upload foto hasil kerja.

## Aturan bisnis yang sudah diterapkan
- Kalender "tertutup kecuali dibuka": slot hanya dari blok **Buka Booking**, dikurangi blok Kerja Utama/Upgrade Diri/Pribadi dan booking lain + buffer.
- Semua booking `pending` dan wajib di-approve artis. Saat approve, artis bisa menyesuaikan jam selesai.
- Booking pending otomatis batal setelah 7 hari (atau sebelum jam mulai kalau lebih dekat).
- Pembatalan/penolakan oleh artis maupun pelanggan wajib alasan, lalu WhatsApp terbuka dengan pesan berisi alasan.
- 1 booking = 1 layanan. Fee jasa saja, bayar di tempat. Pelanggan tanpa login, dikenali dari nomor WA (tanpa OTP).
- Anti double booking dijaga database (exclusion constraint), bukan cuma di browser.

## Coba di lokal
```bash
python3 -m http.server 8000
# buka http://localhost:8000
```
(Harus lewat server, bukan klik file langsung, karena memakai ES modules.)
