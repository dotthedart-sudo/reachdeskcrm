import { getAppUrl } from '../utils/domain';

/** Google Calendar OAuth — event read/write only (no calendar.readonly metadata scope). */
export const GOOGLE_CALENDAR_OAUTH_SCOPE_LIST = [
  'https://www.googleapis.com/auth/calendar.events',
];

/** Space-delimited scope string for Google OAuth authorize URL. */
export const GOOGLE_CALENDAR_OAUTH_SCOPES = GOOGLE_CALENDAR_OAUTH_SCOPE_LIST.join(' ');

const FORBIDDEN_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar',
];

function assertCalendarOAuthScopes() {
  for (const forbidden of FORBIDDEN_CALENDAR_SCOPES) {
    if (GOOGLE_CALENDAR_OAUTH_SCOPE_LIST.includes(forbidden)) {
      throw new Error(`Forbidden Google Calendar OAuth scope: ${forbidden}`);
    }
  }
}

assertCalendarOAuthScopes();

/** localStorage key: user completed OAuth after dropping calendar.readonly. */
export const CALENDAR_SCOPE_ACK_KEY = 'reachdesk_calendar_scope_events_v1';

export function hasCalendarScopeAck() {
  try {
    return localStorage.getItem(CALENDAR_SCOPE_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function markCalendarScopeAck() {
  try {
    localStorage.setItem(CALENDAR_SCOPE_ACK_KEY, '1');
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearCalendarScopeAck() {
  try {
    localStorage.removeItem(CALENDAR_SCOPE_ACK_KEY);
  } catch {
    /* ignore */
  }
}

/** True when Calendar is connected but user hasn't re-authorized with calendar.events only. */
export function needsCalendarReconnect(isConnected) {
  return !!isConnected && !hasCalendarScopeAck();
}

/**
 * Start Google Calendar OAuth (CSRF state + consent).
 * @param {string} [_originPath] Unused today; reserved for parity with Sheets OAuth helper.
 */
export function startGoogleCalendarOAuth(_originPath) {
  const state = crypto.randomUUID();
  sessionStorage.setItem('google_oauth_state', state);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectPath = getAppUrl('/auth/google/callback');
  const redirectAbsolute = redirectPath.startsWith('http')
    ? redirectPath
    : `${window.location.origin}${redirectPath}`;
  const redirectUri = encodeURIComponent(redirectAbsolute);
  const scope = encodeURIComponent(GOOGLE_CALENDAR_OAUTH_SCOPES);
  window.location.href = [
    'https://accounts.google.com/o/oauth2/v2/auth',
    `?client_id=${clientId}`,
    `&redirect_uri=${redirectUri}`,
    '&response_type=code',
    `&scope=${scope}`,
    '&access_type=offline',
    '&prompt=consent',
    `&state=${state}`,
  ].join('');
}
