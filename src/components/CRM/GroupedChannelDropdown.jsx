import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { softBadgeStyle, softDotStyle } from '../../lib/softBadgeStyle';
import { getChannelDefaults, channelFallbackLabel } from '../../lib/customChannels';

const PRESET_COLORS = [
  '#8B949E', '#5B8FB9', '#6B9FD4', '#E8A838', '#F97316',
  '#7FB5A0', '#4ADE80', '#E05252', '#6B7280'
];

export const channelCache = {};

export function clearChannelCache(userId = null) {
  if (userId) {
    for (const k in channelCache) {
      if (k.startsWith(`${userId}_`)) delete channelCache[k];
    }
  } else {
    for (const k in channelCache) delete channelCache[k];
  }
}

export default function GroupedChannelDropdown({
  value,
  onChange,
  isTableInline = false,
  onUpdate,
  channel = 'messaging',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState(() => getChannelDefaults(channel));
  const [userId, setUserId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 220, openUp: false });

  const [editingIndex, setEditingIndex] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const defaults = getChannelDefaults(channel);
  const fallbackLabel = channelFallbackLabel(channel);
  const leadField = 'outreach_channel';
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
      const dropdownHeight = 320;
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
      .from('custom_channels')
      .select('*')
      .eq('user_id', uid)
      .eq('type', channel)
      .order('sort_order', { ascending: true });
    return dedupeStatuses(data.map(d => ({ ...d, label: d.name })));
  };

  const dedupeAndSyncChannels = async (data, uid) => {
    if (!data || data.length === 0) return [];
    
    const seenLabels = new Set();
    const duplicateIds = [];
    const uniqueData = [];

    data.forEach(item => {
      const d = { ...item, label: item.name };
      const lowerLabel = d.label.toLowerCase();
      if (seenLabels.has(lowerLabel)) {
        duplicateIds.push(d.id);
      } else {
        seenLabels.add(lowerLabel);
        uniqueData.push(d);
      }
    });

    if (duplicateIds.length > 0) {
      await supabase.from('custom_channels').delete().in('id', duplicateIds);
    }
    
    return uniqueData;
  };

  const loadStatuses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setUserId(uid);

      const cacheKey = `${uid}_${channel}`;
      
      if (!channelCache[cacheKey]) {
        channelCache[cacheKey] = (async () => {
          let uniqueData = await fetchChannelStatuses(uid);
          
          if (uniqueData.length > 0) {
            const existingLabels = new Set(uniqueData.map(d => d.label.toLowerCase()));
            const missingDefaults = defaults.filter(d => !existingLabels.has(d.label.toLowerCase()));
            
            if (missingDefaults.length > 0) {
              const seedMissing = missingDefaults.map((d, idx) => ({
                user_id: uid,
                type: channel,
                name: d.label,
                color: d.color,
                sort_order: uniqueData.length + idx
              }));
              
              const { data: insertedData, error: insertErr } = await supabase
                .from('custom_channels')
                .upsert(seedMissing, { onConflict: 'user_id,type,lower(name)', ignoreDuplicates: true })
                .select();
                
              if (!insertErr && insertedData) {
                uniqueData = [...uniqueData, ...insertedData.map(d => ({ ...d, label: d.name }))];
              }
            }
          } else {
            const seedData = defaults.map((d, idx) => ({
              user_id: uid,
              type: channel,
              name: d.label,
              color: d.color,
              sort_order: idx
            }));
            const { data: insertedData, error: insertErr } = await supabase
              .from('custom_channels')
              .upsert(seedData, { onConflict: 'user_id,type,lower(name)', ignoreDuplicates: true })
              .select();
            
            if (!insertErr && insertedData) {
              uniqueData = insertedData.map(d => ({ ...d, label: d.name }));
            } else {
              uniqueData = defaults;
            }
          }
          return uniqueData;
        })();
      }

      try {
        const result = await channelCache[cacheKey];
        setStatuses(result);
      } catch (err) {
        delete channelCache[cacheKey];
        console.error('Error loading custom channels:', err);
        setStatuses(defaults);
      }
    } catch (err) {
      console.error('Error in loadStatuses:', err);
      setStatuses(defaults);
    }
  };

  useEffect(() => {
    let mounted = true;
    getChannelDefaults(channel); // Just calling to be sure it's defined
    loadStatuses().then(() => {
      if (!mounted) return;
    });
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
  };

  const handleAdd = async () => {
    if (!newLabel.trim() || !userId) return;
    if (statuses.some(s => s.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      alert('Channel label already exists.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('custom_channels')
        .insert({
          user_id: userId,
          type: channel,
          name: newLabel.trim(),
          color: newColor,
          sort_order: statuses.length
        })
        .select()
        .single();

      if (!error && data) {
        clearChannelCache(userId);
        setStatuses(prev => [...prev, { ...data, label: data.name }]);
        setNewLabel('');
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Error adding channel:', err);
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
      alert('Channel label already exists.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('custom_channels')
        .update({ name: newL, color: editingColor })
        .eq('id', statuses[index].id)
        .select()
        .single();

      if (!error && data) {
        clearChannelCache(userId);
        const updated = [...statuses];
        updated[index] = { ...data, label: data.name };
        setStatuses(updated);
        setEditingIndex(null);

        if (oldLabel !== newL) {
          await supabase.from('leads').update({ outreach_channel: newL }).eq('user_id', userId).eq('outreach_channel', oldLabel);
        }
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Error updating channel:', err);
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

      query.eq('outreach_channel', labelToDelete);

      const { count, error } = await query;

      const resetValue = null;
      const resetLabel = 'None';

      if (!error && count > 0) {
        if (!confirm(`Warning: ${count} lead(s) are currently assigned to "${labelToDelete}". Deleting this will reset them to "${resetLabel}". Proceed?`)) {
          return;
        }
        const updatePayload = { outreach_channel: resetValue };
        await supabase
          .from('leads')
          .update(updatePayload)
          .eq('user_id', userId)
          .eq('outreach_channel', labelToDelete);
      }

      const { error: deleteErr } = await supabase
        .from('custom_channels')
        .delete()
        .eq('id', statuses[index].id);

      if (!deleteErr) {
        clearChannelCache(userId);
        setStatuses(prev => prev.filter((_, idx) => idx !== index));
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error('Error deleting channel:', err);
    }
  };

  const handleResetToDefaults = async () => {
    if (!confirm('Are you sure you want to reset all channels to defaults? This will delete custom edits.')) return;
    try {
      const { error: delErr } = await supabase
        .from('custom_channels')
        .delete()
        .eq('user_id', userId)
        .eq('type', channel);

      if (delErr) throw delErr;

      const seedData = defaults.map((d, idx) => ({
        user_id: userId,
        type: channel,
        name: d.label,
        color: d.color,
        sort_order: idx
      }));

      const { data: insertedData, error: insertErr } = await supabase
        .from('custom_channels')
        .insert(seedData)
        .select();

      if (insertErr) throw insertErr;

      if (insertedData && insertedData.length > 0) {
        clearChannelCache(userId);
        setStatuses(insertedData.map(d => ({ ...d, label: d.name })));
      } else {
        clearChannelCache(userId);
        setStatuses(defaults);
      }
      
      if (onUpdate) onUpdate();
      setIsEditing(false);
    } catch (err) {
      console.error('Error resetting channels:', err);
      alert('Failed to reset channels: ' + err.message);
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
      className="rd-menu"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: dropdownPos.openUp ? undefined : dropdownPos.top,
        bottom: dropdownPos.openUp ? window.innerHeight - dropdownPos.top : undefined,
        left: dropdownPos.left,
        zIndex: 99999,
        width: `${dropdownPos.width}px`,
      }}
    >
      {!isEditing ? (
        <>
          <div className="rd-menu__search">
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              className="rd-menu__search-input"
              placeholder="Search channel..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="rd-menu__list">
            {filteredOptions.length === 0 ? (
              <div className="rd-menu__empty">No matching channels</div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = opt.label.toLowerCase() === displayValue.toLowerCase();
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={`rd-menu__item${isSelected ? ' rd-menu__item--active' : ''}`}
                    onClick={() => handleSelect(opt.label)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opt.color, display: 'inline-block', flexShrink: 0 }} />
                      <span className="rd-menu__item-label">{opt.label}</span>
                    </span>
                    {isSelected && <Check size={14} className="rd-select__check" />}
                  </button>
                );
              })
            )}
          </div>

          <hr className="rd-menu__sep" />

          <button
            type="button"
            className="rd-menu__footer-btn"
            onClick={() => setIsEditing(true)}
          >
            <Pencil size={12} />
            Edit Channels
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Manage Channels</span>
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
