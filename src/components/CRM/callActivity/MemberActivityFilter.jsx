import React from 'react';

export default function MemberActivityFilter({ members = [], value, onChange, disabled = false, isOwner = false, currentUserId }) {
  if (!isOwner) {
    return (
      <div className="cal-segment" role="group" aria-label="Member filter">
        <button
          type="button"
          onClick={() => onChange(currentUserId)}
          className={`cal-segment__btn${value === currentUserId ? ' cal-segment__btn--active' : ''}`}
          disabled={disabled}
        >
          Mine
        </button>
        <button
          type="button"
          onClick={() => onChange('')}
          className={`cal-segment__btn${value === '' ? ' cal-segment__btn--active' : ''}`}
          disabled={disabled}
        >
          All team
        </button>
      </div>
    );
  }

  return (
    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      Member
      <select
        className="form-input"
        style={{ width: 'auto', minWidth: 160 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">All team</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name || m.email?.split('@')[0] || 'Member'}
            {(m.team_role || '').toLowerCase() === 'owner' ? ' (owner)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
