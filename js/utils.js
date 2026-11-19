import { TZ, TZ_OFFSET } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export function durasi(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} menit`;
  return m ? `${h} jam ${m} menit` : `${h} jam`;
}

// ---- Tanggal & jam (selalu WIB) ----
export const fmtDate = (iso) => new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(iso));

export const fmtDateShort = (iso) => new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
}).format(new Date(iso));

export const fmtTime = (iso) => new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(iso)).replace('.', ':');

/** 'YYYY-MM-DD' di WIB untuk sebuah Date/ISO */
export const dayKey = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));

/** Tambah hari ke 'YYYY-MM-DD' */
export function addDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Minggu ... 6 = Sabtu untuk 'YYYY-MM-DD' */
export const weekdayOf = (key) => new Date(key + 'T00:00:00Z').getUTCDay();

/** Menit sejak 00:00 WIB */
export function minutesOfDay(iso) {
  const [h, m] = fmtTime(iso).split(':').map(Number);
  return h * 60 + m;
}

/** Gabungkan tanggal + jam lokal WIB menjadi ISO */
export const toISO = (dateKey, hhmm) => `${dateKey}T${hhmm}:00${TZ_OFFSET}`;

// ---- WhatsApp ----
export function normalizeWa(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
export const waLink = (number, text) =>
  `https://wa.me/${normalizeWa(number)}?text=${encodeURIComponent(text)}`;

// ---- Status ----
export const STATUS = {
  pending: { label: 'Menunggu konfirmasi', cls: 'st-pending' },
  confirmed: { label: 'Dikonfirmasi', cls: 'st-confirmed' },
  done: { label: 'Selesai', cls: 'st-done' },
  cancelled: { label: 'Dibatalkan', cls: 'st-cancelled' },
  rejected: { label: 'Ditolak', cls: 'st-cancelled' },
  no_show: { label: 'Tidak datang', cls: 'st-cancelled' },
};
export const statusBadge = (s) =>
  `<span class="badge ${STATUS[s]?.cls || ''}">${esc(STATUS[s]?.label || s)}</span>`;

// ---- UI ----
export function toast(msg, type = 'info') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/** Pesan error dari Supabase yang ramah dibaca */
export function errMsg(error) {
  const m = error?.message || String(error);
  if (/bookings_no_overlap|exclusion/i.test(m)) return 'Jadwal bentrok dengan booking lain.';
  return m;
}

/** Modal sederhana. Mengembalikan elemen dialog. */
export function openModal(html, { onSubmit } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  const form = $('form', dlg);
  if (form && onSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      if (btn) btn.disabled = true;
      try {
        const ok = await onSubmit(new FormData(form), dlg);
        if (ok !== false) dlg.close();
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
  dlg.showModal();
  return dlg;
}
