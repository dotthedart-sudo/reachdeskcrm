import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileText } from 'lucide-react';
import ScriptViewerPanel from './ScriptViewerPanel';
import {
  PhoneCall,
  Settings as Gear,
  Lightbulb,
  EyeOff,
  Mail,
  Phone,
  Search,
  Filter,
  Check,
  Clock,
  ChevronDown,
} from 'lucide-react';
import CopyableCell from '../CopyableCell';
import GroupedStatusDropdown from '../GroupedStatusDropdown';
import PriorityDropdown from '../PriorityDropdown';
import EditableDropdown from '../EditableDropdown';
import LocalTimeCell from '../LocalTimeCell';
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
import { formatDueText, formatLastContactedText } from '../../../lib/crmTableFormatters';
import { isLeadCallableNow } from '../../../lib/leadTimezone';
import CallingSession from './CallingSession';
import ManageCallAttemptsModal from './ManageCallAttemptsModal';
import EditCallAttemptModal from './EditCallAttemptModal';
import DataTableShell from '../DataTableShell';
import { useColumnPrefs } from '../useColumnPrefs';
import { useAppContext } from '../../../App';
import RdSelect from '../../ui/RdSelect';

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
  onOpenFilterDrawer,
  onModeChange,
  outreachMode = 'calls',
  callSubView = 'queue',
  onCallSubViewChange,
  searchQuery = '',
  onSearchChange,
  onlyGoodTimeToCall = false,
  onToggleGoodTimeToCall,
  showNoteSharing = false,
  suggestionRules = [],
  onUpdateColumnDef,
  setColumnDefs,
  templates = [],
  onQuickAddLead,
  reachMode = 'icons',
  onSetReachMode,
}) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [manageLead, setManageLead] = useState(null);
  const [editLatest, setEditLatest] = useState(null);
  const [autoOpenCallbackLeadId, setAutoOpenCallbackLeadId] = useState(null);

  const { showToast, userSnippets = [] } = useAppContext() || {};
  const [scriptView, setScriptView] = useState(null); // { leadId, scriptId }

  const columnPrefs = useColumnPrefs({
    tableView: 'call_queue',
    columnDefs,
    setColumnDefs,
    showToast,
    templates,
    leads,
  });

  const userId = currentUser?.id;
  const userTimeZone = useMemo(() => getEffectiveUserTimeZone(currentUser), [currentUser?.timezone]);
  const defaultCountryCode = currentUser?.default_country_code || null;
  const suggestionsEnabled = currentUser?.suggestions_enabled !== false;

  const tableCols = useMemo(() => {
    const cols = getTableColumns(columnDefs, 'call_queue').filter((c) => c.column_key !== '_actions');
    if (cols.length > 0) return cols;
    return CALL_QUEUE_DEFAULT_DEFS.filter((d) => d.is_visible).map((d, i) => ({ ...d, id: `default-${d.column_key}`, sort_order: i }));
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
                <span style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} data-ph-mask>{displayName}</span>
                {isCallbackDue && (
                  <span title="Callback due" aria-label="Callback due" style={{ display: 'inline-flex', color: 'var(--rd-overdue, #D97706)', flexShrink: 0 }}>
                    <CalendarClock size={13} />
                  </span>
                )}
              </div>
            </CopyableCell>
          </td>
        );
      }
      case 'phone':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <CopyableCell value={lead.phone || ''} onCopied={onCopied}>
              <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.88rem' }} data-ph-mask>
                {lead.phone || '—'}
              </span>
            </CopyableCell>
          </td>
        );
      case 'local_time':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <LocalTimeCell
              lead={lead}
              listCountry={lead.folder_default_country}
              userCountry={defaultCountryCode}
              onSaveTimezone={(id, tz) => onFieldChange?.(id, 'timezone', tz)}
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
      case 'attempts': {
        const attemptCount = attemptList.length;
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '12px',
                minWidth: 44,
                height: 24,
                padding: '0 6px',
                justifyContent: 'center',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500,
              }}
              title="Manage call logs"
              onClick={(e) => {
                e.stopPropagation();
                setManageLead(lead);
              }}
            >
              {attemptCount} / 5
            </button>
          </td>
        );
      }
      case 'next_checkpoint_at': {
        const nextTime = lead.next_checkpoint_at;
        const dueInfo = formatDueText(nextTime, lead.call_action);
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <DateTimePickerCell
              compact
              mode="future"
              autoOpen={autoOpenCallbackLeadId === lead.id && !tableCols.some((c) => c.column_key === 'call_action')}
              value={nextTime || null}
              timeZone={userTimeZone}
              customLabel={dueInfo?.text}
              isOverdue={dueInfo?.isOverdue}
              isPlaceholder={dueInfo?.isPlaceholder}
              onChange={(iso) => {
                onFieldChange?.(lead.id, 'next_checkpoint_at', iso);
                if (autoOpenCallbackLeadId === lead.id) setAutoOpenCallbackLeadId(null);
              }}
              placeholder="—"
              disabled={viewerFolderAccess}
            />
          </td>
        );
      }
      case 'platform':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <ReachIcons lead={lead} columnDefs={columnDefs} reachMode={reachMode} />
          </td>
        );
      case 'outreach_channel':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <GroupedChannelDropdown
              userId={userId}
              value={lead.outreach_channel}
              onChange={(val) => onFieldChange?.(lead.id, 'outreach_channel', val)}
              isTableInline={true}
              onUpdate={onRefresh}
              channel="messaging"
            />
          </td>
        );
      case 'status': {
        const isCallbackReq = displayCallStatus(lead.call_status) === 'Callback requested'
          && !tableCols.some((c) => c.column_key === 'call_action');
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', width: '100%' }}>
              <GroupedStatusDropdown
                channel="calls"
                value={displayCallStatus(lead.call_status)}
                onChange={(val) => handleCallStatusChange(lead.id, val)}
                isTableInline
                onUpdate={onRefresh}
                disabled={viewerFolderAccess}
              />
              {isCallbackReq && (
                <DateTimePickerCell
                  iconOnly
                  mode="future"
                  autoOpen={autoOpenCallbackLeadId === lead.id}
                  value={lead.next_checkpoint_at}
                  timeZone={userTimeZone}
                  isOverdue={!!lead.next_checkpoint_at && new Date(lead.next_checkpoint_at) <= new Date()}
                  onChange={(iso) => {
                    onFieldChange?.(lead.id, 'next_checkpoint_at', iso);
                    if (autoOpenCallbackLeadId === lead.id) setAutoOpenCallbackLeadId(null);
                  }}
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
                  iconOnly
                  mode="future"
                  autoOpen={autoOpenCallbackLeadId === lead.id}
                  value={lead.next_checkpoint_at}
                  timeZone={userTimeZone}
                  isOverdue={!!lead.next_checkpoint_at && new Date(lead.next_checkpoint_at) <= new Date()}
                  onChange={(iso) => {
                    onFieldChange?.(lead.id, 'next_checkpoint_at', iso);
                    if (autoOpenCallbackLeadId === lead.id) setAutoOpenCallbackLeadId(null);
                  }}
                />
              )}
              {isMismatch && (
                <button
                  type="button"
                  className="btn-icon"
                  title={`Apply suggested: ${expected}`}
                  style={{ color: '#FBBF24', padding: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFieldChange?.(lead.id, 'call_action', expected);
                  }}
                >
                  <Lightbulb size={14} />
                </button>
              )}
            </div>
          </td>
        );
      }
      case 'script_used': {
        const isOpen = scriptView?.leadId === lead.id;
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <GroupedTemplateDropdown
                  value={lead.script_used || ''}
                  onChange={(val) => {
                    onFieldChange?.(lead.id, 'script_used', val);
                    if (val) setScriptView({ leadId: lead.id, scriptId: val });
                  }}
                  templates={templates}
                  kind={TEMPLATE_KINDS.CALLS}
                  placeholder="None"
                  isTableInline={true}
                />
              </div>
              {lead.script_used && (
                <button
                  type="button"
                  className="rd-script-open-btn"
                  title="Open script for this lead"
                  aria-label="Open script for this lead"
                  aria-pressed={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setScriptView(isOpen ? null : { leadId: lead.id, scriptId: lead.script_used });
                  }}
                >
                  <FileText size={14} />
                </button>
              )}
            </div>
          </td>
        );
      }
      case 'last_called':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <DateTimePickerCell
              compact
              mode="past"
              value={lead.last_called_at || last?.occurred_at || last?.created_at || null}
              timeZone={userTimeZone}
              onChange={(iso) => handleLastCalledChange(lead, iso)}
              placeholder="—"
              disabled={viewerFolderAccess}
            />
          </td>
        );
      case 'last_contacted_at': {
        // Most recent touch: a logged call or a manual "last contacted".
        const touches = [lead.last_contacted_at, lead.last_called_at, last?.occurred_at || last?.created_at]
          .filter(Boolean)
          .map((v) => new Date(v))
          .filter((d) => !isNaN(d));
        const latest = touches.length ? new Date(Math.max(...touches)).toISOString() : null;
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <DateTimePickerCell
              compact
              mode="past"
              value={latest}
              customLabel={latest ? formatLastContactedText(latest) : undefined}
              timeZone={userTimeZone}
              onChange={(iso) => onFieldChange?.(lead.id, 'last_contacted_at', iso)}
              placeholder="—"
              disabled={viewerFolderAccess}
            />
          </td>
        );
      }
      case 'priority':
        return (
          <td {...cellProps} onClick={(e) => e.stopPropagation()}>
            <PriorityDropdown
              value={lead.priority || 'Warm'}
              onChange={(val) => onFieldChange?.(lead.id, 'priority', val)}
            />
          </td>
        );
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

  // Calculate total columns for quick-add row span
  const totalCols = tableCols.length + 1 + 1; // select + rownum + tableCols

  return (
    <div className="flex-col" style={{ gap: 12 }}>
      {/* ── Cold Calls Toolbar ── */}
      <div
        className="crm-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          margin: '0 0 12px 0',
        }}
      >
        {/* Left: Search, Status, Filters, Sort, [Queue | Call log], Good time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', width: 220, minWidth: 160 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search leads"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 30, height: 32, fontSize: 13, borderRadius: 6, width: '100%' }}
            />
          </div>

          <RdSelect
            value=""
            onChange={() => {}}
            options={[
              { value: '', label: 'Status: All' },
              { value: 'Callback requested', label: 'Callback requested' },
              { value: 'No answer', label: 'No answer' },
              { value: 'Voicemail left', label: 'Voicemail left' },
              { value: 'Answered', label: 'Answered' },
              { value: 'Not called', label: 'Not called' },
              { value: 'Not interested', label: 'Not interested' },
              { value: 'Busy', label: 'Busy' },
              { value: 'Closed won', label: 'Closed won' },
            ]}
            placeholder="Status: All"
            size="sm"
          />

          {onOpenFilterDrawer && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenFilterDrawer}
              style={{ height: 32, fontSize: 13, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Filter size={13} />
              Filters
            </button>
          )}

          {/* Sort Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 32,
                fontSize: 13,
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Sort: Due first
              <ChevronDown size={13} />
            </button>
          </div>

          {onCallSubViewChange && (
            <div
              className="rd-segmented"
              style={{
                display: 'inline-flex',
                padding: 2,
                borderRadius: 6,
              }}
            >
              <button
                type="button"
                onClick={() => onCallSubViewChange('queue')}
                className={`rd-segmented__btn${callSubView === 'queue' ? ' rd-segmented__btn--active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Queue
              </button>
              <button
                type="button"
                onClick={() => onCallSubViewChange('log')}
                className={`rd-segmented__btn${callSubView === 'log' ? ' rd-segmented__btn--active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Call log
              </button>
            </div>
          )}

          <button
            type="button"
            className={`btn btn-sm ${onlyGoodTimeToCall ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onToggleGoodTimeToCall}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              fontSize: 12,
              borderRadius: 6,
              borderColor: onlyGoodTimeToCall ? 'transparent' : 'var(--border)',
            }}
            title="Show only leads where local time is between 9 AM and 6 PM"
          >
            Good time to call now
          </button>
        </div>

        {/* Right: Columns, More, Start calling */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onOpenColumnManager && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenColumnManager}
              style={{ height: 32, fontSize: 13, borderRadius: 6 }}
            >
              Columns
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ height: 32, fontSize: 13, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            More <ChevronDown size={13} />
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={allLeads.length === 0 || sessionQueue.length === 0}
            onClick={() => setSessionOpen(true)}
            style={{ height: 32, fontSize: 13, fontWeight: 500, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            Start calling
          </button>
        </div>
      </div>

      {/* ── Table Shell ── */}
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
        selectHeader={
          onSelectRow ? (
            <input
              type="checkbox"
              className="rd-checkbox"
              checked={leads.length > 0 && leads.every((l) => selectedIds.includes(l.id))}
              onChange={() => onSelectAll(leads)}
              aria-label="Select all on this page"
              disabled={viewerFolderAccess}
              style={{ cursor: 'pointer' }}
            />
          ) : null
        }
        renderSelectCell={
          onSelectRow
            ? (lead) => (
                <input
                  type="checkbox"
                  className="rd-checkbox"
                  checked={selectedIds.includes(lead.id)}
                  onChange={(e) => onSelectRow(lead.id, e.target.checked)}
                  aria-label="Select lead"
                  style={{ cursor: 'pointer' }}
                />
              )
            : null
        }
        showRowNumbers={false}
        getRowNumber={(lead, idx) => (allLeads.length ? allLeads.findIndex((l) => l.id === lead.id) + 1 : idx + 1)}
        renderHeaderLabel={(col) => col.column_label}
        getHeaderText={(col) => col.column_label}
        getCellTitle={(lead, col) => getLeadCellCopyValue(lead, col)}
        renderCell={(lead, col, cellProps) => {
          const last = byLead.get(lead.id);
          const attemptList = scopedAttempts.filter((a) => a.lead_id === lead.id);
          return renderCellContent(col, lead, last, attemptList, cellProps);
        }}
        reachMode={reachMode}
        onSetReachMode={onSetReachMode}
        emptyMessage="No leads in this calling queue."
      />
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8, paddingLeft: 4 }}>
        {leads.length} of {allLeads.length || leads.length} leads
      </div>

      <ScriptViewerPanel
        open={!!scriptView}
        script={scriptView ? templates.find((t) => t.id === scriptView.scriptId) : null}
        lead={scriptView ? (allLeads.find((l) => l.id === scriptView.leadId) || leads.find((l) => l.id === scriptView.leadId)) : null}
        snippets={userSnippets}
        columnDefs={columnDefs}
        onClose={() => setScriptView(null)}
        onCopied={(msg) => (onCopied ? onCopied(msg) : showToast?.(msg))}
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
