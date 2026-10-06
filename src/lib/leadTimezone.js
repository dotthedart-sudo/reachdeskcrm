/**
 * Lead timezone inference, local time display, and call-window guidance.
 * Backed by libphonenumber-js and a comprehensive NANP area code map.
 */

import { parsePhoneNumberFromString, getCountryCallingCode } from 'libphonenumber-js';
import { formatLocalTime, getSupportedTimeZones } from './dateTime.js';
import { NANP_AREA_CODE_TO_TZ, NANP_TOLL_FREE } from './nanpAreaCodes.js';

export { getSupportedTimeZones };

/** ISO2 Country → Primary IANA Timezone */
export const COUNTRY_TO_PRIMARY_TZ = {
  US: 'America/New_York',
  CA: 'America/Toronto',
  GB: 'Europe/London',
  PK: 'Asia/Karachi',
  IN: 'Asia/Kolkata',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  SG: 'Asia/Singapore',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  KR: 'Asia/Seoul',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  ZA: 'Africa/Johannesburg',
  NG: 'Africa/Lagos',
  EG: 'Africa/Cairo',
  PH: 'Asia/Manila',
  MY: 'Asia/Kuala_Lumpur',
  ID: 'Asia/Jakarta',
  TH: 'Asia/Bangkok',
  BD: 'Asia/Dhaka',
  IE: 'Europe/Dublin',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen',
  FI: 'Europe/Helsinki',
  PL: 'Europe/Warsaw',
  TR: 'Europe/Istanbul',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  BE: 'Europe/Brussels',
  PT: 'Europe/Lisbon',
  GR: 'Europe/Athens',
  CZ: 'Europe/Prague',
  RO: 'Europe/Bucharest',
  HU: 'Europe/Budapest',
  IL: 'Asia/Jerusalem',
  RU: 'Europe/Moscow',
  LK: 'Asia/Colombo',
  KE: 'Africa/Nairobi',
  GH: 'Africa/Accra',
  CO: 'America/Bogota',
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  PE: 'America/Lima',
  VN: 'Asia/Ho_Chi_Minh',
  TW: 'Asia/Taipei',
  HK: 'Asia/Hong_Kong',
  UA: 'Europe/Kyiv',
  AF: 'Asia/Kabul',
  GG: 'Europe/London',
  JE: 'Europe/London',
  IM: 'Europe/London',
};

/** Calling code → ISO2 Country lookup */
export const CALLING_CODE_TO_COUNTRY = {
  '1': 'US',
  '44': 'GB',
  '92': 'PK',
  '91': 'IN',
  '49': 'DE',
  '33': 'FR',
  '61': 'AU',
  '64': 'NZ',
  '65': 'SG',
  '971': 'AE',
  '966': 'SA',
  '34': 'ES',
  '39': 'IT',
  '31': 'NL',
  '81': 'JP',
  '86': 'CN',
  '82': 'KR',
  '55': 'BR',
  '52': 'MX',
  '27': 'ZA',
  '234': 'NG',
  '20': 'EG',
  '63': 'PH',
  '60': 'MY',
  '62': 'ID',
  '66': 'TH',
  '880': 'BD',
  '353': 'IE',
  '46': 'SE',
  '47': 'NO',
  '45': 'DK',
  '358': 'FI',
  '48': 'PL',
  '90': 'TR',
  '41': 'CH',
  '43': 'AT',
  '32': 'BE',
  '351': 'PT',
  '30': 'GR',
  '420': 'CZ',
  '40': 'RO',
  '36': 'HU',
  '972': 'IL',
  '7': 'RU',
  '94': 'LK',
  '254': 'KE',
  '233': 'GH',
  '57': 'CO',
  '54': 'AR',
  '56': 'CL',
  '51': 'PE',
  '84': 'VN',
  '886': 'TW',
  '852': 'HK',
  '380': 'UA',
  '93': 'AF',
};

/** Searchable country → primary timezone list (for country timezone picker) */
export const COUNTRY_TIMEZONE_OPTIONS = [
  { code: 'US', name: 'United States', dial: '1', timezone: 'America/New_York' },
  { code: 'CA', name: 'Canada', dial: '1', timezone: 'America/Toronto' },
  { code: 'GB', name: 'United Kingdom', dial: '44', timezone: 'Europe/London' },
  { code: 'AU', name: 'Australia', dial: '61', timezone: 'Australia/Sydney' },
  { code: 'DE', name: 'Germany', dial: '49', timezone: 'Europe/Berlin' },
  { code: 'FR', name: 'France', dial: '33', timezone: 'Europe/Paris' },
  { code: 'IN', name: 'India', dial: '91', timezone: 'Asia/Kolkata' },
  { code: 'PK', name: 'Pakistan', dial: '92', timezone: 'Asia/Karachi' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', timezone: 'Asia/Dubai' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', timezone: 'Asia/Riyadh' },
  { code: 'SG', name: 'Singapore', dial: '65', timezone: 'Asia/Singapore' },
  { code: 'NZ', name: 'New Zealand', dial: '64', timezone: 'Pacific/Auckland' },
  { code: 'NL', name: 'Netherlands', dial: '31', timezone: 'Europe/Amsterdam' },
  { code: 'ES', name: 'Spain', dial: '34', timezone: 'Europe/Madrid' },
  { code: 'IT', name: 'Italy', dial: '39', timezone: 'Europe/Rome' },
  { code: 'CH', name: 'Switzerland', dial: '41', timezone: 'Europe/Zurich' },
  { code: 'SE', name: 'Sweden', dial: '46', timezone: 'Europe/Stockholm' },
  { code: 'NO', name: 'Norway', dial: '47', timezone: 'Europe/Oslo' },
  { code: 'DK', name: 'Denmark', dial: '45', timezone: 'Europe/Copenhagen' },
  { code: 'IE', name: 'Ireland', dial: '353', timezone: 'Europe/Dublin' },
  { code: 'PL', name: 'Poland', dial: '48', timezone: 'Europe/Warsaw' },
  { code: 'AT', name: 'Austria', dial: '43', timezone: 'Europe/Vienna' },
  { code: 'BE', name: 'Belgium', dial: '32', timezone: 'Europe/Brussels' },
  { code: 'PT', name: 'Portugal', dial: '351', timezone: 'Europe/Lisbon' },
  { code: 'GR', name: 'Greece', dial: '30', timezone: 'Europe/Athens' },
  { code: 'TR', name: 'Turkey', dial: '90', timezone: 'Europe/Istanbul' },
  { code: 'BR', name: 'Brazil', dial: '55', timezone: 'America/Sao_Paulo' },
  { code: 'MX', name: 'Mexico', dial: '52', timezone: 'America/Mexico_City' },
  { code: 'JP', name: 'Japan', dial: '81', timezone: 'Asia/Tokyo' },
  { code: 'KR', name: 'South Korea', dial: '82', timezone: 'Asia/Seoul' },
  { code: 'CN', name: 'China', dial: '86', timezone: 'Asia/Shanghai' },
  { code: 'HK', name: 'Hong Kong', dial: '852', timezone: 'Asia/Hong_Kong' },
  { code: 'MY', name: 'Malaysia', dial: '60', timezone: 'Asia/Kuala_Lumpur' },
  { code: 'PH', name: 'Philippines', dial: '63', timezone: 'Asia/Manila' },
  { code: 'ID', name: 'Indonesia', dial: '62', timezone: 'Asia/Jakarta' },
  { code: 'TH', name: 'Thailand', dial: '66', timezone: 'Asia/Bangkok' },
  { code: 'VN', name: 'Vietnam', dial: '84', timezone: 'Asia/Ho_Chi_Minh' },
  { code: 'ZA', name: 'South Africa', dial: '27', timezone: 'Africa/Johannesburg' },
  { code: 'NG', name: 'Nigeria', dial: '234', timezone: 'Africa/Lagos' },
  { code: 'EG', name: 'Egypt', dial: '20', timezone: 'Africa/Cairo' },
  { code: 'KE', name: 'Kenya', dial: '254', timezone: 'Africa/Nairobi' },
  { code: 'BD', name: 'Bangladesh', dial: '880', timezone: 'Asia/Dhaka' },
  { code: 'LK', name: 'Sri Lanka', dial: '94', timezone: 'Asia/Colombo' },
  { code: 'IL', name: 'Israel', dial: '972', timezone: 'Asia/Jerusalem' },
  { code: 'CO', name: 'Colombia', dial: '57', timezone: 'America/Bogota' },
  { code: 'AR', name: 'Argentina', dial: '54', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'CL', name: 'Chile', dial: '56', timezone: 'America/Santiago' },
  { code: 'PE', name: 'Peru', dial: '51', timezone: 'America/Lima' },
].sort((a, b) => a.name.localeCompare(b.name));

const TZ_TO_COUNTRY = Object.fromEntries(
  COUNTRY_TIMEZONE_OPTIONS.map((c) => [c.timezone, c.name]),
);

export function getCountryLabelForTimezone(timezone) {
  if (!timezone) return null;
  return TZ_TO_COUNTRY[timezone] || null;
}

/** Convert a country string/calling code (e.g. '+1', '1', 'US') to ISO2 code ('US') */
export function toCountryIso(codeOrDial) {
  if (!codeOrDial) return null;
  const str = String(codeOrDial).trim().toUpperCase();
  if (COUNTRY_TO_PRIMARY_TZ[str]) return str;
  const digits = str.replace(/\D/g, '');
  if (CALLING_CODE_TO_COUNTRY[digits]) return CALLING_CODE_TO_COUNTRY[digits];
  return null;
}

/**
 * Infer default user country & calling code from browser timezone.
 */
export function inferCountryFromUserEnvironment(tz = null) {
  const zone = tz || (typeof Intl !== 'undefined' && Intl.DateTimeFormat?.().resolvedOptions?.().timeZone) || '';
  if (!zone) return { country: 'US', dialCode: '+1' };

  for (const item of COUNTRY_TIMEZONE_OPTIONS) {
    if (item.timezone === zone) {
      return { country: item.code, dialCode: `+${item.dial}` };
    }
  }

  if (zone.startsWith('America/New_York') || zone.startsWith('America/Chicago') || zone.startsWith('America/Denver') || zone.startsWith('America/Los_Angeles') || zone.startsWith('America/Phoenix')) {
    return { country: 'US', dialCode: '+1' };
  }
  if (zone.startsWith('America/Toronto') || zone.startsWith('America/Vancouver') || zone.startsWith('America/Edmonton')) {
    return { country: 'CA', dialCode: '+1' };
  }
  if (zone.startsWith('Europe/London')) return { country: 'GB', dialCode: '+44' };
  if (zone.startsWith('Asia/Karachi')) return { country: 'PK', dialCode: '+92' };
  if (zone.startsWith('Asia/Kolkata')) return { country: 'IN', dialCode: '+91' };
  if (zone.startsWith('Europe/Berlin')) return { country: 'DE', dialCode: '+49' };
  if (zone.startsWith('Europe/Paris')) return { country: 'FR', dialCode: '+33' };
  if (zone.startsWith('Australia/')) return { country: 'AU', dialCode: '+61' };

  return { country: 'US', dialCode: '+1' };
}

/** Normalize international prefixes: +, 00, 011 */
export function normalizeInternationalPrefix(phone) {
  if (!phone) return '';
  let clean = phone.trim();
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('00')) return `+${clean.slice(2)}`;
  if (clean.startsWith('011')) return `+${clean.slice(3)}`;
  return clean;
}

/**
 * Infer timezone from phone number with strict multi-candidate validation.
 * 
 * Rules:
 * 1. Leading '+', '00', '011' parsed as international number.
 * 2. Else candidate countries: listCountry -> userCountry -> 'US'.
 * 3. Use isValidNumber(). If exactly 1 candidate is valid, use it; if several/none -> timezone null, confidence 'none'.
 * 4. For NANP (+1), resolve area code to exact IANA timezone.
 * 
 * @returns {{ timezone: string|null, country: string|null, confidence: 'high'|'medium'|'low'|'none', formattedPhone: string|null }}
 */
export function inferTimezoneFromPhone(phone, context = {}) {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return { timezone: null, country: null, confidence: 'none', formattedPhone: null };
  }

  const raw = phone.trim();
  const normalizedPrefix = normalizeInternationalPrefix(raw);
  const isExplicitInternational = normalizedPrefix.startsWith('+');

  if (isExplicitInternational) {
    const parsed = parsePhoneNumberFromString(normalizedPrefix);
    if (parsed && parsed.isValid()) {
      const country = parsed.country;
      const callingCode = parsed.countryCallingCode;

      // NANP (+1) area-code resolution
      if (callingCode === '1' || country === 'US' || country === 'CA') {
        const areaCode = parsed.nationalNumber.slice(0, 3);
        if (NANP_AREA_CODE_TO_TZ[areaCode]) {
          return {
            timezone: NANP_AREA_CODE_TO_TZ[areaCode],
            country: country || 'US',
            confidence: 'high',
            formattedPhone: parsed.formatInternational(),
          };
        }
        if (NANP_TOLL_FREE.has(areaCode)) {
          return {
            timezone: null,
            country: country || 'US',
            confidence: 'none',
            formattedPhone: parsed.formatInternational(),
          };
        }
        return {
          timezone: country === 'CA' ? 'America/Toronto' : 'America/New_York',
          country: country || 'US',
          confidence: 'low',
          formattedPhone: parsed.formatInternational(),
        };
      }

      const tz = COUNTRY_TO_PRIMARY_TZ[country] || null;
      return {
        timezone: tz,
        country: country || null,
        confidence: tz ? 'high' : 'none',
        formattedPhone: parsed.formatInternational(),
      };
    }

    return { timezone: null, country: null, confidence: 'none', formattedPhone: null };
  }

  // National/local number without international prefix.
  const listCountryIso = toCountryIso(context.listCountry || context.folderCountry || context.defaultCountry);
  const userCountryIso = toCountryIso(context.userCountry || context.defaultCountryCode);

  // If listCountry is provided and number is valid for list country -> use it immediately!
  if (listCountryIso) {
    try {
      const parsed = parsePhoneNumberFromString(raw, listCountryIso);
      if (parsed && parsed.isValid()) {
        const country = parsed.country || listCountryIso;
        const callingCode = parsed.countryCallingCode;

        if (callingCode === '1' || country === 'US' || country === 'CA') {
          const areaCode = parsed.nationalNumber.slice(0, 3);
          if (NANP_AREA_CODE_TO_TZ[areaCode]) {
            return {
              timezone: NANP_AREA_CODE_TO_TZ[areaCode],
              country,
              confidence: 'high',
              formattedPhone: parsed.formatInternational(),
            };
          }
          if (NANP_TOLL_FREE.has(areaCode)) {
            return {
              timezone: null,
              country,
              confidence: 'none',
              formattedPhone: parsed.formatInternational(),
            };
          }
          return {
            timezone: country === 'CA' ? 'America/Toronto' : 'America/New_York',
            country,
            confidence: 'medium',
            formattedPhone: parsed.formatInternational(),
          };
        }

        const tz = COUNTRY_TO_PRIMARY_TZ[country] || null;
        if (tz) {
          return {
            timezone: tz,
            country,
            confidence: 'high',
            formattedPhone: parsed.formatInternational(),
          };
        }
      }
    } catch {}
  }

  // Fallback candidates: userCountry and US (only if no listCountry)
  const candidateList = [...new Set([userCountryIso, 'US'].filter(Boolean))];
  const validParsedCandidates = [];

  for (const candidateIso of candidateList) {
    try {
      const parsed = parsePhoneNumberFromString(raw, candidateIso);
      if (parsed && parsed.isValid()) {
        validParsedCandidates.push({ parsed, country: parsed.country || candidateIso });
      }
    } catch {}
  }

  // If strictly ONE candidate is valid, use it. If multiple or zero -> never guess, return null!
  if (validParsedCandidates.length === 1) {
    const { parsed, country } = validParsedCandidates[0];
    const callingCode = parsed.countryCallingCode;

    if (callingCode === '1' || country === 'US' || country === 'CA') {
      const areaCode = parsed.nationalNumber.slice(0, 3);
      if (NANP_AREA_CODE_TO_TZ[areaCode]) {
        return {
          timezone: NANP_AREA_CODE_TO_TZ[areaCode],
          country,
          confidence: 'high',
          formattedPhone: parsed.formatInternational(),
        };
      }
      if (NANP_TOLL_FREE.has(areaCode)) {
        return {
          timezone: null,
          country,
          confidence: 'none',
          formattedPhone: parsed.formatInternational(),
        };
      }
      return {
        timezone: country === 'CA' ? 'America/Toronto' : 'America/New_York',
        country,
        confidence: 'medium',
        formattedPhone: parsed.formatInternational(),
      };
    }

    const tz = COUNTRY_TO_PRIMARY_TZ[country] || null;
    if (tz) {
      return {
        timezone: tz,
        country,
        confidence: 'medium',
        formattedPhone: parsed.formatInternational(),
      };
    }
  }

  // If 0 or >1 valid candidates (ambiguous) -> return null
  return { timezone: null, country: null, confidence: 'none', formattedPhone: null };
}

/**
 * Resolved timezone for a lead.
 * Priority: manual → folder.default_timezone → phone (list country first) → user's Settings timezone → null.
 */
export function getLeadTimezone(lead, context = {}) {
  // 1. Manual override
  if (lead?.timezone_source === 'manual' && lead?.timezone) {
    return lead.timezone;
  }
  if (lead?.timezone && !lead?.timezone_source) {
    return lead.timezone;
  }

  // 2. Folder default timezone
  const folderTz = lead?.folder_default_timezone 
    || context?.folderDefaultTimezone 
    || context?.folder_default_timezone 
    || context?.listTimezone 
    || context?.defaultTimezone;
  if (folderTz) {
    return folderTz;
  }

  // If lead has a stored timezone that wasn't manual, use it
  if (lead?.timezone) {
    return lead.timezone;
  }

  // 3. Phone inference (list country first)
  if (lead?.phone) {
    const listCountry = lead?.list_country 
      || lead?.folder_default_country 
      || context?.listCountry 
      || context?.folderCountry;
    const userCountry = context?.userCountry || context?.defaultCountryCode;
    const inferred = inferTimezoneFromPhone(lead.phone, { listCountry, userCountry });
    if (inferred.timezone) {
      return inferred.timezone;
    }
  }

  // 4. User's Settings timezone
  const userSettingsTz = context?.userTimezone 
    || context?.userSettingsTimezone 
    || context?.effectiveUserTimeZone;
  if (userSettingsTz) {
    return userSettingsTz;
  }

  // 5. null
  return null;
}

/** Local time string for lead, e.g. "2:30 PM CST". */
export function getLeadLocalTime(lead, at = new Date(), context = {}) {
  const tz = getLeadTimezone(lead, context);
  if (!tz) return null;
  try {
    return formatLocalTime(at.toISOString(), { timeZone: tz, showZone: true });
  } catch {
    return null;
  }
}

/** Friendlier label: "3:20 PM · New York" */
export function getLeadLocalTimeLabel(lead, at = new Date(), context = {}) {
  const tz = getLeadTimezone(lead, context);
  if (!tz) return null;
  try {
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).format(at instanceof Date ? at : new Date(at));
    const country = getCountryLabelForTimezone(tz);
    const city = tz.split('/').pop()?.replace(/_/g, ' ');
    const place = country ? `${country} (${city})` : city;
    return place ? `${time} · ${place}` : time;
  } catch {
    return getLeadLocalTime(lead, at, context);
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

export const CALL_WINDOW_BADGE = {
  good: { label: 'Good time', bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
  early: { label: 'Early', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  late: { label: 'Late', bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' },
  weekend: { label: 'Weekend', bg: 'color-mix(in srgb, var(--text-muted) 16%, transparent)', color: 'var(--text-secondary)' },
  unknown: { label: 'Unknown TZ', bg: 'color-mix(in srgb, var(--text-muted) 16%, transparent)', color: 'var(--text-secondary)' },
};

/**
 * Call-window status in the lead's timezone.
 * @returns {{ status: 'good'|'early'|'late'|'weekend'|'unknown', label: string }}
 */
export function getCallWindowStatus(
  lead,
  at = new Date(),
  { startHour = 9, endHour = 18, listCountry = null, userCountry = null } = {},
) {
  const tz = getLeadTimezone(lead, { listCountry, userCountry });
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
  listCountry = null,
  userCountry = null,
  defaultCountryCode = null,
}) {
  // Manual choice is NEVER overwritten
  if (timezoneManual && timezone?.trim()) {
    return { timezone: timezone.trim(), timezone_source: 'manual' };
  }
  if (timezone_source === 'manual' && timezone?.trim()) {
    return { timezone: timezone.trim(), timezone_source: 'manual' };
  }

  const phoneChanged = phone !== previousPhone;
  if (phone?.trim() && (phoneChanged || !timezone)) {
    const inferred = inferTimezoneFromPhone(phone, {
      listCountry,
      userCountry: userCountry || defaultCountryCode,
    });
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
export function sortByCallability(leads, at = new Date(), context = {}) {
  return [...(leads || [])].sort((a, b) => {
    const sa = getCallWindowStatus(a, at, context).status;
    const sb = getCallWindowStatus(b, at, context).status;
    return (CALLABILITY_ORDER[sa] ?? 99) - (CALLABILITY_ORDER[sb] ?? 99);
  });
}
