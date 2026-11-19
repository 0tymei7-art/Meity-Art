import { sb } from '../supabase.js';
import { $, $$, esc, toast, errMsg } from '../utils.js';
import { requireAdmin } from './common.js';
import { uploadImage, removeImage } from './upload.js';

await requireAdmin();

let services = [];
let items = [];

async function load() {
  const [s, p] = await Promise.all([
    sb.from('services').select('id, name, category_id').order('name'),
    sb.from('portfolio').select('*').order('sort_order').order('created_at', { ascending: false }),
  ]);
  services = s.data || [];
  items = p.data || [];
  $('#pf-service').innerHTML = '<option value="">—</option>' + services.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  render();
}

function render() {
  const box = $('#gallery');
  box.innerHTML = items.length ? items.map((p) => `
    <figure>
      <img src="${esc(p.image_url)}" alt="${esc(p.caption || 'Portofolio')}" loading="lazy">
      <figcaption class="row" style="gap: 6px">
        <span style="flex: 1">${esc(p.caption || '')}</span>
        <button class="btn btn-danger btn-sm" type="button" data-del="${p.id}" aria-label="Hapus foto">Hapus</button>
      </figcaption>
    </figure>`).join('') : '<div class="empty">Belum ada foto.</div>';
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Hapus foto ini?')) return;
    const p = items.find((x) => x.id === b.dataset.del);
    const { error } = await sb.from('portfolio').delete().eq('id', p.id);
    if (error) return toast(errMsg(error), 'error');
    await removeImage(p.storage_path);
    toast('Foto dihapus.', 'success');
    load();
  }));
}

$('#form-upload').addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = [...$('#pf-file').files];
  if (!files.length) return;
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const serviceId = $('#pf-service').value || null;
  const svc = services.find((x) => x.id === serviceId);
  const caption = $('#pf-caption').value.trim() || null;
  let ok = 0;
  for (const [i, file] of files.entries()) {
    btn.textContent = `Upload ${i + 1}/${files.length}…`;
    try {
      const { url, path } = await uploadImage(file, 'portfolio');
      const { error } = await sb.from('portfolio').insert({
        image_url: url, storage_path: path, caption, service_id: serviceId, category_id: svc?.category_id || null,
      });
      if (error) throw error;
      ok++;
    } catch (err) {
      toast(`${file.name}: ${errMsg(err)}`, 'error');
    }
  }
  btn.disabled = false;
  btn.textContent = 'Upload';
  if (ok) toast(`${ok} foto terupload.`, 'success');
  e.target.reset();
  load();
});

load();
