-- =====================================================================
-- MEITY ART — Skema database Supabase
-- Jalankan sekali di Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------
do $$ begin
  create type public.block_type as enum ('open', 'main_job', 'upgrade', 'personal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('pending', 'confirmed', 'done', 'cancelled', 'rejected', 'no_show');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- ADMIN (artis). Hanya user yang terdaftar di tabel ini yang dianggap admin.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()); $$;

-- ---------------------------------------------------------------------
-- SETTINGS (satu baris)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Meity Art',
  wa_number text not null default '6281234567890',
  instagram text,
  slot_interval_min int not null default 30 check (slot_interval_min in (15, 30, 60)),
  buffer_min int not null default 30 check (buffer_min >= 0),
  min_notice_hours int not null default 24 check (min_notice_hours >= 0),
  max_days_ahead int not null default 30 check (max_days_ahead > 0),
  max_bookings_per_day int not null default 3 check (max_bookings_per_day > 0),
  pending_expiry_days int not null default 7 check (pending_expiry_days > 0),
  timezone text not null default 'Asia/Jakarta',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- KATEGORI & LAYANAN
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.categories (name, slug) values ('Nail Art', 'nail-art') on conflict (slug) do nothing;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text,
  duration_min int not null check (duration_min > 0),
  price int not null default 0 check (price >= 0),
  photo_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PELANGGAN (tanpa login, dikenali lewat nomor WA)
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wa_number text not null unique,
  instagram text,
  default_location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- KALENDER: blok sekali pakai + aturan berulang mingguan
-- ---------------------------------------------------------------------
create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  type public.block_type not null,
  title text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists time_blocks_range_idx on public.time_blocks using gist (tstzrange(start_at, end_at));

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  type public.block_type not null,
  title text,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Minggu ... 6 = Sabtu
  start_time time not null,
  end_time time not null,
  valid_from date not null default current_date,
  valid_until date,
  skip_dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- ---------------------------------------------------------------------
-- BOOKING
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  service_name_snapshot text not null,
  price_snapshot int not null default 0,
  start_at timestamptz not null,
  end_at timestamptz not null,
  block_until timestamptz not null, -- end_at + buffer (diisi trigger)
  location text not null,
  location_notes text,
  customer_notes text,
  artist_notes text,
  status public.booking_status not null default 'pending',
  cancel_reason text,
  cancelled_by text check (cancelled_by in ('artist', 'customer', 'system')),
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

-- Anti double booking di level database
do $$ begin
  alter table public.bookings add constraint bookings_no_overlap
    exclude using gist (tstzrange(start_at, block_until, '[)') with &&)
    where (status in ('pending', 'confirmed'));
exception when duplicate_object or duplicate_table then null; end $$;

create index if not exists bookings_status_idx on public.bookings (status, start_at);
create index if not exists bookings_customer_idx on public.bookings (customer_id);

-- ---------------------------------------------------------------------
-- PORTOFOLIO
-- ---------------------------------------------------------------------
create table if not exists public.portfolio (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  image_url text not null,
  storage_path text,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- TRIGGER
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- block_until selalu = end_at + buffer; berlaku juga saat artis mengubah jam selesai
create or replace function public.bookings_before_write()
returns trigger language plpgsql as $$
declare v_buffer int;
begin
  select buffer_min into v_buffer from public.settings where id = 1;
  new.block_until := new.end_at + make_interval(mins => coalesce(v_buffer, 0));
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists bookings_before_write on public.bookings;
create trigger bookings_before_write before insert or update of end_at, start_at, status on public.bookings
  for each row execute function public.bookings_before_write();

-- ---------------------------------------------------------------------
-- FUNGSI KALENDER
-- ---------------------------------------------------------------------
-- Semua blok (sekali pakai + hasil aturan berulang) dalam rentang tanggal
create or replace function public.expand_blocks(p_from date, p_to date)
returns table (source text, ref_id uuid, type public.block_type, title text, start_at timestamptz, end_at timestamptz, day date)
language sql stable security definer set search_path = public
as $$
  with tz as (select timezone as z from public.settings where id = 1)
  select 'block', b.id, b.type, b.title, b.start_at, b.end_at, (b.start_at at time zone tz.z)::date
  from public.time_blocks b, tz
  where b.start_at < ((p_to + 1)::timestamp at time zone tz.z)
    and b.end_at > (p_from::timestamp at time zone tz.z)
  union all
  select 'rule', r.id, r.type, r.title,
         (g.d + r.start_time) at time zone tz.z,
         (g.d + r.end_time) at time zone tz.z,
         g.d
  from public.recurring_rules r
  cross join tz
  cross join lateral (
    select gs::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  ) g
  where extract(dow from g.d) = r.weekday
    and g.d >= r.valid_from
    and (r.valid_until is null or g.d <= r.valid_until)
    and not (g.d = any (r.skip_dates));
$$;

-- Slot kosong untuk satu layanan pada satu tanggal (dipakai halaman booking)
create or replace function public.get_available_slots(p_service_id uuid, p_date date)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.settings%rowtype;
  v_dur int;
  v_count int;
  v_min_start timestamptz;
begin
  select * into s from public.settings where id = 1;
  select duration_min into v_dur from public.services where id = p_service_id and is_active;
  if v_dur is null then return; end if;

  if p_date < (now() at time zone s.timezone)::date
     or p_date > (now() at time zone s.timezone)::date + s.max_days_ahead then
    return;
  end if;

  select count(*) into v_count from public.bookings k
  where k.status in ('pending', 'confirmed') and (k.start_at at time zone s.timezone)::date = p_date;
  if v_count >= s.max_bookings_per_day then return; end if;

  v_min_start := now() + make_interval(hours => s.min_notice_hours);

  return query
  with blk as (select * from public.expand_blocks(p_date, p_date)),
  cand as (
    select gs as st, gs + make_interval(mins => v_dur) as en
    from blk o
    cross join lateral generate_series(
      o.start_at, o.end_at - make_interval(mins => v_dur), make_interval(mins => s.slot_interval_min)
    ) gs
    where o.type = 'open'
  )
  select distinct c.st, c.en
  from cand c
  where c.st >= v_min_start
    and not exists (
      select 1 from blk b
      where b.type <> 'open' and tstzrange(b.start_at, b.end_at) && tstzrange(c.st, c.en))
    and not exists (
      select 1 from public.bookings k
      where k.status in ('pending', 'confirmed')
        and tstzrange(k.start_at, k.block_until) && tstzrange(c.st, c.en + make_interval(mins => s.buffer_min)))
  order by c.st;
end $$;

-- ---------------------------------------------------------------------
-- FUNGSI PUBLIK (dipanggil pelanggan tanpa login)
-- ---------------------------------------------------------------------
create or replace function public.normalize_wa(p_wa text)
returns text language sql immutable as $$
  select case
    when d like '0%' then '62' || substr(d, 2)
    when d like '8%' then '62' || d
    else d end
  from (select regexp_replace(coalesce(p_wa, ''), '\D', '', 'g') as d) x;
$$;

-- Kenali pelanggan lama dari nomor WA (hanya nama & instagram)
create or replace function public.find_customer(p_wa text)
returns json language sql stable security definer set search_path = public
as $$
  select json_build_object('name', c.name, 'instagram', c.instagram)
  from public.customers c where c.wa_number = public.normalize_wa(p_wa);
$$;

create or replace function public.create_booking(
  p_service_id uuid,
  p_start timestamptz,
  p_name text,
  p_wa text,
  p_instagram text,
  p_location text,
  p_location_notes text,
  p_notes text
) returns json
language plpgsql volatile security definer set search_path = public
as $$
declare
  s public.settings%rowtype;
  v_service public.services%rowtype;
  v_wa text := public.normalize_wa(p_wa);
  v_customer_id uuid;
  v_code text;
  v_end timestamptz;
  v_id uuid;
begin
  select * into s from public.settings where id = 1;
  select * into v_service from public.services where id = p_service_id and is_active;
  if v_service.id is null then raise exception 'Layanan tidak ditemukan'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Nama wajib diisi'; end if;
  if length(v_wa) < 10 or length(v_wa) > 15 then raise exception 'Nomor WA tidak valid'; end if;
  if length(trim(coalesce(p_location, ''))) < 3 then raise exception 'Lokasi wajib diisi'; end if;

  if not exists (
    select 1 from public.get_available_slots(p_service_id, (p_start at time zone s.timezone)::date) a
    where a.slot_start = p_start
  ) then
    raise exception 'Slot sudah tidak tersedia, silakan pilih jam lain';
  end if;

  insert into public.customers (name, wa_number, instagram, default_location)
  values (trim(p_name), v_wa, nullif(trim(coalesce(p_instagram, '')), ''), trim(p_location))
  on conflict (wa_number) do update
    set name = excluded.name,
        instagram = coalesce(excluded.instagram, public.customers.instagram),
        default_location = excluded.default_location
  returning id into v_customer_id;

  loop
    v_code := 'MA-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.bookings where booking_code = v_code);
  end loop;

  v_end := p_start + make_interval(mins => v_service.duration_min);

  begin
    insert into public.bookings (
      booking_code, customer_id, service_id, service_name_snapshot, price_snapshot,
      start_at, end_at, block_until, location, location_notes, customer_notes, expires_at
    ) values (
      v_code, v_customer_id, v_service.id, v_service.name, v_service.price,
      p_start, v_end, v_end, trim(p_location), nullif(trim(coalesce(p_location_notes, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      least(now() + make_interval(days => s.pending_expiry_days), p_start)
    ) returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Slot baru saja diambil orang lain, silakan pilih jam lain';
  end;

  return json_build_object(
    'booking_code', v_code,
    'service_name', v_service.name,
    'price', v_service.price,
    'start_at', p_start,
    'end_at', v_end,
    'wa_artist', s.wa_number
  );
end $$;

create or replace function public.get_booking_status(p_code text, p_wa text)
returns json language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'booking_code', b.booking_code,
    'status', b.status,
    'service_name', b.service_name_snapshot,
    'price', b.price_snapshot,
    'start_at', b.start_at,
    'end_at', b.end_at,
    'location', b.location,
    'customer_name', c.name,
    'cancel_reason', b.cancel_reason,
    'cancelled_by', b.cancelled_by,
    'expires_at', b.expires_at,
    'wa_artist', (select wa_number from public.settings where id = 1)
  )
  from public.bookings b join public.customers c on c.id = b.customer_id
  where b.booking_code = upper(trim(p_code)) and c.wa_number = public.normalize_wa(p_wa);
$$;

create or replace function public.cancel_booking_customer(p_code text, p_wa text, p_reason text)
returns json language plpgsql volatile security definer set search_path = public
as $$
declare v_id uuid;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Alasan pembatalan wajib diisi (minimal 5 karakter)';
  end if;
  update public.bookings b set status = 'cancelled', cancelled_by = 'customer', cancel_reason = trim(p_reason)
  from public.customers c
  where c.id = b.customer_id
    and b.booking_code = upper(trim(p_code))
    and c.wa_number = public.normalize_wa(p_wa)
    and b.status in ('pending', 'confirmed')
  returning b.id into v_id;
  if v_id is null then raise exception 'Booking tidak ditemukan atau sudah tidak bisa dibatalkan'; end if;
  return public.get_booking_status(p_code, p_wa);
end $$;

-- Auto-cancel booking pending yang lewat batas waktu
create or replace function public.expire_pending_bookings()
returns int language plpgsql volatile security definer set search_path = public
as $$
declare v_n int;
begin
  update public.bookings
  set status = 'cancelled', cancelled_by = 'system',
      cancel_reason = 'Tidak dikonfirmasi artis sebelum batas waktu'
  where status = 'pending' and expires_at is not null and expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- HAK AKSES FUNGSI
-- ---------------------------------------------------------------------
revoke all on function public.expand_blocks(date, date) from public, anon;
grant execute on function public.expand_blocks(date, date) to authenticated;
revoke all on function public.expire_pending_bookings() from public, anon, authenticated;

grant execute on function public.get_available_slots(uuid, date) to anon, authenticated;
grant execute on function public.find_customer(text) to anon, authenticated;
grant execute on function public.create_booking(uuid, timestamptz, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_booking_status(text, text) to anon, authenticated;
grant execute on function public.cancel_booking_customer(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.time_blocks enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.bookings enable row level security;
alter table public.portfolio enable row level security;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());

-- Data publik yang boleh dibaca pengunjung
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to anon, authenticated using (true);
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists services_read on public.services;
create policy services_read on public.services for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists portfolio_read on public.portfolio;
create policy portfolio_read on public.portfolio for select to anon, authenticated using (true);

-- Admin: akses penuh
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['categories', 'services', 'customers', 'time_blocks', 'recurring_rules', 'bookings', 'portfolio'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- STORAGE: bucket foto portofolio & layanan
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

drop policy if exists portfolio_public_read on storage.objects;
create policy portfolio_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'portfolio');
drop policy if exists portfolio_admin_insert on storage.objects;
create policy portfolio_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio' and public.is_admin());
drop policy if exists portfolio_admin_update on storage.objects;
create policy portfolio_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'portfolio' and public.is_admin());
drop policy if exists portfolio_admin_delete on storage.objects;
create policy portfolio_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio' and public.is_admin());
