import { sb } from '../supabase.js';
import {
  $, $$, esc, fmtDate, fmtDateShort, fmtTime, dayKey, addDays, weekdayOf, minutesOfDay, toISO,
  toast, errMsg, openModal, statusBadge, rupiah,
} from '../utils.js';
import { requireAdmin, BLOCK_TYPES } from './common.js';

await requireAdmin();

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 48;
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const mondayOf = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));
let weekStart = mondayOf(dayKey());
let items = [];

$('#prev').addEventListener('click', () => { weekStart = addDays(weekStart, -7); load(); });
$('#next').addEventListener('click', () => { weekStart = addDays(weekStart, 7); load(); });
$('#this-week').addEventListener('click', () => { weekStart = mondayOf(dayKey()); load(); });
$('#add-block').addEventListener('click', () => blockForm({ date: dayKey(), start: '10:00', end: '12:00' }));

async function load() {
  const weekEnd = addDays(weekStart, 6);
  $('#range-label').textContent = `${fmtDateShort(toISO(weekStart, '12:00'))} – ${fmtDateShort(toISO(weekEnd, '12:00'))}`;
  const [blocks, bookings] = await Promise.all([
    sb.rpc('expand_blocks', { p_from: weekStart, p_to: weekEnd }),
    sb.from('bookings').select('*, customers(name, wa_number)')
      .in('status', ['pending', 'confirmed'])
      .gte('start_at', toISO(weekStart, '00:00')).lt('start_at', toISO(addDays(weekEnd, 1), '00:00')),
  ]);
  if (blocks.error) toast(errMsg(blocks.error), 'error');
  items = [
    ...(blocks.data || []).map((b) => ({ kind: 'block', ...b })),
    ...(bookings.data || []).map((b) => ({ kind: 'booking', ...b, day: dayKey(b.start_at) })),
  ];
  render();
}

function top(iso) {
  const m = Math.max(minutesOfDay(iso) - START_HOUR * 60, 0);
  return (m / 60) * HOUR_PX;
}
function height(startIso, endIso, sameDay) {
  const s = Math.max(minutesOfDay(startIso), START_HOUR * 60);
  let e = minutesOfDay(endIso);
  if (!sameDay || e <= s) e = END_HOUR * 60;
  return Math.max(((e - s) / 60) * HOUR_PX, 20);
}

function render() {
  const cal = $('#cal');
  const today = dayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const totalH = (END_HOUR - START_HOUR) * HOUR_PX;

  let html = '<div class="cal-head"></div>';
  html += days.map((d) => `<div class="cal-head ${d === today ? 'today' : ''}">${DAY_NAMES[weekdayOf(d)]} ${Number(d.slice(8))}</div>`).join('');

  html += `<div class="cal-hours" style="height: ${totalH}px">`;
  for (let h = START_HOUR + 1; h < END_HOUR; h++) {
    html += `<span class="cal-hour-label" style="top: ${(h - START_HOUR) * HOUR_PX}px">${String(h).padStart(2, '0')}:00</span>`;
  }
  html += '</div>';

  for (const d of days) {
    html += `<div class="cal-day" data-day="${d}" style="height: ${totalH}px">`;
    for (let h = START_HOUR + 1; h < END_HOUR; h++) html += `<div class="hline" style="top: ${(h - START_HOUR) * HOUR_PX}px"></div>`;
    items.filter((it) => it.day === d).forEach((it) => {
      const idx = items.indexOf(it);
      const sameDay = dayKey(it.end_at) === d;
      const style = `top: ${top(it.start_at)}px; height: ${height(it.start_at, it.end_at, sameDay)}px`;
      if (it.kind === 'booking') {
        html += `<button type="button" class="cal-item t-booking ${it.status}" style="${style}" data-idx="${idx}">
          <b>${fmtTime(it.start_at)} ${esc(it.customers?.name || '')}</b>${esc(it.service_name_snapshot)}</button>`;
      } else {
        html += `<button type="button" class="cal-item t-${it.type} ${it.source}" style="${style}" data-idx="${idx}">
          <b>${fmtTime(it.start_at)}–${fmtTime(it.end_at)}</b>${esc(it.title || BLOCK_TYPES[it.type])}</button>`;
      }
    });
    html += '</div>';
  }
  cal.innerHTML = html;

  $$('.cal-item', cal).forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const it = items[Number(el.dataset.idx)];
    if (it.kind === 'booking') bookingDetail(it); else blockDetail(it);
  }));
  $$('.cal-day', cal).forEach((col) => col.addEventListener('click', (e) => {
    const y = e.clientY - col.getBoundingClientRect().top;
    const mins = START_HOUR * 60 + Math.floor((y / HOUR_PX) * 2) * 30;
    const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    blockForm({ date: col.dataset.day, start: hhmm(mins), end: hhmm(Math.min(mins + 120, 23 * 60 + 30)) });
  }));
}

function blockForm({ date, start, end }) {
  openModal(`
    <form>
      <h3>Tambah blok waktu</h3>
      <div class="field">
        <label for="bf-type">Jenis</label>
        <select id="bf-type" name="type">
          ${Object.entries(BLOCK_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <span class="hint">Hanya "Buka Booking" yang muncul sebagai slot untuk pelanggan.</span>
      </div>
      <div class="field"><label for="bf-title">Judul (opsional)</label><input id="bf-title" name="title" placeholder="Contoh: Shift kantor, Kursus gel art"></div>
      <div class="field"><label for="bf-date">Tanggal</label><input id="bf-date" name="date" type="date" value="${date}" required></div>
      <div class="form-grid">
        <div class="field"><label for="bf-start">Mulai</label><input id="bf-start" name="start" type="time" value="${start}" required></div>
        <div class="field"><label for="bf-end">Selesai</label><input id="bf-end" name="end" type="time" value="${end}" required></div>
      </div>
      <label class="check"><input type="checkbox" name="repeat" id="bf-repeat"> Ulangi setiap minggu di hari yang sama</label>
      <div class="field hidden" id="bf-until-wrap"><label for="bf-until">Berulang sampai (kosongkan = seterusnya)</label><input id="bf-until" name="until" type="date"></div>
      <div class="row"><button class="btn btn-ghost" type="button" data-close>Batal</button><span class="spacer"></span><button class="btn btn-primary" type="submit">Simpan</button></div>
    </form>`, {
    onSubmit: async (f) => {
      const d = f.get('date');
      const s = f.get('start');
      const e = f.get('end');
      if (e <= s) { toast('Jam selesai harus setelah jam mulai.', 'error'); return false; }
      const title = String(f.get('title')).trim() || null;
      const type = f.get('type');
      const { error } = f.get('repeat')
        ? await sb.from('recurring_rules').insert({
          type, title, weekday: weekdayOf(d), start_time: s, end_time: e, valid_from: d, valid_until: f.get('until') || null,
        })
        : await sb.from('time_blocks').insert({ type, title, start_at: toISO(d, s), end_at: toISO(d, e) });
      if (error) { toast(errMsg(error), 'error'); return false; }
      toast('Blok tersimpan.', 'success');
      load();
      return true;
    },
  });
  $('#bf-repeat').addEventListener('change', (e) => $('#bf-until-wrap').classList.toggle('hidden', !e.target.checked));
}

function blockDetail(it) {
  const isRule = it.source === 'rule';
  const dlg = openModal(`
    <div class="modal-body">
      <h3>${esc(it.title || BLOCK_TYPES[it.type])}</h3>
      <p style="margin: 0">${esc(BLOCK_TYPES[it.type])}${isRule ? ' · berulang tiap minggu' : ''}</p>
      <p class="muted" style="margin: 0">${fmtDate(it.start_at)}, ${fmtTime(it.start_at)}–${fmtTime(it.end_at)} WIB</p>
      <div class="row">
        ${isRule
    ? `<button class="btn btn-outline btn-sm" type="button" data-do="skip">Lewati tanggal ini saja</button>
           <button class="btn btn-danger btn-sm" type="button" data-do="del-rule">Hapus semua pengulangan</button>`
    : '<button class="btn btn-danger btn-sm" type="button" data-do="del-block">Hapus blok</button>'}
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" type="button" data-close>Tutup</button>
      </div>
    </div>`);

  $$('[data-do]', dlg).forEach((btn) => btn.addEventListener('click', async () => {
    let res;
    if (btn.dataset.do === 'del-block') {
      res = await sb.from('time_blocks').delete().eq('id', it.ref_id);
    } else if (btn.dataset.do === 'del-rule') {
      if (!confirm('Hapus aturan ini untuk semua minggu?')) return;
      res = await sb.from('recurring_rules').delete().eq('id', it.ref_id);
    } else {
      const { data: rule } = await sb.from('recurring_rules').select('skip_dates').eq('id', it.ref_id).single();
      res = await sb.from('recurring_rules').update({ skip_dates: [...(rule?.skip_dates || []), it.day] }).eq('id', it.ref_id);
    }
    if (res.error) return toast(errMsg(res.error), 'error');
    dlg.close();
    toast('Kalender diperbarui.', 'success');
    load();
  }));
}

function bookingDetail(b) {
  openModal(`
    <div class="modal-body">
      <div class="row">${statusBadge(b.status)}<span class="muted small">${esc(b.booking_code)}</span></div>
      <h3>${esc(b.customers?.name || '')}</h3>
      <p style="margin: 0">${esc(b.service_name_snapshot)} · ${rupiah(b.price_snapshot)}</p>
      <p class="muted" style="margin: 0">${fmtDate(b.start_at)}, ${fmtTime(b.start_at)}–${fmtTime(b.end_at)} WIB<br>${esc(b.location)}</p>
      <div class="row">
        <a class="btn btn-primary btn-sm" href="booking.html?status=${b.status}">Kelola di halaman Booking</a>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" type="button" data-close>Tutup</button>
      </div>
    </div>`);
}

load();
