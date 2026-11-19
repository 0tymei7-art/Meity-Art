import { sb } from '../supabase.js';
import { $, normalizeWa, toast, errMsg } from '../utils.js';
import { requireAdmin, getSettings } from './common.js';

await requireAdmin();

const TEXT = ['business_name', 'wa_number', 'instagram'];
const NUM = ['slot_interval_min', 'buffer_min', 'min_notice_hours', 'max_days_ahead', 'max_bookings_per_day', 'pending_expiry_days'];

const s = await getSettings();
[...TEXT, ...NUM].forEach((k) => { $(`#${k}`).value = s?.[k] ?? ''; });

$('#form-settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = {};
  TEXT.forEach((k) => { row[k] = $(`#${k}`).value.trim() || null; });
  NUM.forEach((k) => { row[k] = Number($(`#${k}`).value); });
  row.wa_number = normalizeWa(row.wa_number);
  if (row.wa_number.length < 10) return toast('Nomor WhatsApp belum valid.', 'error');
  const { error } = await sb.from('settings').update(row).eq('id', 1);
  if (error) return toast(errMsg(error), 'error');
  $('#wa_number').value = row.wa_number;
  toast('Pengaturan tersimpan.', 'success');
});
