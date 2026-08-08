import { softBadgeStyle } from '../../../lib/softBadgeStyle';

const OUTCOME_COLORS = {
  Answered: '#22c55e',
  'No Answer': '#f59e0b',
  'Voicemail Left': '#3b82f6',
  Busy: '#a855f7',
  'Wrong Number': '#9ca3af',
  'Callback Requested': '#ec4899',
  'Not Interested': '#E05252',
};

export default function OutcomeBadge({ outcome }) {
  if (!outcome) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>;
  const color = OUTCOME_COLORS[outcome] || '#64748b';
  return (
    <span className="badge" style={softBadgeStyle(color)}>
      {outcome}
    </span>
  );
}

export { OUTCOME_COLORS as OUTCOME_BADGE };
