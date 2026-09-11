/** Shared column order logic for CRM data tables (contact_details / pipeline / clients / call_queue). */

import { getLeadLocalTime } from '../../lib/leadTimezone';

export const CALL_ACTION_DEFAULT_OPTIONS = [
  { label: 'Call now', color: '#3b82f6' },
  { label: 'Leave voicemail', color: '#6366f1' },
  { label: 'Callback scheduled', color: '#f59e0b' },
  { label: 'Try again tomorrow', color: '#8b5cf6' },
  { label: 'Wrong number — remove', color: '#ef4444' },
  { label: 'Not interested — close', color: '#6b7280' },
  { label: 'Send info by email', color: '#10b981' },
  { label: 'No call needed', color: '#6b7280' },
];

export const CALL_QUEUE_DEFAULT_DEFS = [
  { table_view: 'call_queue', column_key: 'name', column_label: 'Name', column_type: 'text', is_visible: true, is_default: true, sort_order: 0, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'phone', column_label: 'Phone', column_type: 'text', is_visible: true, is_default: true, sort_order: 1, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'outreach_channel', column_label: 'Channel', column_type: 'channel', is_visible: true, is_default: true, sort_order: 2, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'platform', column_label: 'Reach', column_type: 'reach', is_visible: true, is_default: true, sort_order: 3, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'local_time', column_label: 'Lead local time', column_type: 'computed', is_visible: true, is_default: true, sort_order: 4, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'call_action', column_label: 'Call next step', column_type: 'dropdown', is_visible: true, is_default: true, sort_order: 5, dropdown_options: CALL_ACTION_DEFAULT_OPTIONS },
  { table_view: 'call_queue', column_key: 'script_used', column_label: 'Script', column_type: 'template', is_visible: true, is_default: true, sort_order: 6, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'status', column_label: 'Status', column_type: 'status', is_visible: true, is_default: true, sort_order: 7, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'last_called', column_label: 'Last called', column_type: 'date', is_visible: true, is_default: true, sort_order: 8, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'last_contacted_at', column_label: 'Last contacted', column_type: 'date', is_visible: false, is_default: true, sort_order: 9, dropdown_options: [] },

  { table_view: 'call_queue', column_key: 'attempts', column_label: 'Attempts', column_type: 'number', is_visible: true, is_default: true, sort_order: 11, dropdown_options: [] },
  { table_view: 'call_queue', column_key: 'priority', column_label: 'Priority', column_type: 'priority', is_visible: false, is_default: true, sort_order: 12, dropdown_options: [] },
];

export function getTableColumns(columnDefs, view) {
  const allViewCols = columnDefs
    .filter((c) => c.table_view === view)
    .filter((c, index, self) => self.findIndex((t) => t.column_key === c.column_key) === index);

  return allViewCols
    .filter((c) => c.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getLeadCellCopyValue(lead, col) {
  if (!lead || !col) return '';

  const isCustom = !col.is_default;
  const raw = isCustom ? lead.custom_fields?.[col.column_key] : lead[col.column_key];

  if (col.column_key === 'name') {
    return `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
  }

  if (col.column_key === 'phone') {
    return lead.phone || '';
  }

  if (col.column_key === 'local_time') {
    return getLeadLocalTime(lead) || '';
  }

  if (col.column_type === 'date' && raw) {
    try {
      const d = new Date(raw);
      if (!isNaN(d)) {
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    } catch {
      /* fall through */
    }
  }

  if (raw == null || raw === '') return '';
  return String(raw);
}
