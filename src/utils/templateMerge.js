/**
 * Personalizes a message template by merging lead data and user snippets.
 * 
 * @param {string} bodyText - The raw template body containing placeholders like [Name], [company].
 * @param {object} lead - The lead record from the database.
 * @param {Array} snippets - The user's static snippets list from the user_snippets table.
 * @param {Array} columnDefs - The user's column definitions.
 * @returns {string} The personalized message text.
 */
export function mergeTemplateFields(bodyText, lead, snippets = [], columnDefs = []) {
  if (!bodyText) return '';
  if (!lead) return bodyText;

  // 1. Build Group A Lead values mapping
  const leadValues = {};
  
  // Combine first_name and last_name for [name] or [Name]
  const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.name || '';
  leadValues['name'] = fullName;
  leadValues['first_name'] = lead.first_name || '';
  leadValues['last_name'] = lead.last_name || '';
  leadValues['email'] = lead.email || '';
  leadValues['company'] = lead.company || '';
  leadValues['niche'] = lead.niche || '';
  leadValues['phone'] = lead.phone || '';
  leadValues['status'] = lead.status || '';
  leadValues['priority'] = lead.priority || '';
  leadValues['action_to_take'] = lead.action_to_take || '';
  leadValues['last_contacted_at'] = lead.last_contacted_at || '';
  leadValues['project'] = lead.project || '';

  // Extract values from custom fields
  if (lead.custom_fields && typeof lead.custom_fields === 'object') {
    Object.keys(lead.custom_fields).forEach(key => {
      leadValues[key.toLowerCase()] = lead.custom_fields[key] || '';
    });
  }

  // Map column keys from columnDefs to ensure custom column keys map correctly
  if (Array.isArray(columnDefs)) {
    columnDefs.forEach(col => {
      if (col.column_key) {
        const key = col.column_key.toLowerCase();
        const isCustom = !col.is_default;
        const val = isCustom ? lead.custom_fields?.[col.column_key] : lead[col.column_key];
        if (val !== undefined && val !== null) {
          leadValues[key] = val;
        }
      }
    });
  }

  // 2. Build Group B Static Snippets mapping
  const snippetValues = {};
  if (Array.isArray(snippets)) {
    snippets.forEach(snip => {
      if (snip.snippet_key) {
        snippetValues[snip.snippet_key.toLowerCase()] = snip.snippet_value || '';
      }
    });
  }

  // 3. Regex replace logic: support [key] and {{key}} (starter templates)
  return bodyText.replace(/(\[([^\]]+)\]|\{\{([^\}]+)\}\})/g, (match, fullMatch, bracketKey, braceKey) => {
    const rawKey = (bracketKey || braceKey || '').trim();
    const key = rawKey.toLowerCase();

    // Check Group A: Lead values
    if (leadValues[key] !== undefined && leadValues[key] !== null) {
      return String(leadValues[key]);
    }

    // Check Group B: Static snippets
    if (snippetValues[key] !== undefined && snippetValues[key] !== null) {
      return String(snippetValues[key]);
    }

    // Fallback: If not found, return the exact original tag (including brackets)
    return match;
  });
}

import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { toCountryIso, normalizeInternationalPrefix } from '../lib/leadTimezone';

/**
 * Normalizes a phone number for international destination formats (wa.me, sms, E.164).
 * 
 * @param {string} phone - The raw phone number stored on the lead.
 * @param {string} defaultCountryCode - The user's default country code or calling code (e.g. '+1', 'US').
 * @param {string} listCountry - Optional list/folder country code (e.g. 'US', 'GB').
 * @returns {object} { normalized, isValid, country, error }
 */
export function normalizePhoneNumber(phone, defaultCountryCode = null, listCountry = null) {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return { normalized: '', isValid: false, country: null, error: 'No phone number provided' };
  }

  const raw = phone.trim();
  const normalizedPrefix = normalizeInternationalPrefix(raw);

  if (normalizedPrefix.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(normalizedPrefix);
    if (parsed && parsed.isValid()) {
      return {
        normalized: parsed.format('E.164'),
        isValid: true,
        country: parsed.country || null,
        error: null,
      };
    }
    // Fallback if parsing failed but starts with +
    const cleanDigits = normalizedPrefix.replace(/\D/g, '');
    const isValid = cleanDigits.length >= 8 && cleanDigits.length <= 15;
    return {
      normalized: `+${cleanDigits}`,
      isValid,
      country: null,
      error: isValid ? null : `Phone "${raw}" is invalid (must be 8-15 digits with valid country code)`,
    };
  }

  // Local/national candidate testing: listCountry -> defaultCountryCode -> 'US'
  const listIso = toCountryIso(listCountry);
  const userIso = toCountryIso(defaultCountryCode);
  const candidates = [listIso, userIso, 'US'].filter(Boolean).filter((c, i, s) => s.indexOf(c) === i);

  for (const candidateIso of candidates) {
    try {
      const parsed = parsePhoneNumberFromString(raw, candidateIso);
      if (parsed && parsed.isValid()) {
        return {
          normalized: parsed.format('E.164'),
          isValid: true,
          country: parsed.country || candidateIso,
          error: null,
        };
      }
    } catch {
      // ignore
    }
  }

  // Fallback: clean non-digits
  const clean = raw.replace(/[\s\-\(\)\.]/g, '');
  return {
    normalized: clean,
    isValid: false,
    country: null,
    error: `Could not determine valid country prefix for "${raw}". Include country code (e.g. +1...)`,
  };
}

/**
 * Generates prefilled URLs for email, WhatsApp, and SMS channels.
 * 
 * @param {string} channelKey - 'email' | 'whatsapp' | 'sms'
 * @param {string} destination - For email: 'mailto' | 'gmail' | 'outlook'. For whatsapp: 'whatsapp'. For sms: 'sms'.
 * @param {object} contactInfo - { email, phone }
 * @param {string} subject - The message subject.
 * @param {string} body - The message body.
 * @param {string} defaultCountryCode - Default country prefix.
 * @param {string} listCountry - Optional list country.
 * @returns {object} { url, warning }
 */
export function generatePrefilledUrl(channelKey, destination, contactInfo, subject = '', body = '', defaultCountryCode = null, listCountry = null) {
  const encSubject = encodeURIComponent(subject);
  const encBody = encodeURIComponent(body);

  if (channelKey === 'email') {
    const to = contactInfo.email || '';
    if (destination === 'gmail') {
      return { url: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encSubject}&body=${encBody}` };
    }
    if (destination === 'outlook') {
      return { url: `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encSubject}&body=${encBody}` };
    }
    return { url: `mailto:${to}?subject=${encSubject}&body=${encBody}` };
  }

  if (channelKey === 'whatsapp') {
    const { normalized, isValid, error } = normalizePhoneNumber(contactInfo.phone, defaultCountryCode, listCountry);
    const cleanPhone = normalized.replace(/\+/g, '');
    return {
      url: `https://wa.me/${cleanPhone}?text=${encBody}`,
      warning: isValid ? null : error,
    };
  }

  if (channelKey === 'sms') {
    const { normalized, isValid, error } = normalizePhoneNumber(contactInfo.phone, defaultCountryCode, listCountry);
    const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    const separator = isIOS ? '&' : '?';
    return {
      url: `sms:${normalized}${separator}body=${encBody}`,
      warning: isValid ? null : error,
    };
  }

  return { url: '' };
}
