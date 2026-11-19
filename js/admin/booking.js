import { sb } from '../supabase.js';
import { $, $$ } from '../utils.js';
import { requireAdmin } from './common.js';
import { BOOKING_SELECT, bookingCard, bindBookingActions } from './booking-actions.js';

await requireAdmin();

let status = new URLSearchParams(location.search).get('status') || 'pending';
let rows = [];

$$('#tabs button').forEach((b) => b.addEventListener('click', () => { status = b.dataset.status; load(); }));
$('#search').addEventListener('input', render);

async function load() {
  $$('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === status)));
  let q = sb.from('bookings').select(BOOKING_SELECT).limit(300);
  if (status !== 'all') q = q.in('status', status.split(','));
  const upcomingFirst = status === 'pending' || status === 'confirmed';
  q = q.order('start_at', { ascending: upcomingFirst });
  const { data, error } = await q;
  rows = error ? [] : data;
  render();
}

function render() {
  const term = $('#search').value.trim().toLowerCase();
  const list = term
    ? rows.filter((b) => [b.booking_code, b.customers?.name, b.customers?.wa_number]
      .some((v) => String(v || '').toLowerCase().includes(term)))
    : rows;
  const box = $('#list');
  box.innerHTML = list.length ? list.map(bookingCard).join('') : '<div class="empty">Tidak ada booking.</div>';
  bindBookingActions(box, list, load);
}

load();
