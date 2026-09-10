import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Upload, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  leadDisplayName,
  buildOutreachSessionQueue,
  leadsNeverCalled,
  isLeadCallableNow,
} from '../../lib/outreachQueue';
import CallWindowBadge from '../CRM/CallWindowBadge';
import { getLeadLocalTimeLabel } from '../../lib/leadTimezone';

const SOURCES = [
  { id: 'search', label: 'Search' },
  { id: 'queue', label: 'Outreach queue' },
  { id: 'never', label: 'Never called' },
  { id: 'folder', label: 'Folder' },
];

export default function PlanColdCallsModal({
  open,
  onClose,
  plannedDate,
  userId,
  leads = [],
  attempts = [],
  folders = [],
  existingLeadIds = [],
  defaultCountryCode = '+92',
  userTimeZone = null,
  onPlanned,
}) {
  const navigate = useNavigate();
  const [source, setSource] = useState('search');
  const [search, setSearch] = useState('');
  const [folderId, setFolderId] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [callableOnly, setCallableOnly] = useState(false);
  const [taskType, setTaskType] = useState('call');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existingSet = useMemo(() => new Set(existingLeadIds), [existingLeadIds]);

  const pool = useMemo(() => {
    if (source === 'queue') return buildOutreachSessionQueue(leads, attempts, userTimeZone);
    if (source === 'never') return leadsNeverCalled(leads, attempts);
    if (source === 'folder' && folderId) {
      return leads.filter((l) => l.folder_id === folderId);
    }
    const q = search.trim().toLowerCase();
    if (!q) return leads.slice(0, 100);
    return leads.filter((l) => {
      const hay = [
        l.first_name, l.last_name, l.email, l.phone, l.company,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 100);
  }, [source, search, folderId, leads, attempts, userTimeZone]);

  const available = useMemo(() => {
    let list = pool.filter((l) => !existingSet.has(l.id));
    if (callableOnly) {
      list = list.filter((l) => isLeadCallableNow(l, new Date(), { defaultCountryCode }));
    }
    return list;
  }, [pool, existingSet, callableOnly, defaultCountryCode]);

  if (!open) return null;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(available.map((l) => l.id)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError('Select at least one lead.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const rows = Array.from(selected).map((leadId) => ({
        user_id: userId,
        lead_id: leadId,
        planned_date: plannedDate,
        planned_at: new Date(`${plannedDate}T12:00:00`).toISOString(),
        task_type: taskType,
        status: 'pending',
      }));
      const { error: insertErr } = await supabase
        .from('planned_outreach_tasks')
        .insert(rows);
      if (insertErr) throw insertErr;
      onPlanned?.();
      onClose();
    } catch (err) {
      console.error('[PlanColdCalls]', err);
      setError(err.message || 'Failed to plan calls.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(520px, 94vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '1.25rem', background: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={18} /> Plan outreach
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {new Date(plannedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {[
            { id: 'call', label: 'Calls' },
            { id: 'email', label: 'Emails' },
            { id: 'follow_up', label: 'Follow-ups' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTaskType(opt.id)}
              className={taskType === opt.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setSource(s.id); setSelected(new Set()); }}
              className={source === s.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {s.label}
            </button>
          ))}
        </div>

        {source === 'search' && (
          <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Search leads by name, email, phone, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {source === 'folder' && (
          <select
            className="form-input"
            style={{ marginBottom: '0.75rem' }}
            value={folderId}
            onChange={(e) => { setFolderId(e.target.value); setSelected(new Set()); }}
          >
            <option value="">Select folder…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <ToggleSwitch
            checked={callableOnly}
            onChange={(checked) => { setCallableOnly(checked); setSelected(new Set()); }}
          />
          <span style={{ fontSize: '0.85rem' }}>
            Callable now (9am–6pm in lead&apos;s timezone, Mon–Fri)
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {available.length} available · {selected.size} selected
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={selectAll} disabled={available.length === 0}>
              Select all
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/leads?import=csv')}
            >
              <Upload size={12} /> Import CSV
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, marginBottom: '0.75rem' }}>
          {available.length === 0 ? (
            <p style={{ padding: '1rem', margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {callableOnly
                ? 'No callable leads right now — try turning off the filter or set timezones in CRM.'
                : source === 'folder' && !folderId
                  ? 'Pick a folder to see leads.'
                  : 'No leads match — try another source or import from CRM.'}
            </p>
          ) : (
            available.map((lead) => {
              const localTime = getLeadLocalTimeLabel(lead, new Date(), defaultCountryCode);
              return (
                <label
                  key={lead.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.6rem 0.75rem',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggle(lead.id)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{leadDisplayName(lead)}</div>
                      <CallWindowBadge lead={lead} defaultCountryCode={defaultCountryCode} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {[lead.company, lead.phone, lead.email].filter(Boolean).join(' · ')}
                    </div>
                    {localTime && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Their time: {localTime}
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        {error && <div style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving || selected.size === 0} onClick={handleSubmit}>
            {saving ? 'Adding…' : `Add ${selected.size || ''} to plan`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
