import React, { useState } from 'react';
import { AlertCircle, Check, Save, Plus, Trash2, Bell, MessageSquare, Phone } from 'lucide-react';
import { DIALER_OPTIONS } from '../../lib/callDialer';
import {
  DEFAULT_CALL_OUTCOME_RULES,
  DEFAULT_CALL_STATUS_RULES,
} from '../../lib/callOutcomeRules';
import {
  DEFAULT_MESSAGING_ACTION_RULES,
  MESSAGING_STATUS_OPTIONS,
} from '../../lib/automationRules';
import { CALL_OUTCOMES } from '../../lib/outreachQueue';

const SECTIONS = [
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'messaging', label: 'Messaging', icon: MessageSquare },
  { id: 'calls', label: 'Calls', icon: Phone },
];

function ToggleRow({ title, description, checked, onChange, disabled }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.75rem 0',
        cursor: disabled ? 'wait' : 'pointer',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{title}</div>
        {description && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.4 }}>
            {description}
          </div>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, cursor: disabled ? 'wait' : 'pointer' }}
      />
    </label>
  );
}

function RuleTable({ columns, children }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--bg-tertiary)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columns.map((c) => c.width || '1fr').join(' '),
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {columns.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

function RuleRow({ columns, children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns.map((c) => c.width || '1fr').join(' '),
        gap: '0.5rem',
        padding: '0.55rem 0.75rem',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.82rem',
      }}
    >
      {children}
    </div>
  );
}

export default function AutomationsPanel({
  remindersEnabled,
  setRemindersEnabled,
  reminderNotificationMode,
  setReminderNotificationMode,
  reminderDigestHour,
  setReminderDigestHour,
  suggestionsEnabled,
  setSuggestionsEnabled,
  suggestionsAutoApply,
  setSuggestionsAutoApply,
  callSuggestionsAutoApply,
  setCallSuggestionsAutoApply,
  messagingActionRules,
  setMessagingActionRules,
  alwaysDraft,
  setAlwaysDraft,
  defaultCountryCode,
  setDefaultCountryCode,
  callOutcomeRules,
  setCallOutcomeRules,
  callStatusRules,
  setCallStatusRules,
  defaultDialer,
  setDefaultDialer,
  ghlDialerUrl,
  setGhlDialerUrl,
  customDialerUrl,
  setCustomDialerUrl,
  automationError,
  automationSuccess,
  automationSaving,
  onSubmit,
  isTeamWorkspace = false,
}) {
  const [section, setSection] = useState('reminders');

  const messagingCols = [
    { key: 'status', label: 'When status is', width: '1fr' },
    { key: 'action', label: 'Suggest next step', width: '1fr' },
    { key: 'rm', label: '', width: '36px' },
  ];
  const outcomeCols = [
    { key: 'outcome', label: 'Call outcome', width: '1fr' },
    { key: 'status', label: 'Set call status', width: '1fr' },
    { key: 'action', label: 'Set next step', width: '1fr' },
  ];
  const statusCols = [
    { key: 'status', label: 'When call status is', width: '1fr' },
    { key: 'action', label: 'Suggest next step', width: '1fr' },
    { key: 'rm', label: '', width: '36px' },
  ];

  return (
    <form onSubmit={onSubmit} className="flex-col gap-4">
      <div className="card rd-page-form">
        <div className="rd-page-form-header">
          <h3>Automations</h3>
          <p className="rd-modal-sub">
            {isTeamWorkspace
              ? 'Workspace rules shared with everyone on your team. Reminder preferences below stay personal to your account.'
              : 'Personal rules for your account only — teammates keep their own settings.'}
            {' '}
            These map existing statuses to next steps; they do not rename CRM dropdowns.
          </p>
        </div>

        {automationError && (
          <div className="auth-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{automationError}</span>
          </div>
        )}

        {automationSuccess && (
          <div className="auth-success-banner" role="status">
            <Check size={15} />
            <span>{automationSuccess}</span>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Automation sections"
          style={{
            display: 'inline-flex',
            padding: 3,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            gap: 2,
            flexWrap: 'wrap',
            marginBottom: '0.25rem',
          }}
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0.45rem 0.85rem',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  background: active ? 'var(--bg-card)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        {section === 'reminders' && (
          <div className="flex-col gap-3">
            <ToggleRow
              title="Follow-up reminders"
              description="When on, you’ll get follow-up reminders and push digests for this account."
              checked={remindersEnabled}
              onChange={setRemindersEnabled}
              disabled={automationSaving}
            />

            {remindersEnabled && (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                    Push notification mode
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="reminder_notification_mode"
                        checked={reminderNotificationMode === 'digest'}
                        onChange={() => setReminderNotificationMode('digest')}
                        disabled={automationSaving}
                      />
                      Daily digest (recommended)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="reminder_notification_mode"
                        checked={reminderNotificationMode === 'instant'}
                        onChange={() => setReminderNotificationMode('instant')}
                        disabled={automationSaving}
                      />
                      Instant per follow-up
                    </label>
                  </div>
                </div>

                {reminderNotificationMode === 'digest' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Digest time</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Local hour for the daily follow-ups push.
                      </div>
                    </div>
                    <select
                      className="form-input"
                      value={reminderDigestHour}
                      onChange={(e) => setReminderDigestHour(Number(e.target.value))}
                      disabled={automationSaving}
                      style={{ width: 'auto', minWidth: 120 }}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {section === 'messaging' && (
          <div className="flex-col gap-3">
            <ToggleRow
              title="Action suggestions"
              description="Show status-based next-step suggestions and warning bulbs in messaging."
              checked={suggestionsEnabled}
              onChange={setSuggestionsEnabled}
              disabled={automationSaving}
            />

            {suggestionsEnabled && (
              <>
                <ToggleRow
                  title="Auto-apply next step"
                  description="When messaging status changes, write the suggested next step automatically."
                  checked={suggestionsAutoApply}
                  onChange={setSuggestionsAutoApply}
                  disabled={automationSaving}
                />

                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                    Status → next step
                  </div>
                  <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Pick an existing messaging status and the next step to suggest. This does not add or rename statuses in CRM.
                  </p>

                  <RuleTable columns={messagingCols}>
                    {messagingActionRules.map((rule, idx) => (
                      <RuleRow key={`${rule.status}-${idx}`} columns={messagingCols}>
                        <select
                          className="form-input"
                          value={rule.status || ''}
                          onChange={(e) => {
                            const next = [...messagingActionRules];
                            next[idx] = { ...next[idx], status: e.target.value };
                            setMessagingActionRules(next);
                          }}
                          disabled={automationSaving}
                        >
                          <option value="">Select status</option>
                          {MESSAGING_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Wait for reply"
                          value={rule.suggested_action || ''}
                          onChange={(e) => {
                            const next = [...messagingActionRules];
                            next[idx] = { ...next[idx], suggested_action: e.target.value };
                            setMessagingActionRules(next);
                          }}
                          disabled={automationSaving}
                        />
                        <button
                          type="button"
                          className="btn-icon"
                          title="Remove rule"
                          disabled={automationSaving}
                          onClick={() => setMessagingActionRules(messagingActionRules.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </RuleRow>
                    ))}
                  </RuleTable>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={automationSaving}
                      onClick={() => setMessagingActionRules([...messagingActionRules, { status: '', suggested_action: '' }])}
                    >
                      <Plus size={14} /> Add rule
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={automationSaving}
                      onClick={() => setMessagingActionRules(DEFAULT_MESSAGING_ACTION_RULES.map((r) => ({ ...r })))}
                    >
                      Reset to defaults
                    </button>
                  </div>
                </div>
              </>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.25rem' }}>
              <ToggleRow
                title="Always draft before sending"
                description="Show template preview and destinations before opening outreach channels."
                checked={alwaysDraft}
                onChange={setAlwaysDraft}
                disabled={automationSaving}
              />
            </div>
          </div>
        )}

        {section === 'calls' && (
          <div className="flex-col gap-3">
            <ToggleRow
              title="Auto-apply call next step"
              description="When call status or outcome changes, sync call next step from the rules below."
              checked={callSuggestionsAutoApply}
              onChange={setCallSuggestionsAutoApply}
              disabled={automationSaving}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Default country code</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Prefix used to normalize local numbers for WhatsApp / SMS.
                </div>
              </div>
              <input
                type="text"
                className="form-input"
                value={defaultCountryCode}
                onChange={(e) => setDefaultCountryCode(e.target.value)}
                placeholder="+92"
                disabled={automationSaving}
                style={{ width: 88, textAlign: 'center' }}
              />
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                Call outcome rules
              </div>
              <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                When you log a call, optionally set call status and next step from the outcome.
              </p>
              <RuleTable columns={outcomeCols}>
                {callOutcomeRules.map((rule, idx) => (
                  <RuleRow key={`${rule.outcome}-${idx}`} columns={outcomeCols}>
                    <select
                      className="form-input"
                      value={rule.outcome}
                      onChange={(e) => {
                        const next = [...callOutcomeRules];
                        next[idx] = { ...next[idx], outcome: e.target.value };
                        setCallOutcomeRules(next);
                      }}
                      disabled={automationSaving}
                    >
                      {CALL_OUTCOMES.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Optional"
                      value={rule.suggested_call_status || rule.suggested_status || ''}
                      onChange={(e) => {
                        const next = [...callOutcomeRules];
                        next[idx] = {
                          ...next[idx],
                          suggested_call_status: e.target.value || null,
                          suggested_status: undefined,
                        };
                        setCallOutcomeRules(next);
                      }}
                      disabled={automationSaving}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Call next step"
                      value={rule.suggested_call_action || ''}
                      onChange={(e) => {
                        const next = [...callOutcomeRules];
                        next[idx] = { ...next[idx], suggested_call_action: e.target.value || null };
                        setCallOutcomeRules(next);
                      }}
                      disabled={automationSaving}
                    />
                  </RuleRow>
                ))}
              </RuleTable>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '0.65rem' }}
                disabled={automationSaving}
                onClick={() => setCallOutcomeRules([...DEFAULT_CALL_OUTCOME_RULES])}
              >
                Reset outcome rules
              </button>
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                Call status → next step
              </div>
              <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Suggested call action in Call Queue when call status changes.
              </p>
              <RuleTable columns={statusCols}>
                {callStatusRules.map((rule, idx) => (
                  <RuleRow key={`${rule.status}-${idx}`} columns={statusCols}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Call status"
                      value={rule.status}
                      onChange={(e) => {
                        const next = [...callStatusRules];
                        next[idx] = { ...next[idx], status: e.target.value };
                        setCallStatusRules(next);
                      }}
                      disabled={automationSaving}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Suggested next step"
                      value={rule.suggested_call_action || ''}
                      onChange={(e) => {
                        const next = [...callStatusRules];
                        next[idx] = { ...next[idx], suggested_call_action: e.target.value };
                        setCallStatusRules(next);
                      }}
                      disabled={automationSaving}
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      title="Remove rule"
                      disabled={automationSaving}
                      onClick={() => setCallStatusRules(callStatusRules.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </RuleRow>
                ))}
              </RuleTable>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={automationSaving}
                  onClick={() => setCallStatusRules([...callStatusRules, { status: '', suggested_call_action: '' }])}
                >
                  <Plus size={14} /> Add rule
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={automationSaving}
                  onClick={() => setCallStatusRules([...DEFAULT_CALL_STATUS_RULES])}
                >
                  Reset to defaults
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                Default dialer
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Used by the Call button in Cold Calls. Other options stay in the menu.
              </p>
              <select
                className="form-input"
                value={defaultDialer}
                onChange={(e) => setDefaultDialer(e.target.value)}
                disabled={automationSaving}
                style={{ maxWidth: 280, marginBottom: '0.5rem' }}
              >
                {DIALER_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {defaultDialer === 'ghl' && (
                <input
                  type="url"
                  className="form-input"
                  value={ghlDialerUrl}
                  onChange={(e) => setGhlDialerUrl(e.target.value)}
                  placeholder="https://app.gohighlevel.com/...?phone={phone}"
                  disabled={automationSaving}
                  style={{ fontSize: '0.85rem' }}
                />
              )}
              {defaultDialer === 'custom' && (
                <input
                  type="url"
                  className="form-input"
                  value={customDialerUrl}
                  onChange={(e) => setCustomDialerUrl(e.target.value)}
                  placeholder="https://your-dialer.com/call?n={phone}"
                  disabled={automationSaving}
                  style={{ fontSize: '0.85rem' }}
                />
              )}
            </div>
          </div>
        )}

        <div className="rd-page-form-actions" style={{ marginTop: '0.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={automationSaving}>
            <Save size={16} /> {automationSaving ? 'Saving…' : 'Save automations'}
          </button>
        </div>
      </div>
    </form>
  );
}
