/**
 * Shared utility functions for lead links, platform detection, and contact metadata.
 */
import { inferTimezoneFromPhone } from './leadTimezone';

/**
 * Normalizes a URL by ensuring https:// protocol is present.
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Detects the platform identifier from a URL.
 * Returns: 'linkedin' | 'instagram' | 'facebook' | 'x' | 'tiktok' | 'youtube' | 'website'
 */
export function detectPlatform(url) {
  if (!url || typeof url !== 'string') return 'website';
  try {
    const cleanUrl = normalizeUrl(url);
    const host = new URL(cleanUrl).hostname.toLowerCase();
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('twitter.com') || host.includes('x.com') || host === 't.co') return 'x';
    if (host.includes('facebook.com') || host.includes('fb.me') || host.includes('fb.com')) return 'facebook';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    return 'website';
  } catch {
    return 'website';
  }
}

/**
 * Human readable label for platforms.
 */
export function getPlatformLabel(platform) {
  switch (platform) {
    case 'linkedin': return 'LinkedIn';
    case 'instagram': return 'Instagram';
    case 'x': return 'X / Twitter';
    case 'facebook': return 'Facebook';
    case 'tiktok': return 'TikTok';
    case 'youtube': return 'YouTube';
    default: return 'Website';
  }
}

/**
 * Syncs legacy link columns (linkedin_url, instagram_url, twitter_url, website)
 * from a list of links [{ url, platform }].
 */
export function syncLegacyLinkColumns(links = []) {
  let linkedin_url = null;
  let instagram_url = null;
  let twitter_url = null;
  let website = null;

  if (Array.isArray(links)) {
    for (const item of links) {
      if (!item) continue;
      const url = typeof item === 'string' ? normalizeUrl(item) : normalizeUrl(item.url);
      if (!url) continue;
      const plat = (typeof item === 'object' && item.platform) ? item.platform : detectPlatform(url);

      if (plat === 'linkedin' && !linkedin_url) linkedin_url = url;
      else if (plat === 'instagram' && !instagram_url) instagram_url = url;
      else if (plat === 'x' && !twitter_url) twitter_url = url;
      else if (plat === 'website' && !website) website = url;
    }
  }

  return { linkedin_url, instagram_url, twitter_url, website };
}

/**
 * Extracts and parses a list of initial link objects from lead data.
 */
export function extractLeadLinksArray(lead) {
  const result = [];
  const seenUrls = new Set();

  const add = (rawUrl, platformHint) => {
    if (!rawUrl) return;
    const clean = normalizeUrl(rawUrl);
    if (!clean || seenUrls.has(clean)) return;
    seenUrls.add(clean);
    result.push({
      url: clean,
      platform: platformHint || detectPlatform(clean)
    });
  };

  if (Array.isArray(lead?.links)) {
    lead.links.forEach((item) => {
      if (typeof item === 'string') {
        add(item);
      } else if (item && item.url) {
        add(item.url, item.platform || detectPlatform(item.url));
      }
    });
  }

  if (lead?.linkedin_url) add(lead.linkedin_url, 'linkedin');
  if (lead?.instagram_url) add(lead.instagram_url, 'instagram');
  if (lead?.twitter_url) add(lead.twitter_url, 'x');
  if (lead?.website) add(lead.website, 'website');

  return result;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'yahoo.co.uk',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com',
  'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'aol.com',
  'zoho.com', 'mail.com', 'gmx.com', 'yandex.com', 'fastmail.com',
  'tutanota.com', 'hey.com'
]);

/**
 * Extracts company name from email domain if not a generic public provider.
 * e.g. "sophie@brightdental.com" -> "Bright Dental"
 */
export function autoDetectCompanyFromEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const parts = email.trim().split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase().trim();
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return null;

  // Strip TLDs (e.g. .com, .co.uk, .org, .io, .ai)
  const baseDomain = domain.replace(/\.(com|co\.[a-z]{2}|org|net|io|ai|co|dev|app|agency|tech|ca|de|fr|uk|us|biz|info)$/i, '');
  if (!baseDomain || baseDomain.length < 2) return null;

  // Split on hyphens, dots, underscores or camelCase
  const words = baseDomain
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return null;

  // Capitalize each word
  return words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function formatTimeInZone(timeZone, at = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(at);
  } catch {
    return null;
  }
}

/**
 * Returns a small hint string for phone timezone e.g. "10:20 AM in New York from the number"
 * If timezone is null, returns "Can't tell the country. Add +1 or set this list's country."
 */
export function getTimezoneHintFromPhone(phone, { listCountry = null, userCountry = null } = {}) {
  if (!phone || typeof phone !== 'string' || phone.trim().length < 3) return null;
  const { timezone } = inferTimezoneFromPhone(phone, { listCountry, userCountry });
  if (!timezone) {
    return "Can't tell the country. Add +1 or set this list's country.";
  }

  const timeStr = formatTimeInZone(timezone);
  if (!timeStr) return null;

  const cityName = timezone.split('/').pop().replace(/_/g, ' ');
  return `${timeStr} in ${cityName} from the number`;
}
