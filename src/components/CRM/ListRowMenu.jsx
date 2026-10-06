import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, FolderOpen, Pencil, Download, Trash2, FileSpreadsheet, Clock, Share2 } from 'lucide-react';

export default function ListRowMenu({
  onOpen,
  onRename,
  onOpenSettings,
  onDelete,
  onExport,
  onExportSheets,
  onShare,
  canShare = false,
  canExport = true,
  canExportSheets = false,
  showLocalTime = false,
  onToggleLocalTime,
}) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, openUp: false });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) {
        setOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const run = (fn) => (e) => {
    e.stopPropagation();
    setOpen(false);
    fn?.();
  };

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const panelHeight = 280;
      const minWidth = 160;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < panelHeight && rect.top > panelHeight;
      const left = Math.min(Math.max(8, rect.right - minWidth), window.innerWidth - minWidth - 8);
      setPanelPos({
        openUp,
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left,
      });
    }
    setOpen((v) => !v);
  };

  const panel = open && createPortal(
    <div
      ref={panelRef}
      className="crm-list-row-menu-panel crm-list-row-menu-panel--portal"
      role="menu"
      style={{
        position: 'fixed',
        top: panelPos.openUp ? undefined : panelPos.top,
        bottom: panelPos.openUp ? window.innerHeight - panelPos.top : undefined,
        left: panelPos.left,
        zIndex: 99999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="crm-list-row-menu-item" role="menuitem" onClick={run(onOpen)}>
        <FolderOpen size={14} />
        Open
      </button>
          <button type="button" className="crm-list-row-menu-item" role="menuitem" onClick={run(onRename)}>
            <Pencil size={14} />
            Rename
          </button>
          {onOpenSettings && (
            <button type="button" className="crm-list-row-menu-item" role="menuitem" onClick={run(onOpenSettings)}>
              <Clock size={14} />
              List settings
            </button>
          )}
          {canShare && onShare && (
            <button type="button" className="crm-list-row-menu-item" role="menuitem" onClick={run(onShare)}>
              <Share2 size={14} />
              Share list…
            </button>
          )}
      {canExport && onExport && (
        <button type="button" className="crm-list-row-menu-item" role="menuitem" onClick={run(onExport)}>
          <Download size={14} />
          Export CSV
        </button>
      )}
      {canExport && canExportSheets && onExportSheets && (
        <button type="button" className="crm-list-row-menu-item" role="menuitem" onClick={run(onExportSheets)}>
          <FileSpreadsheet size={14} />
          Export to Google Sheets
        </button>
      )}
      {onToggleLocalTime && (
        <>
          <div className="crm-list-row-menu-divider" role="separator" />
          <label
            className="crm-list-row-menu-item crm-list-row-menu-toggle"
            onClick={(e) => e.stopPropagation()}
          >
            <Clock size={14} />
            <span className="crm-list-row-menu-toggle-label">Show lead local time</span>
            <input
              type="checkbox"
              checked={!!showLocalTime}
              onChange={(e) => onToggleLocalTime(e.target.checked)}
            />
          </label>
        </>
      )}
      <div className="crm-list-row-menu-divider" role="separator" />
      <button
        type="button"
        className="crm-list-row-menu-item crm-list-row-menu-item--danger"
        role="menuitem"
        onClick={run(onDelete)}
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>,
    document.body,
  );

  return (
    <div className="crm-list-row-menu" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="crm-list-row-menu-trigger"
        aria-label="List actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
      >
        <MoreHorizontal size={16} />
      </button>
      {panel}
    </div>
  );
}
