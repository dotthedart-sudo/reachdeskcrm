import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Flame, Sun, Snowflake, ChevronDown, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { softBadgeStyle, softDotStyle } from '../../lib/softBadgeStyle';

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f59e0b', // Amber/Yellow
  '#10b981', // Emerald/Green
  '#3b82f6', // Blue
  '#8b5cf6', // Violet/Purple
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#6b7280'  // Slate/Gray
];

const DEFAULT_PRIORITIES = [
  { label: 'Hot', color: '#ef4444' },
  { label: 'Warm', color: '#f59e0b' },
  { label: 'Cold', color: '#3b82f6' }
];

const stripEmojis = (str) => {
  if (!str) return '';
  return str.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|🔥|⚡|📦|🧊/g, '').trim();
};

export default function PriorityDropdown({ value, onChange, onUpdate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [priorities, setPriorities] = useState(DEFAULT_PRIORITIES);
  const [columnDefId, setColumnDefId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 220, openUp: false });

  // Edit mode inputs
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      const isInsideTrigger = triggerRef.current && triggerRef.current.contains(e.target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!isInsideTrigger && !isInsideDropdown) {
        setIsOpen(false);
        setIsEditing(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openDropdown = (e) => {
    if (e) e.stopPropagation();
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      const width = Math.max(rect.width, 220);
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

  // Fetch current user and column definition for priorities
  useEffect(() => {
    async function loadPriorities() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const uid = session.user.id;
        setUserId(uid);

        const { data, error } = await supabase
          .from('column_definitions')
          .select('*')
          .eq('user_id', uid)
          .eq('column_key', 'priority');

        if (!error && data && data.length > 0) {
          // Find the one that has dropdown options or use the first one
          const targetDef = data.find(d => d.dropdown_options && d.dropdown_options.length > 0) || data[0];
          setColumnDefId(targetDef.id);
          
          if (targetDef.dropdown_options && targetDef.dropdown_options.length > 0) {
            const strippedOptions = targetDef.dropdown_options.map(opt => ({
              ...opt,
              label: stripEmojis(opt.label)
            }));
            setPriorities(strippedOptions);
          }

          // Asynchronously migrate emojis for all found definitions
          for (const row of data) {
            if (row.dropdown_options && row.dropdown_options.length > 0) {
              let hasEmojis = false;
              const cleanOpts = row.dropdown_options.map(opt => {
                if (opt.label && /🔥|⚡|📦|🧊/.test(opt.label)) {
                  hasEmojis = true;
                }
                return {
                  ...opt,
                  label: stripEmojis(opt.label)
                };
              });
              if (hasEmojis) {
                supabase
                  .from('column_definitions')
                  .update({ dropdown_options: cleanOpts })
                  .eq('id', row.id)
                  .then(({ error: upErr }) => {
                    if (upErr) console.error('Failed to clean emojis from column definitions:', upErr);
                  });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading priorities:', err);
      }
    }
    loadPriorities();
  }, []);

  const savePrioritiesToDb = async (updatedList) => {
    if (!userId) return;
    try {
      if (columnDefId) {
        await supabase
          .from('column_definitions')
          .update({ dropdown_options: updatedList })
          .eq('id', columnDefId);
      } else {
        // Create it if it doesn't exist
        const { data, error } = await supabase
          .from('column_definitions')
          .insert({
            user_id: userId,
            table_view: 'pipeline',
            column_key: 'priority',
            column_label: 'Priority',
            column_type: 'dropdown',
            is_visible: true,
            is_default: true,
            sort_order: 1,
            dropdown_options: updatedList
          })
          .select()
          .single();
        if (!error && data) {
          setColumnDefId(data.id);
        }
      }
    } catch (err) {
      console.error('Error saving priorities:', err);
    }
  };

  const handleAdd = async () => {
    const labelVal = stripEmojis(newLabel.trim());
    if (!labelVal) return;
    if (priorities.some(p => p.label.toLowerCase() === labelVal.toLowerCase())) {
      alert('Priority label already exists.');
      return;
    }
    const updated = [...priorities, { label: labelVal, color: newColor }];
    setPriorities(updated);
    setNewLabel('');
    await savePrioritiesToDb(updated);
    if (onUpdate) onUpdate();
  };

  const handleStartEdit = (index) => {
    setEditingIndex(index);
    setEditingLabel(priorities[index].label);
    setEditingColor(priorities[index].color);
  };

  const handleSaveEdit = async (index) => {
    const newL = stripEmojis(editingLabel.trim());
    if (!newL) return;
    const oldLabel = priorities[index].label;

    if (priorities.some((p, idx) => idx !== index && p.label.toLowerCase() === newL.toLowerCase())) {
      alert('Priority label already exists.');
      return;
    }

    const updated = [...priorities];
    updated[index] = { label: newL, color: editingColor };
    setPriorities(updated);
    setEditingIndex(null);

    // If label changed, update all leads that use the old label
    if (oldLabel !== newL && userId) {
      await supabase
        .from('leads')
        .update({ priority: newL })
        .eq('user_id', userId)
        .eq('priority', oldLabel);
    }

    await savePrioritiesToDb(updated);
    if (onUpdate) onUpdate();
  };

  const handleDelete = async (index) => {
    const labelToDelete = priorities[index].label;
    if (!userId) return;

    // Check if any leads use this priority
    const { count, error } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('priority', labelToDelete);

    if (!error && count > 0) {
      if (!confirm(`Warning: ${count} lead(s) are currently set to "${labelToDelete}". Deleting this will reassign them to "Cold". Proceed?`)) {
        return;
      }
      // Reassign leads to 'Cold'
      await supabase
        .from('leads')
        .update({ priority: 'Cold' })
        .eq('user_id', userId)
        .eq('priority', labelToDelete);
    }

    const updated = priorities.filter((_, idx) => idx !== index);
    setPriorities(updated);
    await savePrioritiesToDb(updated);
    if (onUpdate) onUpdate();
  };

  // Find priority match
  const normalizedVal = value ? stripEmojis(value.trim()) : 'Cold';
  const currentPriority = priorities.find(p => p.label.toLowerCase() === normalizedVal.toLowerCase()) || { label: normalizedVal, color: '#6b7280' };

  const getPriorityStyle = (color) => ({
    ...softBadgeStyle(color),
    padding: '0.25rem 0.65rem',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  });

  const dropdownPanel = isOpen && createPortal(
    <div
      ref={dropdownRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: dropdownPos.openUp ? undefined : dropdownPos.top,
        bottom: dropdownPos.openUp ? window.innerHeight - dropdownPos.top : undefined,
        left: dropdownPos.left,
        zIndex: 99999,
        width: `${dropdownPos.width}px`,
        backgroundColor: 'var(--bg-card, #161B22)',
        border: '1px solid var(--border-strong, #30363D)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}
    >
      {!isEditing ? (
        <>
          {/* Normal Selection List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '180px', overflowY: 'auto' }}>
            {priorities.map(opt => {
              const isSelected = normalizedVal.toLowerCase() === opt.label.toLowerCase();
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    onChange(opt.label);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.65rem',
                    border: 'none',
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    color: opt.color,
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    width: '100%'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent'}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opt.color }} />
                  <span>{stripEmojis(opt.label)}</span>
                </button>
              );
            })}
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
            Edit Priorities
          </button>
        </>
      ) : (
        /* Editable Management Mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Manage Priorities</span>
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
            {priorities.map((opt, idx) => (
              <div key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {editingIndex === idx ? (
                  <>
                    <input
                      type="text"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'var(--bg-primary, #0D1117)',
                        border: '1px solid var(--border-color, #30363D)',
                        color: '#fff',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.78rem'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(idx)}
                      style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 0 }}
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIndex(null)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opt.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.78rem', color: opt.color, fontWeight: 500 }}>{stripEmojis(opt.label)}</span>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                    >
                      <Pencil size={12} />
                    </button>
                    {priorities.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDelete(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color, #30363D)', margin: '2px 0' }} />

          {/* Add Option */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                type="text"
                placeholder="New priority name..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                style={{
                  flex: 1,
                  background: 'var(--bg-primary, #0D1117)',
                  border: '1px solid var(--border-color, #30363D)',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '0.78rem'
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
    <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        style={getPriorityStyle(currentPriority.color)}
      >
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: currentPriority.color }} />
        <span>{stripEmojis(currentPriority.label)}</span>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>

      {dropdownPanel}
    </div>
  );
}
