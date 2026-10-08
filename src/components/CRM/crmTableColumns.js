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

const PRIORITY_OPTIONS = [
  { label: 'Hot', color: '#ef4444' },
  { label: 'Warm', color: '#f59e0b' },
  { label: 'Cold', color: '#3b82f6' },
];

/**
 * Message Outreach default columns (table_view 'pipeline').
 * Visible by default fit on a laptop screen without horizontal scroll.
 * Hidden ones stay available in Column settings.
 * `dropdown_options` for action_to_take are filled in by CRM.jsx (ACTION_TO_TAKE_SEED).
 */
export const MESSAGE_DEFAULT_DEFS = [
  { table_view: 'pipeline', column_key: 'name', column_label: 'Name', column_type: 'text', is_visible: true },
  { table_view: 'pipeline', column_key: 'platform', column_label: 'Reach', column_type: 'reach', is_visible: true },
  { table_view: 'pipeline', column_key: 'priority', column_label: 'Priority', column_type: 'dropdown', is_visible: true, dropdown_options: PRIORITY_OPTIONS },
  { table_view: 'pipeline', column_key: 'status', column_label: 'Status', column_type: 'dropdown', is_visible: true },
  { table_view: 'pipeline', column_key: 'action_to_take', column_label: 'Next step', column_type: 'dropdown', is_visible: true },
  { table_view: 'pipeline', column_key: 'last_contacted_at', column_label: 'Last contacted', column_type: 'date', is_visible: true },
  { table_view: 'pipeline', column_key: 'template_used', column_label: 'Template', column_type: 'template', is_visible: true },
  { table_view: 'pipeline', column_key: 'next_checkpoint_at', column_label: 'Follow-up', column_type: 'datetime', is_visible: false },
  { table_view: 'pipeline', column_key: 'outreach_channel', column_label: 'Channel', column_type: 'channel', is_visible: false },
  { table_view: 'pipeline', column_key: 'email', column_label: 'Email', column_type: 'text', is_visible: false },
  { table_view: 'pipeline', column_key: 'phone', column_label: 'Phone', column_type: 'text', is_visible: false },
  { table_view: 'pipeline', column_key: 'company', column_label: 'Company', column_type: 'text', is_visible: false },
  { table_view: 'pipeline', column_key: 'niche', column_label: 'Niche', column_type: 'text', is_visible: false },
  { table_view: 'pipeline', column_key: 'created_at', column_label: 'Added on', column_type: 'date', is_visible: false },
].map((d, idx) => ({ is_default: true, dropdown_options: [], ...d, sort_order: idx }));

/** Cold Calls default columns (table_view 'call_queue'). Same rules as messages. */
export const CALL_QUEUE_DEFAULT_DEFS = [
  { table_view: 'call_queue', column_key: 'name', column_label: 'Name', column_type: 'text', is_visible: true },
  { table_view: 'call_queue', column_key: 'platform', column_label: 'Reach', column_type: 'reach', is_visible: true },
  { table_view: 'call_queue', column_key: 'phone', column_label: 'Phone', column_type: 'text', is_visible: true },
  { table_view: 'call_queue', column_key: 'local_time', column_label: 'Local time', column_type: 'computed', is_visible: true },
  { table_view: 'call_queue', column_key: 'status', column_label: 'Status', column_type: 'status', is_visible: true },
  { table_view: 'call_queue', column_key: 'call_action', column_label: 'Next step', column_type: 'dropdown', is_visible: true, dropdown_options: CALL_ACTION_DEFAULT_OPTIONS },
  { table_view: 'call_queue', column_key: 'script_used', column_label: 'Script', column_type: 'template', is_visible: true },
  { table_view: 'call_queue', column_key: 'last_contacted_at', column_label: 'Last contacted', column_type: 'date', is_visible: true },
  { table_view: 'call_queue', column_key: 'next_checkpoint_at', column_label: 'Follow-up', column_type: 'datetime', is_visible: false },
  { table_view: 'call_queue', column_key: 'attempts', column_label: 'Attempts', column_type: 'number', is_visible: false },
  { table_view: 'call_queue', column_key: 'outreach_channel', column_label: 'Channel', column_type: 'channel', is_visible: false },
  { table_view: 'call_queue', column_key: 'priority', column_label: 'Priority', column_type: 'priority', is_visible: false },
  { table_view: 'call_queue', column_key: 'email', column_label: 'Email', column_type: 'text', is_visible: false },
  { table_view: 'call_queue', column_key: 'company', column_label: 'Company', column_type: 'text', is_visible: false },
  { table_view: 'call_queue', column_key: 'niche', column_label: 'Niche', column_type: 'text', is_visible: false },
].map((d, idx) => ({ is_default: true, dropdown_options: [], ...d, sort_order: idx }));

/** Columns that were removed from the product; never render them even if old rows exist. */
export const RETIRED_COLUMN_KEYS = {
  call_queue: new Set(['outcome', 'last_called']),
  pipeline: new Set([]),
};

const isRetired = (view, c) => RETIRED_COLUMN_KEYS[view]?.has(c.column_key) && c.is_default !== false;

export function getTableColumns(columnDefs, view) {
  const allViewCols = columnDefs
    .filter((c) => c.table_view === view && !isRetired(view, c))
    .filter((c, index, self) => self.findIndex((t) => t.column_key === c.column_key) === index);

  return allViewCols
    .filter((c) => c.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** All column defs for a view (visible + hidden), deduped and sorted. */
export function getAllViewColumns(columnDefs, view) {
  return columnDefs
    .filter((c) => c.table_view === view && !isRetired(view, c))
    .filter((c, index, self) => self.findIndex((t) => t.column_key === c.column_key) === index)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Default columns whose content is a pill / dropdown / icon set.
 * They never wrap: content keeps its natural size and the cell just hides overflow.
 * Custom columns are never always-clipped.
 */
export const ALWAYS_CLIPPED_KEYS = new Set([
  'priority',
  'status',
  'action_to_take',
  'call_action',
  'outreach_channel',
  'template_used',
  'platform',
  'script_used',
  'outcome',
  '_row_num',
]);

export function isAlwaysClipped(col) {
  if (!col) return true;
  if (col.column_key === '_row_num') return true;
  if (!col.is_default) return false;
  return ALWAYS_CLIPPED_KEYS.has(col.column_key);
}

/** Default column order per view — used by "Reset columns". */
export const DEFAULT_COLUMN_ORDER = {
  pipeline: MESSAGE_DEFAULT_DEFS.map((d) => d.column_key),
  // Legacy view key, kept so old "reset" calls still resolve.
  contact_details: MESSAGE_DEFAULT_DEFS.map((d) => d.column_key),
  call_queue: CALL_QUEUE_DEFAULT_DEFS.map((d) => d.column_key),
};

/** Default visible columns per view, used by "Reset columns". */
export const DEFAULT_VISIBLE_COLUMNS = {
  pipeline: MESSAGE_DEFAULT_DEFS.filter((d) => d.is_visible).map((d) => d.column_key),
  contact_details: MESSAGE_DEFAULT_DEFS.filter((d) => d.is_visible).map((d) => d.column_key),
  call_queue: CALL_QUEUE_DEFAULT_DEFS.filter((d) => d.is_visible).map((d) => d.column_key),
};


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
