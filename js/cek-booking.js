import { sb } from './supabase.js';
import { $, esc, rupiah, fmtDate, fmtTime, statusBadge, waLink, toast, errMsg } from './utils.js';

let current = null; // { code, wa, data }

const params = new URLSearchParams(location.search);
if (params.get('code')) $('#code').value = params.get('code');
try { const w = localStorage.getItem('meity_last_wa'); if (w) $('#wa').value = w; } catch { /* abaikan */ }

$('#form-check').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#code').value.trim();
  const wa = $('#wa').value.trim();
  if (!code || !wa) return toast('Isi kode booking dan nomor WhatsApp.', 'error');
  const { data, error } = await sb.rpc('get_booking_status', { p_code: code, p_wa: wa });
  if (error) return toast(errMsg(error), 'error');
  if (!data) {
    $('#result').innerHTML = `<div class="empty">Booking tidak ditemukan. Pastikan kode dan nomor WhatsApp sesuai.</div>`;
    return;
  }
  current = { code, wa, data };
  render();
});

function render() {
  const b = current.data;
  const canCancel = ['pending', 'confirmed'].includes(b.status);
  $('#result').innerHTML = `
    <div class="card stack summary">
      <div class="row"><span class="code-box" style="font-size: 20px">${esc(b.booking_code)}</span><span class="spacer"></span>${statusBadge(b.status)}</div>
      <dl>
        <dt>Nama</dt><dd>${esc(b.customer_name)}</dd>
        <dt>Layanan</dt><dd>${esc(b.service_name)}</dd>
        <dt>Tanggal</dt><dd>${fmtDate(b.start_at)}</dd>
        <dt>Jam</dt><dd>${fmtTime(b.start_at)} – ${fmtTime(b.end_at)} WIB</dd>
        <dt>Lokasi</dt><dd>${esc(b.location)}</dd>
        <dt>Fee jasa</dt><dd>${rupiah(b.price)} · bayar di tempat</dd>
        ${b.status === 'pending' && b.expires_at ? `<dt>Batas konfirmasi</dt><dd>${fmtDate(b.expires_at)}, ${fmtTime(b.expires_at)} WIB</dd>` : ''}
        ${b.cancel_reason ? `<dt>Alasan</dt><dd>${esc(b.cancel_reason)}</dd>` : ''}
      </dl>
      <div class="row">
        <a class="btn btn-wa" href="${waLink(b.wa_artist, `Halo kak, saya mau tanya booking ${b.booking_code}.`)}" target="_blank" rel="noopener">Chat artis</a>
        ${canCancel ? '<button class="btn btn-danger" type="button" id="show-cancel">Batalkan booking</button>' : ''}
      </div>
    </div>
    ${canCancel ? `
    <form class="card stack hidden" id="form-cancel" style="margin-top: 16px">
      <h3 style="margin: 0">Batalkan booking</h3>
      <div class="field">
        <label for="reason">Alasan pembatalan</label>
        <textarea id="reason" required minlength="5" placeholder="Tulis alasan yang jelas ya"></textarea>
        <span class="hint">Alasan wajib diisi dan akan dikirim ke artis lewat WhatsApp.</span>
      </div>
      <div class="row">
        <button class="btn btn-ghost" type="button" id="hide-cancel">Tidak jadi</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" type="submit">Batalkan &amp; kirim WA</button>
      </div>
    </form>` : ''}`;

  if (!canCancel) return;
  $('#show-cancel').addEventListener('click', () => { $('#form-cancel').classList.remove('hidden'); $('#reason').focus(); });
  $('#hide-cancel').addEventListener('click', () => $('#form-cancel').classList.add('hidden'));
  $('#form-cancel').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = $('#reason').value.trim();
    if (reason.length < 5) return toast('Alasan minimal 5 karakter.', 'error');
    // Buka tab WA dulu supaya tidak diblokir browser sebagai pop-up
    const waTab = window.open('', '_blank');
    const { data, error } = await sb.rpc('cancel_booking_customer', { p_code: current.code, p_wa: current.wa, p_reason: reason });
    if (error) { waTab?.close(); return toast(errMsg(error), 'error'); }
    const msg = [
      'Halo kak, saya membatalkan booking Meity Art.',
      '',
      `Kode booking: ${b.booking_code}`,
      `Jadwal: ${fmtDate(b.start_at)}, ${fmtTime(b.start_at)} WIB`,
      `Alasan: ${reason}`,
      '',
      'Mohon maaf dan terima kasih.',
    ].join('\n');
    const url = waLink(b.wa_artist, msg);
    if (waTab) waTab.location = url; else location.href = url;
    current.data = data;
    toast('Booking dibatalkan.', 'success');
    render();
  });
}
