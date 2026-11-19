import { sb } from './supabase.js';
import {
  $, $$, esc, rupiah, durasi, fmtDate, fmtTime, dayKey, addDays, waLink, toast, errMsg,
} from './utils.js';

const state = {
  step: 1,
  services: [],
  service: null,
  date: null,
  slot: null, // { start, end }
  data: null,
  settings: null,
};

// ---------- Navigasi langkah ----------
function go(step) {
  state.step = step;
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== String(step)));
  $$('#steps li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle('active', n === step);
    li.classList.toggle('done', typeof step === 'number' ? n < step : true);
    li.toggleAttribute('aria-current', n === step);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-back]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.back))));

// ---------- Step 1: layanan ----------
async function loadServices() {
  const box = $('#service-options');
  const { data, error } = await sb.from('services')
    .select('id, name, description, duration_min, price, categories(name)')
    .eq('is_active', true).order('sort_order').order('name');
  if (error || !data?.length) {
    box.innerHTML = `<div class="empty">${error ? 'Gagal memuat layanan.' : 'Belum ada layanan yang dibuka.'}</div>`;
    return;
  }
  state.services = data;
  box.innerHTML = data.map((s) => `
    <label class="choice">
      <input type="radio" name="service" value="${esc(s.id)}">
      <div class="card row" style="align-items: flex-start">
        <div style="flex: 1 1 240px">
          <span class="pill">${esc(s.categories?.name || 'Nail Art')}</span>
          <h3 style="margin: 8px 0 4px">${esc(s.name)}</h3>
          ${s.description ? `<p class="muted small" style="margin: 0">${esc(s.description)}</p>` : ''}
        </div>
        <div style="text-align: right">
          <div class="price">${rupiah(s.price)}</div>
          <div class="service-meta">± ${durasi(s.duration_min)}</div>
        </div>
      </div>
    </label>`).join('');

  $$('input[name=service]', box).forEach((r) => r.addEventListener('change', () => {
    state.service = state.services.find((s) => s.id === r.value);
    state.slot = null;
    $('#to-2').disabled = false;
  }));

  const pre = new URLSearchParams(location.search).get('service');
  const preInput = pre && $$('input[name=service]', box).find((r) => r.value === pre);
  if (preInput) { preInput.checked = true; preInput.dispatchEvent(new Event('change')); }
}

$('#to-2').addEventListener('click', () => { go(2); if (state.date) loadSlots(); });

// ---------- Step 2: tanggal & slot ----------
async function loadSettings() {
  const { data } = await sb.from('settings').select('*').eq('id', 1).single();
  state.settings = data;
  const today = dayKey();
  const max = addDays(today, data?.max_days_ahead ?? 30);
  const input = $('#date');
  input.min = today;
  input.max = max;
  $('#date-hint').textContent = `Booking bisa sampai ${data?.max_days_ahead ?? 30} hari ke depan.`;
}

$('#date').addEventListener('change', (e) => {
  state.date = e.target.value || null;
  state.slot = null;
  $('#to-3').disabled = true;
  loadSlots();
});

async function loadSlots() {
  const box = $('#slots');
  if (!state.date || !state.service) return;
  box.innerHTML = `<div class="empty" style="grid-column: 1 / -1">Mencari jam kosong…</div>`;
  const { data, error } = await sb.rpc('get_available_slots', { p_service_id: state.service.id, p_date: state.date });
  if (error) { box.innerHTML = `<div class="empty" style="grid-column: 1 / -1">Gagal memuat jadwal.</div>`; return; }
  if (!data.length) {
    box.innerHTML = `<div class="empty" style="grid-column: 1 / -1">Belum ada jam kosong di tanggal ini. Coba tanggal lain ya.</div>`;
    return;
  }
  box.innerHTML = data.map((s, i) => `
    <button type="button" class="slot" aria-pressed="false" data-i="${i}">${fmtTime(s.slot_start)}</button>`).join('');
  $$('.slot', box).forEach((b) => b.addEventListener('click', () => {
    $$('.slot', box).forEach((x) => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    const s = data[Number(b.dataset.i)];
    state.slot = { start: s.slot_start, end: s.slot_end };
    $('#to-3').disabled = false;
  }));
}

$('#to-3').addEventListener('click', () => go(3));

// ---------- Step 3: data diri ----------
let lookupTimer;
$('#wa').addEventListener('input', () => {
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(async () => {
    const wa = $('#wa').value;
    if (wa.replace(/\D/g, '').length < 10) { $('#wa-hint').textContent = ''; return; }
    const { data } = await sb.rpc('find_customer', { p_wa: wa });
    if (data) {
      $('#wa-hint').textContent = `Hai ${data.name}, data kamu sudah kami kenali.`;
      if (!$('#name').value) $('#name').value = data.name;
      if (!$('#instagram').value && data.instagram) $('#instagram').value = data.instagram;
    } else {
      $('#wa-hint').textContent = 'Nomor baru, data kamu akan otomatis tersimpan (register).';
    }
  }, 500);
});

$('#form-data').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const d = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v).trim()]));
  const digits = d.wa.replace(/\D/g, '');
  if (digits.length < 10) return toast('Nomor WhatsApp belum valid.', 'error');
  if (d.name.length < 2) return toast('Nama wajib diisi.', 'error');
  if (d.location.length < 3) return toast('Lokasi wajib diisi.', 'error');
  state.data = d;
  renderSummary($('#summary'));
  go(4);
});

function renderSummary(el) {
  const s = state.service;
  const d = state.data;
  el.innerHTML = `
    <dl>
      <dt>Layanan</dt><dd>${esc(s.name)}</dd>
      <dt>Tanggal</dt><dd>${fmtDate(state.slot.start)}</dd>
      <dt>Jam</dt><dd>${fmtTime(state.slot.start)} – ${fmtTime(state.slot.end)} WIB (estimasi)</dd>
      <dt>Fee jasa</dt><dd>${rupiah(s.price)} · bayar di tempat</dd>
      <dt>Nama</dt><dd>${esc(d.name)}</dd>
      <dt>WhatsApp</dt><dd>${esc(d.wa)}</dd>
      <dt>Lokasi</dt><dd>${esc(d.location)}${d.location_notes ? `<br><span class="muted small">${esc(d.location_notes)}</span>` : ''}</dd>
      ${d.notes ? `<dt>Catatan</dt><dd>${esc(d.notes)}</dd>` : ''}
    </dl>`;
}

// ---------- Step 4: kirim ----------
$('#submit-booking').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Mengirim…';
  const d = state.data;
  const { data, error } = await sb.rpc('create_booking', {
    p_service_id: state.service.id,
    p_start: state.slot.start,
    p_name: d.name,
    p_wa: d.wa,
    p_instagram: d.instagram || null,
    p_location: d.location,
    p_location_notes: d.location_notes || null,
    p_notes: d.notes || null,
  });
  btn.disabled = false;
  btn.textContent = 'Kirim Booking';
  if (error) {
    toast(errMsg(error), 'error');
    if (/slot/i.test(error.message)) { go(2); loadSlots(); }
    return;
  }
  showDone(data);
});

function showDone(res) {
  $('#done-code').textContent = res.booking_code;
  renderSummary($('#done-summary'));
  const d = state.data;
  const msg = [
    `Halo kak, saya ${d.name} baru saja booking di Meity Art.`,
    '',
    `Kode booking: ${res.booking_code}`,
    `Layanan: ${res.service_name}`,
    `Jadwal: ${fmtDate(res.start_at)}, ${fmtTime(res.start_at)} WIB`,
    `Lokasi: ${d.location}`,
    '',
    'Mohon konfirmasinya ya, terima kasih!',
  ].join('\n');
  $('#done-wa').href = waLink(res.wa_artist, msg);
  $('#done-check').href = `cek-booking.html?code=${encodeURIComponent(res.booking_code)}`;
  go('done');
  try { localStorage.setItem('meity_last_wa', d.wa); } catch { /* abaikan */ }
}

// ---------- Init ----------
go(1);
loadSettings();
loadServices();
