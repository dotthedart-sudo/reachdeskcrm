import React, { useState } from 'react';
import { AlertCircle, Check, Save, Plus, Trash2, Bell, MessageSquare, Phone } from 'lucide-react';
import { DIALER_OPTIONS } from '../../lib/callDialer';
import { DEFAULT_CALL_STATUS_RULES } from '../../lib/callOutcomeRules';
import { DEFAULT_MESSAGING_ACTION_RULES } from '../../lib/automationRules';
import { CALL_OUTCOMES, DEFAULT_OUTCOME_RULES as DEFAULT_CALL_OUTCOME_RULES } from '../../lib/callOutcomes';
import ToggleSwitch from '../ui/ToggleSwitch';

const SECTIONS = [
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'messaging', label: 'Messaging', icon: MessageSquare },
  { id: 'calls', label: 'Calls', icon: Phone },
];

const ADD_NEW_VALUE = '__add_new_status__';

const settingsStackStyle = {
  maxWidth: 760,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const settingsCardStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 10,
  padding: 20,
};

function SettingsCard({ children, style }) {
  return <div style={{ ...settingsCardStyle, ...style }}>{children}</div>;
}

function SettingsStack({ children }) {
  return <div style={settingsStackStyle}>{children}</div>;
}

/** Visually separate preference toggles from rule tables when a tab grows tall. */
function SettingsDivider({ label }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: '4px 0',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      {label ? (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      ) : null}
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

function CardHeading({ title, description }) {
  return (
    <div style={{ marginBottom: description ? 14 : 0 }}>
      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
        {title}
      </div>
      {description ? (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange, disabled }) {
  return (
    <label
      style={{
        display: 'block',
        cursor: disabled ? 'wait' : 'pointer',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
          {title}
        </span>
        <ToggleSwitch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
      {description ? (
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            marginTop: 6,
            lineHeight: 1.45,
          }}
        >
          {description}
        </div>
      ) : null}
    </label>
  );
}

/** Select tied to custom_statuses options, with inline “Add new status…”. */
function StatusSelect({
  value,
  options = [],
  onChange,
  onCreate,
  disabled,
  allowEmpty = true,
  emptyLabel = 'Select status',
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const labels = Array.from(
    new Set([...(options || []), value].filter((v) => typeof v === 'string' && v.trim())),
  );

  const commitCreate = async () => {
    const label = draft.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      if (onCreate) await onCreate(label);
      onChange(label);
      setCreating(false);
      setDraft('');
    } catch (err) {
      console.error('Failed to create status:', err);
      alert(err.message || 'Could not add status.');
    } finally {
      setBusy(false);
    }
  };

  if (creating) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
        <input
          type="text"
          className="form-input"
          placeholder="New status name"
          value={draft}
          autoFocus
          disabled={disabled || busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitCreate();
            }
            if (e.key === 'Escape') {
              setCreating(false);
              setDraft('');
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled || busy || !draft.trim()}
          onClick={commitCreate}
        >
          Add
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled || busy}
          onClick={() => {
            setCreating(false);
            setDraft('');
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      className="form-input"
      value={value || ''}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        if (next === ADD_NEW_VALUE) {
          setCreating(true);
          return;
        }
        onChange(next);
      }}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {labels.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
      <option value={ADD_NEW_VALUE}>+ Add new status…</option>
    </select>
  );
}

function FlowArrow() {
  return (
    <span
      aria-hidden="true"
      style={{
        color: 'var(--text-secondary)',
        fontSize: '0.95rem',
        fontWeight: 600,
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      →
    </span>
  );
}

function RuleTable({ columns, children }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg-tertiary)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columns.map((c) => c.width || '1fr').join(' '),
          gap: '0.5rem',
          padding: '0.55rem 0.75rem',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}
      >
        {columns.map((c) => (
          <span key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</span>
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
        padding: '0.65rem 0.75rem',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-subtle)',
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
  syncFollowupsToGoogle,
  setSyncFollowupsToGoogle,
  googleCalendarConnected = false,
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
  messagingStatusOptions = [],
  callStatusOptions = [],
  onAddMessagingStatus,
  onAddCallStatus,
  automationError,
  automationSuccess,
  automationSaving,
  onSubmit,
  isTeamWorkspace = false,
}) {
  const [section, setSection] = useState('reminders');

  const messagingCols = [
    { key: 'status', label: 'Status', width: 'minmax(0, 1fr)' },
    { key: 'arrow', label: '', width: '28px', align: 'center' },
    { key: 'action', label: 'Next step', width: 'minmax(0, 1fr)' },
    { key: 'rm', label: '', width: '36px' },
  ];
  const outcomeCols = [
    { key: 'outcome', label: 'Outcome', width: 'minmax(0, 1fr)' },
    { key: 'arrow1', label: '', width: '28px', align: 'center' },
    { key: 'status', label: 'Call status', width: 'minmax(0, 1fr)' },
    { key: 'arrow2', label: '', width: '28px', align: 'center' },
    { key: 'action', label: 'Next step', width: 'minmax(0, 1fr)' },
  ];
  const statusCols = [
    { key: 'status', label: 'Status', width: 'minmax(0, 1fr)' },
    { key: 'arrow', label: '', width: '28px', align: 'center' },
    { key: 'action', label: 'Next step', width: 'minmax(0, 1fr)' },
    { key: 'rm', label: '', width: '36px' },
  ];

  return (
    <form onSubmit={onSubmit} className="flex-col gap-4">
      <div className="card rd-page-form">
        <div className="rd-page-form-header">
          <h3>Automations</h3>
          <p className="rd-modal-sub">
            {isTeamWorkspace
              ? 'Shared workspace rules. Reminder preferences below stay personal.'
              : 'Rules for your account only — teammates keep their own.'}
            {' '}
            Status lists match Edit Statuses in CRM.
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
            border: '1px solid var(--border-subtle)',
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
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        {section === 'reminders' && (
          <SettingsStack>
            <SettingsCard>
              <ToggleRow
                title="Remind me about follow-ups"
                description="Turn on reminders and push digests for due follow-ups."
                checked={remindersEnabled}
                onChange={setRemindersEnabled}
                disabled={automationSaving}
              />
            </SettingsCard>

            {remindersEnabled && (
              <SettingsCard>
                <CardHeading title="How you're notified" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: 'var(--text-primary)', cursor: automationSaving ? 'wait' : 'pointer' }}>
                    <input
                      type="radio"
                      name="reminder_notification_mode"
                      checked={reminderNotificationMode === 'digest'}
                      onChange={() => setReminderNotificationMode('digest')}
                      disabled={automationSaving}
                    />
                    Daily digest (recommended)
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: 'var(--text-primary)', cursor: automationSaving ? 'wait' : 'pointer' }}>
                    <input
                      type="radio"
                      name="reminder_notification_mode"
                      checked={reminderNotificationMode === 'instant'}
                      onChange={() => setReminderNotificationMode('instant')}
                      disabled={automationSaving}
                    />
                    Instant, for each follow-up
                  </label>
                </div>
              </SettingsCard>
            )}

            {remindersEnabled && reminderNotificationMode === 'digest' && (
              <SettingsCard>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      Digest time
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.45 }}>
                      What local hour you get the daily follow-ups push.
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
              </SettingsCard>
            )}

            {remindersEnabled && (
              <SettingsCard>
                <ToggleRow
                  title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      Sync follow-ups to Google Calendar
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 999,
                          padding: '2px 7px',
                        }}
                      >
                        Recommended off
                      </span>
                    </span>
                  }
                  description={
                    googleCalendarConnected
                      ? 'Off keeps follow-ups only in ReachDesk Calendar and Reminders. Turn on to also create timed Google Calendar events (can clutter your real calendar if you have many).'
                      : 'Connect Google Calendar in Integrations first. Leave this off to keep follow-ups in ReachDesk only — recommended.'
                  }
                  checked={!!syncFollowupsToGoogle}
                  onChange={setSyncFollowupsToGoogle}
                  disabled={automationSaving || !googleCalendarConnected}
                />
              </SettingsCard>
            )}
          </SettingsStack>
        )}

        {section === 'messaging' && (
          <SettingsStack>
            <SettingsCard>
              <ToggleRow
                title="Next-step hints"
                description="Show a hint on each lead about what to do next."
                checked={suggestionsEnabled}
                onChange={setSuggestionsEnabled}
                disabled={automationSaving}
              />
            </SettingsCard>

            {suggestionsEnabled && (
              <SettingsCard>
                <ToggleRow
                  title="Fill in next steps for me"
                  description="When you change a lead's status, the next step is written automatically."
                  checked={suggestionsAutoApply}
                  onChange={setSuggestionsAutoApply}
                  disabled={automationSaving}
                />
              </SettingsCard>
            )}

            {suggestionsEnabled && (
              <>
                <SettingsDivider label="Rules" />
                <SettingsCard>
                  <CardHeading
                    title="What happens after each status"
                    description="Choose the next step to suggest for each status. This doesn't add or rename statuses — do that in Edit Statuses."
                  />

                  <RuleTable columns={messagingCols}>
                    {messagingActionRules.map((rule, idx) => (
                      <RuleRow key={`${rule.status}-${idx}`} columns={messagingCols}>
                        <StatusSelect
                          value={rule.status || ''}
                          options={messagingStatusOptions}
                          emptyLabel="Select status"
                          disabled={automationSaving}
                          onCreate={onAddMessagingStatus}
                          onChange={(status) => {
                            const next = [...messagingActionRules];
                            next[idx] = { ...next[idx], status };
                            setMessagingActionRules(next);
                          }}
                        />
                        <FlowArrow />
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
                          style={{ justifySelf: 'end' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </RuleRow>
                    ))}
                  </RuleTable>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 14 }}>
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
                </SettingsCard>
              </>
            )}

            <SettingsCard>
              <ToggleRow
                title="Preview before sending"
                description="Show the template and where it goes before opening WhatsApp or SMS."
                checked={alwaysDraft}
                onChange={setAlwaysDraft}
                disabled={automationSaving}
              />
            </SettingsCard>
          </SettingsStack>
        )}

        {section === 'calls' && (
          <SettingsStack>
            <SettingsCard>
              <ToggleRow
                title="Fill in call next steps for me"
                description="When call status or outcome changes, update the call next step from the rules below."
                checked={callSuggestionsAutoApply}
                onChange={setCallSuggestionsAutoApply}
                disabled={automationSaving}
              />
            </SettingsCard>

            <SettingsCard>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    Default country code
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.45 }}>
                    Used to complete local numbers for WhatsApp and SMS.
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
            </SettingsCard>

            <SettingsDivider label="Rules" />

            <SettingsCard>
              <CardHeading
                title="After each call outcome"
                description="When you log a call, optionally set call status and next step from the outcome."
              />
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
                    <FlowArrow />
                    <StatusSelect
                      value={rule.suggested_call_status || rule.suggested_status || ''}
                      options={callStatusOptions}
                      emptyLabel="Optional"
                      disabled={automationSaving}
                      onCreate={onAddCallStatus}
                      onChange={(status) => {
                        const next = [...callOutcomeRules];
                        next[idx] = {
                          ...next[idx],
                          suggested_call_status: status || null,
                          suggested_status: undefined,
                        };
                        setCallOutcomeRules(next);
                      }}
                    />
                    <FlowArrow />
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
                style={{ marginTop: 14 }}
                disabled={automationSaving}
                onClick={() => setCallOutcomeRules([...DEFAULT_CALL_OUTCOME_RULES])}
              >
                Reset outcome rules
              </button>
            </SettingsCard>

            <SettingsCard>
              <CardHeading
                title="What happens after each call status"
                description="Choose the next step to suggest when call status changes. Statuses come from Call Queue Edit Statuses."
              />
              <RuleTable columns={statusCols}>
                {callStatusRules.map((rule, idx) => (
                  <RuleRow key={`${rule.status}-${idx}`} columns={statusCols}>
                    <StatusSelect
                      value={rule.status || ''}
                      options={callStatusOptions}
                      emptyLabel="Select status"
                      disabled={automationSaving}
                      onCreate={onAddCallStatus}
                      onChange={(status) => {
                        const next = [...callStatusRules];
                        next[idx] = { ...next[idx], status };
                        setCallStatusRules(next);
                      }}
                    />
                    <FlowArrow />
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
                      style={{ justifySelf: 'end' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </RuleRow>
                ))}
              </RuleTable>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 14 }}>
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
            </SettingsCard>

            <SettingsCard>
              <CardHeading
                title="Default dialer"
                description="Used by the Call button in Cold Calls. Other dialers stay in the menu."
              />
              <select
                className="form-input"
                value={defaultDialer}
                onChange={(e) => setDefaultDialer(e.target.value)}
                disabled={automationSaving}
                style={{ maxWidth: 280, marginBottom: defaultDialer === 'ghl' || defaultDialer === 'custom' ? 10 : 0 }}
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
            </SettingsCard>
          </SettingsStack>
        )}

        <div className="rd-page-form-actions" style={{ marginTop: '0.5rem', maxWidth: 760 }}>
          <button type="submit" className="btn btn-primary" disabled={automationSaving}>
            <Save size={16} /> {automationSaving ? 'Saving…' : 'Save automations'}
          </button>
        </div>
      </div>
    </form>
  );
}
