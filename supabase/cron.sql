-- =====================================================================
-- MEITY ART — Jadwal otomatis (auto-cancel booking pending > batas waktu)
-- 1. Supabase Dashboard → Database → Extensions → aktifkan "pg_cron"
-- 2. Jalankan file ini di SQL Editor
-- =====================================================================

select cron.schedule(
  'meity-expire-pending',
  '*/30 * * * *',               -- tiap 30 menit
  $$ select public.expire_pending_bookings(); $$
);

-- Cek jadwal:      select * from cron.job;
-- Hapus jadwal:    select cron.unschedule('meity-expire-pending');
