export const DEFAULT_MESSAGING_CHANNELS = [
  { label: 'Email', color: '#8B949E' },
  { label: 'Instagram', color: '#ec4899' },
  { label: 'LinkedIn', color: '#3b82f6' },
  { label: 'Facebook', color: '#4f46e5' },
  { label: 'Twitter', color: '#0ea5e9' },
  { label: 'WhatsApp', color: '#10b981' }
];

export const DEFAULT_CALL_CHANNELS = [
  { label: 'SIM/Phone', color: '#8B949E' },
  { label: 'WhatsApp', color: '#10b981' },
  { label: 'Skype', color: '#06b6d4' },
  { label: 'GoHighLevel', color: '#f59e0b' },
  { label: 'Zoom Phone', color: '#3b82f6' }
];

export function getChannelDefaults(type) {
  return type === 'calls' ? DEFAULT_CALL_CHANNELS : DEFAULT_MESSAGING_CHANNELS;
}

export function channelFallbackLabel(type) {
  return type === 'calls' ? 'SIM/Phone' : 'Email';
}
