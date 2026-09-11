import { softBadgeStyle } from '../../../lib/softBadgeStyle';

import { OUTCOME_COLORS } from '../../../lib/callOutcomes';

export default function OutcomeBadge({ outcome }) {
  if (!outcome) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>;
  const color = OUTCOME_COLORS[outcome] || '#64748b';
  return (
    <span className="badge" style={softBadgeStyle(color)}>
      {outcome}
    </span>
  );
}

