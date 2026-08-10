import { supabase } from '../lib/supabase';
import { prepareLeadExportRows } from '../lib/leadExportFields';
import { fetchAllLeadsForScope } from '../lib/leadsQuery';

export function triggerDownload(content, filename, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function toCSVRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '').replace(/"/g, '""');
    return `"${s}"`;
  }).join(',');
}

export function stripHTML(html = '') {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

export async function exportLeads(userId, leadsData = null, filename = 'reachdesk-leads.csv', options = {}) {
  let leads = leadsData;
  if (!leads) {
    leads = await fetchAllLeadsForScope({
      userIds: [userId],
      orderBy: [{ column: 'created_at', ascending: true }],
    });
  }
  if (!leads || leads.length === 0) {
    throw new Error('No leads found.');
  }

  const { headers, rows } = await prepareLeadExportRows(leads, options);

  const csv = [toCSVRow(headers), ...rows.map((row) => toCSVRow(row))].join('\r\n');
  triggerDownload(csv, filename, 'text/csv;charset=utf-8;');
}

export async function exportNotes(userId) {
  const { data: notes, error } = await supabase
    .from('notes')
    .select('title,content,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  if (!notes || notes.length === 0) {
    throw new Error('No notes found.');
  }

  const lines = notes.map(n => {
    const title = n.title || 'Untitled';
    const date = n.updated_at ? new Date(n.updated_at).toLocaleDateString() : '';
    const body = stripHTML(n.content || '');
    return `== ${title} ==${ date ? `  [${date}]` : '' }\n${body}\n`;
  });

  const txt = lines.join('\n' + '─'.repeat(60) + '\n\n');
  triggerDownload(txt, 'reachdesk-notes.txt', 'text/plain;charset=utf-8;');
}
