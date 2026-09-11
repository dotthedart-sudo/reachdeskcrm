import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useCustomCallOutcomes } from '../../../lib/callOutcomes';
import CustomOutcomeModal from './CustomOutcomeModal';
import { updateCallAttempt, refreshLeadLastCalledAt } from '../../../lib/callActivity';

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditCallAttemptModal({ attempt, onClose, onSaved, profile, lead, isLatest }) {
  const availableOutcomes = useCustomCallOutcomes();
  const [outcome, setOutcome] = useState(attempt?.outcome || 'No Answer');
  const [showAddOutcome, setShowAddOutcome] = useState(false);
  const [note, setNote] = useState(attempt?.note || '');
  const [noteVisibility, setNoteVisibility] = useState(attempt?.note_visibility || 'team');
  const [occurredLocal, setOccurredLocal] = useState(
    toLocalInputValue(attempt?.occurred_at || attempt?.created_at),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOutcome(attempt?.outcome || 'No Answer');
    setNote(attempt?.note || '');
    setNoteVisibility(attempt?.note_visibility || 'team');
    setOccurredLocal(toLocalInputValue(attempt?.occurred_at || attempt?.created_at));
    setError('');
  }, [attempt]);

  if (!attempt) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const occurredAt = occurredLocal ? new Date(occurredLocal).toISOString() : null;
      
      const selectedOutcomeObj = availableOutcomes.find(o => o.label === outcome);
      const outcomeBase = selectedOutcomeObj ? (selectedOutcomeObj.based_on || selectedOutcomeObj.label) : outcome;

      const updated = await updateCallAttempt(attempt.id, {
        outcome,
        outcome_base: outcomeBase,
        note,
        noteVisibility,
        occurredAt,
      }, {
        oldOutcome: attempt.outcome,
        isLatest,
        profile,
        lead
      });
      if (attempt.user_id && attempt.lead_id) {
        await refreshLeadLastCalledAt(attempt.lead_id, attempt.user_id);
      }
      onSaved?.(updated);
    } catch (err) {
      setError(err.message || 'Failed to update call.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2200 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 'min(420px, 92vw)', padding: '1.25rem' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Edit call log</h3>
          <button type="button" className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-col gap-3">
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
            <label className="form-label">Note</label>
            <textarea className="form-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={noteVisibility === 'team'}
              onChange={(e) => setNoteVisibility(e.target.checked ? 'team' : 'private')}
            />
            Share note with team
          </label>
          {error && <div style={{ color: 'var(--danger-color)', fontSize: '0.85rem' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
      
      {showAddOutcome && (
        <CustomOutcomeModal 
          onClose={() => {
            setShowAddOutcome(false);
            if (outcome === 'ADD_NEW') setOutcome(attempt.outcome); // fallback
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
