import React, { useState, useEffect } from 'react';
import { Settings as Gear, Trash2, Plus, X, RefreshCw, GripVertical, Eye, EyeOff, Pin, PinOff, WrapText, Scissors } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isAlwaysClipped, DEFAULT_COLUMN_ORDER } from './crmTableColumns';

const TAB_CONFIG = [
  { id: 'contact_details', label: 'Message · Contact' },
  { id: 'pipeline', label: 'Message · Pipeline' },
  { id: 'call_queue', label: 'Cold Calls · Queue' },
];

function tabLabel(id) {
  return TAB_CONFIG.find((t) => t.id === id)?.label || id;
}

export default function ColumnManager({
  isOpen,
  onClose,
  view,
  columns,
  onUpdateColumns,
  onResetToDefault,
  userId,
}) {
  const [activeTab, setActiveTab] = useState('contact_details');
  const [allCols, setAllCols] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState('text');
  const [dragColId, setDragColId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const initial = view === 'call_queue' ? 'call_queue' : (view === 'pipeline' ? 'pipeline' : 'contact_details');
      setActiveTab(initial);
      setAllCols(JSON.parse(JSON.stringify(columns || [])));
      setShowAddForm(false);
    }
  }, [isOpen, columns, view]);

  const currentTabCols = allCols.filter((c) => c.table_view === activeTab);

  // Group into pinned and unpinned, preserving sort_order
  const pinnedCols = currentTabCols.filter((c) => c.is_pinned).sort((a, b) => a.sort_order - b.sort_order);
  const unpinnedCols = currentTabCols.filter((c) => !c.is_pinned).sort((a, b) => a.sort_order - b.sort_order);
  const orderedTabCols = [...pinnedCols, ...unpinnedCols];

  const updateCurrentTabCols = (newTabCols) => {
    const otherCols = allCols.filter((c) => c.table_view !== activeTab);
    setAllCols([...otherCols, ...newTabCols]);
  };

  const visibleCount = currentTabCols.filter((c) => c.is_visible).length;

  const handleToggleVisible = (colId) => {
    const col = currentTabCols.find((c) => c.id === colId);
    if (!col) return;
    if (col.is_visible && visibleCount <= 1) {
      alert('At least one column must stay visible.');
      return;
    }
    const updated = currentTabCols.map((c) => (c.id === colId ? { ...c, is_visible: !c.is_visible, ...(c.is_visible ? { is_pinned: false } : {}) } : c));
    updateCurrentTabCols(updated);
  };

  const handleTogglePin = (colId) => {
    const col = currentTabCols.find((c) => c.id === colId);
    if (!col) return;
    const nextPinned = !col.is_pinned;
    const updated = currentTabCols.map((c) => (c.id === colId ? { ...c, is_pinned: nextPinned } : c));
    updateCurrentTabCols(updated);
  };

  const handleToggleWrap = (colId) => {
    const col = currentTabCols.find((c) => c.id === colId);
    if (!col || isAlwaysClipped(col)) return;
    const nextWrap = col.wrap_mode === 'wrap' ? 'clip' : 'wrap';
    const updated = currentTabCols.map((c) => (c.id === colId ? { ...c, wrap_mode: nextWrap } : c));
    updateCurrentTabCols(updated);
  };

  const handleStartRename = (col) => {
    setEditingId(col.id);
    setEditingLabel(col.column_label);
  };

  const handleSaveRename = (id) => {
    if (!editingLabel.trim()) return;
    const updated = currentTabCols.map((c) => (c.id === id ? { ...c, column_label: editingLabel.trim() } : c));
    updateCurrentTabCols(updated);
    setEditingId(null);
  };

  const handleDeleteCustom = (id) => {
    if (!confirm('Delete this custom column? Data in custom_fields will remain but won\'t be visible.')) return;
    updateCurrentTabCols(currentTabCols.filter((c) => c.id !== id));
  };

  const handleAddColumn = () => {
    if (!newColLabel.trim()) return;
    const key = `custom_${newColLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (currentTabCols.some((c) => c.column_key === key)) {
      alert('A column with a similar name already exists.');
      return;
    }
    const newCol = {
      id: crypto.randomUUID(),
      user_id: userId,
      table_view: activeTab,
      column_key: key,
      column_label: newColLabel.trim(),
      column_type: newColType,
      is_visible: true,
      is_default: false,
      is_pinned: false,
      wrap_mode: 'clip',
      sort_order: currentTabCols.length,
      dropdown_options: newColType === 'dropdown'
        ? [{ label: 'Option 1', color: '#3b82f6' }, { label: 'Option 2', color: '#10b981' }]
        : [],
    };
    updateCurrentTabCols([...currentTabCols, newCol]);
    setNewColLabel('');
    setShowAddForm(false);
  };

  const handleReset = () => {
    const defaultVisible = {
      pipeline: ['name', 'priority', 'status', 'outreach_channel', 'action_to_take', 'next_checkpoint_at', 'last_contacted_at', 'platform', 'email'],
      contact_details: ['name', 'priority', 'status', 'outreach_channel', 'action_to_take', 'next_checkpoint_at', 'last_contacted_at', 'platform', 'email'],
      call_queue: ['name', 'phone', 'local_time', 'outcome', 'call_action', 'next_checkpoint_at', 'last_called', 'platform'],
    }[activeTab] || [];

    const defaultOrder = DEFAULT_COLUMN_ORDER[activeTab] || [];
    let tabCols = [...currentTabCols];

    if (!tabCols.some((c) => c.column_key === 'next_checkpoint_at')) {
      tabCols.push({
        id: crypto.randomUUID(),
        user_id: userId,
        table_view: activeTab,
        column_key: 'next_checkpoint_at',
        column_label: 'Due',
        column_type: 'datetime',
        is_visible: true,
        is_default: true,
        is_pinned: false,
        wrap_mode: 'clip',
        sort_order: 5,
        dropdown_options: [],
      });
    }

    const updated = tabCols.map((c) => {
      const isVis = defaultVisible.includes(c.column_key);
      const visIdx = defaultVisible.indexOf(c.column_key);
      const hiddenIdx = defaultOrder.indexOf(c.column_key);
      return {
        ...c,
        is_visible: isVis,
        is_pinned: false,
        wrap_mode: 'clip',
        sort_order: isVis ? visIdx : (hiddenIdx >= 0 ? 100 + hiddenIdx : 999),
      };
    }).sort((a, b) => a.sort_order - b.sort_order);

    updateCurrentTabCols(updated.map((c, i) => ({ ...c, sort_order: i })));
  };

  const handleSaveAll = async () => {
    try {
      const originalCustom = (columns || []).filter((c) => !c.is_default);
      const remainingCustomIds = allCols.filter((c) => !c.is_default).map((c) => c.id);
      const deletedCustomIds = originalCustom.filter((c) => !remainingCustomIds.includes(c.id)).map((c) => c.id);

      if (deletedCustomIds.length > 0) {
        await supabase.from('column_definitions').delete().in('id', deletedCustomIds).eq('user_id', userId);
      }

      const upsertPayload = [];
      for (const tabId of TAB_CONFIG.map((t) => t.id)) {
        const tabCols = allCols.filter((c) => c.table_view === tabId);
        const p = tabCols.filter((c) => c.is_pinned).sort((a, b) => a.sort_order - b.sort_order);
        const u = tabCols.filter((c) => !c.is_pinned).sort((a, b) => a.sort_order - b.sort_order);
        const ordered = [...p, ...u];

        ordered.forEach((c, idx) => {
          upsertPayload.push({
            id: c.id,
            user_id: userId,
            table_view: c.table_view,
            column_key: c.column_key,
            column_label: c.column_label,
            column_type: c.column_type,
            is_visible: c.is_visible,
            is_default: c.is_default,
            is_pinned: !!c.is_pinned,
            wrap_mode: c.wrap_mode || 'clip',
            sort_order: idx,
            dropdown_options: c.dropdown_options,
          });
        });
      }

      const { data, error } = await supabase.from('column_definitions').upsert(upsertPayload).select();
      if (error) throw error;
      onUpdateColumns?.(data);
      onClose();
    } catch (err) {
      console.error('Error saving column configuration:', err);
      alert(`Failed to save columns: ${err.message}`);
    }
  };

  const handleDragStart = (e, colId) => {
    setDragColId(colId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, targetColId) => {
    e.preventDefault();
    if (!dragColId || dragColId === targetColId) return;
    const list = [...orderedTabCols];
    const dragIdx = list.findIndex((c) => c.id === dragColId);
    const targetIdx = list.findIndex((c) => c.id === targetColId);
    if (dragIdx === -1 || targetIdx === -1) return;

    const [draggedItem] = list.splice(dragIdx, 1);
    list.splice(targetIdx, 0, draggedItem);
    updateCurrentTabCols(list.map((c, idx) => ({ ...c, sort_order: idx })));
  };

  const handleDragEnd = () => setDragColId(null);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" style={{ justifyContent: 'flex-end', backdropFilter: 'blur(3px)' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '440px',
          height: '100vh',
          borderRadius: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.3)',
          borderLeft: '0.5px solid var(--border)',
          animation: 'slideInRight 0.3s ease-out',
          textAlign: 'left',
        }}
      >
        <div className="modal-header" style={{ paddingBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Gear size={16} /> Column Management
          </h3>
          <button type="button" onClick={onClose} className="theme-toggle"><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); setShowAddForm(false); }}
              style={{
                flex: 1,
                padding: '0.55rem 0.35rem',
                border: 'none',
                background: 'transparent',
                color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                fontWeight: 600,
                fontSize: '0.72rem',
                cursor: 'pointer',
                lineHeight: 1.3,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
              Columns ({currentTabCols.length})
            </span>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Drag grip to reorder · Toggle eye to show/hide · Pin keeps column at left · Wrap allows up to 3 lines
            </div>
          </div>

          {pinnedCols.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--status-cold)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.35rem' }}>
                <Pin size={11} /> PINNED COLUMNS ({pinnedCols.length})
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {orderedTabCols.map((col) => {
              const alwaysClipped = isAlwaysClipped(col);
              const isWrap = col.wrap_mode === 'wrap';
              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, col.id)}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.6rem',
                    background: dragColId === col.id ? 'rgba(91,143,185,0.08)' : 'var(--bg-card)',
                    border: col.is_pinned ? '1px solid var(--status-cold)' : '0.5px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'grab',
                    opacity: col.is_visible ? 1 : 0.6,
                  }}
                >
                  <div style={{ color: 'var(--text-muted)', cursor: 'grab', userSelect: 'none', display: 'flex', alignItems: 'center' }}>
                    <GripVertical size={14} />
                  </div>

                  {/* Eye: show/hide */}
                  <button
                    type="button"
                    onClick={() => handleToggleVisible(col.id)}
                    className="btn-icon"
                    style={{ padding: '2px', color: col.is_visible ? 'var(--text-primary)' : 'var(--text-muted)' }}
                    title={col.is_visible ? 'Hide column' : 'Show column'}
                  >
                    {col.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === col.id ? (
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onBlur={() => handleSaveRename(col.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(col.id)}
                        className="form-input"
                        style={{ padding: '0.15rem 0.35rem', fontSize: '0.82rem', width: '100%' }}
                        autoFocus
                      />
                    ) : (
                      <span
                        onClick={() => handleStartRename(col)}
                        style={{ fontSize: '0.82rem', cursor: 'pointer', color: col.is_visible ? 'var(--text-primary)' : 'var(--text-muted)' }}
                        title="Click to rename"
                      >
                        {col.column_label}
                      </span>
                    )}
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'capitalize' }}>
                      {col.column_type}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {/* Wrap toggle */}
                    <button
                      type="button"
                      disabled={alwaysClipped}
                      onClick={() => handleToggleWrap(col.id)}
                      className="btn-icon"
                      style={{
                        padding: '3px 6px',
                        fontSize: '11px',
                        borderRadius: '3px',
                        border: '1px solid var(--border)',
                        background: isWrap ? 'var(--bg-card-hover)' : 'transparent',
                        color: alwaysClipped ? 'var(--text-muted)' : (isWrap ? 'var(--text-primary)' : 'var(--text-secondary)'),
                        opacity: alwaysClipped ? 0.4 : 1,
                        cursor: alwaysClipped ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                      title={alwaysClipped ? 'Always clipped for this column' : (isWrap ? 'Wrapped (click to clip)' : 'Clipped (click to wrap)')}
                    >
                      {isWrap ? <WrapText size={12} /> : <Scissors size={12} />}
                      <span style={{ fontSize: '10px' }}>{isWrap ? 'Wrap' : 'Clip'}</span>
                    </button>

                    {/* Pin toggle */}
                    <button
                      type="button"
                      onClick={() => handleTogglePin(col.id)}
                      className="btn-icon"
                      style={{
                        padding: '3px',
                        color: col.is_pinned ? 'var(--status-cold)' : 'var(--text-muted)',
                      }}
                      title={col.is_pinned ? 'Unpin column' : 'Pin column'}
                    >
                      {col.is_pinned ? <Pin size={13} fill="currentColor" /> : <PinOff size={13} />}
                    </button>

                    {!col.is_default && (
                      <button type="button" onClick={() => handleDeleteCustom(col.id)} className="btn-icon" style={{ padding: '3px', color: 'var(--status-hot)' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {showAddForm ? (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h4 style={{ fontSize: '0.85rem', margin: 0 }}>Add custom column</h4>
              <input
                type="text"
                placeholder="e.g. Lead Source"
                value={newColLabel}
                onChange={(e) => setNewColLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddColumn();
                  }
                }}
                className="form-input"
              />
              <select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="form-select">
                <option value="text">Text</option>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
                <option value="number">Number</option>
                <option value="link">URL Link</option>
              </select>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowAddForm(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="button" onClick={handleAddColumn} className="btn btn-primary btn-sm">Add</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddForm(true)} className="btn btn-secondary w-full" style={{ marginTop: '1rem', justifyContent: 'center', fontSize: '0.8rem' }}>
              <Plus size={13} /> Add custom column
            </button>
          )}
        </div>

        <div style={{ borderTop: '0.5px solid var(--border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.8rem' }}
          >
            <RefreshCw size={13} /> Reset {tabLabel(activeTab)} columns to default
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
            <button type="button" onClick={handleSaveAll} className="btn btn-primary flex-1">Save layout</button>
          </div>
        </div>
      </div>
    </div>
  );
}
