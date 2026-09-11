import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { leadDisplayName } from '../../../lib/outreachQueue';
import { CALL_OUTCOMES } from '../../../lib/callOutcomes';
import { logCallWithUpdates } from '../../../lib/callActivity';
import { captureDeviceTimestamp } from '../../../lib/dateTime';
import { useCustomCallOutcomes } from '../../../lib/callOutcomes';
import CustomOutcomeModal from './CustomOutcomeModal';

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function LogCallModal({
  open,
  onClose,
  leads,
  defaultLeadId,
  userId,
  teamId = null,
  profile = null,
  onLogged,
  fixedLead = null,
  showNoteSharing = false,
  updateLeadFields = true,
  timeZone = null,
}) {
  const [leadId, setLeadId] = useState(defaultLeadId || '');
  const availableOutcomes = useCustomCallOutcomes();
  const [outcome, setOutcome] = useState('Answered');
  const [showAddOutcome, setShowAddOutcome] = useState(false);
  const [note, setNote] = useState('');
  const [noteVisibility, setNoteVisibility] = useState('team');
  const [applyStatusAction, setApplyStatusAction] = useState(true);
  const [occurredLocal, setOccurredLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLeadId(fixedLead?.id || defaultLeadId || '');
    setOutcome('No Answer');
    setNote('');
    setNoteVisibility('team');
    setApplyStatusAction(updateLeadFields);
    setOccurredLocal(toLocalInputValue(captureDeviceTimestamp(timeZone).occurredAt));
    setError('');
  }, [open, defaultLeadId, fixedLead?.id, updateLeadFields, timeZone]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const resolvedLeadId = fixedLead?.id || leadId;
    if (!resolvedLeadId || !outcome) {
      setError('Pick a lead and outcome.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const occurredAt = occurredLocal ? new Date(occurredLocal).toISOString() : null;
      
      const selectedOutcomeObj = availableOutcomes.find(o => o.label === outcome);
      const outcomeBase = selectedOutcomeObj ? (selectedOutcomeObj.based_on || selectedOutcomeObj.label) : outcome;

      const { attempt, leadUpdates } = await logCallWithUpdates({
        userId,
        leadId: resolvedLeadId,
        outcome,
        outcomeBase,
        note,
        noteVisibility: showNoteSharing ? noteVisibility : 'team',
        teamId,
        updateLeadFields: applyStatusAction,
        timeZone,
        profile,
        occurredAt,
      });
      onLogged?.({ attempt, leadUpdates });
      onClose();
    } catch (err) {
      console.error('[LogCallModal] failed:', err);
      setError(err.message || 'Failed to log call.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(440px, 92vw)', padding: '1.25rem', background: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Log Call</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-3">
          {!fixedLead && (
            <div className="form-group">
              <label className="form-label">Lead</label>
              {leads.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  No callable leads in your workspace scope. Add or import leads in CRM first.
                </p>
              ) : (
                <select
                  className="form-input"
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  required
                >
                  <option value="">Select a lead…</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {leadDisplayName(lead)}
                      {lead.phone ? ` · ${lead.phone}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {fixedLead && (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Logging call for <strong style={{ color: 'var(--text-primary)' }}>{leadDisplayName(fixedLead)}</strong>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">When you called</label>
            <input
              type="datetime-local"
              className="form-input"
              value={occurredLocal}
              onChange={(e) => setOccurredLocal(e.target.value)}
              required
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Backdate if you called outside ReachDesk.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Outcome</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="form-input"
                style={{ flex: 1 }}
                value={outcome}
                onChange={(e) => {
                  if (e.target.value === 'ADD_NEW') {
                    setShowAddOutcome(true);
                  } else {
                    setOutcome(e.target.value);
                  }
                }}
                required
              >
                {availableOutcomes.map((o) => (
                  <option key={o.label} value={o.label}>{o.label}</option>
                ))}
                <option value="ADD_NEW" style={{ fontWeight: 'bold' }}>+ Add custom outcome…</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <textarea
              className="form-input"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened on the call…"
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={applyStatusAction}
              onChange={(e) => setApplyStatusAction(e.target.checked)}
            />
            Update status and call next step from outcome
          </label>

          {showNoteSharing && note.trim() && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={noteVisibility === 'team'}
                onChange={(e) => setNoteVisibility(e.target.checked ? 'team' : 'private')}
              />
              Share note with team (outcome is always visible when team sharing is on)
            </label>
          )}

          {error && <div style={{ color: 'var(--danger-color)', fontSize: '0.85rem' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || (!fixedLead && leads.length === 0)}>
              {saving ? 'Saving…' : 'Save call'}
            </button>
          </div>
        </form>
      </div>

      {showAddOutcome && (
        <CustomOutcomeModal 
          onClose={() => {
            setShowAddOutcome(false);
            if (outcome === 'ADD_NEW') setOutcome('Answered'); // fallback
          }}
          onCreated={(newOutcome) => {
            setShowAddOutcome(false);
            setOutcome(newOutcome.label);
          }}
        />
      )}
    </div>
  );
}
