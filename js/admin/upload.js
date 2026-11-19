import { sb } from '../supabase.js';

const MAX_SIDE = 1600;

/** Perkecil foto di browser sebelum upload supaya hemat kuota storage */
async function shrink(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 900_000) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Upload ke bucket "portfolio". Mengembalikan { url, path } */
export async function uploadImage(file, folder = 'misc') {
  const f = await shrink(file);
  const ext = f.name.split('.').pop().toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('portfolio').upload(path, f, { contentType: f.type, upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from('portfolio').getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function removeImage(path) {
  if (path) await sb.storage.from('portfolio').remove([path]);
}
