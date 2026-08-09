import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2, ChevronUp, ChevronDown, X, Lock } from 'lucide-react';
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

const PROTECTED_ACTION_VALUES = new Set([
  'Send first pitch',
  'Wait for reply',
  'Send a follow up',
  'Send a different pitch',
  'Send proposal',
  'Send Calendly',
  'Prepare for call',
  'Send invoice',
  'No action needed',
  'Follow Up',
  'Send Template',
  'Schedule Call',
  'No Action'
]);

export const DEFAULT_ACTION_OPTIONS = [
  { label: 'Send first pitch', color: '#3b82f6' },
  { label: 'Wait for reply', color: '#6b7280' },
  { label: 'Send a follow up', color: '#f59e0b' },
  { label: 'Send a different pitch', color: '#8b5cf6' },
  { label: 'Send proposal', color: '#5B8FB9' },
  { label: 'Send Calendly', color: '#6366f1' },
  { label: 'Hand off to calls', color: '#8b5cf6' },
  { label: 'Send invoice', color: '#10b981' },
  { label: 'No action needed', color: '#6b7280' }
];

export const CALL_ACTION_OPTIONS = [
  { label: 'Call now', color: '#3b82f6' },
  { label: 'Leave voicemail', color: '#6366f1' },
  { label: 'Callback scheduled', color: '#f59e0b' },
  { label: 'Try again tomorrow', color: '#8b5cf6' },
  { label: 'Wrong number — remove', color: '#ef4444' },
  { label: 'Not interested — close', color: '#6b7280' },
  { label: 'Send info by email', color: '#10b981' },
  { label: 'No call needed', color: '#6b7280' },
];

export default function EditableDropdown({
  value,
  columnDef,
  onChange,
  onUpdateColumnDef
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 180, openUp: false });
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  // Modal State
  const [options, setOptions] = useState([]);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionColor, setNewOptionColor] = useState(PRESET_COLORS[0]);

  const isActionToTake = columnDef?.column_key === 'action_to_take';
  const isCallAction = columnDef?.column_key === 'call_action';
  const rawOptions = isCallAction
    ? (columnDef?.dropdown_options?.length ? columnDef.dropdown_options : CALL_ACTION_OPTIONS)
    : isActionToTake
      ? DEFAULT_ACTION_OPTIONS
      : (columnDef?.dropdown_options || []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      const isInsideTrigger = triggerRef.current && triggerRef.current.contains(event.target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      if (!isInsideTrigger && !isInsideDropdown) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openDropdown = (e) => {
    if (e) e.stopPropagation();
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      const width = Math.max(rect.width, 180);
      setDropdownPos({
        left: Math.min(rect.left, window.innerWidth - width - 8),
        width,
        openUp,
        top: openUp ? rect.top - 4 : rect.bottom + 4
      });
    }
    setIsOpen(prev => !prev);
  };

  const handleOpenEditOptions = (e) => {
    e.stopPropagation();
    setOptions(JSON.parse(JSON.stringify(rawOptions))); // Deep copy
    setShowEditModal(true);
    setIsOpen(false);
  };

  const handleAddOption = () => {
    if (!newOptionLabel.trim()) return;
    if (options.some(opt => opt.label.trim().toLowerCase() === newOptionLabel.trim().toLowerCase())) {
      alert('Option already exists.');
      return;
    }
    const newOpt = {
      label: newOptionLabel.trim(),
      color: newOptionColor
    };
    setOptions([...options, newOpt]);
    setNewOptionLabel('');
  };

  const handleRemoveOption = (index) => {
    const opt = options[index];
    const isActionToTakeCol = columnDef?.column_key === 'action_to_take';
    if (opt && isActionToTakeCol && PROTECTED_ACTION_VALUES.has(opt.label)) {
      return;
    }
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleMoveOption = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= options.length) return;
    const updated = [...options];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setOptions(updated);
  };

  const handleSaveOptions = async () => {
    try {
      const { error } = await supabase
        .from('column_definitions')
        .update({ dropdown_options: options })
        .eq('id', columnDef.id);

      if (error) throw error;

      if (onUpdateColumnDef) {
        onUpdateColumnDef(columnDef.id, options);
      }
      setShowEditModal(false);
    } catch (err) {
      console.error('Error saving dropdown options:', err);
      alert('Failed to save options: ' + err.message);
    }
  };

const ACTION_COLORS = {
  'Send first pitch': '#3b82f6',
  'Wait for reply': '#6b7280',
  'Send a follow up': '#f59e0b',
  'Send a different pitch': '#8b5cf6',
  'Send proposal': '#5B8FB9',
  'Send Calendly': '#6366f1',
  'Prepare for call': '#8b5cf6',
  'Send invoice': '#10b981',
  'No action needed': '#6b7280',
  'Follow Up': '#3b82f6',
  'Send Template': '#8b5cf6',
  'Schedule Call': '#f59e0b',
  'No Action': '#6b7280'
};

  // Find current option style
  let currentOpt = rawOptions.find(opt => opt.label === value);
  if (!currentOpt) {
    const fallbackColor = ACTION_COLORS[value] || '#6b7280';
    currentOpt = { label: value || 'None', color: fallbackColor };
  }
  const chipStyle = {
    ...softBadgeStyle(currentOpt.color),
    padding: '0.2rem 0.6rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    whiteSpace: 'nowrap'
  };

  const dropdownMenu = isOpen && createPortal(
    <div
      ref={dropdownRef}
      className="rd-menu"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: dropdownPos.openUp ? undefined : dropdownPos.top,
        bottom: dropdownPos.openUp ? window.innerHeight - dropdownPos.top : undefined,
        left: dropdownPos.left,
        zIndex: 99999,
        minWidth: `${dropdownPos.width}px`,
      }}
    >
      <div className="rd-menu__list">
        {rawOptions.map(opt => (
          <button
            key={opt.label}
            type="button"
            className={`rd-menu__item${value === opt.label ? ' rd-menu__item--active' : ''}`}
            onClick={() => {
              onChange(opt.label);
              setIsOpen(false);
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: opt.color, flexShrink: 0 }} />
              <span className="rd-menu__item-label">{opt.label}</span>
            </span>
          </button>
        ))}
        {rawOptions.length === 0 && (
          <div className="rd-menu__empty">No options configured.</div>
        )}
      </div>
      <hr className="rd-menu__sep" />
      <button
        type="button"
        className="rd-menu__footer-btn"
        onClick={handleOpenEditOptions}
      >
        <Pencil size={12} /> Edit Options
      </button>
    </div>,
    document.body
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button ref={triggerRef} onClick={openDropdown} style={chipStyle} type="button">
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', ...softDotStyle(currentOpt.color) }} />
        {currentOpt.label}
      </button>

      {dropdownMenu}

      {/* Edit Options Modal */}
      {showEditModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '450px', width: '90%', padding: '1.5rem' }}>
            <div className="modal-header">
              <h3>Edit {columnDef?.column_label || 'Options'}</h3>
              <button type="button" onClick={() => setShowEditModal(false)} className="theme-toggle"><X size={18} /></button>
            </div>

            <div className="flex-col gap-3" style={{ marginTop: '0.5rem' }}>
              {/* Option List */}
              <div 
                className="flex-col gap-2" 
                style={{ 
                  maxHeight: '200px', 
                  overflowY: 'auto', 
                  paddingRight: '4px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px',
                  background: 'var(--bg-secondary)'
                }}
              >
                {options.map((opt, idx) => (
                  <div 
                    key={idx} 
                    className="flex justify-between align-center" 
                    style={{ 
                      padding: '0.4rem 0.5rem', 
                      borderRadius: '6px', 
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      gap: '0.5rem'
                    }}
                  >
                    <div className="flex align-center gap-2" style={{ flex: 1 }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opt.color }} />
                      <span style={{ fontSize: '0.85rem' }}>{opt.label}</span>
                    </div>

                    <div className="flex gap-1">
                      <button 
                        type="button" 
                        onClick={() => handleMoveOption(idx, -1)} 
                        disabled={idx === 0} 
                        className="btn-icon" 
                        style={{ padding: '0.2rem', color: idx === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer' }}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleMoveOption(idx, 1)} 
                        disabled={idx === options.length - 1} 
                        className="btn-icon" 
                        style={{ padding: '0.2rem', color: idx === options.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)', background: 'none', border: 'none', cursor: idx === options.length - 1 ? 'not-allowed' : 'pointer' }}
                      >
                        <ChevronDown size={14} />
                      </button>
                      {columnDef?.column_key === 'action_to_take' && PROTECTED_ACTION_VALUES.has(opt.label) ? (
                        <div 
                          style={{ padding: '0.2rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', opacity: 0.6 }}
                          title="System protected option"
                        >
                          <Lock size={14} />
                        </div>
                      ) : (
                        <button 
                          type="button" 
                          onClick={() => handleRemoveOption(idx)} 
                          className="btn-icon" 
                          style={{ padding: '0.2rem', color: 'var(--danger-color)', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {options.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No options. Add one below.
                  </div>
                )}
              </div>

              {/* Add Option Form */}
              <div 
                className="flex-col gap-2" 
                style={{ 
                  borderTop: '1px solid var(--border-color)', 
                  paddingTop: '1rem',
                  marginTop: '0.5rem'
                }}
              >
                <label className="form-label">Add Option</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOptionLabel}
                    onChange={e => setNewOptionLabel(e.target.value)}
                    placeholder="e.g. High Priority"
                    className="form-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="btn btn-primary"
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>

                {/* Color Choice */}
                <div style={{ marginTop: '0.5rem' }}>
                  <span className="form-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Option Color</span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewOptionColor(c)}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: newOptionColor === c ? '2.5px solid white' : '1px solid rgba(255,255,255,0.15)',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div 
                className="flex justify-between mt-4" 
                style={{ 
                  borderTop: '1px solid var(--border-color)', 
                  paddingTop: '1rem' 
                }}
              >
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveOptions} 
                  className="btn btn-primary"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
