/**
 * Per-user status → next step automation rules (messaging + calls).
 */

import {
  DEFAULT_CALL_OUTCOME_RULES,
  DEFAULT_CALL_STATUS_RULES,
} from './callOutcomeRules';

const OUTCOME_RULES_KEY = (userId) => `crm_call_outcome_rules_${userId}`;
const STATUS_RULES_KEY = (userId) => `crm_call_status_rules_${userId}`;

/** Default messaging status → next step map (editable in Automations). */
export const DEFAULT_MESSAGING_ACTION_RULES = [
  { status: 'Lead', suggested_action: 'Send first pitch' },
  { status: 'Contacted', suggested_action: 'Wait for reply' },
  { status: 'Positive Reply', suggested_action: 'Send proposal' },
  { status: 'Proposal Sent', suggested_action: 'Send Calendly' },
  { status: 'Invite Sent', suggested_action: 'Wait for reply' },
  { status: 'Booked', suggested_action: 'Prepare for call' },
  { status: 'Followed up', suggested_action: 'Wait for reply' },
  { status: 'No show', suggested_action: 'Send a follow up' },
  { status: 'Not Interested', suggested_action: 'Send a different pitch' },
  { status: 'Closed Won', suggested_action: 'Send invoice' },
  { status: 'Waiting', suggested_action: 'Wait for reply' },
  { status: 'Rescheduled', suggested_action: 'Prepare for call' },
  { status: 'Client', suggested_action: 'No action needed' },
];

export const MESSAGING_STATUS_OPTIONS = DEFAULT_MESSAGING_ACTION_RULES.map((r) => r.status);

function normalize(val) {
  if (!val) return '';
  return val.trim().toLowerCase().replace(/_/g, ' ');
}

function migrateOutcomeRule(rule) {
  if (!rule) return rule;
  if (rule.suggested_call_status) return rule;
  if (!rule.suggested_status) return rule;
  return { ...rule, suggested_call_status: rule.suggested_status, suggested_status: undefined };
}

function readLocalStorageRules(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Rules for Automations editor — profile JSONB or defaults. */
export function getMessagingRulesForEditor(profile, globalRules = []) {
  if (Array.isArray(profile?.messaging_action_rules) && profile.messaging_action_rules.length > 0) {
    return profile.messaging_action_rules.map((r) => ({ ...r }));
  }
  if (Array.isArray(globalRules) && globalRules.length > 0) {
    return globalRules.map((r) => ({
      status: r.status,
      suggested_action: r.suggested_action,
    }));
  }
  return DEFAULT_MESSAGING_ACTION_RULES.map((r) => ({ ...r }));
}

export function getCallStatusRulesForEditor(profile, userId) {
  if (Array.isArray(profile?.call_status_rules) && profile.call_status_rules.length > 0) {
    return profile.call_status_rules.map((r) => ({ ...r }));
  }
  const fromLocal = userId ? readLocalStorageRules(STATUS_RULES_KEY(userId)) : null;
  if (fromLocal) return fromLocal.map((r) => ({ ...r }));
  return DEFAULT_CALL_STATUS_RULES.map((r) => ({ ...r }));
}

export function getCallOutcomeRulesForEditor(profile, userId) {
  if (Array.isArray(profile?.call_outcome_rules) && profile.call_outcome_rules.length > 0) {
    return profile.call_outcome_rules.map((r) => migrateOutcomeRule({ ...r }));
  }
  const fromLocal = userId ? readLocalStorageRules(OUTCOME_RULES_KEY(userId)) : null;
  if (fromLocal) return fromLocal.map(migrateOutcomeRule);
  return DEFAULT_CALL_OUTCOME_RULES.map((r) => migrateOutcomeRule({ ...r }));
}

/** Resolved messaging rules for runtime (profile > global DB > defaults). */
export function resolveMessagingActionRules(profile, globalRules = []) {
  if (Array.isArray(profile?.messaging_action_rules) && profile.messaging_action_rules.length > 0) {
    return profile.messaging_action_rules;
  }
  if (Array.isArray(globalRules) && globalRules.length > 0) {
    return globalRules;
  }
  return DEFAULT_MESSAGING_ACTION_RULES;
}

export function resolveCallStatusRules(profile, userId) {
  if (Array.isArray(profile?.call_status_rules) && profile.call_status_rules.length > 0) {
    return profile.call_status_rules;
  }
  const fromLocal = userId ? readLocalStorageRules(STATUS_RULES_KEY(userId)) : null;
  if (fromLocal) return fromLocal;
  return DEFAULT_CALL_STATUS_RULES;
}

export function resolveCallOutcomeRules(profile, userId) {
  if (Array.isArray(profile?.call_outcome_rules) && profile.call_outcome_rules.length > 0) {
    return profile.call_outcome_rules.map(migrateOutcomeRule);
  }
  const fromLocal = userId ? readLocalStorageRules(OUTCOME_RULES_KEY(userId)) : null;
  if (fromLocal) return fromLocal.map(migrateOutcomeRule);
  return DEFAULT_CALL_OUTCOME_RULES.map(migrateOutcomeRule);
}

export function shouldAutoApplyCallSuggestions(profile) {
  return profile?.call_suggestions_auto_apply !== false;
}

/**
 * One-time migrate localStorage call rules → profile columns.
 * Returns update payload if migration needed, else null.
 */
export function buildCallRulesMigrationPatch(profile, userId) {
  if (!userId || !profile) return null;

  const patch = {};
  const hasDbCallStatus = Array.isArray(profile.call_status_rules) && profile.call_status_rules.length > 0;
  const hasDbCallOutcome = Array.isArray(profile.call_outcome_rules) && profile.call_outcome_rules.length > 0;

  if (!hasDbCallStatus) {
    const fromLocal = readLocalStorageRules(STATUS_RULES_KEY(userId));
    if (fromLocal) patch.call_status_rules = fromLocal;
  }

  if (!hasDbCallOutcome) {
    const fromLocal = readLocalStorageRules(OUTCOME_RULES_KEY(userId));
    if (fromLocal) patch.call_outcome_rules = fromLocal.map(migrateOutcomeRule);
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

export function clearMigratedCallRulesLocalStorage(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(OUTCOME_RULES_KEY(userId));
    localStorage.removeItem(STATUS_RULES_KEY(userId));
  } catch {
    // ignore
  }
}
