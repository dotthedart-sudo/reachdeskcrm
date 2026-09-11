import React, { useState, useEffect } from 'react';
import { Settings as Gear, Trash2, Plus, ArrowUp, ArrowDown, X, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  const [dragRealIdx, setDragRealIdx] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const initial = view === 'call_queue' ? 'call_queue' : (view === 'pipeline' ? 'pipeline' : 'contact_details');
      setActiveTab(initial);
      setAllCols(JSON.parse(JSON.stringify(columns || [])));
      setShowAddForm(false);
    }
  }, [isOpen, columns, view]);

  const currentTabCols = allCols.filter((c) => c.table_view === activeTab);

  const editableCols = currentTabCols.map((c, i) => ({ ...c, _realIdx: i }));

  const updateCurrentTabCols = (newTabCols) => {
    const otherCols = allCols.filter((c) => c.table_view !== activeTab);
    setAllCols([...otherCols, ...newTabCols]);
  };

  const visibleCount = currentTabCols.filter((c) => c.is_visible).length;

  const handleToggleVisible = (realIdx) => {
    const col = currentTabCols[realIdx];
    if (col.is_visible && visibleCount <= 1) {
      alert('At least one column must stay visible.');
      return;
    }
    const updated = currentTabCols.map((c, i) => (i === realIdx ? { ...c, is_visible: !c.is_visible } : c));
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

  const handleMove = (realIdx, direction) => {
    const list = [...currentTabCols];
    const targetIdx = realIdx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[realIdx];
    list[realIdx] = list[targetIdx];
    list[targetIdx] = temp;
    updateCurrentTabCols(list.map((c, idx) => ({ ...c, sort_order: idx })));
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
      sort_order: currentTabCols.length,
      dropdown_options: newColType === 'dropdown'
        ? [{ label: 'Option 1', color: '#3b82f6' }, { label: 'Option 2', color: '#10b981' }]
        : [],
    };
    updateCurrentTabCols([...currentTabCols, newCol]);
    setNewColLabel('');
    setShowAddForm(false);
  };

  const handleSaveAll = async () => {
    try {
      const originalCustom = (columns || []).filter((c) => !c.is_default);
      const remainingCustomIds = allCols.filter((c) => !c.is_default).map((c) => c.id);
      const deletedCustomIds = originalCustom.filter((c) => !remainingCustomIds.includes(c.id)).map((c) => c.id);

      if (deletedCustomIds.length > 0) {
        await supabase.from('column_definitions').delete().in('id', deletedCustomIds);
      }

      const upsertPayload = [];
      for (const tabId of TAB_CONFIG.map((t) => t.id)) {
        const tabCols = allCols.filter((c) => c.table_view === tabId);
        tabCols.forEach((c, idx) => {
          upsertPayload.push({
            id: c.id,
            user_id: userId,
            table_view: c.table_view,
            column_key: c.column_key,
            column_label: c.column_label,
            column_type: c.column_type,
            is_visible: c.is_visible,
            is_default: c.is_default,
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

  const handleDragStart = (e, realIdx) => {
    setDragRealIdx(realIdx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, realIdx) => {
    e.preventDefault();
    if (dragRealIdx === null || dragRealIdx === realIdx) return;
    const list = [...currentTabCols];
    const draggedItem = list[dragRealIdx];
    list.splice(dragRealIdx, 1);
    list.splice(realIdx, 0, draggedItem);
    setDragRealIdx(realIdx);
    updateCurrentTabCols(list.map((c, idx) => ({ ...c, sort_order: idx })));
  };

  const handleDragEnd = () => setDragRealIdx(null);

  const canAddCustom = true;

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" style={{ justifyContent: 'flex-end', backdropFilter: 'blur(3px)' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '420px',
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

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1rem 1rem 0', paddingRight: '4px' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
              Columns
            </span>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Drag to reorder · toggle to show/hide · drag header edges in the table to resize
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {editableCols.map((col, editIdx) => (
              <div
                key={col.id}
                draggable
                onDragStart={(e) => handleDragStart(e, col._realIdx)}
                onDragOver={(e) => handleDragOver(e, col._realIdx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.5rem 0.75rem',
                  background: dragRealIdx === col._realIdx ? 'rgba(91,143,185,0.08)' : 'var(--bg-card)',
                  border: dragRealIdx === col._realIdx ? '0.5px solid var(--accent-blue)' : '0.5px solid var(--border)',
                  borderRadius: '4px',
                  cursor: 'grab',
                }}
              >
                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', cursor: 'grab', userSelect: 'none' }}>⋮⋮</div>
                <input
                  type="checkbox"
                  checked={col.is_visible}
                  onChange={() => handleToggleVisible(col._realIdx)}
                  style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: 'var(--accent-blue)' }}
                />
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
                      style={{ fontSize: '0.85rem', cursor: 'pointer', color: col.is_visible ? 'var(--text-primary)' : 'var(--text-muted)' }}
                      title="Click to rename"
                    >
                      {col.column_label}
                    </span>
                  )}
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'capitalize' }}>
                    {col.column_type}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button type="button" onClick={() => handleMove(col._realIdx, -1)} disabled={editIdx === 0} className="btn-icon" style={{ padding: '0.15rem' }}>
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" onClick={() => handleMove(col._realIdx, 1)} disabled={editIdx === editableCols.length - 1} className="btn-icon" style={{ padding: '0.15rem' }}>
                    <ArrowDown size={13} />
                  </button>
                  {!col.is_default && (
                    <button type="button" onClick={() => handleDeleteCustom(col.id)} className="btn-icon" style={{ padding: '0.15rem', color: 'var(--status-hot)' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {canAddCustom && (showAddForm ? (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h4 style={{ fontSize: '0.85rem', margin: 0 }}>Add custom column</h4>
              <input type="text" placeholder="e.g. Lead Source" value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} className="form-input" />
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
          ))}
        </div>

        <div style={{ borderTop: '0.5px solid var(--border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => onResetToDefault(activeTab)}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.8rem' }}
          >
            <RefreshCw size={13} /> Reset {tabLabel(activeTab)} to default
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
