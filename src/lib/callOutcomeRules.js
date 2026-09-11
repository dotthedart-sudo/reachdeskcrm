/** Default mappings from call outcome / call status → call_status + call_action + priority. */

import { supabase } from './supabase';
import { CALL_OUTCOMES, DEFAULT_OUTCOME_RULES as DEFAULT_CALL_OUTCOME_RULES } from './callOutcomes';
import {
  resolveCallOutcomeRules,
  resolveCallStatusRules,
  shouldAutoApplyCallSuggestions,
} from './automationRules';

export { shouldAutoApplyCallSuggestions };

export const DEFAULT_CALL_STATUSES = [
  { label: 'Not called', color: '#3b82f6' },
  { label: 'No answer', color: '#6b7280' },
  { label: 'Busy', color: '#f59e0b' },
  { label: 'Voicemail left', color: '#8b5cf6' },
  { label: 'Answered', color: '#10b981' },
  { label: 'Callback requested', color: '#06b6d4' },
  { label: 'Interested', color: '#22c55e' },
  { label: 'Meeting booked', color: '#ec4899' },
  { label: 'Wrong number', color: '#ef4444' },
  { label: 'Not interested', color: '#64748b' },
];



export const DEFAULT_CALL_STATUS_RULES = [
  { status: 'Not called', suggested_call_action: 'Call now', suggested_priority: 'Cold' },
  { status: 'No answer', suggested_call_action: 'Try again tomorrow', suggested_priority: 'Cold' },
  { status: 'Busy', suggested_call_action: 'Try again tomorrow', suggested_priority: 'Cold' },
  { status: 'Voicemail left', suggested_call_action: 'Try again tomorrow', suggested_priority: 'Cold' },
  { status: 'Answered', suggested_call_action: 'Callback scheduled', suggested_priority: 'Warm' },
  { status: 'Callback requested', suggested_call_action: 'Callback scheduled', suggested_priority: 'Warm' },
  { status: 'Interested', suggested_call_action: 'Send info by email', suggested_priority: 'Hot' },
  { status: 'Meeting booked', suggested_call_action: 'No call needed', suggested_priority: 'Hot' },
  { status: 'Wrong number', suggested_call_action: 'Wrong number — remove', suggested_priority: 'Cold' },
  { status: 'Not interested', suggested_call_action: 'Not interested — close', suggested_priority: 'Cold' },
];

const CALL_STATUS_TO_OUTCOME = {
  'no answer': 'No Answer',
  busy: 'Busy',
  'voicemail left': 'Voicemail Left',
  answered: 'Answered',
  'callback requested': 'Callback Requested',
  'not interested': 'Not Interested',
  'wrong number': 'Wrong Number',
};

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

/** @deprecated Use resolveCallOutcomeRules(profile, userId) */
export function loadCallOutcomeRules(userId, profile = null) {
  return resolveCallOutcomeRules(profile, userId);
}

/** @deprecated Use resolveCallStatusRules(profile, userId) */
export function loadCallStatusRules(userId, profile = null) {
  return resolveCallStatusRules(profile, userId);
}

/** @deprecated Rules persist on user_profiles JSONB */
export function saveCallOutcomeRules(userId, rules) {
  if (!userId) return;
  try {
    localStorage.setItem(`crm_call_outcome_rules_${userId}`, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

/** @deprecated Rules persist on user_profiles JSONB */
export function saveCallStatusRules(userId, rules) {
  if (!userId) return;
  try {
    localStorage.setItem(`crm_call_status_rules_${userId}`, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

export function getOutcomeMapping(outcome, userId, profile = null, dbRules = []) {
  const custom = resolveCallOutcomeRules(profile, userId);
  const fromCustom = custom.find((r) => r.outcome === outcome);
  if (fromCustom) return migrateOutcomeRule(fromCustom);

  const fromDb = (dbRules || []).find((r) => r.outcome === outcome);
  if (fromDb) return migrateOutcomeRule(fromDb);

  return migrateOutcomeRule(DEFAULT_CALL_OUTCOME_RULES.find((r) => r.outcome === outcome) || null);
}

export function getCallActionForStatus(status, userId, profile = null) {
  if (!status) return null;

  const custom = resolveCallStatusRules(profile, userId);
  const fromCustom = custom.find((r) => normalize(r.status) === normalize(status));
  if (fromCustom?.suggested_call_action) return fromCustom.suggested_call_action;

  const fallback = DEFAULT_CALL_STATUS_RULES.find((r) => normalize(r.status) === normalize(status));
  return fallback?.suggested_call_action || null;
}

export function getPriorityForCallStatus(status, userId, profile = null) {
  if (!status) return null;

  const custom = resolveCallStatusRules(profile, userId);
  const fromCustom = custom.find((r) => normalize(r.status) === normalize(status));
  if (fromCustom?.suggested_priority) return fromCustom.suggested_priority;

  const fallback = DEFAULT_CALL_STATUS_RULES.find((r) => normalize(r.status) === normalize(status));
  return fallback?.suggested_priority || null;
}

export function getCallStatusPatch(callStatus, userId, profile = null) {
  const patch = { call_status: callStatus };
  if (profile && !shouldAutoApplyCallSuggestions(profile)) return patch;

  const action = getCallActionForStatus(callStatus, userId, profile);
  const priority = getPriorityForCallStatus(callStatus, userId, profile);
  if (action) patch.call_action = action;
  if (priority) patch.priority = priority;
  return patch;
}

export function outcomeForCallStatus(callStatus) {
  const key = normalize(callStatus);
  if (CALL_STATUS_TO_OUTCOME[key]) return CALL_STATUS_TO_OUTCOME[key];
  const match = CALL_OUTCOMES.find((o) => normalize(o) === key);
  return match || callStatus;
}

export function displayCallStatus(callStatus) {
  return callStatus || 'Not called';
}

export async function applyOutcomeToLead(leadId, outcome, userId, profile = null, customOutcomeRules = null) {
  if (profile && !shouldAutoApplyCallSuggestions(profile)) return null;

  const mapping = getOutcomeMapping(outcome, userId, profile, customOutcomeRules);
  const patch = {};
  const callStatus = mapping?.suggested_call_status ?? mapping?.suggested_status;
  if (callStatus) patch.call_status = callStatus;
  if (mapping?.suggested_call_action) patch.call_action = mapping.suggested_call_action;
  if (mapping?.suggested_priority) patch.priority = mapping.suggested_priority;

  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function applyCallStatusToLead(leadId, callStatus, userId, profile = null) {
  const patch = getCallStatusPatch(callStatus, userId, profile);
  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export function normalizeCallStatus(val) {
  return normalize(val || 'Not called');
}
