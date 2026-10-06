import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, Download, FolderInput, Search, Trash2, X } from 'lucide-react';
import { DEFAULT_STATUSES } from './GroupedStatusDropdown';
import { DEFAULT_CALL_STATUSES } from '../../lib/callOutcomeRules';
import { getChannelDefaults } from '../../lib/customChannels';
import { COUNTRY_TIMEZONE_OPTIONS } from '../../lib/leadTimezone';
import { getSupportedTimeZones } from '../../lib/dateTime';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';

export default function CRMBulkActionBar({
  selectedIds = [],
  activeList = [],
  paginatedList = [],
  outreachMode = 'messages',
  onSelectAll,
  onClear,
  onClearCurrentPage,
  onStatusChange,
  onChannelChange,
  onMoveToFolder,
  onSetTimezone,
  onExport,
  onDelete,
  onFieldChange,
  folders = [],
  statuses = [],
  templates = [],
  teamProfilesMap = {},
  currentUser,
  canEdit = true,
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showTzMenu, setShowTzMenu] = useState(false);
  const [tzQuery, setTzQuery] = useState('');
  const [folderQuery, setFolderQuery] = useState('');

  const statusBtnRef = useRef(null);
  const folderBtnRef = useRef(null);
  const tzBtnRef = useRef(null);
  const statusPanelRef = useRef(null);
  const folderPanelRef = useRef(null);
  const tzPanelRef = useRef(null);

  const [statusPos, setStatusPos] = useState(null);
  const [folderPos, setFolderPos] = useState(null);
  const [tzPos, setTzPos] = useState(null);

  const count = selectedIds.length;

  useEffect(() => {
    const onDocClick = (e) => {
      if (showStatusMenu && !statusBtnRef.current?.contains(e.target) && !statusPanelRef.current?.contains(e.target)) {
        setShowStatusMenu(false);
      }
      if (showFolderMenu && !folderBtnRef.current?.contains(e.target) && !folderPanelRef.current?.contains(e.target)) {
        setShowFolderMenu(false);
      }
      if (showTzMenu && !tzBtnRef.current?.contains(e.target) && !tzPanelRef.current?.contains(e.target)) {
        setShowTzMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showStatusMenu, showFolderMenu, showTzMenu]);

  if (count === 0) return null;

  const effectiveStatuses = statuses.length > 0
    ? statuses
    : (outreachMode === 'calls' ? DEFAULT_CALL_STATUSES : DEFAULT_STATUSES);

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(folderQuery.trim().toLowerCase()),
  );

  const allTimezones = [
    ...COUNTRY_TIMEZONE_OPTIONS.map((c) => ({
      name: `${c.name} (${c.timezone.split('/').pop()?.replace(/_/g, ' ')})`,
      tz: c.timezone,
      dial: c.dial,
    })),
  ];

  const filteredTimezones = allTimezones.filter(
    (item) =>
      item.name.toLowerCase().includes(tzQuery.toLowerCase()) ||
      item.tz.toLowerCase().includes(tzQuery.toLowerCase()) ||
      item.dial.includes(tzQuery.replace(/^\+/, '')),
  );

  const handleOpenStatus = () => {
    if (statusBtnRef.current) {
      setStatusPos(computePortalMenuPosition(statusBtnRef.current, { menuWidth: 180, menuHeight: 240 }));
    }
    setShowStatusMenu((p) => !p);
  };

  const handleOpenFolder = () => {
    if (folderBtnRef.current) {
      setFolderPos(computePortalMenuPosition(folderBtnRef.current, { menuWidth: 200, menuHeight: 260 }));
    }
    setShowFolderMenu((p) => !p);
  };

  const handleOpenTz = () => {
    if (tzBtnRef.current) {
      setTzPos(computePortalMenuPosition(tzBtnRef.current, { menuWidth: 260, menuHeight: 300 }));
    }
    setShowTzMenu((p) => !p);
  };

  return (
    <div
      className="bulk-action-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        padding: '0.5rem 0.85rem',
        background: 'var(--bg-secondary, #1A1A1A)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
        <span>{count} selected</span>
        {count === paginatedList.length && activeList.length > paginatedList.length && (
          <button
            type="button"
            onClick={onSelectAll}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '2px 6px', height: 22 }}
          >
            Select all {activeList.length} in view
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Set timezone */}
        <button
          ref={tzBtnRef}
          type="button"
          onClick={handleOpenTz}
          className="btn btn-secondary btn-sm"
          style={{ height: 28, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <Clock size={13} /> Set timezone
        </button>

        {/* Move to list */}
        <button
          ref={folderBtnRef}
          type="button"
          onClick={handleOpenFolder}
          className="btn btn-secondary btn-sm"
          style={{ height: 28, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <FolderInput size={13} /> Move to list
        </button>

        {/* Change status */}
        <button
          ref={statusBtnRef}
          type="button"
          onClick={handleOpenStatus}
          className="btn btn-secondary btn-sm"
          style={{ height: 28, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          Change status
        </button>

        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="btn btn-secondary btn-sm"
            style={{ height: 28, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Download size={13} /> Export
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="btn btn-danger btn-sm"
            style={{ height: 28, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Trash2 size={13} /> Delete
          </button>
        )}

        {/* Clear selection */}
        <button
          type="button"
          onClick={onClear}
          className="btn btn-secondary btn-sm"
          title="Clear selection"
          style={{ height: 28, fontSize: 12, padding: '0 8px' }}
        >
          Clear
        </button>
      </div>

      {/* Portaled Timezone Menu */}
      {showTzMenu && tzPos && createPortal(
        <div
          ref={tzPanelRef}
          className="rd-menu"
          style={{ ...portalMenuStyle(tzPos), width: 260, maxHeight: 300, display: 'flex', flexDirection: 'column' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rd-menu__search" style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', borderRadius: 4, padding: '2px 6px' }}>
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                type="search"
                className="rd-menu__search-input"
                placeholder="Search country or timezone…"
                value={tzQuery}
                onChange={(e) => setTzQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 12, color: 'var(--text-primary)' }}
                autoFocus
              />
            </div>
          </div>
          <div className="rd-menu__list rd-menu__list--tall" style={{ flex: 1, overflowY: 'auto' }}>
            {filteredTimezones.map((item) => (
              <button
                key={item.tz + item.name}
                type="button"
                className="rd-menu__item"
                onClick={() => {
                  onSetTimezone?.(item.tz);
                  setShowTzMenu(false);
                }}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 8px' }}
              >
                <span className="rd-menu__item-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{item.dial}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* Portaled Move to List Menu */}
      {showFolderMenu && folderPos && createPortal(
        <div
          ref={folderPanelRef}
          className="rd-menu"
          style={{ ...portalMenuStyle(folderPos), width: 200, maxHeight: 260, display: 'flex', flexDirection: 'column' }}
          onClick={(e) => e.stopPropagation()}
        >
          {folders.length > 5 && (
            <div className="rd-menu__search" style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
              <input
                type="search"
                className="rd-menu__search-input"
                placeholder="Filter lists…"
                value={folderQuery}
                onChange={(e) => setFolderQuery(e.target.value)}
                style={{ width: '100%', fontSize: 11 }}
                autoFocus
              />
            </div>
          )}
          <div className="rd-menu__list" style={{ flex: 1, overflowY: 'auto' }}>
            <button
              type="button"
              className="rd-menu__item"
              onClick={() => {
                onMoveToFolder?.('');
                setShowFolderMenu(false);
              }}
              style={{ fontSize: 12, padding: '6px 8px' }}
            >
              (Unfiled)
            </button>
            {filteredFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="rd-menu__item"
                onClick={() => {
                  onMoveToFolder?.(f.id);
                  setShowFolderMenu(false);
                }}
                style={{ fontSize: 12, padding: '6px 8px' }}
              >
                <span className="rd-menu__item-label">{f.name}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* Portaled Change Status Menu */}
      {showStatusMenu && statusPos && createPortal(
        <div
          ref={statusPanelRef}
          className="rd-menu"
          style={{ ...portalMenuStyle(statusPos), width: 180, maxHeight: 240, overflowY: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rd-menu__list">
            {effectiveStatuses.map((s) => (
              <button
                key={s.label}
                type="button"
                className="rd-menu__item"
                onClick={() => {
                  onStatusChange?.(s.label);
                  setShowStatusMenu(false);
                }}
                style={{ fontSize: 12, padding: '6px 8px' }}
              >
                <span className="rd-menu__item-label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
