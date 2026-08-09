import { supabase } from './supabase';
import { getLeadLocalTime, getLeadTimezone } from './leadTimezone';

function stripHtmlForExport(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function formatLeadNotesForExport(notes = []) {
  if (!notes?.length) return '';
  return notes
    .map((note) => {
      const title = note.title || 'Untitled';
      const body = stripHtmlForExport(note.content || '');
      return body ? `${title}: ${body}` : title;
    })
    .join('\n---\n');
}

/** Fetch rich lead notes (Lead drawer) keyed by lead id. */
export async function fetchLeadNotesByLeadIds(leadIds = []) {
  const ids = [...new Set((leadIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const byLeadId = {};
  const chunkSize = 200;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('lead_notes')
      .select('lead_id, title, content, created_at')
      .in('lead_id', chunk)
      .order('created_at', { ascending: true });

    if (error) throw error;

    (data || []).forEach((note) => {
      if (!note.lead_id) return;
      if (!byLeadId[note.lead_id]) byLeadId[note.lead_id] = [];
      byLeadId[note.lead_id].push(note);
    });
  }

  return byLeadId;
}

const BASE_EXPORT_FIELDS = [
  { key: 'name', label: 'Name', getValue: (l) => l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') },
  { key: 'email', label: 'Email', getValue: (l) => l.email || '' },
  { key: 'phone', label: 'Phone', getValue: (l) => l.phone || '' },
  { key: 'company', label: 'Company', getValue: (l) => l.company || '' },
  { key: 'niche', label: 'Niche', getValue: (l) => l.niche || '' },
  { key: 'status', label: 'Status', getValue: (l) => l.status || '' },
  { key: 'priority', label: 'Priority', getValue: (l) => l.priority || '' },
  { key: 'project', label: 'Project', getValue: (l) => l.project || '' },
  { key: 'notes', label: 'Notes', getValue: (l) => l.notes || '' },
  { key: 'pipeline_notes', label: 'Pipeline notes', getValue: (l) => l.pipeline_notes || '' },
  { key: 'linkedin_url', label: 'LinkedIn', getValue: (l) => l.linkedin_url || '' },
  { key: 'instagram_url', label: 'Instagram', getValue: (l) => l.instagram_url || '' },
  { key: 'twitter_url', label: 'Twitter', getValue: (l) => l.twitter_url || '' },
  { key: 'website', label: 'Website', getValue: (l) => l.website || '' },
];

export function buildLeadExportFields({
  includeLocalTime = false,
  defaultCountryCode = '+92',
  leadNotesByLeadId = {},
} = {}) {
  const fields = [...BASE_EXPORT_FIELDS];
  const pipelineNotesIdx = fields.findIndex((f) => f.key === 'pipeline_notes');
  fields.splice(pipelineNotesIdx + 1, 0, {
    key: 'lead_notes',
    label: 'Lead notes',
    getValue: (l) => formatLeadNotesForExport(leadNotesByLeadId[l.id] || []),
  });
  if (includeLocalTime) {
    fields.push(
      {
        key: 'timezone',
        label: 'Timezone',
        getValue: (l) => getLeadTimezone(l, defaultCountryCode) || l.timezone || '',
      },
      {
        key: 'lead_local_time',
        label: 'Lead local time',
        getValue: (l) => getLeadLocalTime(l, new Date(), defaultCountryCode) || '',
      },
    );
  }
  return fields;
}

export async function prepareLeadExportRows(leads, options = {}) {
  const leadIds = (leads || []).map((l) => l.id).filter(Boolean);
  const leadNotesByLeadId = options.leadNotesByLeadId
    ?? (options.includeLeadNotes === false ? {} : await fetchLeadNotesByLeadIds(leadIds));

  const fields = buildLeadExportFields({ ...options, leadNotesByLeadId });
  const validLeads = (leads || []).filter((l) =>
    fields.some((field) => {
      const val = field.getValue(l);
      return val !== null && val !== undefined && String(val).trim() !== '';
    }),
  );

  if (validLeads.length === 0) {
    throw new Error('No leads found with exportable data.');
  }

  const headers = fields.map((f) => f.label);
  const rows = validLeads.map((l) => fields.map((field) => field.getValue(l)));
  return { headers, rows, validLeads };
}
