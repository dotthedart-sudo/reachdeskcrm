import { supabase } from './supabase';
import { captureDeviceTimestamp, getEffectiveUserTimeZone } from './dateTime';
import { logLeadTimelineEvent } from './leadTimeline';
import { resolveMessagingActionRules } from './automationRules';
import { queueFollowupGoogleSync } from './googleFollowupSync';

export const CHECKPOINT_OFFSETS_HOURS = [12, 24, 72, 120, 168, 336, 504];

export const RESOLVED_STATUSES = ['Positive Reply', 'Booked', 'Rescheduled', 'Closed Won', 'Client'];

export const REPLY_CHECK_STATUSES = ['Contacted', 'Invite Sent', 'Proposal Sent', 'Followed up'];
export const FOLLOW_UP_CHECK_STATUSES = ['No show', 'Not Interested'];

/** Closed Won and Client both mean the lead is already a client. */
export function isClientStatus(status) {
  const n = (status || '').toLowerCase().trim().replace(/_/g, ' ');
  return n === 'client' || n === 'closed won';
}

/**
 * Returns the suggested action based on the rules and current status.
 * @param {string} status
 * @param {Array} suggestionRules - global DB rules or pre-resolved rules
 * @param {object|null} profile - when set, prefers profile.messaging_action_rules
 */
export function getSuggestionForStatus(status, suggestionRules = [], profile = null) {
  if (!status) return null;

  const normalize = (val) => {
    if (!val) return '';
    return val.trim().toLowerCase().replace(/_/g, ' ');
  };

  const normStatus = normalize(status);
  const rules = profile
    ? resolveMessagingActionRules(profile, suggestionRules)
    : suggestionRules;

  const rule = rules.find((r) => normalize(r.status) === normStatus);
  if (rule?.suggested_action) return rule.suggested_action;
  const fallbacks = {
    'lead': 'Send first pitch',
    'contacted': 'Wait for reply',
    'positive reply': 'Send proposal',
    'Invite Sent': 'Wait for reply',
    'booked': 'Prepare for call',
    'no show': 'Send a follow up',
    'rescheduled': 'Prepare for call',
    'proposal sent': 'Send Calendly',
    'followed up': 'Wait for reply',
    'not interested': 'Send a different pitch',
    'closed won': 'Send invoice'
  };

  if (fallbacks[normStatus]) {
    return fallbacks[normStatus];
  }

  // Fallback to substring matching if not matched directly
  for (const [key, val] of Object.entries(fallbacks)) {
    if (normStatus.includes(key) || key.includes(normStatus)) {
      return val;
    }
  }

  return null;
}

/**
 * Automatically applies the status's suggestion to the action_to_take of the lead.
 */
export async function applySuggestion(lead, suggestionRules = [], profile = null) {
  if (!lead) return null;
  const suggestion = getSuggestionForStatus(lead.status, suggestionRules, profile);
  if (!suggestion) return null;
  
  const { error } = await supabase
    .from('leads')
    .update({ action_to_take: suggestion })
    .eq('id', lead.id);
    
  if (error) {
    console.error('Error applying suggestion:', error);
    throw error;
  }
  return { action_to_take: suggestion };
}

/**
 * Core function to handle status updates, next_checkpoint_at logic.
 * Only touches leads table columns: status, next_checkpoint_at, last_contacted_at, action_to_take.
 */
export async function updateLeadStatusAndCheckpoint({
  lead,
  leadId,
  newStatus,
  customHours = null,
  suggestionRules = [],
  currentUser = null,
  extraUpdates = {}
}) {
  let targetLead = lead;
  
  // 1. Fetch lead from database if only leadId is provided
  if (!targetLead && leadId) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();
    if (error) throw error;
    targetLead = data;
  }
  
  if (!targetLead) {
    throw new Error('Lead not found');
  }
  
  const prevStatus = targetLead.status;
  const skipAutoContacted = !!extraUpdates.skip_auto_last_contacted;
  const stamp = captureDeviceTimestamp(getEffectiveUserTimeZone(currentUser));
  const isFirstContact = newStatus === 'Contacted' && !targetLead.last_contacted_at;

  // Auto-set last_contacted_at on every status change (device/profile local "now")
  // unless caller opts out (manual timestamp edit).
  let lastContacted = targetLead.last_contacted_at;
  if (!skipAutoContacted) {
    lastContacted = stamp.occurredAt;
  }

  const baseTime = lastContacted ? new Date(lastContacted).getTime() : Date.now();
  const nowMs = Date.now();

  // Calculate next checkpoint timestamp
  let nextCheckpoint = null;
  const isFollowUpCycle = REPLY_CHECK_STATUSES.includes(newStatus) || FOLLOW_UP_CHECK_STATUSES.includes(newStatus);

  if (isFollowUpCycle && lastContacted) {
    if (isFirstContact || !targetLead.last_contacted_at) {
      // First checkpoint can be overridden by custom hours
      let hoursOffset = 12; // default first offset from CHECKPOINT_OFFSETS_HOURS[0]
      if (customHours !== null && customHours !== undefined) {
        hoursOffset = customHours;
      } else if (targetLead.custom_reminder_hours !== null && targetLead.custom_reminder_hours !== undefined) {
        hoursOffset = Number(targetLead.custom_reminder_hours);
      }
      nextCheckpoint = new Date(baseTime + hoursOffset * 60 * 60 * 1000).toISOString();
    } else {
      // Subsequent checkpoints ignore custom hours and use the cumulative array sequence
      let nextOffsetHours = null;
      for (const hours of CHECKPOINT_OFFSETS_HOURS) {
        const scheduledTime = baseTime + hours * 60 * 60 * 1000;
        if (scheduledTime > nowMs) {
          nextOffsetHours = hours;
          break;
        }
      }
      if (nextOffsetHours !== null) {
        nextCheckpoint = new Date(baseTime + nextOffsetHours * 60 * 60 * 1000).toISOString();
      }
    }
  }

  // Determine suggested action
  const suggestedAction = getSuggestionForStatus(newStatus, suggestionRules, currentUser);

  // Build lead update payload
  const { skip_auto_last_contacted: _skip, ...safeExtra } = extraUpdates;
  const prevCheckpoint = targetLead.next_checkpoint_at || null;
  const leadUpdate = {
    status: newStatus,
    next_checkpoint_at: nextCheckpoint,
    ...safeExtra,
  };

  // Allow a new push when the checkpoint reschedules or clears
  if (prevCheckpoint !== nextCheckpoint) {
    leadUpdate.checkpoint_notified_at = null;
  }

  if (!skipAutoContacted) {
    leadUpdate.last_contacted_at = lastContacted;
  }
  
  // Apply suggestions automatically if enabled
  const suggestionsEnabled = currentUser ? currentUser.suggestions_enabled : true;
  const autoApply = currentUser ? currentUser.suggestions_auto_apply !== false : true;
  if (suggestionsEnabled && autoApply && suggestedAction && !extraUpdates.action_to_take) {
    leadUpdate.action_to_take = suggestedAction;
  }

  // Automatically adjust priority based on status changes
  if (['Lead', 'Contacted', 'No show', 'Not Interested'].includes(newStatus)) {
    leadUpdate.priority = 'Cold';
  } else if (['Positive Reply', 'Invite Sent', 'Booked', 'Rescheduled', 'Proposal Sent', 'Followed up'].includes(newStatus)) {
    leadUpdate.priority = 'Warm';
  } else if (isClientStatus(newStatus)) {
    leadUpdate.priority = 'Hot';
    if (!extraUpdates.lifecycle_stage) {
      leadUpdate.lifecycle_stage = 'client';
    }
  }
  
  // Update leads table
  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update(leadUpdate)
    .eq('id', targetLead.id)
    .select()
    .single();
    
  if (updateError) throw updateError;

  if (prevStatus !== newStatus && currentUser?.id) {
    logLeadTimelineEvent({
      leadId: targetLead.id,
      userId: currentUser.id,
      teamId: currentUser.team_id || null,
      eventType: 'status_changed',
      summary: `Status → ${newStatus}`,
      detail: { from: prevStatus, to: newStatus, field: 'status' },
      timeZone: getEffectiveUserTimeZone(currentUser),
    }).catch(() => {});
  }

  let draftCreated = false;
  if (['Booked', 'Rescheduled'].includes(newStatus)) {
    try {
      draftCreated = await createAutoDraftInvoice(updatedLead, currentUser?.id || updatedLead.user_id);
    } catch (e) {
      console.error('Failed to create auto draft invoice:', e);
    }
  }

  if (updatedLead) {
    updatedLead.draftCreated = draftCreated;
  }

  if (currentUser && updatedLead) {
    const prevCheckpoint = targetLead.next_checkpoint_at || null;
    const nextCheckpoint = updatedLead.next_checkpoint_at || null;
    if (prevCheckpoint !== nextCheckpoint || currentUser.sync_followups_to_google === true) {
      queueFollowupGoogleSync({
        lead: updatedLead,
        currentUser,
        previousCheckpointAt: prevCheckpoint,
      });
    }
  }

  return updatedLead;
}

export async function createAutoDraftInvoice(lead, userId) {
  // Check if a draft invoice already exists for this lead
  const { data: existing, error: checkErr } = await supabase
    .from('invoices')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('status', 'draft')
    .limit(1);
    
  if (checkErr) {
    console.error('Error checking existing draft invoice:', checkErr);
    return false;
  }
  
  if (existing && existing.length > 0) {
    // Draft invoice already exists, do not create duplicate
    return false;
  }
  
  const invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000);
  const clientName = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed Client';
  const clientEmail = lead.email || '';
  
  const dbInvoice = {
    user_id: userId,
    lead_id: lead.id,
    invoice_number: invoiceNum,
    client_name: clientName,
    client_email: clientEmail,
    status: 'draft',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: null,
    currency: 'USD',
    subtotal: 0,
    tax: 0,
    total: 0,
    items: []
  };
  
  const { error: insErr } = await supabase
    .from('invoices')
    .insert(dbInvoice);
    
  if (insErr) {
    console.error('Error inserting auto-draft invoice:', insErr);
    return false;
  }
  return true;
}
