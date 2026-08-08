import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DEFAULT_CALL_STATUSES as CALL_STATUS_DEFAULTS } from '../../lib/callOutcomeRules';
import { softBadgeStyle, softDotStyle } from '../../lib/softBadgeStyle';

const PRESET_COLORS = [
  '#8B949E', // Gray
  '#5B8FB9', // Blue
  '#6B9FD4', // Light Blue
  '#E8A838', // Yellow
  '#F97316', // Orange
  '#7FB5A0', // Greenish
  '#4ADE80', // Emerald Green
  '#E05252', // Red
  '#6B7280'  // Slate Gray
];

export const DEFAULT_STATUSES = [
  { label: 'Lead', color: '#3b82f6' },
  { label: 'Contacted', color: '#f59e0b' },
  { label: 'Positive Reply', color: '#8b5cf6' },
  { label: 'Calendly Sent', color: '#6B9FD4' },
  { label: 'Booked', color: '#ec4899' },
  { label: 'No show', color: '#ef4444' },
  { label: 'Rescheduled', color: '#a855f7' },
  { label: 'Proposal Sent', color: '#06b6d4' },
  { label: 'Followed up', color: '#10b981' },
  { label: 'Not Interested', color: '#6b7280' },
  { label: 'Closed Won', color: '#10b981' }
];

export const DEFAULT_CALL_STATUSES = CALL_STATUS_DEFAULTS;

const seedingPromises = {};

function channelDefaults(channel) {
  return channel === 'calls' ? DEFAULT_CALL_STATUSES : DEFAULT_STATUSES;
}

function channelFallbackLabel(channel) {
  return channel === 'calls' ? 'Not called' : 'Lead';
}

function channelLeadField(channel) {
  return channel === 'calls' ? 'call_status' : 'status';
}

export default function GroupedStatusDropdown({
  value,
  onChange,
  isTableInline = false,
  onUpdate,
  channel = 'messaging',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState(() => channelDefaults(channel));
  const [userId, setUserId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 220, openUp: false });

  // Edit mode inputs
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const defaults = channelDefaults(channel);
  const fallbackLabel = channelFallbackLabel(channel);
  const leadField = channelLeadField(channel);
  const seedKey = (uid) => `${uid}:${channel}`;

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) {
        setIsOpen(false);
        setIsEditing(false);
      }
    };

    // Defer so the opening click does not immediately close the panel.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const openDropdown = (e) => {
    e?.stopPropagation?.();
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 320; // max expected height
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      const width = isTableInline ? 220 : Math.max(rect.width, 220);
      setDropdownPos({
        left: Math.min(rect.left, window.innerWidth - width - 8),
        width,
        openUp,
        top: openUp ? rect.top - 4 : rect.bottom + 4
      });
    }
    setIsOpen(prev => !prev);
    setIsEditing(false);
  };

  const dedupeStatuses = (rows) => {
    const seen = new Set();
    return (rows || []).filter((d) => {
      const labelLower = d.label.toLowerCase();
      if (seen.has(labelLower)) return false;
      seen.add(labelLower);
      return true;
    });
  };

  const fetchChannelStatuses = async (uid) => {
    const { data } = await supabase
      .from('custom_statuses')
      .select('*')
      .eq('user_id', uid)
      .eq('channel', channel)
      .order('sort_order', { ascending: true });
    return dedupeStatuses(data);
  };

  // Load user session and custom statuses from Supabase
  const loadStatuses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setUserId(uid);

      const key = seedKey(uid);

      // Lock to prevent concurrent seedings
      if (seedingPromises[key]) {
        await seedingPromises[key];
        const unique = await fetchChannelStatuses(uid);
        if (unique.length > 0) setStatuses(unique);
        return;
      }

      const { data, error } = await supabase
        .from('custom_statuses')
        .select('*')
        .eq('user_id', uid)
        .eq('channel', channel)
        .order('sort_order', { ascending: true });

      if (error) {
        console.warn('Error loading custom statuses:', error);
        setStatuses(defaults);
        return;
      }

      if (data) {
        if (data.length > 0) {
          const seenLabels = new Set();
          const duplicateIds = [];
          const uniqueData = [];

          data.forEach(d => {
            const lowerLabel = d.label.toLowerCase();
            if (seenLabels.has(lowerLabel)) {
              duplicateIds.push(d.id);
            } else {
              seenLabels.add(lowerLabel);
              uniqueData.push(d);
            }
          });

          if (duplicateIds.length > 0) {
            await supabase.from('custom_statuses').delete().in('id', duplicateIds);
          }

          const existingLabels = new Set(uniqueData.map(d => d.label.toLowerCase()));
          const missingDefaults = defaults.filter(d => !existingLabels.has(d.label.toLowerCase()));
          
          if (missingDefaults.length > 0) {
            const performSeeding = async () => {
              const seedMissing = missingDefaults.map((d, idx) => ({
                user_id: uid,
                channel,
                label: d.label,
                color: d.color,
                sort_order: uniqueData.length + idx
              }));
              
              const { data: insertedData, error: insertErr } = await supabase
                .from('custom_statuses')
                .insert(seedMissing)
                .select();
                
              if (!insertErr && insertedData) {
                return [...uniqueData, ...insertedData];
              }
              return uniqueData;
            };

            seedingPromises[key] = performSeeding();
            const result = await seedingPromises[key];
            delete seedingPromises[key];
            setStatuses(result);
          } else {
            setStatuses(uniqueData);
          }
        } else {
          const performInitialSeeding = async () => {
            const seedData = defaults.map((d, idx) => ({
              user_id: uid,
              channel,
              label: d.label,
              color: d.color,
              sort_order: idx
            }));
            const { data: insertedData, error: insertErr } = await supabase
              .from('custom_statuses')
              .insert(seedData)
              .select();
            
            if (!insertErr && insertedData) {
              return insertedData;
            }
            return defaults;
          };

          seedingPromises[key] = performInitialSeeding();
          const result = await seedingPromises[key];
          delete seedingPromises[key];
          setStatuses(result);
        }
      }
    } catch (err) {
      console.error('Error loading custom statuses:', err);
      setStatuses(defaults);
    }
  };

  useEffect(() => {
    setStatuses(defaults);
    loadStatuses();
  }, [channel]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
  };

  const handleAdd = async () => {
    if (!newLabel.trim() || !userId) return;
    if (statuses.some(s => s.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      alert('Status label already exists.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('custom_statuses')
        .insert({
          user_id: userId,
          channel,
          label: newLabel.trim(),
          color: newColor,
          sort_order: statuses.length
        })
        .select()
        .single();

      if (!error && data) {
        setStatuses(prev => [...prev, data]);
        setNewLabel('');
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Error adding status:', err);
    }
  };

  const handleStartEdit = (index) => {
    setEditingIndex(index);
    setEditingLabel(statuses[index].label);
    setEditingColor(statuses[index].color);
  };

  const handleSaveEdit = async (index) => {
    if (!editingLabel.trim() || !userId) return;
    const oldLabel = statuses[index].label;
    const newL = editingLabel.trim();

    if (statuses.some((s, idx) => idx !== index && s.label.toLowerCase() === newL.toLowerCase())) {
      alert('Status label already exists.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('custom_statuses')
        .update({ label: newL, color: editingColor })
        .eq('id', statuses[index].id)
        .select()
        .single();

      if (!error && data) {
        const updated = [...statuses];
        updated[index] = data;
        setStatuses(updated);
        setEditingIndex(null);

        if (oldLabel !== newL) {
          if (channel === 'calls') {
            await supabase
              .from('leads')
              .update({ call_status: newL })
              .eq('user_id', userId)
              .eq('call_status', oldLabel);
          } else {
            await supabase
              .from('leads')
              .update({ status: newL })
              .eq('user_id', userId)
              .eq('status', oldLabel);
          }
        }
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleDelete = async (index) => {
    const labelToDelete = statuses[index].label;
    if (!userId) return;

    try {
      const query = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (channel === 'calls') {
        query.eq('call_status', labelToDelete);
      } else {
        query.eq('status', labelToDelete);
      }

      const { count, error } = await query;

      const resetValue = channel === 'calls' ? null : fallbackLabel;
      const resetLabel = channel === 'calls' ? 'Not called' : fallbackLabel;

      if (!error && count > 0) {
        if (!confirm(`Warning: ${count} lead(s) are currently in "${labelToDelete}" status. Deleting this will reassign them to "${resetLabel}". Proceed?`)) {
          return;
        }
        const updatePayload = channel === 'calls' ? { call_status: resetValue } : { status: resetValue };
        await supabase
          .from('leads')
          .update(updatePayload)
          .eq('user_id', userId)
          .eq(leadField, labelToDelete);
      }

      const { error: deleteErr } = await supabase
        .from('custom_statuses')
        .delete()
        .eq('id', statuses[index].id);

      if (!deleteErr) {
        setStatuses(prev => prev.filter((_, idx) => idx !== index));
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Error deleting status:', err);
    }
  };

  const handleResetToDefaults = async () => {
    if (!confirm('Are you sure you want to reset all statuses to defaults? This will delete custom edits.')) return;
    try {
      const { error: delErr } = await supabase
        .from('custom_statuses')
        .delete()
        .eq('user_id', userId)
        .eq('channel', channel);

      if (delErr) throw delErr;

      const seedData = defaults.map((d, idx) => ({
        user_id: userId,
        channel,
        label: d.label,
        color: d.color,
        sort_order: idx
      }));

      const { data: insertedData, error: insertErr } = await supabase
        .from('custom_statuses')
        .insert(seedData)
        .select();

      if (insertErr) throw insertErr;

      if (insertedData && insertedData.length > 0) {
        setStatuses(insertedData);
      } else {
        setStatuses(defaults);
      }
      
      if (onUpdate) onUpdate();
      setIsEditing(false);
    } catch (err) {
      console.error('Error resetting to default statuses:', err);
      alert('Failed to reset statuses: ' + err.message);
    }
  };

  const displayValue = value || fallbackLabel;
  const currentOpt = statuses.find(opt => opt.label.toLowerCase() === displayValue.toLowerCase()) || { label: displayValue, color: '#8B949E' };

  const filteredOptions = statuses.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const dropdownPanel = isOpen && createPortal(
    <div
      ref={panelRef}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: dropdownPos.openUp ? undefined : dropdownPos.top,
        bottom: dropdownPos.openUp ? window.innerHeight - dropdownPos.top : undefined,
        left: dropdownPos.left,
        zIndex: 99999,
        width: `${dropdownPos.width}px`,
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        padding: '8px'
      }}
    >
      {!isEditing ? (
        <>
          {/* Search Header */}
          <div style={{ padding: '0 8px 8px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Options List */}
          <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                No matching statuses
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = opt.label.toLowerCase() === displayValue.toLowerCase();
                return (
                  <div
                    key={opt.label}
                    onClick={() => handleSelect(opt.label)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                      color: isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      transition: 'background 0.15s ease',
                      borderRadius: '4px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opt.color, display: 'inline-block', flexShrink: 0 }} />
                    <span>{opt.label}</span>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color, #30363D)', margin: '4px 0' }} />
          
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px',
              width: '100%',
              borderRadius: '4px'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Pencil size={12} />
            Edit Statuses
          </button>
        </>
      ) : (
        /* Editable Management Mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Manage Statuses</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleResetToDefaults}
                style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
              >
                Reset
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>|</span>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
              >
                Back
              </button>
            </div>
          </div>

          {/* Editable Option List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
            {statuses.map((opt, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  gap: '4px'
                }}
              >
                {editingIndex === idx ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                    <div style={{ position: 'relative', width: '16px', height: '16px', borderRadius: '50%', background: editingColor }}>
                      <input
                        type="color"
                        value={editingColor}
                        onChange={e => setEditingColor(e.target.value)}
                        style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                      />
                    </div>
                    <input
                      type="text"
                      value={editingLabel}
                      onChange={e => setEditingLabel(e.target.value)}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        padding: '2px 4px',
                        borderRadius: '3px',
                        width: '80px'
                      }}
                    />
                    <button type="button" onClick={() => handleSaveEdit(idx)} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '2px' }}><Check size={12} /></button>
                    <button type="button" onClick={() => setEditingIndex(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><X size={12} /></button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opt.color }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{opt.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" onClick={() => handleStartEdit(idx)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}><Pencil size={11} /></button>
                      <button type="button" onClick={() => handleDelete(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={11} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add New Status */}
          <div style={{ borderTop: '1px solid var(--border-color, #30363D)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Add New</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '18px', height: '18px', borderRadius: '50%', background: newColor, border: '1px solid rgba(255,255,255,0.2)' }}>
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                />
              </div>
              <input
                type="text"
                placeholder="Label..."
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.78rem',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  flex: 1,
                  minWidth: 0
                }}
              />
              <button
                type="button"
                onClick={handleAdd}
                style={{
                  background: 'var(--accent-blue)',
                  border: 'none',
                  color: 'var(--accent-on)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Plus size={12} />
              </button>
            </div>

            {/* Preset Colors */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: newColor === c ? '1.5px solid white' : 'none',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: isTableInline ? 'auto' : '100%' }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      {isTableInline ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={openDropdown}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...softBadgeStyle(currentOpt.color),
            borderRadius: '6px',
            padding: '0.25rem 0.6rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            outline: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', ...softDotStyle(currentOpt.color), display: 'inline-block', flexShrink: 0 }} />
          {currentOpt.label}
          <ChevronDown size={12} style={{ opacity: 0.7 }} />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={openDropdown}
          onMouseDown={(e) => e.stopPropagation()}
          className="form-input"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            backgroundColor: 'var(--bg-tertiary, #161B22)',
            color: 'var(--text-primary, #F0F6FC)',
            borderColor: isOpen ? 'var(--accent-blue, #58A6FF)' : 'var(--border, #30363D)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: currentOpt.color, display: 'inline-block', flexShrink: 0 }} />
            <span>{currentOpt.label}</span>
          </div>
          <ChevronDown size={14} style={{ opacity: 0.7 }} />
        </button>
      )}

      {dropdownPanel}
    </div>
  );
}
