import React, { useMemo, useState } from 'react';
import { ChevronRight, Plus, Pencil, Trash2, List } from 'lucide-react';
import {
  CALL_OUTCOMES,
  TERMINAL_OUTCOMES,
  leadDisplayName,
  computeNextFollowUp,
  startOfToday,
} from '../../../lib/outreachQueue';
import CallWindowBadge from '../CallWindowBadge';
import OutcomeBadge from './OutcomeBadge';
import EditCallAttemptModal from './EditCallAttemptModal';
import ManageCallAttemptsModal from './ManageCallAttemptsModal';
import ResizableTh from '../ResizableTh';
import ResizableTr from '../ResizableTr';
import { useCrmTableLayout } from '../useCrmTableLayout';
import '../DataTableEnhancements.css';

const COLS = [
  { key: 'lead', label: 'Lead' },
  { key: 'local_time', label: 'Local time' },
  { key: 'outcome', label: 'Last outcome' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'followup', label: 'Next follow-up' },
  { key: '_actions', label: '' },
];

export default function MyCallFeed({
  leads = [],
  attempts = [],
  loading,
  defaultCountryCode = '+92',
  onOpenLead,
  onLogCall,
  onGoToQueue,
  onAttemptUpdated,
  onAttemptDeleted,
  currentUserId,
  userTimeZone = null,
}) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [editAttempt, setEditAttempt] = useState(null);
  const [manageLead, setManageLead] = useState(null);
  const { getWidth, setWidth, resetWidth, getRowHeight, setRowHeight, resetRowHeight } =
    useCrmTableLayout('my_call_feed');

  const attemptsByLead = useMemo(() => {
    const map = new Map();
    for (const a of attempts) {
      if (!map.has(a.lead_id)) map.set(a.lead_id, []);
      map.get(a.lead_id).push(a);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.occurred_at || b.created_at) - new Date(a.occurred_at || a.created_at));
    }
    return map;
  }, [attempts]);

  const rows = useMemo(() => {
    const today = startOfToday(userTimeZone);
    const result = [];

    for (const lead of leads) {
      const leadAttempts = attemptsByLead.get(lead.id) || [];
      if (leadAttempts.length === 0) continue;

      const last = leadAttempts[0];
      const nextFollowUp = computeNextFollowUp(last);
      const needsFollowUpToday =
        nextFollowUp && nextFollowUp.getTime() <= today.getTime() && !TERMINAL_OUTCOMES.has(last.outcome);

      result.push({
        lead,
        attemptCount: leadAttempts.length,
        lastOutcome: last.outcome,
        lastAt: last.occurred_at || last.created_at,
        lastAttempt: last,
        nextFollowUp,
        needsFollowUpToday,
        attempts: leadAttempts,
      });
    }

    let filtered = result;
    if (filter === 'needs_followup') {
      filtered = result.filter((r) => r.needsFollowUpToday);
    } else if (filter.startsWith('outcome:')) {
      const outcome = filter.slice('outcome:'.length);
      filtered = result.filter((r) => r.lastOutcome === outcome);
    }

    const sorted = [...filtered];
    if (sort === 'recent') {
      sorted.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => new Date(a.lastAt) - new Date(b.lastAt));
    } else if (sort === 'attempts') {
      sorted.sort((a, b) => b.attemptCount - a.attemptCount || new Date(b.lastAt) - new Date(a.lastAt));
    } else if (sort === 'followup') {
      sorted.sort((a, b) => {
        const at = a.nextFollowUp ? a.nextFollowUp.getTime() : Number.POSITIVE_INFINITY;
        const bt = b.nextFollowUp ? b.nextFollowUp.getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
      });
    }

    return sorted;
  }, [leads, attemptsByLead, filter, sort, userTimeZone]);

  const canEdit = (attempt) => attempt && attempt.user_id === currentUserId;

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', padding: '1.5rem 0' }}>Loading call activity…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Call Log is your history feed</p>
        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>
          Work leads in <strong>Call Queue</strong> — log outcomes with one click and status updates automatically.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {onGoToQueue && (
            <button type="button" className="btn btn-primary" onClick={onGoToQueue}>
              Open Call Queue
            </button>
          )}
          {onLogCall && (
            <button type="button" className="btn btn-secondary" onClick={onLogCall}>
              <Plus size={14} /> Log a call
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Filter
          <select className="form-input" style={{ width: 'auto', minWidth: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All with calls</option>
            <option value="needs_followup">Needs follow-up</option>
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={`outcome:${o}`}>{o}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Sort
          <select className="form-input" style={{ width: 'auto', minWidth: 150 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
            <option value="attempts">Most attempts</option>
            <option value="followup">Follow-up date</option>
          </select>
        </label>
      </div>

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
            {rows.map((row) => (
              <ResizableTr
                key={row.lead.id}
                rowKey={row.lead.id}
                height={getRowHeight(row.lead.id)}
                onResize={setRowHeight}
                onReset={resetRowHeight}
              >
                <td
                  style={{ cursor: 'pointer', width: getWidth('lead'), minWidth: getWidth('lead'), maxWidth: getWidth('lead') }}
                  onClick={() => onOpenLead?.(row.lead, 'calls')}
                >
                  <div style={{ fontWeight: 600 }}>{leadDisplayName(row.lead)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {row.lead.phone || row.lead.email || '—'}
                  </div>
                </td>
                <td style={{ width: getWidth('local_time'), minWidth: getWidth('local_time'), maxWidth: getWidth('local_time') }}>
                  <CallWindowBadge lead={row.lead} defaultCountryCode={defaultCountryCode} showLocalTime />
                </td>
                <td style={{ width: getWidth('outcome'), minWidth: getWidth('outcome'), maxWidth: getWidth('outcome') }}>
                  <OutcomeBadge outcome={row.lastOutcome} />
                </td>
                <td style={{ width: getWidth('attempts'), minWidth: getWidth('attempts'), maxWidth: getWidth('attempts') }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="View / edit / delete call logs"
                    onClick={() => setManageLead(row.lead)}
                    style={{ minWidth: 36 }}
                  >
                    {row.attemptCount}
                  </button>
                </td>
                <td style={{ color: row.needsFollowUpToday ? 'var(--status-hot)' : 'var(--text-secondary)', width: getWidth('followup'), minWidth: getWidth('followup'), maxWidth: getWidth('followup') }}>
                  {row.nextFollowUp ? row.nextFollowUp.toLocaleDateString() : '—'}
                  {row.needsFollowUpToday && (
                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600 }}>Due today</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', width: getWidth('_actions'), minWidth: getWidth('_actions'), maxWidth: getWidth('_actions') }}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      title="Manage call logs"
                      onClick={() => setManageLead(row.lead)}
                    >
                      <List size={12} />
                    </button>
                    {canEdit(row.lastAttempt) && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditAttempt(row.lastAttempt)} title="Edit latest">
                        <Pencil size={12} />
                      </button>
                    )}
                    <button type="button" className="btn-icon" onClick={() => onOpenLead?.(row.lead, 'calls')}>
                      <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </div>
                </td>
              </ResizableTr>
            ))}
          </tbody>
        </table>
      </div>

      {editAttempt && (
        <EditCallAttemptModal
          attempt={editAttempt}
          onClose={() => setEditAttempt(null)}
          onSaved={(updated) => {
            onAttemptUpdated?.(updated);
            setEditAttempt(null);
          }}
        />
      )}

      <ManageCallAttemptsModal
        open={!!manageLead}
        lead={manageLead}
        attempts={manageLead ? (attemptsByLead.get(manageLead.id) || []) : []}
        currentUserId={currentUserId}
        onClose={() => setManageLead(null)}
        onChanged={() => {
          onAttemptDeleted?.('refresh');
        }}
      />
    </>
  );
}
