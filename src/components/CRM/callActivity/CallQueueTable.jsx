import React, { useEffect, useMemo, useState } from 'react';
import { PhoneCall, Settings as Gear, Lightbulb, EyeOff } from 'lucide-react';
import CopyableCell from '../CopyableCell';
import GroupedStatusDropdown from '../GroupedStatusDropdown';
import PriorityDropdown from '../PriorityDropdown';
import EditableDropdown from '../EditableDropdown';
import CallWindowBadge from '../CallWindowBadge';
import DateTimePickerCell from '../DateTimePickerCell';
import OutcomeBadge from './OutcomeBadge';
import GroupedTemplateDropdown from '../GroupedTemplateDropdown';
import GroupedChannelDropdown from '../GroupedChannelDropdown';
import CustomFieldCell from '../CustomFieldCell';
import { ReachIcons } from '../../icons/PlatformIcons';
import { TEMPLATE_KINDS } from '../../../lib/templateKinds';
import { getTableColumns, getLeadCellCopyValue, CALL_QUEUE_DEFAULT_DEFS } from '../crmTableColumns';
import { fetchMyCallAttempts } from '../../../lib/callActivity';
import { getCallActionForStatus, displayCallStatus } from '../../../lib/callOutcomeRules';
import { attemptsByLeadMap, allAttemptsByLeadMap, buildOutreachSessionQueue } from '../../../lib/outreachQueue';
import { formatLocalTime, getEffectiveUserTimeZone } from '../../../lib/dateTime';
import CallingSession from './CallingSession';
import ManageCallAttemptsModal from './ManageCallAttemptsModal';
import EditCallAttemptModal from './EditCallAttemptModal';
import DataTableShell from '../DataTableShell';
import { useColumnPrefs } from '../useColumnPrefs';

export default function CallQueueTable({
  leads = [],
  allLeads = [],
  selectedIds = [],
  viewerFolderAccess = false,
  onSelectRow,
  onSelectAll,
  columnDefs = [],
  currentUser,
  teamId,
  onOpenLead,
  onCallStatusChange,
  onFieldChange,
  onCopied,
  onRefresh,
  onLeadUpdated,
  onOpenColumnManager,
  showNoteSharing = false,
  suggestionRules = [],
  onUpdateColumnDef,
  setColumnDefs,
  templates = [],
}) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [manageLead, setManageLead] = useState(null);
  const [editLatest, setEditLatest] = useState(null);
  const [autoOpenCallbackLeadId, setAutoOpenCallbackLeadId] = useState(null);

  const columnPrefs = useColumnPrefs({
    tableView: 'call_queue',
    columnDefs,
    setColumnDefs,
  });

  const userId = currentUser?.id;
  const userTimeZone = useMemo(() => getEffectiveUserTimeZone(currentUser), [currentUser?.timezone]);
  const defaultCountryCode = currentUser?.default_country_code || '+92';
  const suggestionsEnabled = currentUser?.suggestions_enabled !== false;

  const tableCols = useMemo(() => {
    const cols = getTableColumns(columnDefs, 'call_queue').filter((c) => c.column_key !== '_actions');
    if (cols.length > 0) return cols;
    return CALL_QUEUE_DEFAULT_DEFS.map((d, i) => ({ ...d, id: `default-${d.column_key}`, sort_order: i }));
  }, [columnDefs]);

  const callActionColDef = useMemo(
    () => tableCols.find((c) => c.column_key === 'call_action') || {
      column_key: 'call_action',
      column_label: 'Call next step',
      column_type: 'dropdown',
      is_default: true,
      dropdown_options: [],
    },
    [tableCols],
  );

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMyCallAttempts(userId)
      .then((data) => { if (!cancelled) setAttempts(data); })
      .catch(() => { if (!cancelled) setAttempts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, leads.length]);

  const leadIdSet = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const allLeadIdSet = useMemo(() => new Set(allLeads.map((l) => l.id)), [allLeads]);

  const scopedAttempts = useMemo(
    () => attempts.filter((a) => allLeadIdSet.has(a.lead_id)),
    [attempts, allLeadIdSet],
  );

  const byLead = useMemo(() => allAttemptsByLeadMap(scopedAttempts), [scopedAttempts]);

  const sessionQueue = useMemo(
    () => buildOutreachSessionQueue(allLeads, scopedAttempts, userTimeZone),
    [allLeads, scopedAttempts, userTimeZone],
  );

  const handleLogged = ({ attempt, leadUpdates } = {}) => {
    if (attempt) setAttempts((prev) => [attempt, ...prev]);
    if (leadUpdates?.id) {
      onLeadUpdated?.(leadUpdates);
    }
  };

  const handleCallStatusChange = async (leadId, newStatus) => {
    if (newStatus === 'Callback requested') {
      setAutoOpenCallbackLeadId(leadId);
    }
    const result = await onCallStatusChange?.(leadId, newStatus);
    if (result?.attempt) {
      setAttempts((prev) => [result.attempt, ...prev]);
    }
    return result;
  };

  const handleLastCalledChange = (lead, iso) => {
    onFieldChange?.(lead.id, 'last_called_at', iso);
  };

  const renderCellContent = (col, lead, last, attemptList, cellProps) => {
    const displayName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || '—';
    const isCustom = !col.is_default;
    const copyValue = getLeadCellCopyValue(lead, col);

    switch (col.column_key) {
      case 'name': {
        const isCallbackDue = lead.call_action === 'Callback scheduled' && lead.next_checkpoint_at && new Date(lead.next_checkpoint_at) <= new Date();
        return (
          <td {...cellProps}>
            <CopyableCell value={copyValue} onCopied={onCopied}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} data-ph-mask>{displayName}</span>
                {isCallbackDue && <span className="sim-badge" style={{ background: 'var(--status-warm)', color: '#fff', fontSize: '0.7rem' }}>Callback due</span>}
              </div>
            </CopyableCell>
          </td>
        );
      }
      case 'phone':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <CopyableCell value={lead.phone || ''} onCopied={onCopied}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }} data-ph-mask>
                {lead.phone || '—'}
              </span>
            </CopyableCell>
          </td>
        );
      case 'local_time':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <CallWindowBadge
              lead={lead}
              defaultCountryCode={defaultCountryCode}
              showLocalTime
              compact
              editable
              onTimezoneChange={(tz) => onFieldChange?.(lead.id, 'timezone', tz || '')}
            />
          </td>
        );
      case 'outreach_channel':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <CopyableCell value={lead.outreach_channel || ''} onCopied={onCopied} variant="inline">
              <GroupedChannelDropdown
                userId={userId}
                value={lead.outreach_channel}
                onChange={(val) => onFieldChange?.(lead.id, 'outreach_channel', val)}
                isTableInline={true}
                onUpdate={onRefresh}
                channel="messaging"
              />
            </CopyableCell>
          </td>
        );
      case 'status': {
        const isCallbackReq = displayCallStatus(lead.call_status) === 'Callback requested';
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', width: '100%' }}>
              <CopyableCell value={displayCallStatus(lead.call_status)} onCopied={onCopied} variant="inline">
                <GroupedStatusDropdown
                  channel="calls"
                  value={displayCallStatus(lead.call_status)}
                  onChange={(val) => handleCallStatusChange(lead.id, val)}
                  isTableInline
                  onUpdate={onRefresh}
                  disabled={viewerFolderAccess}
                />
              </CopyableCell>
              {isCallbackReq && (
                <DateTimePickerCell
                  compact
                  autoOpen={autoOpenCallbackLeadId === lead.id}
                  value={lead.next_checkpoint_at}
                  timeZone={userTimeZone}
                  onChange={(iso) => {
                    onFieldChange?.(lead.id, 'next_checkpoint_at', iso);
                    if (autoOpenCallbackLeadId === lead.id) setAutoOpenCallbackLeadId(null);
                  }}
                  placeholder="Set time"
                />
              )}
            </div>
          </td>
        );
      }
      case 'call_action': {
        const callStatusLabel = displayCallStatus(lead.call_status);
        const expected = suggestionsEnabled
          ? getCallActionForStatus(callStatusLabel, userId, currentUser)
          : null;
        const isMismatch = expected && lead.call_action !== expected;
        const isCallbackScheduled = lead.call_action === 'Callback scheduled' || callStatusLabel === 'Callback requested';

        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <CopyableCell value={lead.call_action || ''} onCopied={onCopied} variant="inline">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <EditableDropdown
                  value={lead.call_action || ''}
                  columnDef={callActionColDef}
                  onChange={(val) => {
                    onFieldChange?.(lead.id, 'call_action', val);
                    if (val === 'Callback scheduled') {
                      setAutoOpenCallbackLeadId(lead.id);
                    }
                  }}
                  onUpdateColumnDef={onUpdateColumnDef}
                  disabled={viewerFolderAccess}
                />
                {isCallbackScheduled && (
                  <DateTimePickerCell
                    compact
                    autoOpen={autoOpenCallbackLeadId === lead.id}
                    value={lead.next_checkpoint_at}
                    timeZone={userTimeZone}
                    onChange={(iso) => {
                      onFieldChange?.(lead.id, 'next_checkpoint_at', iso);
                      if (autoOpenCallbackLeadId === lead.id) setAutoOpenCallbackLeadId(null);
                    }}
                    placeholder="Set time"
                  />
                )}
                {isMismatch && (
                  <button
                    type="button"
                    className="btn-icon"
                    title={`Apply suggested: ${expected}`}
                    style={{ color: 'var(--status-warm)', padding: 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFieldChange?.(lead.id, 'call_action', expected);
                    }}
                  >
                    <Lightbulb size={14} />
                  </button>
                )}
              </div>
            </CopyableCell>
          </td>
        );
      }
      case 'script_used':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <CopyableCell value={lead.script_used || ''} onCopied={onCopied} variant="inline">
              <GroupedTemplateDropdown
                value={lead.script_used || ''}
                onChange={(val) => onFieldChange?.(lead.id, 'script_used', val)}
                templates={templates}
                kind={TEMPLATE_KINDS.CALLS}
                placeholder="None"
              />
            </CopyableCell>
          </td>
        );
      case 'next_checkpoint_at':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <DateTimePickerCell
              compact
              autoOpen={autoOpenCallbackLeadId === lead.id}
              value={lead.next_checkpoint_at || null}
              timeZone={userTimeZone}
              onChange={(iso) => {
                onFieldChange?.(lead.id, 'next_checkpoint_at', iso);
                if (autoOpenCallbackLeadId === lead.id) setAutoOpenCallbackLeadId(null);
              }}
              placeholder="—"
              disabled={viewerFolderAccess}
            />
          </td>
        );
      case 'last_called':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <DateTimePickerCell
              compact
              value={lead.last_called_at || last?.occurred_at || last?.created_at || null}
              timeZone={userTimeZone}
              onChange={(iso) => handleLastCalledChange(lead, iso)}
              placeholder="—"
              disabled={viewerFolderAccess}
            />
          </td>
        );
      case 'last_contacted_at':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <DateTimePickerCell
              compact
              value={lead.last_contacted_at || null}
              timeZone={userTimeZone}
              onChange={(iso) => onFieldChange?.(lead.id, 'last_contacted_at', iso)}
              placeholder="—"
            />
          </td>
        );
      case 'outcome': {
        const latestAttempt = attemptList[0];
        if (!latestAttempt) {
          return (
            <td {...cellProps}>
              <span style={{ color: 'var(--text-muted)' }}>—</span>
            </td>
          );
        }
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              title="Edit latest call log"
              onClick={(e) => {
                e.stopPropagation();
                setEditLatest({ attempt: latestAttempt, lead });
              }}
            >
              <OutcomeBadge outcome={latestAttempt.outcome} />
            </button>
          </td>
        );
      }
      case 'attempts':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', minWidth: 36, justifyContent: 'center' }}
              title="Manage call logs"
              onClick={(e) => {
                e.stopPropagation();
                setManageLead(lead);
              }}
            >
              {attemptList.length || '—'}
            </button>
          </td>
        );
      case 'priority':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <CopyableCell value={lead.priority || 'Warm'} onCopied={onCopied} variant="inline">
              <PriorityDropdown
                value={lead.priority || 'Warm'}
                onChange={(val) => onFieldChange?.(lead.id, 'priority', val)}
              />
            </CopyableCell>
          </td>
        );
      case 'platform':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <ReachIcons lead={lead} onRefresh={onRefresh} />
          </td>
        );
      case 'linkedin_url':
      case 'instagram_url':
      case 'twitter_url':
      case 'website':
      default:
        if (isCustom || col.column_type === 'link') {
          return (
            <td {...cellProps} onClick={(e) => e.stopPropagation()}>
              <CustomFieldCell
                lead={lead}
                col={col}
                onChange={(newValOrCustomFields) => {
                  if (isCustom) {
                    onFieldChange?.(lead.id, 'custom_fields', newValOrCustomFields);
                  } else {
                    onFieldChange?.(lead.id, col.column_key, newValOrCustomFields);
                  }
                }}
                currentUser={currentUser}
                templates={templates}
                suggestionRules={[]} 
                setColumnDefs={setColumnDefs}
                onRefresh={onRefresh}
              />
            </td>
          );
        }
        return (
          <td {...cellProps} data-ph-mask>
            <CopyableCell value={copyValue} onCopied={onCopied}>
              {lead[col.column_key] ?? '—'}
            </CopyableCell>
          </td>
        );
    }
  };

  if (sessionOpen) {
    return (
      <CallingSession
        queue={sessionQueue}
        userId={userId}
        teamId={teamId}
        profile={currentUser}
        onClose={() => setSessionOpen(false)}
        onOpenLead={(lead) => onOpenLead?.(lead, 'calls')}
        defaultCountryCode={defaultCountryCode}
        showNoteSharing={showNoteSharing}
        onLogged={handleLogged}
        timeZone={userTimeZone}
      />
    );
  }

  return (
    <div className="flex-col gap-3">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {loading ? 'Loading call data…' : `${allLeads.length} lead${allLeads.length === 1 ? '' : 's'} in this list · ${sessionQueue.length} in calling queue`}
          {!loading && (
            <span style={{ marginLeft: '0.75rem', color: 'var(--text-secondary)' }}>
              Your time: {formatLocalTime(new Date(), { timeZone: userTimeZone, showZone: true })}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {onOpenColumnManager && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenColumnManager}>
                <Gear size={14} /> Columns
              </button>
              {columnPrefs.viewDefs.filter((c) => !c.is_visible).length > 0 && (
                <button
                  type="button"
                  className="rd-dt-hidden-chip"
                  onClick={onOpenColumnManager}
                  title={`${columnPrefs.viewDefs.filter((c) => !c.is_visible).length} hidden column${columnPrefs.viewDefs.filter((c) => !c.is_visible).length === 1 ? '' : 's'}. Click to manage.`}
                >
                  <EyeOff size={12} />
                  {columnPrefs.viewDefs.filter((c) => !c.is_visible).length} hidden {columnPrefs.viewDefs.filter((c) => !c.is_visible).length === 1 ? 'column' : 'columns'}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={allLeads.length === 0 || sessionQueue.length === 0}
            onClick={() => setSessionOpen(true)}
          >
            <PhoneCall size={14} /> Start calling session
          </button>
        </div>
      </div>

      <DataTableShell
        prefs={columnPrefs}
        columns={tableCols}
        rows={leads}
        getRowKey={(lead) => lead.id}
        isRowSelected={(lead) => selectedIds.includes(lead.id)}
        getRowProps={(lead) => ({
          style: { cursor: 'pointer' },
          onClick: () => onOpenLead?.(lead, 'calls'),
        })}
        selectHeader={onSelectRow ? (
          <input
            type="checkbox"
            className="rd-checkbox"
            checked={leads.length > 0 && leads.every((l) => selectedIds.includes(l.id))}
            onChange={() => onSelectAll(leads)}
            aria-label="Select all on this page"
            disabled={viewerFolderAccess}
            style={{ cursor: 'pointer' }}
          />
        ) : null}
        renderSelectCell={onSelectRow ? (lead) => (
          <input
            type="checkbox"
            className="rd-checkbox"
            checked={selectedIds.includes(lead.id)}
            onChange={(e) => onSelectRow(lead.id, e.target.checked)}
            aria-label="Select lead"
            style={{ cursor: 'pointer' }}
          />
        ) : null}
        showRowNumbers={true}
        getRowNumber={(lead, idx) => (allLeads.length ? allLeads.findIndex((l) => l.id === lead.id) + 1 : idx + 1)}
        renderHeaderLabel={(col) => col.column_label}
        getHeaderText={(col) => col.column_label}
        getCellTitle={(lead, col) => getLeadCellCopyValue(lead, col)}
        renderCell={(lead, col, cellProps) => {
          const last = byLead.get(lead.id);
          const attemptList = scopedAttempts.filter((a) => a.lead_id === lead.id);
          return renderCellContent(col, lead, last, attemptList, cellProps);
        }}
        emptyMessage="No leads in this list."
      />

      <ManageCallAttemptsModal
        open={!!manageLead}
        lead={manageLead}
        attempts={manageLead ? scopedAttempts.filter((a) => a.lead_id === manageLead.id) : []}
        currentUser={currentUser}
        onClose={() => setManageLead(null)}
        onChanged={async () => {
          if (!userId) return;
          const data = await fetchMyCallAttempts(userId);
          setAttempts(data);
          onRefresh?.();
        }}
      />

      {editLatest && (
        <EditCallAttemptModal
          attempt={editLatest.attempt}
          isLatest={true}
          profile={currentUser}
          lead={editLatest.lead}
          onClose={() => setEditLatest(null)}
          onSaved={(updated) => {
            setEditLatest(null);
            setAttempts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
