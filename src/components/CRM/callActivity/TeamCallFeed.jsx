import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { leadDisplayName, computeNextFollowUp } from '../../../lib/outreachQueue';
import { CALL_OUTCOMES } from '../../../lib/callOutcomes';
import { formatActivityDateTime } from '../../../lib/dateTime';
import OutcomeBadge from './OutcomeBadge';
import MemberActivityFilter from './MemberActivityFilter';
import ResizableTh from '../ResizableTh';
import ResizableTr from '../ResizableTr';
import { useCrmTableLayout } from '../useCrmTableLayout';
import '../DataTableEnhancements.css';

const COLS = [
  { key: 'when', label: 'When' },
  { key: 'member', label: 'Member' },
  { key: 'lead', label: 'Lead' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'note', label: 'Note' },
  { key: 'followup', label: 'Follow-up' },
  { key: '_actions', label: '' },
];

export default function TeamCallFeed({
  rows = [],
  members = [],
  loading,
  memberFilter,
  onMemberFilterChange,
  outcomeFilter,
  onOutcomeFilterChange,
  onOpenLead,
  canViewTeam = true,
}) {
  const { getWidth, setWidth, resetWidth, getRowHeight, setRowHeight, resetRowHeight } =
    useCrmTableLayout('team_call_feed');

  const enriched = useMemo(() => {
    return rows.map((row) => ({
      ...row,
      lead: {
        id: row.lead_id,
        first_name: row.lead_first_name,
        last_name: row.lead_last_name,
        email: row.lead_email,
        phone: row.lead_phone,
        company: row.lead_company,
      },
      nextFollowUp: computeNextFollowUp({ outcome: row.outcome, created_at: row.created_at }),
    }));
  }, [rows]);

  if (!canViewTeam) {
    return (
      <div className="card" style={{ padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Team call activity is off. Your owner can enable sharing on the Teams page, or use <strong>My Activity</strong> for your own logs.
      </div>
    );
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', padding: '1.5rem 0' }}>Loading team activity…</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <MemberActivityFilter
          members={members}
          value={memberFilter}
          onChange={onMemberFilterChange}
        />
        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Outcome
          <select
            className="form-input"
            style={{ width: 'auto', minWidth: 150 }}
            value={outcomeFilter}
            onChange={(e) => onOutcomeFilterChange(e.target.value)}
          >
            <option value="">All outcomes</option>
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>

      {enriched.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No team call activity matches this filter.
        </div>
      ) : (
        <div className="table-container" style={{ marginBottom: 0 }}>
          <table className="data-table data-table--resizable" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', textAlign: 'left' }}>
                {COLS.map((col) => (
                  <ResizableTh
                    key={col.key}
                    columnKey={col.key}
                    width={getWidth(col.key)}
                    onResize={setWidth}
                    onReset={resetWidth}
                    style={{ fontWeight: 600 }}
                  >
                    {col.label}
                  </ResizableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.map((row) => (
                <ResizableTr
                  key={row.id}
                  rowKey={row.id}
                  height={getRowHeight(row.id)}
                  onResize={setRowHeight}
                  onReset={resetRowHeight}
                >
                  <td style={{ whiteSpace: 'nowrap', width: getWidth('when'), minWidth: getWidth('when'), maxWidth: getWidth('when') }}>
                    {formatActivityDateTime(row.created_at, { showZone: true })}
                  </td>
                  <td style={{ width: getWidth('member'), minWidth: getWidth('member'), maxWidth: getWidth('member') }}>{row.caller_name || row.caller_email || '—'}</td>
                  <td
                    style={{ cursor: 'pointer', width: getWidth('lead'), minWidth: getWidth('lead'), maxWidth: getWidth('lead') }}
                    onClick={() => onOpenLead?.(row.lead, 'calls')}
                  >
                    <div style={{ fontWeight: 600 }}>{leadDisplayName(row.lead)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.lead.company || row.lead.phone || '—'}</div>
                  </td>
                  <td style={{ width: getWidth('outcome'), minWidth: getWidth('outcome'), maxWidth: getWidth('outcome') }}>
                    <OutcomeBadge outcome={row.outcome} />
                  </td>
                  <td style={{ color: 'var(--text-secondary)', width: getWidth('note'), minWidth: getWidth('note'), maxWidth: getWidth('note') }}>
                    {!row.note_visible && row.note == null ? (
                      <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>(private)</span>
                    ) : (
                      row.note || '—'
                    )}
                  </td>
                  <td style={{ width: getWidth('followup'), minWidth: getWidth('followup'), maxWidth: getWidth('followup') }}>
                    {row.nextFollowUp ? row.nextFollowUp.toLocaleDateString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right', width: getWidth('_actions'), minWidth: getWidth('_actions'), maxWidth: getWidth('_actions') }}>
                    <button type="button" className="btn-icon" onClick={() => onOpenLead?.(row.lead, 'calls')}>
                      <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </td>
                </ResizableTr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
