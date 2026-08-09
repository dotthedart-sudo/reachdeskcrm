export const TEMPLATE_KINDS = {
  MESSAGING: 'messaging',
  CALLS: 'calls',
};

export const MESSAGE_SECTIONS = [
  'INITIAL TEMPLATES',
  'FOLLOW UPS',
  'BOOKING MESSAGES',
  'AFTER BOOKED',
  'AFTER CLIENT BOOKED',
];

export const CALL_SCRIPT_SECTIONS = [
  'OPENERS',
  'VOICEMAIL',
  'OBJECTIONS',
  'CALLBACKS',
  'CLOSING',
];

export function templateKind(t) {
  return t?.kind === TEMPLATE_KINDS.CALLS ? TEMPLATE_KINDS.CALLS : TEMPLATE_KINDS.MESSAGING;
}

export function sectionsForKind(kind) {
  return kind === TEMPLATE_KINDS.CALLS ? CALL_SCRIPT_SECTIONS : MESSAGE_SECTIONS;
}

export function myLibrarySectionName(kind) {
  return kind === TEMPLATE_KINDS.CALLS ? 'MY SCRIPTS' : 'MY TEMPLATES';
}

/** Display label for section headers — sentence case, never all-caps. */
export function formatSectionLabel(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function filterTemplatesByKind(templates, kind) {
  return (templates || []).filter((t) => templateKind(t) === kind);
}
