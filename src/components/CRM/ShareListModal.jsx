import React, { useEffect, useState } from 'react';
import { X, Users } from 'lucide-react';
import { saveFolderShares } from '../../lib/folderShares';
import ToggleSwitch from '../ui/ToggleSwitch';

export default function ShareListModal({
  open,
  onClose,
  folder,
  teamMembers = [],
  currentUser,
  existingShares = [],
  onSaved,
}) {
  const [selected, setSelected] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const map = {};
    existingShares.forEach((s) => {
      map[s.shared_with_user_id] = s.permission || 'view';
    });
    setSelected(map);
    setError('');
  }, [open, existingShares]);

  if (!open || !folder) return null;

  const others = teamMembers.filter((m) => m.id !== currentUser?.id);

  const toggle = (userId) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[userId]) delete next[userId];
      else next[userId] = 'view';
      return next;
    });
  };

  const setPermission = (userId, permission) => {
    setSelected((prev) => ({ ...prev, [userId]: permission }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const entries = Object.entries(selected).map(([userId, permission]) => ({
        userId,
        permission,
      }));
      await saveFolderShares(folder.id, currentUser.id, entries);
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to save shares');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content rd-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="rd-modal-header">
          <div>
            <h3>Share list</h3>
            <p className="rd-modal-sub">{folder.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rd-modal-close" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="rd-modal-body flex-col gap-3">
          {others.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Invite teammates on the Teams page to share this list with them.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Choose who can access this list. They will see leads assigned to it.
              </p>
              <div className="flex-col gap-2">
                {others.map((m) => {
                  const checked = !!selected[m.id];
                  return (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <ToggleSwitch checked={checked} onChange={() => toggle(m.id)} />
                      <Users size={14} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ flex: 1, fontSize: '0.85rem' }}>
                        {m.full_name || m.email}
                        {(m.team_role || '').toLowerCase() === 'owner' ? ' (owner)' : ''}
                      </span>
                      {checked && (
                        <select
                          className="form-input"
                          value={selected[m.id]}
                          onChange={(e) => setPermission(m.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: 'auto', fontSize: '0.78rem', padding: '0.2rem 0.4rem' }}
                        >
                          <option value="view">View</option>
                          <option value="edit">Edit</option>
                        </select>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {error && (
            <p style={{ color: 'var(--danger-color)', fontSize: '0.8rem', margin: 0 }}>{error}</p>
          )}
        </div>
        <div className="rd-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || others.length === 0}>
            {saving ? 'Saving…' : 'Save sharing'}
          </button>
        </div>
      </div>
    </div>
  );
}
