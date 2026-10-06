let _measureCanvas = null;

/**
 * Accurately measures text width using an offscreen 2D canvas context.
 */
export function measureTextWidth(text, font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif') {
  if (!text) return 0;
  if (typeof document === 'undefined') return text.length * 7.5;
  if (!_measureCanvas) {
    _measureCanvas = document.createElement('canvas');
  }
  const ctx = _measureCanvas.getContext('2d');
  if (!ctx) return text.length * 7.5;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * Calculates the width of an individual option pill:
 * 12px/500 text + 8px dot/gap + 16px pill padding (8px left + 8px right)
 */
export function measureOptionPillWidth(label) {
  if (!label) return 0;
  const cleanLabel = String(label).replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
  const textW = measureTextWidth(cleanLabel, '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
  return Math.ceil(textW + 8 + 16);
}

export const PILL_COLUMN_KEYS = new Set([
  'priority',
  'status',
  'call_status',
  'outreach_channel',
  'channel',
  'action_to_take',
  'call_action',
  'outcome',
  'template_used',
  'script_used',
]);

export function isPillColumn(col) {
  if (!col) return false;
  const key = col.column_key || col.key || '';
  if (PILL_COLUMN_KEYS.has(key)) return true;
  if (col.column_type === 'dropdown' || col.column_type === 'channel') return true;
  if (Array.isArray(col.dropdown_options) && col.dropdown_options.length > 0) return true;
  return false;
}

const SPEC_DEFAULT_WIDTHS = {
  name: 180,
  priority: 110,
  status: 140,
  call_status: 140,
  outcome: 140,
  outreach_channel: 110,
  channel: 110,
  action_to_take: 150,
  call_action: 150,
  next_checkpoint_at: 130,
  due: 130,
  last_contacted_at: 130,
  last_called: 160,
  last_activity: 160,
  platform: 120,
  reach: 120,
  phone: 140,
  local_time: 166,
  email: 180,
  template_used: 150,
  script_used: 150,
};

const DEFAULT_OPTIONS_BY_COL = {
  priority: ['Hot', 'Warm', 'Cold'],
  status: ['Lead', 'Contacted', 'Positive reply', 'Booked', 'Not interested', 'Invite sent', 'Closed won', 'No answer', 'Follow up', 'Meeting set'],
  call_status: ['Not called', 'Callback requested', 'No answer', 'Voicemail left', 'Answered', 'Busy', 'Wrong number', 'Not interested', 'Closed won'],
  outreach_channel: ['Email', 'LinkedIn', 'WhatsApp', 'Instagram', 'Phone', 'Twitter', 'Facebook'],
  channel: ['Email', 'LinkedIn', 'WhatsApp', 'Instagram', 'Phone', 'Twitter', 'Facebook'],
  action_to_take: ['Send first pitch', 'Follow up', 'Book a call', 'Research', 'Send proposal', 'None'],
  call_action: ['Callback', 'Try again', 'Send proposal', 'First call', 'None'],
  outcome: ['No answer', 'Voicemail left', 'Answered', 'Busy', 'Callback requested', 'Not interested', 'Closed won'],
};

export function getColumnOptions(col, context = {}) {
  const key = col?.column_key || col?.key || '';
  if (key === 'status') {
    if (context.statuses && context.statuses.length > 0) return context.statuses;
  }
  if (key === 'call_status') {
    if (context.callStatuses && context.callStatuses.length > 0) return context.callStatuses;
  }
  if (key === 'priority') {
    if (context.priorities && context.priorities.length > 0) return context.priorities;
  }
  if (key === 'outreach_channel' || key === 'channel' || col?.column_type === 'channel') {
    if (context.customChannels && context.customChannels.length > 0) return context.customChannels;
  }
  if (key === 'template_used' || key === 'script_used') {
    if (context.templates && context.templates.length > 0) {
      return context.templates.map(t => t.name || t.title || t.label || t).concat(['None']);
    }
  }
  if (col?.dropdown_options && Array.isArray(col.dropdown_options) && col.dropdown_options.length > 0) {
    return col.dropdown_options;
  }
  return DEFAULT_OPTIONS_BY_COL[key] || [];
}

export function countLeadReachIcons(lead, columnDefs = []) {
  if (!lead) return 0;
  const allLinks = [];
  if (Array.isArray(lead.links)) {
    lead.links.forEach((item) => {
      if (typeof item === 'string') allLinks.push(item);
      else if (item && item.url) allLinks.push(item.url);
    });
  }
  if (lead.linkedin_url) allLinks.push(lead.linkedin_url);
  if (lead.instagram_url) allLinks.push(lead.instagram_url);
  if (lead.twitter_url) allLinks.push(lead.twitter_url);
  if (lead.website) allLinks.push(lead.website);
  if (lead.phone) {
    allLinks.push('whatsapp:' + lead.phone);
    allLinks.push('sms:' + lead.phone);
    allLinks.push('tel:' + lead.phone);
  }
  if (lead.email) {
    allLinks.push('mailto:' + lead.email);
  }
  if (lead.custom_fields && columnDefs) {
    columnDefs.forEach((c) => {
      if (!c.is_default && lead.custom_fields[c.column_key]) {
        allLinks.push(lead.custom_fields[c.column_key]);
      }
    });
  }
  return new Set(allLinks.filter(Boolean)).size;
}

/**
 * Computes minimum column width:
 * minWidth(column) = width of the WIDEST option pill in that column's dropdown_options/statuses
 * (measure with canvas/measureText at 12px/500 + 8px dot gap + 16px padding) + 24px cell padding.
 * For Reach column: (max icons in any row * 24px) + 24px cell padding.
 * For non-pill columns, returns 80px or column spec.
 */
export function computePillColumnMinWidth(col, context = {}) {
  const key = col?.column_key || col?.key || '';
  const specDefault = SPEC_DEFAULT_WIDTHS[key] || 80;

  if (key === 'platform' || key === 'reach' || col?.column_type === 'reach') {
    let maxIcons = 0;
    if (Array.isArray(context.leads) && context.leads.length > 0) {
      context.leads.forEach((l) => {
        const cnt = countLeadReachIcons(l, context.columnDefs);
        if (cnt > maxIcons) maxIcons = cnt;
      });
    }
    const iconsToFit = maxIcons > 0 ? maxIcons : 4;
    const reachMinW = (iconsToFit * 24) + 24;
    return Math.max(96, reachMinW);
  }

  const isPill = isPillColumn(col);
  if (!isPill) {
    return Math.max(80, Math.min(specDefault, 80));
  }

  const options = getColumnOptions(col, context);
  let maxPillWidth = 0;
  for (const opt of options) {
    const label = typeof opt === 'string' ? opt : (opt?.label || opt?.name || opt?.title || '');
    if (!label) continue;
    const pillW = measureOptionPillWidth(label);
    if (pillW > maxPillWidth) maxPillWidth = pillW;
  }

  // 24px cell padding (12px left + 12px right padding)
  const minWidth = maxPillWidth > 0 ? maxPillWidth + 24 : 80;
  return Math.max(80, minWidth);
}

/**
 * Double-click auto-fit (all column types):
 * max(widest cell content, header label) + 16px (8px left + 8px right padding),
 * clamped between minWidth and 480px.
 */
export function computePillColumnAutoFitWidth(col, context = {}) {
  const minW = computePillColumnMinWidth(col, context);
  const key = col?.column_key || col?.key || '';
  const label = col?.column_label || col?.label || key || '';

  // 1. Header label width (12px / 500)
  const headerWidth = measureTextWidth(label, '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
  let maxCellWidth = 0;

  // 2. Pill column options width
  if (isPillColumn(col)) {
    const options = getColumnOptions(col, context);
    for (const opt of options) {
      const optLabel = typeof opt === 'string' ? opt : (opt?.label || opt?.name || opt?.title || '');
      if (!optLabel) continue;
      const pillW = measureOptionPillWidth(optLabel);
      if (pillW > maxCellWidth) maxCellWidth = pillW;
    }
  } else if (key === 'platform' || key === 'reach' || col?.column_type === 'reach') {
    let maxIcons = 0;
    if (Array.isArray(context.leads) && context.leads.length > 0) {
      context.leads.forEach((l) => {
        const cnt = countLeadReachIcons(l, context.columnDefs);
        if (cnt > maxIcons) maxIcons = cnt;
      });
    }
    const iconsToFit = maxIcons > 0 ? maxIcons : 4;
    maxCellWidth = iconsToFit * 24;
  }

  // 3. Row cell content measurements (13px / 400)
  if (Array.isArray(context.leads) && context.leads.length > 0) {
    for (const lead of context.leads) {
      if (!lead) continue;
      let text = '';
      if (key === 'name') {
        text = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—';
      } else if (key === '_added_by' || key === 'added_by') {
        const prof = context.teamProfilesMap?.[lead.user_id];
        text = prof?.email || prof?.full_name || lead.added_by || 'Unknown';
      } else if (key === 'next_checkpoint_at') {
        text = lead.next_checkpoint_at ? new Date(lead.next_checkpoint_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Set time';
      } else if (key === 'last_contacted_at') {
        text = lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
      } else if (col?.is_default === false && lead.custom_fields) {
        text = String(lead.custom_fields[key] || '');
      } else if (lead[key] != null) {
        text = String(lead[key]);
      }

      if (text) {
        const w = measureTextWidth(text, '400 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        if (w > maxCellWidth) maxCellWidth = w;
      }
    }
  }

  // 4. Max of header and widest cell + 16px cell padding (8px left + 8px right)
  const widestContent = Math.max(headerWidth, maxCellWidth);
  const targetWidth = Math.ceil(widestContent + 16);

  // 5. Clamped between minWidth and 480px
  return Math.max(minW, Math.min(480, targetWidth));
}
