import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart2, Lock, Download, ChevronDown, Folder, Check, Calendar, Users, User, Mail, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../App';
import { getTeamIds, getEffectivePlan } from '../lib/utils';
import { isTeamOwner } from '../lib/teamWorkspace';
import { fetchSharesForUser } from '../lib/folderShares';
import { BRAND_NAME } from '../config/brand';
import { exportElementToPdf } from '../utils/exportReportsPdf';
import {
  MESSAGE_PIPELINE_STAGES,
  CALL_PIPELINE_STAGES,
  cumulativeMessageFromCurrent,
  cumulativeCallFromCurrent,
  computeStageConversionRatesForStages,
  getMessageStageDisplayLabel,
} from '../lib/dashboardMetrics';
import { fetchLeadPipelineStats, emptyPipelineStats } from '../lib/leadsQuery';
import { usePageHeader } from '../context/PageHeaderContext';
import SegmentedControl from './ui/SegmentedControl';
import ReportsFunnel from './Reports/ReportsFunnel';
import './Reports/Reports.css';

const UNFILED_ID = 'unfiled';
const DATE_PRESETS = [
  { id: 'all', label: 'All time' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'custom', label: 'Custom' },
];

function startOfLocalDay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfLocalDay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = startOfLocalDay(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ListFilterDropdown({ folders, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const allSelected = selectedIds.length === 0;
  const label = (() => {
    if (allSelected) return 'All leads';
    if (selectedIds.length === 1) {
      if (selectedIds[0] === UNFILED_ID) return 'Unfiled';
      return folders.find((f) => f.id === selectedIds[0])?.name || '1 list';
    }
    return `${selectedIds.length} lists`;
  })();

  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div ref={rootRef} className="reports-list-filter" style={{ position: 'relative', minWidth: 180 }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', justifyContent: 'space-between', gap: '0.5rem' }}
        aria-expanded={open}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
          <Folder size={14} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          role="listbox"
          className="reports-list-filter__menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { onChange([]); setOpen(false); }}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              background: allSelected ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              marginBottom: '0.25rem',
            }}
          >
            <Check size={14} style={{ opacity: allSelected ? 1 : 0 }} />
            All leads
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => toggle(UNFILED_ID)}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              background: selectedIds.includes(UNFILED_ID) ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
            }}
          >
            <Check size={14} style={{ opacity: selectedIds.includes(UNFILED_ID) ? 1 : 0 }} />
            Unfiled
          </button>
          {folders.length > 0 && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0.5rem 0.5rem 0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Lists
            </div>
          )}
          {folders.map((f) => {
            const active = selectedIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                className="btn btn-sm"
                onClick={() => toggle(f.id)}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                }}
              >
                <Check size={14} style={{ opacity: active ? 1 : 0, color: f.color || undefined }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Reports({ currentUser }) {
  const navigate = useNavigate();
  const { reportsUnlocked } = useAppContext() || {};
  const allowed = !!reportsUnlocked;
  const exportRef = useRef(null);

  const plan = getEffectivePlan(currentUser);
  const canUseTeamScope = plan === 'teams' && isTeamOwner(currentUser);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [folders, setFolders] = useState([]);
  const [sharedFolderIds, setSharedFolderIds] = useState([]);
  const [teamIds, setTeamIds] = useState([]);
  const [pipelineStats, setPipelineStats] = useState(emptyPipelineStats);
  const [selectedListIds, setSelectedListIds] = useState([]);
  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [reportScope, setReportScope] = useState('team');
  const [countMode, setCountMode] = useState('cumulative'); // 'cumulative' | 'current'

  useEffect(() => {
    if (canUseTeamScope && reportScope === 'team') return;
    setSelectedListIds((ids) =>
      ids.filter((id) => id === UNFILED_ID || folders.some((f) => f.id === id && f.user_id === currentUser?.id)),
    );
  }, [reportScope, canUseTeamScope, folders, currentUser?.id]);

  // Load folders + team scope once
  useEffect(() => {
    if (!currentUser?.id || !allowed) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadMeta() {
      try {
        const ids = await getTeamIds(currentUser.id);
        const owner = isTeamOwner(currentUser);
        const shares = owner ? [] : await fetchSharesForUser(currentUser.id);
        const sharedIds = shares.map((s) => s.folder_id).filter(Boolean);

        const foldersPromise = owner
          ? supabase.from('folders').select('id, name, color, user_id, sort_order').in('user_id', ids).order('sort_order', { ascending: true })
          : (async () => {
            const [ownRes, sharedRes] = await Promise.all([
              supabase.from('folders').select('id, name, color, user_id, sort_order').eq('user_id', currentUser.id).order('sort_order', { ascending: true }),
              sharedIds.length
                ? supabase.from('folders').select('id, name, color, user_id, sort_order').in('id', sharedIds).order('sort_order', { ascending: true })
                : Promise.resolve({ data: [] }),
            ]);
            const byId = new Map();
            [...(ownRes.data || []), ...(sharedRes.data || [])].forEach((f) => byId.set(f.id, f));
            return { data: [...byId.values()] };
          })();

        const foldersRes = await foldersPromise;
        if (foldersRes.error) throw foldersRes.error;
        if (cancelled) return;

        setTeamIds(ids);
        setSharedFolderIds(sharedIds);
        setFolders(foldersRes.data || []);
      } catch (err) {
        console.error('[Reports] Failed to load folders:', err);
        if (!cancelled) setLoading(false);
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.team_id, currentUser?.team_role, allowed]);

  const visibleFolders = useMemo(() => {
    if (canUseTeamScope && reportScope === 'team') return folders;
    return folders.filter((f) => f.user_id === currentUser?.id);
  }, [folders, canUseTeamScope, reportScope, currentUser?.id]);

  const dateBounds = useMemo(() => {
    const now = new Date();
    if (datePreset === '7d') {
      return { from: new Date(now.getTime() - 7 * 86400000), to: now };
    }
    if (datePreset === '30d') {
      return { from: new Date(now.getTime() - 30 * 86400000), to: now };
    }
    if (datePreset === '90d') {
      return { from: new Date(now.getTime() - 90 * 86400000), to: now };
    }
    if (datePreset === 'custom') {
      return {
        from: startOfLocalDay(customFrom),
        to: endOfLocalDay(customTo),
      };
    }
    return { from: null, to: null };
  }, [datePreset, customFrom, customTo]);

  // Exact pipeline stats via RPC whenever filters change (no max-rows cap)
  useEffect(() => {
    if (!currentUser?.id || !allowed) {
      setLoading(false);
      return;
    }
    if (!teamIds.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      try {
        const useTeam = canUseTeamScope && reportScope === 'team';
        const applyFolderFilter = selectedListIds.length > 0;
        const includeUnfiled = selectedListIds.includes(UNFILED_ID);
        const selectedFolderIds = selectedListIds.filter((id) => id !== UNFILED_ID);

        const stats = await fetchLeadPipelineStats({
          userIds: useTeam ? teamIds : [currentUser.id],
          sharedFolderIds: useTeam ? sharedFolderIds : sharedFolderIds,
          applyFolderFilter,
          selectedFolderIds,
          includeUnfiled,
          createdFrom: dateBounds.from ? dateBounds.from.toISOString() : null,
          createdTo: dateBounds.to ? dateBounds.to.toISOString() : null,
          ownerUserId: useTeam ? null : currentUser.id,
        });

        if (!cancelled) setPipelineStats(stats);
      } catch (err) {
        console.error('[Reports] Failed to load pipeline stats:', err);
        if (!cancelled) setPipelineStats(emptyPipelineStats());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [
    currentUser?.id,
    allowed,
    teamIds,
    sharedFolderIds,
    canUseTeamScope,
    reportScope,
    selectedListIds,
    dateBounds,
  ]);

  const messageCounts = useMemo(() => {
    const current = pipelineStats.message_current || {};
    if (countMode === 'current') return current;
    return cumulativeMessageFromCurrent(current);
  }, [pipelineStats, countMode]);

  const callStageIds = useMemo(() => CALL_PIPELINE_STAGES.map((s) => s.id), []);

  const callCounts = useMemo(() => {
    const current = pipelineStats.call_current || {};
    if (countMode === 'current') return current;
    return cumulativeCallFromCurrent(current);
  }, [pipelineStats, countMode]);

  const messageConversionRates = useMemo(
    () => computeStageConversionRatesForStages(MESSAGE_PIPELINE_STAGES, messageCounts),
    [messageCounts],
  );

  const callConversionRates = useMemo(
    () => computeStageConversionRatesForStages(callStageIds, callCounts),
    [callStageIds, callCounts],
  );

  const getCallStageLabel = (id) => CALL_PIPELINE_STAGES.find((s) => s.id === id)?.label || id;
  const totalLeads = pipelineStats.total || 0;

  const scopeSummary = useMemo(() => {
    if (canUseTeamScope && reportScope === 'team') return 'Whole team';
    return 'My leads';
  }, [canUseTeamScope, reportScope]);

  const listFilterSummary = useMemo(() => {
    if (selectedListIds.length === 0) return 'All leads';
    const names = selectedListIds.map((id) => {
      if (id === UNFILED_ID) return 'Unfiled';
      return visibleFolders.find((f) => f.id === id)?.name || 'List';
    });
    return names.join(', ');
  }, [selectedListIds, visibleFolders]);

  const dateFilterSummary = useMemo(() => {
    if (datePreset === 'all') return 'All time';
    if (datePreset === '7d') return 'Last 7 days';
    if (datePreset === '30d') return 'Last 30 days';
    if (datePreset === '90d') return 'Last 90 days';
    if (datePreset === 'custom') {
      if (customFrom && customTo) return `${formatShortDate(customFrom)} – ${formatShortDate(customTo)}`;
      if (customFrom) return `From ${formatShortDate(customFrom)}`;
      if (customTo) return `Through ${formatShortDate(customTo)}`;
      return 'Custom range';
    }
    return 'All time';
  }, [datePreset, customFrom, customTo]);

  const handleExportPdf = async () => {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportElementToPdf(exportRef.current, {
        filename: `reachdesk-pipeline-report-${stamp}.pdf`,
      });
    } catch (err) {
      console.error('[Reports] PDF export failed:', err);
      alert('Could not export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const headerActions = useMemo(() => (
    allowed ? (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={handleExportPdf}
        disabled={exporting || loading || totalLeads === 0}
      >
        <Download size={14} />
        {exporting ? 'Exporting…' : 'Export PDF'}
      </button>
    ) : null
  ), [allowed, exporting, loading, totalLeads]);

  usePageHeader({ title: 'Reports', actions: headerActions });

  if (!allowed) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 320,
          gap: '1rem',
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--text-muted)',
        }}
      >
        <Lock size={32} />
        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Reports are on Trial, Pro, and Teams</h3>
        <p style={{ margin: 0, maxWidth: 420 }}>
          See how many leads reached each pipeline stage — cumulative counts that stay accurate even when deals move forward.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/upgrade')}>
          Upgrade to Pro
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="loading-container">Loading reports...</div>;
  }

  const generatedLabel = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="reports-page flex-col gap-4">
      {canUseTeamScope && (
        <SegmentedControl
          ariaLabel="Report scope"
          value={reportScope}
          onChange={setReportScope}
          options={[
            { value: 'team', label: 'Whole team', icon: <Users size={14} /> },
            { value: 'mine', label: 'My leads', icon: <User size={14} /> },
          ]}
        />
      )}

      <div className="reports-filters">
        <div className="reports-filters__group">
          <span className="reports-filters__label">Lists</span>
          <ListFilterDropdown
            folders={visibleFolders}
            selectedIds={selectedListIds}
            onChange={setSelectedListIds}
          />
        </div>

        <div className="reports-filters__group">
          <span className="reports-filters__label">Entered pipeline</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${datePreset === p.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDatePreset(p.id)}
              >
                {p.id === 'custom' ? <Calendar size={12} style={{ marginRight: 4 }} /> : null}
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {datePreset === 'custom' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="reports-filters__group">
              <label htmlFor="reports-from" className="reports-filters__label">From</label>
              <input
                id="reports-from"
                type="date"
                className="form-input"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ minWidth: 140 }}
              />
            </div>
            <div className="reports-filters__group">
              <label htmlFor="reports-to" className="reports-filters__label">To</label>
              <input
                id="reports-to"
                type="date"
                className="form-input"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ minWidth: 140 }}
              />
            </div>
          </div>
        )}
      </div>

      <div
        ref={exportRef}
        className="card reports-export-root reports-export-root--pdf"
      >
        <div className="reports-export-header">
          <div className="reports-export-brand">
            <img src="/logo.png" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
            <div>
              <div className="reports-export-brand__name">{BRAND_NAME}</div>
              <div className="reports-export-brand__type">Pipeline Report</div>
            </div>
          </div>
          <div className="reports-export-meta">
            <div>Generated {generatedLabel}</div>
            <div>Scope: {scopeSummary}</div>
            <div>Lists: {listFilterSummary}</div>
            <div>Entered: {dateFilterSummary}</div>
            <div>Counting: {countMode === 'cumulative' ? 'Cumulative reach' : 'Current status'}</div>
          </div>
        </div>

        {totalLeads === 0 ? (
          <div className="reports-empty">
            <p>
              {selectedListIds.length > 0 || datePreset !== 'all' || reportScope === 'mine'
                ? 'No leads match the selected scope, lists, and date range.'
                : 'Add leads in the CRM to see pipeline reports here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="reports-count-mode" role="group" aria-label="Pipeline count mode">
              <button
                type="button"
                className={`reports-scope__btn ${countMode === 'cumulative' ? 'reports-scope__btn--active' : ''}`}
                onClick={() => setCountMode('cumulative')}
              >
                Cumulative
              </button>
              <button
                type="button"
                className={`reports-scope__btn ${countMode === 'current' ? 'reports-scope__btn--active' : ''}`}
                onClick={() => setCountMode('current')}
              >
                Current status
              </button>
            </div>

            <div className="reports-pipelines">
              <section className="reports-pipeline-section">
                <h3 className="reports-pipeline-section__title">
                  <Mail size={16} />
                  Messages pipeline
                </h3>
                <p className="reports-pipeline-section__desc">
                  Email / LinkedIn stages by message status.
                </p>
                <div className="reports-metrics">
                  {MESSAGE_PIPELINE_STAGES.map((stage) => {
                    const count = messageCounts[stage] ?? 0;
                    const isContacts = stage === 'Lead';
                    const pctOfTotal = !isContacts && totalLeads > 0
                      ? Math.round((count / totalLeads) * 100)
                      : null;

                    return (
                      <div key={stage} className="reports-metric">
                        <div className="reports-metric__label">{getMessageStageDisplayLabel(stage)}</div>
                        <div className="reports-metric__value">{count}</div>
                        {pctOfTotal != null && (
                          <div className="reports-metric__context">
                            {pctOfTotal}% of filtered leads
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <ReportsFunnel
                  stages={MESSAGE_PIPELINE_STAGES}
                  counts={messageCounts}
                  conversionRates={messageConversionRates}
                  totalLeads={totalLeads}
                  getStageLabel={getMessageStageDisplayLabel}
                />
              </section>

              <section className="reports-pipeline-section">
                <h3 className="reports-pipeline-section__title">
                  <Phone size={16} />
                  Calls pipeline
                </h3>
                <p className="reports-pipeline-section__desc">
                  Call queue stages by call status — Not called → Attempted → Connected → Callback → Closed.
                </p>
                <div className="reports-metrics">
                  {callStageIds.map((stageId) => {
                    const count = callCounts[stageId] ?? 0;
                    const pctOfTotal = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : null;

                    return (
                      <div key={stageId} className="reports-metric">
                        <div className="reports-metric__label">{getCallStageLabel(stageId)}</div>
                        <div className="reports-metric__value">{count}</div>
                        {stageId !== 'not_called' && pctOfTotal != null && (
                          <div className="reports-metric__context">
                            {pctOfTotal}% of filtered leads
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <ReportsFunnel
                  stages={callStageIds}
                  counts={callCounts}
                  conversionRates={callConversionRates}
                  totalLeads={totalLeads}
                  getStageLabel={getCallStageLabel}
                />
              </section>
            </div>
          </>
        )}

        <div className="reports-export-footer">
          <span>
            {countMode === 'cumulative' ? 'Cumulative reach' : 'Current status'}
            {' · '}
            Active leads only
          </span>
          <span>{BRAND_NAME}</span>
        </div>
      </div>
    </div>
  );
}
