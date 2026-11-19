import { sb } from '../supabase.js';
import { $, rupiah, fmtDate, dayKey, addDays, toISO } from '../utils.js';
import { requireAdmin } from './common.js';
import { BOOKING_SELECT, bookingCard, bindBookingActions } from './booking-actions.js';

await requireAdmin();

async function load() {
  const today = dayKey();
  $('#today-label').textContent = fmtDate(new Date());
  const todayStart = toISO(today, '00:00');
  const tomorrow = toISO(addDays(today, 1), '00:00');
  const weekEnd = toISO(addDays(today, 7), '00:00');
  const monthStart = toISO(today.slice(0, 8) + '01', '00:00');

  const [pending, todayRes, week, income] = await Promise.all([
    sb.from('bookings').select(BOOKING_SELECT).eq('status', 'pending').order('start_at'),
    sb.from('bookings').select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'confirmed']).gte('start_at', todayStart).lt('start_at', tomorrow),
    sb.from('bookings').select(BOOKING_SELECT).eq('status', 'confirmed')
      .gte('start_at', new Date().toISOString()).lt('start_at', weekEnd).order('start_at'),
    sb.from('bookings').select('price_snapshot').eq('status', 'done').gte('start_at', monthStart),
  ]);

  $('#st-pending').textContent = pending.data?.length ?? 0;
  $('#st-today').textContent = todayRes.count ?? 0;
  $('#st-week').textContent = week.data?.length ?? 0;
  const total = (income.data || []).reduce((a, r) => a + r.price_snapshot, 0);
  $('#st-income').textContent = rupiah(total);
  $('#st-income-n').textContent = `${income.data?.length || 0} booking selesai`;

  renderList($('#pending-list'), pending.data || [], 'Tidak ada booking yang menunggu. Santai dulu.');
  renderList($('#upcoming-list'), week.data || [], 'Belum ada booking terkonfirmasi minggu ini.');
}

function renderList(box, rows, emptyText) {
  box.innerHTML = rows.length ? rows.map(bookingCard).join('') : `<div class="empty">${emptyText}</div>`;
  bindBookingActions(box, rows, load);
}

load();
