import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderInput, Search } from 'lucide-react';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';

export default function RowFolderMoveButton({
  lead,
  folders = [],
  onMove,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const updatePos = () => {
    if (!triggerRef.current) return;
    setMenuPos(
      computePortalMenuPosition(triggerRef.current, {
        menuWidth: 200,
        menuHeight: 260,
      }),
    );
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onDoc = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const filteredFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, query]);

  const handleSelect = (folderId) => {
    onMove?.(folderId);
    setOpen(false);
    setQuery('');
  };

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      className="rd-menu"
      role="menu"
      style={{ ...portalMenuStyle(menuPos), width: 200, maxHeight: 260, display: 'flex', flexDirection: 'column' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {folders.length > 5 && (
        <div className="rd-menu__search" style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary, rgba(0,0,0,0.05))', borderRadius: 4, padding: '2px 6px' }}>
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="search"
              className="rd-menu__search-input"
              placeholder="Filter lists…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 11, color: 'var(--text-primary)' }}
              autoFocus
            />
          </div>
        </div>
      )}

      <div className="rd-menu__list" style={{ flex: 1, overflowY: 'auto' }}>
        <button
          type="button"
          role="menuitem"
          className={`rd-menu__item${!lead.folder_id ? ' rd-menu__item--active' : ''}`}
          onClick={() => handleSelect('')}
          style={{ fontSize: 12, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span className="rd-menu__item-label">(Unfiled)</span>
          {!lead.folder_id && <Check size={13} style={{ color: 'var(--status-cold, #5B8FB9)' }} />}
        </button>

        {filteredFolders.map((f) => {
          const isSelected = lead.folder_id === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              className={`rd-menu__item${isSelected ? ' rd-menu__item--active' : ''}`}
              onClick={() => handleSelect(f.id)}
              style={{ fontSize: 12, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span className="rd-menu__item-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
              {isSelected && <Check size={13} style={{ color: 'var(--status-cold, #5B8FB9)' }} />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((p) => !p)}
        title="Move to list"
        style={{ padding: '3px 6px', height: 24 }}
      >
        <FolderInput size={12} />
      </button>
      {menu}
    </div>
  );
}
