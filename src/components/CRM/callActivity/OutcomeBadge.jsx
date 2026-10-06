import Pill from '../../ui/Pill';
import { OUTCOME_COLORS } from '../../../lib/callOutcomes';

export default function OutcomeBadge({ outcome }) {
  if (!outcome) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>;
  const color = OUTCOME_COLORS[outcome] || '#64748b';
  return <Pill label={outcome} color={color} dot={true} />;
}

