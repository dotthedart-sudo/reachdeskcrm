/** Lead timezone inference, local time display, and call-window guidance. */

import { normalizePhoneNumber } from '../utils/templateMerge';
import { formatLocalTime, getSupportedTimeZones } from './dateTime';

export { getSupportedTimeZones };

/** Longest-match dial code → default IANA zone (imperfect for multi-zone countries). */
const DIAL_CODE_TO_TZ = {
  '1': 'America/New_York',
  '7': 'Europe/Moscow',
  '20': 'Africa/Cairo',
  '27': 'Africa/Johannesburg',
  '30': 'Europe/Athens',
  '31': 'Europe/Amsterdam',
  '32': 'Europe/Brussels',
  '33': 'Europe/Paris',
  '34': 'Europe/Madrid',
  '39': 'Europe/Rome',
  '41': 'Europe/Zurich',
  '43': 'Europe/Vienna',
  '44': 'Europe/London',
  '45': 'Europe/Copenhagen',
  '46': 'Europe/Stockholm',
  '47': 'Europe/Oslo',
  '48': 'Europe/Warsaw',
  '49': 'Europe/Berlin',
  '51': 'America/Lima',
  '52': 'America/Mexico_City',
  '55': 'America/Sao_Paulo',
  '60': 'Asia/Kuala_Lumpur',
  '61': 'Australia/Sydney',
  '62': 'Asia/Jakarta',
  '63': 'Asia/Manila',
  '64': 'Pacific/Auckland',
  '65': 'Asia/Singapore',
  '66': 'Asia/Bangkok',
  '81': 'Asia/Tokyo',
  '82': 'Asia/Seoul',
  '86': 'Asia/Shanghai',
  '90': 'Europe/Istanbul',
  '91': 'Asia/Kolkata',
  '92': 'Asia/Karachi',
  '93': 'Asia/Kabul',
  '94': 'Asia/Colombo',
  '971': 'Asia/Dubai',
  '972': 'Asia/Jerusalem',
  '966': 'Asia/Riyadh',
  '880': 'Asia/Dhaka',
  '234': 'Africa/Lagos',
  '254': 'Africa/Nairobi',
};

/** Searchable country → primary timezone (for lead timezone picker). */
export const COUNTRY_TIMEZONE_OPTIONS = [
  { name: 'United States', dial: '1', timezone: 'America/New_York' },
  { name: 'Canada', dial: '1', timezone: 'America/Toronto' },
  { name: 'United Kingdom', dial: '44', timezone: 'Europe/London' },
  { name: 'Pakistan', dial: '92', timezone: 'Asia/Karachi' },
  { name: 'India', dial: '91', timezone: 'Asia/Kolkata' },
  { name: 'Bangladesh', dial: '880', timezone: 'Asia/Dhaka' },
  { name: 'United Arab Emirates', dial: '971', timezone: 'Asia/Dubai' },
  { name: 'Saudi Arabia', dial: '966', timezone: 'Asia/Riyadh' },
  { name: 'Germany', dial: '49', timezone: 'Europe/Berlin' },
  { name: 'France', dial: '33', timezone: 'Europe/Paris' },
  { name: 'Netherlands', dial: '31', timezone: 'Europe/Amsterdam' },
  { name: 'Spain', dial: '34', timezone: 'Europe/Madrid' },
  { name: 'Italy', dial: '39', timezone: 'Europe/Rome' },
  { name: 'Australia', dial: '61', timezone: 'Australia/Sydney' },
  { name: 'Singapore', dial: '65', timezone: 'Asia/Singapore' },
  { name: 'Malaysia', dial: '60', timezone: 'Asia/Kuala_Lumpur' },
  { name: 'Indonesia', dial: '62', timezone: 'Asia/Jakarta' },
  { name: 'Philippines', dial: '63', timezone: 'Asia/Manila' },
  { name: 'Japan', dial: '81', timezone: 'Asia/Tokyo' },
  { name: 'South Korea', dial: '82', timezone: 'Asia/Seoul' },
  { name: 'China', dial: '86', timezone: 'Asia/Shanghai' },
  { name: 'Brazil', dial: '55', timezone: 'America/Sao_Paulo' },
  { name: 'Mexico', dial: '52', timezone: 'America/Mexico_City' },
  { name: 'Nigeria', dial: '234', timezone: 'Africa/Lagos' },
  { name: 'Kenya', dial: '254', timezone: 'Africa/Nairobi' },
  { name: 'South Africa', dial: '27', timezone: 'Africa/Johannesburg' },
  { name: 'Egypt', dial: '20', timezone: 'Africa/Cairo' },
  { name: 'Turkey', dial: '90', timezone: 'Europe/Istanbul' },
  { name: 'Poland', dial: '48', timezone: 'Europe/Warsaw' },
  { name: 'Sweden', dial: '46', timezone: 'Europe/Stockholm' },
  { name: 'Norway', dial: '47', timezone: 'Europe/Oslo' },
  { name: 'Denmark', dial: '45', timezone: 'Europe/Copenhagen' },
  { name: 'Switzerland', dial: '41', timezone: 'Europe/Zurich' },
  { name: 'Austria', dial: '43', timezone: 'Europe/Vienna' },
  { name: 'Belgium', dial: '32', timezone: 'Europe/Brussels' },
  { name: 'Greece', dial: '30', timezone: 'Europe/Athens' },
  { name: 'Portugal', dial: '351', timezone: 'Europe/Lisbon' },
  { name: 'Ireland', dial: '353', timezone: 'Europe/Dublin' },
  { name: 'New Zealand', dial: '64', timezone: 'Pacific/Auckland' },
  { name: 'Thailand', dial: '66', timezone: 'Asia/Bangkok' },
  { name: 'Sri Lanka', dial: '94', timezone: 'Asia/Colombo' },
  { name: 'Afghanistan', dial: '93', timezone: 'Asia/Kabul' },
  { name: 'Israel', dial: '972', timezone: 'Asia/Jerusalem' },
  { name: 'Peru', dial: '51', timezone: 'America/Lima' },
  { name: 'Russia', dial: '7', timezone: 'Europe/Moscow' },
].sort((a, b) => a.name.localeCompare(b.name));

const TZ_TO_COUNTRY = Object.fromEntries(
  COUNTRY_TIMEZONE_OPTIONS.map((c) => [c.timezone, c.name]),
);

export function getCountryLabelForTimezone(timezone) {
  if (!timezone) return null;
  return TZ_TO_COUNTRY[timezone] || null;
}

const CALL_WINDOW_BADGE = {
  good: { label: 'Good time', bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
  early: { label: 'Early', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  late: { label: 'Late', bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' },
  weekend: { label: 'Weekend', bg: 'color-mix(in srgb, var(--text-muted) 16%, transparent)', color: 'var(--text-secondary)' },
  unknown: { label: 'Unknown TZ', bg: 'color-mix(in srgb, var(--text-muted) 16%, transparent)', color: 'var(--text-secondary)' },
};

function extractDialCode(normalizedPhone) {
  if (!normalizedPhone?.startsWith('+')) return null;
  const digits = normalizedPhone.slice(1).replace(/\D/g, '');
  for (const len of [3, 2, 1]) {
    const code = digits.slice(0, len);
    if (DIAL_CODE_TO_TZ[code]) return code;
  }
  return null;
}

/** Infer IANA timezone from phone number. */
export function inferTimezoneFromPhone(phone, defaultCountryCode = '+92') {
  if (!phone?.trim()) {
    return { timezone: null, source: null, confidence: 'none' };
  }
  const { normalized, isValid } = normalizePhoneNumber(phone, defaultCountryCode);
  if (!isValid && !normalized.startsWith('+')) {
    return { timezone: null, source: null, confidence: 'none' };
  }
  const dialCode = extractDialCode(normalized);
  const timezone = dialCode ? DIAL_CODE_TO_TZ[dialCode] : null;
  return {
    timezone: timezone || null,
    source: timezone ? 'phone' : null,
    confidence: timezone ? (dialCode === '1' ? 'low' : 'medium') : 'none',
  };
}

/** Resolved timezone for a lead (stored or inferred at read time). */
export function getLeadTimezone(lead, defaultCountryCode = '+92') {
  if (lead?.timezone) return lead.timezone;
  if (lead?.phone) {
    return inferTimezoneFromPhone(lead.phone, defaultCountryCode).timezone;
  }
  return null;
}

/** Local time string for lead, e.g. "2:30 PM CST". */
export function getLeadLocalTime(lead, at = new Date(), defaultCountryCode = '+92') {
  const tz = getLeadTimezone(lead, defaultCountryCode);
  if (!tz) return null;
  try {
    const time = formatLocalTime(at.toISOString(), { timeZone: tz, showZone: true });
    return time;
  } catch {
    return null;
  }
}

/** Friendlier label: "3:20 PM · Pakistan" (falls back to zone abbreviation). */
export function getLeadLocalTimeLabel(lead, at = new Date(), defaultCountryCode = '+92') {
  const tz = getLeadTimezone(lead, defaultCountryCode);
  if (!tz) return null;
  try {
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).format(at instanceof Date ? at : new Date(at));
    const country = getCountryLabelForTimezone(tz);
    const city = tz.split('/').pop()?.replace(/_/g, ' ');
    const place = country || city;
    return place ? `${time} · ${place}` : time;
  } catch {
    return getLeadLocalTime(lead, at, defaultCountryCode);
  }
}

function getLocalPartsInZone(at, timeZone) {
  const d = at instanceof Date ? at : new Date(at);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return { weekday, hour };
}

/**
 * Call-window status in the lead's timezone.
 * @returns {{ status: 'good'|'early'|'late'|'weekend'|'unknown', label: string }}
 */
export function getCallWindowStatus(
  lead,
  at = new Date(),
  { startHour = 9, endHour = 18, defaultCountryCode = '+92' } = {},
) {
  const tz = getLeadTimezone(lead, defaultCountryCode);
  if (!tz) {
    return { status: 'unknown', label: CALL_WINDOW_BADGE.unknown.label };
  }
  try {
    const { weekday, hour } = getLocalPartsInZone(at, tz);
    if (weekday === 'Sat' || weekday === 'Sun') {
      return { status: 'weekend', label: CALL_WINDOW_BADGE.weekend.label };
    }
    if (hour >= startHour && hour < endHour) {
      return { status: 'good', label: CALL_WINDOW_BADGE.good.label };
    }
    if (hour < startHour) {
      return { status: 'early', label: CALL_WINDOW_BADGE.early.label };
    }
    return { status: 'late', label: CALL_WINDOW_BADGE.late.label };
  } catch {
    return { status: 'unknown', label: CALL_WINDOW_BADGE.unknown.label };
  }
}

export function isLeadCallableNow(lead, at = new Date(), options = {}) {
  return getCallWindowStatus(lead, at, options).status === 'good';
}

export function getCallWindowBadgeStyle(status) {
  return CALL_WINDOW_BADGE[status] || CALL_WINDOW_BADGE.unknown;
}

/** Prepare timezone fields for lead insert/update. */
export function resolveLeadTimezoneForSave({
  timezone,
  timezone_source,
  timezoneManual,
  phone,
  previousPhone,
  defaultCountryCode = '+92',
}) {
  if (timezoneManual && timezone?.trim()) {
    return { timezone: timezone.trim(), timezone_source: 'manual' };
  }
  if (timezone_source === 'manual' && timezone?.trim()) {
    return { timezone: timezone.trim(), timezone_source: 'manual' };
  }
  const phoneChanged = phone !== previousPhone;
  if (phone?.trim() && (phoneChanged || !timezone)) {
    const inferred = inferTimezoneFromPhone(phone, defaultCountryCode);
    if (inferred.timezone) {
      return { timezone: inferred.timezone, timezone_source: 'phone' };
    }
  }
  return {
    timezone: timezone?.trim() || null,
    timezone_source: timezone?.trim() ? (timezone_source || 'phone') : null,
  };
}

const CALLABILITY_ORDER = { good: 0, early: 1, late: 2, weekend: 3, unknown: 4 };

/** Sort leads: good time first, then early/late, then unknown. */
export function sortByCallability(leads, at = new Date(), defaultCountryCode = '+92') {
  return [...(leads || [])].sort((a, b) => {
    const sa = getCallWindowStatus(a, at, { defaultCountryCode }).status;
    const sb = getCallWindowStatus(b, at, { defaultCountryCode }).status;
    return (CALLABILITY_ORDER[sa] ?? 99) - (CALLABILITY_ORDER[sb] ?? 99);
  });
}
