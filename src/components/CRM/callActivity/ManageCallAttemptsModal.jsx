import React, { useMemo, useState } from 'react';
import { X, Trash2, Pencil } from 'lucide-react';
import {
  deleteCallAttempts,
  refreshLeadLastCalledAt,
} from '../../../lib/callActivity';
import EditCallAttemptModal from './EditCallAttemptModal';
import OutcomeBadge from './OutcomeBadge';

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Manage all call attempts for one lead — edit any, delete one or selected. */
export default function ManageCallAttemptsModal({
  open,
  lead,
  attempts = [],
  currentUser,
  onClose,
  onChanged,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [editAttempt, setEditAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const currentUserId = currentUser?.id;
  const ownAttempts = useMemo(
    () => (attempts || []).filter((a) => a.user_id === currentUserId)
      .sort((a, b) => new Date(b.occurred_at || b.created_at) - new Date(a.occurred_at || a.created_at)),
    [attempts, currentUserId],
  );

  if (!open || !lead) return null;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === ownAttempts.length) setSelected(new Set());
    else setSelected(new Set(ownAttempts.map((a) => a.id)));
  };

  const handleDeleteSelected = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} call log${selected.size === 1 ? '' : 's'}?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteCallAttempts([...selected]);
      await refreshLeadLastCalledAt(lead.id, currentUserId);
      setSelected(new Set());
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to delete.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOne = async (id) => {
    if (!window.confirm('Delete this call log?')) return;
    setBusy(true);
    setError('');
    try {
      await deleteCallAttempts([id]);
      await refreshLeadLastCalledAt(lead.id, currentUserId);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to delete.');
    } finally {
      setBusy(false);
    }
  };

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead';

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: '1rem' }}
        onClick={onClose}
      >
        <div
          className="card"
          style={{ width: 'min(520px, 96vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Call logs</h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{name} · {ownAttempts.length} attempt{ownAttempts.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>

          <div style={{ padding: '0.75rem 1.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAll} disabled={!ownAttempts.length}>
              {selected.size === ownAttempts.length && ownAttempts.length > 0 ? 'Clear selection' : 'Select all'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDeleteSelected}
              disabled={busy || selected.size === 0}
              style={{ color: selected.size ? 'var(--status-hot)' : undefined }}
            >
              <Trash2 size={14} /> Delete selected ({selected.size})
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: '0.5rem 0', flex: 1 }}>
            {ownAttempts.length === 0 ? (
              <p style={{ padding: '1.5rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>No call logs yet.</p>
            ) : (
              ownAttempts.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
                    aria-label="Select attempt"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <OutcomeBadge outcome={a.outcome} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {formatWhen(a.occurred_at || a.created_at)}
                      </span>
                    </div>
                    {a.note && (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{a.note}</p>
                    )}
                  </div>
                  <button type="button" className="btn-icon" title="Edit" onClick={() => setEditAttempt(a)} disabled={busy}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="btn-icon" title="Delete" onClick={() => handleDeleteOne(a.id)} disabled={busy}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {error && (
            <div style={{ padding: '0.75rem 1.25rem', color: 'var(--danger-color)', fontSize: '0.85rem' }}>{error}</div>
          )}
        </div>
      </div>

      {editAttempt && (
        <EditCallAttemptModal
          attempt={editAttempt}
          isLatest={attempts[0]?.id === editAttempt.id}
          profile={currentUser}
          lead={lead}
          onClose={() => setEditAttempt(null)}
          onSaved={() => {
            setEditAttempt(null);
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
