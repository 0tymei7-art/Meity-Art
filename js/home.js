import { sb } from './supabase.js';
import { $, esc, rupiah, durasi, waLink } from './utils.js';

async function loadSettings() {
  const { data } = await sb.from('settings').select('business_name, wa_number, instagram').eq('id', 1).single();
  if (!data) return;
  $('#footer-wa').href = waLink(data.wa_number, `Halo ${data.business_name}, saya mau tanya soal nail art.`);
  if (data.instagram) {
    const ig = $('#footer-ig');
    ig.href = `https://instagram.com/${data.instagram.replace(/^@/, '')}`;
    ig.classList.remove('hidden');
  }
}

async function loadServices() {
  const box = $('#service-list');
  const { data, error } = await sb.from('services')
    .select('id, name, description, duration_min, price, photo_url, categories(name)')
    .eq('is_active', true).order('sort_order').order('name');
  if (error) { box.innerHTML = `<div class="empty">Gagal memuat layanan.</div>`; return; }
  if (!data.length) { box.innerHTML = `<div class="empty">Layanan segera hadir.</div>`; return; }
  box.innerHTML = data.map((s) => `
    <article class="card service-card">
      ${s.photo_url ? `<img class="photo" src="${esc(s.photo_url)}" alt="${esc(s.name)}" loading="lazy">` : ''}
      <span class="pill" style="align-self: flex-start">${esc(s.categories?.name || 'Nail Art')}</span>
      <h3 style="margin: 0">${esc(s.name)}</h3>
      ${s.description ? `<p class="muted" style="margin: 0">${esc(s.description)}</p>` : ''}
      <div class="service-meta">Estimasi ${durasi(s.duration_min)}</div>
      <div class="price">${rupiah(s.price)}</div>
      <a class="btn btn-primary" href="booking.html?service=${encodeURIComponent(s.id)}">Booking layanan ini</a>
    </article>`).join('');
}

async function loadGallery() {
  const box = $('#gallery');
  const { data } = await sb.from('portfolio').select('image_url, caption').order('sort_order').order('created_at', { ascending: false }).limit(12);
  if (!data?.length) { box.innerHTML = `<div class="empty">Portofolio segera hadir.</div>`; return; }
  box.innerHTML = data.map((p) => `
    <figure>
      <img src="${esc(p.image_url)}" alt="${esc(p.caption || 'Hasil nail art Meity Art')}" loading="lazy">
      ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
    </figure>`).join('');
  const hero = $('#hero-art');
  hero.innerHTML = `<img src="${esc(data[0].image_url)}" alt="">`;
}

loadSettings();
loadServices();
loadGallery();
