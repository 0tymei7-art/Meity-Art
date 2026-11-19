import { sb } from '../supabase.js';
import { $, $$, esc, rupiah, durasi, toast, errMsg, openModal } from '../utils.js';
import { requireAdmin } from './common.js';
import { uploadImage } from './upload.js';

await requireAdmin();

let categories = [];
let services = [];

$('#add-category').addEventListener('click', () => categoryForm());
$('#add-service').addEventListener('click', () => {
  if (!categories.length) return toast('Buat kategori dulu.', 'error');
  serviceForm();
});

async function load() {
  const [c, s] = await Promise.all([
    sb.from('categories').select('*').order('sort_order').order('name'),
    sb.from('services').select('*').order('sort_order').order('name'),
  ]);
  categories = c.data || [];
  services = s.data || [];
  render();
}

function render() {
  const box = $('#list');
  if (!categories.length) { box.innerHTML = '<div class="empty">Belum ada kategori.</div>'; return; }
  box.innerHTML = categories.map((cat) => {
    const list = services.filter((s) => s.category_id === cat.id);
    return `
      <section class="stack" style="padding: 0">
        <div class="row">
          <h2 style="margin: 0">${esc(cat.name)}</h2>
          ${cat.is_active ? '' : '<span class="badge st-cancelled">Nonaktif</span>'}
          <button class="btn btn-ghost btn-sm" type="button" data-edit-cat="${cat.id}">Edit kategori</button>
        </div>
        ${list.length ? `<div class="table-box"><table>
          <thead><tr><th>Layanan</th><th>Durasi</th><th>Fee jasa</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map((s) => `
            <tr>
              <td><b>${esc(s.name)}</b>${s.description ? `<div class="small muted">${esc(s.description)}</div>` : ''}</td>
              <td>${durasi(s.duration_min)}</td>
              <td>${rupiah(s.price)}</td>
              <td>${s.is_active ? '<span class="badge st-confirmed">Aktif</span>' : '<span class="badge st-done">Nonaktif</span>'}</td>
              <td><button class="btn btn-outline btn-sm" type="button" data-edit="${s.id}">Edit</button></td>
            </tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Belum ada layanan di kategori ini.</div>'}
      </section>`;
  }).join('');

  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => serviceForm(services.find((s) => s.id === b.dataset.edit))));
  $$('[data-edit-cat]', box).forEach((b) => b.addEventListener('click', () => categoryForm(categories.find((c) => c.id === b.dataset.editCat))));
}

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');

function categoryForm(cat = null) {
  openModal(`
    <form>
      <h3>${cat ? 'Edit' : 'Tambah'} kategori</h3>
      <div class="field"><label for="cf-name">Nama</label><input id="cf-name" name="name" value="${esc(cat?.name || '')}" placeholder="Contoh: Eyelash" required></div>
      <div class="field"><label for="cf-order">Urutan</label><input id="cf-order" name="sort_order" type="number" value="${cat?.sort_order ?? 0}"></div>
      <label class="check"><input type="checkbox" name="is_active" ${cat?.is_active === false ? '' : 'checked'}> Aktif (tampil di web)</label>
      <div class="row"><button class="btn btn-ghost" type="button" data-close>Batal</button><span class="spacer"></span><button class="btn btn-primary" type="submit">Simpan</button></div>
    </form>`, {
    onSubmit: async (f) => {
      const row = { name: String(f.get('name')).trim(), sort_order: Number(f.get('sort_order') || 0), is_active: !!f.get('is_active') };
      const { error } = cat
        ? await sb.from('categories').update(row).eq('id', cat.id)
        : await sb.from('categories').insert({ ...row, slug: slugify(row.name) });
      if (error) { toast(errMsg(error), 'error'); return false; }
      toast('Kategori tersimpan.', 'success');
      load();
      return true;
    },
  });
}

function serviceForm(svc = null) {
  openModal(`
    <form>
      <h3>${svc ? 'Edit' : 'Tambah'} layanan</h3>
      <div class="field"><label for="sf-cat">Kategori</label>
        <select id="sf-cat" name="category_id">${categories.map((c) => `<option value="${c.id}" ${svc?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="sf-name">Nama layanan</label><input id="sf-name" name="name" value="${esc(svc?.name || '')}" required></div>
      <div class="field"><label for="sf-desc">Deskripsi (opsional)</label><textarea id="sf-desc" name="description">${esc(svc?.description || '')}</textarea></div>
      <div class="form-grid">
        <div class="field"><label for="sf-dur">Estimasi durasi (menit)</label><input id="sf-dur" name="duration_min" type="number" min="15" step="15" value="${svc?.duration_min ?? 90}" required></div>
        <div class="field"><label for="sf-price">Fee jasa (Rp)</label><input id="sf-price" name="price" type="number" min="0" step="1000" value="${svc?.price ?? ''}" required></div>
      </div>
      <div class="field"><label for="sf-photo">Foto (opsional)</label><input id="sf-photo" name="photo" type="file" accept="image/*">
        ${svc?.photo_url ? `<img src="${esc(svc.photo_url)}" alt="" style="width: 120px; border-radius: 8px; margin-top: 6px">` : ''}</div>
      <div class="field"><label for="sf-order">Urutan tampil</label><input id="sf-order" name="sort_order" type="number" value="${svc?.sort_order ?? 0}"></div>
      <label class="check"><input type="checkbox" name="is_active" ${svc?.is_active === false ? '' : 'checked'}> Aktif (bisa dibooking)</label>
      <div class="row"><button class="btn btn-ghost" type="button" data-close>Batal</button><span class="spacer"></span><button class="btn btn-primary" type="submit">Simpan</button></div>
    </form>`, {
    onSubmit: async (f) => {
      const row = {
        category_id: f.get('category_id'),
        name: String(f.get('name')).trim(),
        description: String(f.get('description')).trim() || null,
        duration_min: Number(f.get('duration_min')),
        price: Number(f.get('price')),
        sort_order: Number(f.get('sort_order') || 0),
        is_active: !!f.get('is_active'),
      };
      const photo = f.get('photo');
      if (photo && photo.size) {
        try { row.photo_url = (await uploadImage(photo, 'services')).url; } catch (e) { toast(errMsg(e), 'error'); return false; }
      }
      const { error } = svc
        ? await sb.from('services').update(row).eq('id', svc.id)
        : await sb.from('services').insert(row);
      if (error) { toast(errMsg(error), 'error'); return false; }
      toast('Layanan tersimpan.', 'success');
      load();
      return true;
    },
  });
}

load();
