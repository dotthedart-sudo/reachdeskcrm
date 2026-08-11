import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, CheckSquare, Type, Hash } from 'lucide-react';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';

const DatabaseNodeView = ({ node, updateAttributes, selected }) => {
  const { columns, rows } = node.attrs;

  const handleUpdateColumns = (newCols) => {
    updateAttributes({ columns: newCols });
  };

  const handleUpdateRows = (newRows) => {
    updateAttributes({ rows: newRows });
  };

  const addColumn = () => {
    const newColId = 'col_' + Date.now().toString() + Math.random().toString().slice(2, 6);
    handleUpdateColumns([...columns, { id: newColId, name: `Column ${columns.length + 1}`, type: 'text' }]);
  };

  const deleteColumn = (colId) => {
    if (columns.length <= 1) return; // Prevent deleting last column
    const newCols = columns.filter(c => c.id !== colId);
    // Cleanup cells for that col
    const newRows = rows.map(r => {
      const { [colId]: removed, ...rest } = r.cells;
      return { ...r, cells: rest };
    });
    updateAttributes({ columns: newCols, rows: newRows });
  };

  const addRow = () => {
    const newRowId = 'row_' + Date.now().toString() + Math.random().toString().slice(2, 6);
    handleUpdateRows([...rows, { id: newRowId, cells: {} }]);
  };

  const deleteRow = (rowId) => {
    handleUpdateRows(rows.filter(r => r.id !== rowId));
  };

  const updateCell = (rowId, colId, value) => {
    const newRows = rows.map(r => {
      if (r.id === rowId) {
        return { ...r, cells: { ...r.cells, [colId]: value } };
      }
      return r;
    });
    handleUpdateRows(newRows);
  };

  const changeColumnType = (colId, newType) => {
    const newCols = columns.map(c => c.id === colId ? { ...c, type: newType } : c);
    handleUpdateColumns(newCols);
  };

  const updateColumnName = (colId, newName) => {
    const newCols = columns.map(c => c.id === colId ? { ...c, name: newName } : c);
    handleUpdateColumns(newCols);
  };

  // Smart Paste Handler
  const handlePaste = (e, rowId, colId) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return; // let normal paste happen
    
    e.preventDefault();
    const pastedRows = text.split('\n').map(line => line.split('\t'));
    
    const startRowIdx = rows.findIndex(r => r.id === rowId);
    const startColIdx = columns.findIndex(c => c.id === colId);

    let currentRows = [...rows];
    let currentCols = [...columns];

    pastedRows.forEach((pastedCells, rOffset) => {
      if (!pastedCells.length || (pastedCells.length === 1 && pastedCells[0] === '')) return;

      const targetRowIdx = startRowIdx + rOffset;
      // Auto-expand rows if needed
      while (targetRowIdx >= currentRows.length) {
        currentRows.push({ id: 'row_' + Date.now() + Math.random().toString().slice(2, 6), cells: {} });
      }

      pastedCells.forEach((cellVal, cOffset) => {
        const targetColIdx = startColIdx + cOffset;
        // Auto-expand columns if needed
        while (targetColIdx >= currentCols.length) {
          currentCols.push({ id: 'col_' + Date.now() + Math.random().toString().slice(2, 6), name: `Column ${currentCols.length + 1}`, type: 'text' });
        }

        const targetColId = currentCols[targetColIdx].id;
        let finalVal = cellVal.trim();

        // Type conversion based on col type
        if (currentCols[targetColIdx].type === 'number') {
          const num = Number(finalVal);
          if (!isNaN(num)) finalVal = num;
        } else if (currentCols[targetColIdx].type === 'checkbox') {
          finalVal = (finalVal.toLowerCase() === 'true' || finalVal === '1' || finalVal.toLowerCase() === 'yes');
        }

        currentRows[targetRowIdx].cells[targetColId] = finalVal;
      });
    });

    updateAttributes({ columns: currentCols, rows: currentRows });
  };

  return (
    <NodeViewWrapper 
      className={`database-block ${selected ? 'is-selected' : ''}`}
      data-type="database-block"
      style={{ margin: '1rem 0', overflowX: 'auto', outline: selected ? '2px solid var(--primary-purple)' : 'none', borderRadius: '8px' }}
    >
      <div style={{ display: 'inline-block', minWidth: '100%', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th key={col.id} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: 0, position: 'relative', background: 'var(--bg-secondary)', textAlign: 'left', minWidth: '150px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                      <ColumnTypeSelector type={col.type} onChange={(newType) => changeColumnType(col.id, newType)} />
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => updateColumnName(col.id, e.target.value)}
                        style={{ background: 'transparent', border: 'none', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', width: '100%' }}
                      />
                    </div>
                    {columns.length > 1 && (
                      <button onClick={() => deleteColumn(col.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '2px' }} title="Delete Column">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th style={{ borderBottom: '1px solid var(--border-color)', padding: '0 8px', background: 'var(--bg-secondary)', width: '40px' }}>
                <button onClick={addColumn} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px' }} title="Add Column">
                  <Plus size={16} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={row.id} className="database-row">
                {columns.map(col => (
                  <td key={col.id} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: 0, position: 'relative' }}>
                    <CellEditor 
                      col={col} 
                      value={row.cells[col.id]} 
                      onChange={(val) => updateCell(row.id, col.id, val)} 
                      onPaste={(e) => handlePaste(e, row.id, col.id)}
                    />
                  </td>
                ))}
                <td style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <button onClick={() => deleteRow(row.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', margin: 'auto' }} title="Delete Row">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '8px' }}>
          <button onClick={addRow} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
            <Plus size={14} /> Add Row
          </button>
        </div>
      </div>
      <style>{`
        .database-row:hover td {
          background-color: var(--bg-tertiary);
        }
      `}</style>
    </NodeViewWrapper>
  );
};

const ColumnTypeSelector = ({ type, onChange }) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const updatePos = () => {
    if (!triggerRef.current) return;
    setMenuPos(computePortalMenuPosition(triggerRef.current, {
      menuWidth: 130,
      menuHeight: 120,
    }));
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const handleClickOutside = (event) => {
      const inRoot = containerRef.current?.contains(event.target);
      const inPanel = panelRef.current?.contains(event.target);
      if (!inRoot && !inPanel) setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const icons = { text: <Type size={14} />, number: <Hash size={14} />, checkbox: <CheckSquare size={14} /> };

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...portalMenuStyle(menuPos),
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: '120px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <button type="button" onClick={() => { onChange('text'); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 8px', textAlign: 'left', borderRadius: '4px', color: 'var(--text-primary)' }}>
        <Type size={14} /> Text
      </button>
      <button type="button" onClick={() => { onChange('number'); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 8px', textAlign: 'left', borderRadius: '4px', color: 'var(--text-primary)' }}>
        <Hash size={14} /> Number
      </button>
      <button type="button" onClick={() => { onChange('checkbox'); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 8px', textAlign: 'left', borderRadius: '4px', color: 'var(--text-primary)' }}>
        <CheckSquare size={14} /> Checkbox
      </button>
    </div>,
    document.body,
  );

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
        title={`Type: ${type}`}
      >
        {icons[type]}
      </button>
      {menu}
    </div>
  );
};

const CellEditor = ({ col, value, onChange, onPaste }) => {
  if (col.type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '38px' }}>
        <input 
          type="checkbox" 
          checked={!!value} 
          onChange={(e) => onChange(e.target.checked)} 
          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--primary-purple)' }}
        />
      </div>
    );
  }

  if (col.type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onPaste={onPaste}
        placeholder="Empty"
        style={{ width: '100%', height: '100%', minHeight: '38px', border: 'none', background: 'transparent', padding: '8px 12px', outline: 'none', color: 'var(--text-primary)', boxSizing: 'border-box' }}
      />
    );
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      placeholder="Empty"
      style={{ width: '100%', height: '100%', minHeight: '38px', border: 'none', background: 'transparent', padding: '8px 12px', outline: 'none', color: 'var(--text-primary)', boxSizing: 'border-box' }}
    />
  );
};

export const DatabaseBlock = Node.create({
  name: 'databaseBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      columns: {
        default: [
          { id: 'c1', name: 'Column 1', type: 'text' },
          { id: 'c2', name: 'Column 2', type: 'text' }
        ],
        parseHTML: element => {
          try {
            return JSON.parse(element.getAttribute('data-columns'));
          } catch {
            return [{ id: 'c1', name: 'Column 1', type: 'text' }, { id: 'c2', name: 'Column 2', type: 'text' }];
          }
        },
        renderHTML: attributes => ({
          'data-columns': JSON.stringify(attributes.columns),
        }),
      },
      rows: {
        default: [
          { id: 'r1', cells: {} },
          { id: 'r2', cells: {} },
          { id: 'r3', cells: {} }
        ],
        parseHTML: element => {
          try {
            return JSON.parse(element.getAttribute('data-rows'));
          } catch {
            return [{ id: 'r1', cells: {} }, { id: 'r2', cells: {} }, { id: 'r3', cells: {} }];
          }
        },
        renderHTML: attributes => ({
          'data-rows': JSON.stringify(attributes.rows),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'database-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseNodeView);
  },

  addCommands() {
    return {
      setDatabaseBlock: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
        });
      },
    };
  },
});
