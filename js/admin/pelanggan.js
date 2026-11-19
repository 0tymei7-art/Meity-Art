import { sb } from '../supabase.js';
import { $, $$, esc, fmtDateShort, fmtTime, statusBadge, waLink, toast, errMsg, openModal, rupiah } from '../utils.js';
import { requireAdmin } from './common.js';

await requireAdmin();

let customers = [];

async function load() {
  const { data, error } = await sb.from('customers')
    .select('*, bookings(id, booking_code, status, start_at, service_name_snapshot, price_snapshot)')
    .order('created_at', { ascending: false });
  if (error) return toast(errMsg(error), 'error');
  customers = data.map((c) => {
    const bk = [...(c.bookings || [])].sort((a, b) => b.start_at.localeCompare(a.start_at));
    return { ...c, bookings: bk, done: bk.filter((b) => b.status === 'done').length };
  });
  render();
}

$('#search').addEventListener('input', render);

function render() {
  const term = $('#search').value.trim().toLowerCase();
  const list = customers.filter((c) => !term || c.name.toLowerCase().includes(term) || c.wa_number.includes(term.replace(/\D/g, '') || '~'));
  $('#rows').innerHTML = list.length ? list.map((c) => `
    <tr>
      <td><b>${esc(c.name)}</b>${c.instagram ? `<div class="small muted">${esc(c.instagram)}</div>` : ''}</td>
      <td><a href="${waLink(c.wa_number, `Halo ${c.name}, ini Meity Art.`)}" target="_blank" rel="noopener">${esc(c.wa_number)}</a></td>
      <td>${c.bookings.length} <span class="small muted">(${c.done} selesai)</span></td>
      <td>${c.bookings[0] ? fmtDateShort(c.bookings[0].start_at) : '-'}</td>
      <td><button class="btn btn-outline btn-sm" type="button" data-id="${c.id}">Detail</button></td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted">Belum ada pelanggan.</td></tr>';
  $$('[data-id]', $('#rows')).forEach((b) => b.addEventListener('click', () => detail(customers.find((c) => c.id === b.dataset.id))));
}

function detail(c) {
  openModal(`
    <form>
      <h3>${esc(c.name)}</h3>
      <p class="muted small" style="margin: 0">WA ${esc(c.wa_number)}${c.default_location ? ` · Lokasi terakhir: ${esc(c.default_location)}` : ''}</p>
      <div class="field"><label for="cn-notes">Catatan pribadi artis</label>
        <textarea id="cn-notes" name="notes" placeholder="Contoh: suka warna nude, kuku pendek">${esc(c.notes || '')}</textarea></div>
      <div>
        <p style="font-weight: 600; margin: 0 0 8px">Riwayat booking</p>
        ${c.bookings.length ? `<div class="list">${c.bookings.map((b) => `
          <div class="row small" style="gap: 8px">${statusBadge(b.status)}
            <span>${fmtDateShort(b.start_at)} ${fmtTime(b.start_at)}</span>
            <span class="muted">${esc(b.service_name_snapshot)} · ${rupiah(b.price_snapshot)}</span></div>`).join('')}</div>`
    : '<p class="muted small">Belum ada.</p>'}
      </div>
      <div class="row"><button class="btn btn-ghost" type="button" data-close>Tutup</button><span class="spacer"></span><button class="btn btn-primary" type="submit">Simpan catatan</button></div>
    </form>`, {
    onSubmit: async (f) => {
      const { error } = await sb.from('customers').update({ notes: String(f.get('notes')).trim() || null }).eq('id', c.id);
      if (error) { toast(errMsg(error), 'error'); return false; }
      toast('Catatan tersimpan.', 'success');
      load();
      return true;
    },
  });
}

load();
