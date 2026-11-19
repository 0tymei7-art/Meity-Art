import { sb } from '../supabase.js';
import {
  $, $$, esc, rupiah, fmtDate, fmtDateShort, fmtTime, statusBadge, waLink, toast, errMsg, openModal, dayKey, toISO,
} from '../utils.js';
import { refreshPendingBadge } from './common.js';

export const BOOKING_SELECT = '*, customers(id, name, wa_number, instagram), services(name, duration_min)';

/** HTML satu kartu booking dengan tombol aksi sesuai status */
export function bookingCard(b) {
  const c = b.customers || {};
  const act = [];
  if (b.status === 'pending') {
    act.push(`<button class="btn btn-primary btn-sm" data-act="approve" data-id="${b.id}">Approve</button>`);
    act.push(`<button class="btn btn-danger btn-sm" data-act="reject" data-id="${b.id}">Tolak</button>`);
  }
  if (b.status === 'confirmed') {
    act.push(`<button class="btn btn-primary btn-sm" data-act="done" data-id="${b.id}">Selesai</button>`);
    act.push(`<button class="btn btn-outline btn-sm" data-act="no_show" data-id="${b.id}">Tidak datang</button>`);
    act.push(`<button class="btn btn-danger btn-sm" data-act="cancel" data-id="${b.id}">Batalkan</button>`);
  }
  act.push(`<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${waLink(c.wa_number, `Halo ${c.name}, ini Meity Art soal booking ${b.booking_code}.`)}">WA</a>`);

  return `
    <article class="card booking-item" data-booking="${b.id}">
      <div class="when">
        <div class="small muted">${fmtDateShort(b.start_at)}</div>
        <div class="t">${fmtTime(b.start_at)}</div>
        <div class="small muted">s/d ${fmtTime(b.end_at)}</div>
      </div>
      <div class="info">
        <div class="row" style="gap: 8px">${statusBadge(b.status)}<span class="small muted">${esc(b.booking_code)}</span></div>
        <h3 style="margin: 6px 0 2px; font-size: 24px">${esc(c.name || '-')}</h3>
        <div>${esc(b.service_name_snapshot)} · ${rupiah(b.price_snapshot)}</div>
        <div class="small muted">Lokasi: ${esc(b.location)}${b.location_notes ? ` · ${esc(b.location_notes)}` : ''}</div>
        ${b.customer_notes ? `<div class="small">Catatan: ${esc(b.customer_notes)}</div>` : ''}
        ${b.status === 'pending' && b.expires_at ? `<div class="small muted">Batas approve: ${fmtDateShort(b.expires_at)} ${fmtTime(b.expires_at)}</div>` : ''}
        ${b.cancel_reason ? `<div class="small" style="color: var(--cherry-dark)">Alasan (${esc(b.cancelled_by || '-')}): ${esc(b.cancel_reason)}</div>` : ''}
      </div>
      <div class="actions">${act.join('')}</div>
    </article>`;
}

/** Pasang handler aksi ke container. bookings = array data, onChange = callback refresh. */
export function bindBookingActions(container, bookings, onChange) {
  $$('[data-act]', container).forEach((btn) => btn.addEventListener('click', () => {
    const b = bookings.find((x) => x.id === btn.dataset.id);
    if (!b) return;
    const handlers = { approve, reject, cancel, done: () => setStatus(b, 'done'), no_show: () => setStatus(b, 'no_show') };
    handlers[btn.dataset.act](b, onChange);
  }));

  async function setStatus(b, status) {
    const label = status === 'done' ? 'selesai' : 'tidak datang';
    if (!confirm(`Tandai booking ${b.booking_code} sebagai ${label}?`)) return;
    const { error } = await sb.from('bookings').update({ status }).eq('id', b.id);
    if (error) return toast(errMsg(error), 'error');
    toast('Status diperbarui.', 'success');
    onChange();
  }
}

function approve(b, onChange) {
  const dateKey = dayKey(b.start_at);
  openModal(`
    <form>
      <h3>Approve booking</h3>
      <p class="muted small" style="margin: 0">${esc(b.customers?.name)} · ${esc(b.service_name_snapshot)} · ${fmtDate(b.start_at)}</p>
      <div class="form-grid">
        <div class="field"><label for="ap-start">Jam mulai</label><input id="ap-start" name="start" type="time" value="${fmtTime(b.start_at)}" required></div>
        <div class="field"><label for="ap-end">Jam selesai</label><input id="ap-end" name="end" type="time" value="${fmtTime(b.end_at)}" required></div>
      </div>
      <span class="hint">Sesuaikan jam selesai kalau desain butuh waktu lebih lama.</span>
      <div class="field"><label for="ap-loc">Lokasi yang disepakati</label><textarea id="ap-loc" name="location" required>${esc(b.location)}</textarea></div>
      <div class="field"><label for="ap-note">Catatan pribadi (opsional)</label><input id="ap-note" name="artist_notes" value="${esc(b.artist_notes || '')}"></div>
      <label class="check"><input type="checkbox" name="wa" checked> Kirim konfirmasi via WhatsApp</label>
      <div class="row"><button class="btn btn-ghost" type="button" data-close>Batal</button><span class="spacer"></span><button class="btn btn-primary" type="submit">Approve</button></div>
    </form>`, {
    onSubmit: async (f) => {
      const start = toISO(dateKey, f.get('start'));
      const end = toISO(dateKey, f.get('end'));
      if (new Date(end) <= new Date(start)) { toast('Jam selesai harus setelah jam mulai.', 'error'); return false; }
      const waTab = f.get('wa') ? window.open('', '_blank') : null;
      const { error } = await sb.from('bookings').update({
        status: 'confirmed', start_at: start, end_at: end, confirmed_at: new Date().toISOString(),
        location: f.get('location').trim(), artist_notes: f.get('artist_notes').trim() || null,
      }).eq('id', b.id);
      if (error) { waTab?.close(); toast(errMsg(error), 'error'); return false; }
      if (waTab) {
        waTab.location = waLink(b.customers.wa_number, [
          `Halo ${b.customers.name}, booking kamu di Meity Art sudah DIKONFIRMASI.`,
          '',
          `Kode: ${b.booking_code}`,
          `Layanan: ${b.service_name_snapshot}`,
          `Jadwal: ${fmtDate(start)}, ${fmtTime(start)}–${fmtTime(end)} WIB`,
          `Lokasi: ${f.get('location').trim()}`,
          `Fee jasa: ${rupiah(b.price_snapshot)} (bayar di tempat)`,
          '',
          'Sampai ketemu!',
        ].join('\n'));
      }
      toast('Booking dikonfirmasi.', 'success');
      refreshPendingBadge();
      onChange();
      return true;
    },
  });
}

function reasonModal(b, { title, status, intro, onChange }) {
  openModal(`
    <form>
      <h3>${esc(title)}</h3>
      <p class="muted small" style="margin: 0">${esc(b.customers?.name)} · ${esc(b.booking_code)} · ${fmtDate(b.start_at)} ${fmtTime(b.start_at)}</p>
      <div class="field">
        <label for="rs">Alasan (wajib, akan dikirim ke pelanggan via WA)</label>
        <textarea id="rs" name="reason" required minlength="5"></textarea>
      </div>
      <div class="row"><button class="btn btn-ghost" type="button" data-close>Kembali</button><span class="spacer"></span><button class="btn btn-primary" type="submit">${esc(title)} &amp; kirim WA</button></div>
    </form>`, {
    onSubmit: async (f) => {
      const reason = String(f.get('reason')).trim();
      if (reason.length < 5) { toast('Alasan minimal 5 karakter.', 'error'); return false; }
      const waTab = window.open('', '_blank');
      const { error } = await sb.from('bookings').update({ status, cancel_reason: reason, cancelled_by: 'artist' }).eq('id', b.id);
      if (error) { waTab?.close(); toast(errMsg(error), 'error'); return false; }
      const url = waLink(b.customers.wa_number, [
        `Halo ${b.customers.name}, ${intro}`,
        '',
        `Kode: ${b.booking_code}`,
        `Jadwal: ${fmtDate(b.start_at)}, ${fmtTime(b.start_at)} WIB`,
        `Alasan: ${reason}`,
        '',
        'Mohon maaf ya. Silakan booking ulang di jam lain kalau masih berkenan.',
      ].join('\n'));
      if (waTab) waTab.location = url; else location.href = url;
      toast('Status diperbarui.', 'success');
      refreshPendingBadge();
      onChange();
      return true;
    },
  });
}

const reject = (b, onChange) => reasonModal(b, {
  title: 'Tolak booking', status: 'rejected', intro: 'mohon maaf booking kamu di Meity Art belum bisa kami terima.', onChange,
});
const cancel = (b, onChange) => reasonModal(b, {
  title: 'Batalkan booking', status: 'cancelled', intro: 'mohon maaf booking kamu di Meity Art terpaksa kami batalkan.', onChange,
});
