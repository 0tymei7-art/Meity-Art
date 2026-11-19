import { sb } from '../supabase.js';
import { $, esc } from '../utils.js';

const NAV = [
  ['index.html', 'Dashboard'],
  ['kalender.html', 'Kalender'],
  ['booking.html', 'Booking', 'pending'],
  ['layanan.html', 'Layanan'],
  ['pelanggan.html', 'Pelanggan'],
  ['portofolio.html', 'Portofolio'],
  ['pengaturan.html', 'Pengaturan'],
];

/** Pastikan user login & terdaftar sebagai admin, lalu render navigasi. */
export async function requireAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('login.html'); return new Promise(() => {}); }
  const { data: adminRow } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (!adminRow) {
    await sb.auth.signOut();
    location.replace('login.html?denied=1');
    return new Promise(() => {});
  }
  renderNav();
  return session;
}

function renderNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const nav = $('#admin-nav');
  nav.innerHTML = `
    <a class="logo" href="index.html" aria-label="Meity Art admin"><span class="logo-word">Meity</span><span class="logo-sub">ART</span></a>
    ${NAV.map(([href, label, badge]) => `
      <a class="nav-link ${here === href ? 'active' : ''}" href="${href}" ${here === href ? 'aria-current="page"' : ''}>
        ${esc(label)}${badge ? `<span class="nav-badge hidden" id="nav-badge-${badge}"></span>` : ''}
      </a>`).join('')}
    <a class="nav-link" href="../index.html" target="_blank" rel="noopener">Lihat web ↗</a>
    <button class="btn btn-outline btn-sm" type="button" id="logout">Keluar</button>`;
  $('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.replace('login.html'); });
  refreshPendingBadge();
}

export async function refreshPendingBadge() {
  const { count } = await sb.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  const el = document.getElementById('nav-badge-pending');
  if (!el) return;
  el.textContent = count || '';
  el.classList.toggle('hidden', !count);
}

export async function getSettings() {
  const { data } = await sb.from('settings').select('*').eq('id', 1).single();
  return data;
}

export const BLOCK_TYPES = {
  open: 'Buka Booking',
  main_job: 'Kerja Utama',
  upgrade: 'Upgrade Diri',
  personal: 'Pribadi',
};
