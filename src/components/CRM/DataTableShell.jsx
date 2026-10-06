import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, EyeOff, GripVertical, Pin, PinOff, Scissors, WrapText } from 'lucide-react';
import { isAlwaysClipped } from './crmTableColumns';
import { isPersistableColumn } from './useColumnPrefs';
import './DataTableShell.css';

const SELECT_W = 40;
const ROWNUM_W = 48;
const DRAG_THRESHOLD = 6;
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_MAX_STEP = 18;
const NO_DRAG_SELECTOR =
  '.rd-dt-resize, .rd-dt-menu-btn, input, button, select, textarea, a, [data-no-drag]';

/* ── Column header menu (portal, rd-menu style) ─────────────────────────── */
function ColumnHeaderMenu({
  col,
  anchorRect,
  onClose,
  onTogglePin,
  onSetWrap,
  onHide,
  canHide,
  reachMode = 'icons',
  onSetReachMode,
}) {
  const ref = useRef(null);
  const fixed = isAlwaysClipped(col);
  const wrapMode = col.wrap_mode === 'wrap' ? 'wrap' : 'clip';
  const isReachCol = col.column_key === 'platform' || col.column_key === 'reach' || col.column_type === 'reach';

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onScroll = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const MENU_W = 224;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - MENU_W - 8));
  const top = anchorRect.bottom + 4;

  const run = (fn) => () => { fn(); onClose(); };

  return createPortal(
    <div
      ref={ref}
      className="rd-menu rd-dt-menu"
      role="menu"
      style={{ left, top, width: MENU_W }}
      onClick={(e) => e.stopPropagation()}
    >
      {isReachCol && (
        <>
          <div className="rd-menu__group-label">Show links as</div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={reachMode !== 'full_links'}
            className="rd-menu__item"
            onClick={run(() => onSetReachMode?.('icons'))}
          >
            <span className="rd-dt-menu__lead">Icons</span>
            {reachMode !== 'full_links' && <Check size={14} />}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={reachMode === 'full_links'}
            className="rd-menu__item"
            onClick={run(() => onSetReachMode?.('full_links'))}
          >
            <span className="rd-dt-menu__lead">Full links</span>
            {reachMode === 'full_links' && <Check size={14} />}
          </button>
          <div className="rd-menu__sep" />
        </>
      )}

      <button type="button" role="menuitem" className="rd-menu__item" onClick={run(onTogglePin)}>
        <span className="rd-dt-menu__lead">
          {col.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
          {col.is_pinned ? 'Unpin column' : 'Pin column'}
        </span>
      </button>

      <div className="rd-menu__sep" />
      <div className="rd-menu__group-label">Text wrapping</div>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={!fixed && wrapMode === 'wrap'}
        className="rd-menu__item"
        disabled={fixed}
        onClick={run(() => onSetWrap('wrap'))}
      >
        <span className="rd-dt-menu__lead"><WrapText size={14} /> Wrap</span>
        {!fixed && wrapMode === 'wrap' && <Check size={14} />}
      </button>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={fixed || wrapMode === 'clip'}
        className="rd-menu__item"
        disabled={fixed}
        onClick={run(() => onSetWrap('clip'))}
      >
        <span className="rd-dt-menu__lead"><Scissors size={14} /> Clip</span>
        {(fixed || wrapMode === 'clip') && <Check size={14} />}
      </button>
      {fixed && <div className="rd-dt-menu__note">Always clipped for this column</div>}

      <div className="rd-menu__sep" />
      <button
        type="button"
        role="menuitem"
        className="rd-menu__item"
        disabled={!canHide}
        title={canHide ? undefined : 'At least one column must stay visible'}
        onClick={run(onHide)}
      >
        <span className="rd-dt-menu__lead"><EyeOff size={14} /> Hide column</span>
      </button>
    </div>,
    document.body,
  );
}

/* ── Resize handle (sits on the column divider) ─────────────────────────── */
function ResizeHandle({ columnKey, width, minWidth = 80, onResize, onReset, onAutoFit }) {
  const [active, setActive] = useState(false);

  const onMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;
    setActive(true);
    document.body.classList.add('rd-dt-resizing');
    const onMove = (ev) => {
      const nextW = Math.max(minWidth, Math.min(560, startW + (ev.clientX - startX)));
      onResize(columnKey, nextW);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('rd-dt-resizing');
      setActive(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      title="Drag to resize · Double-click to auto-fit"
      className={`rd-dt-resize${active ? ' is-active' : ''}`}
      onMouseDown={onMouseDown}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onAutoFit) {
          onAutoFit(columnKey);
        } else if (onReset) {
          onReset(columnKey);
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/**
 * Shared table shell for the Leads tables (Message Outreach + Cold Calls).
 * Owns: scroll container, sticky header, pinning + offsets, grid lines,
 * wrap/clip, header menu, hidden-column tags, resize and drag-to-reorder.
 * Cell CONTENT is rendered by the caller through renderCell (unchanged renderers).
 */
export default function DataTableShell({
  prefs,
  columns,
  rows,
  getRowKey,
  getRowProps,
  isRowSelected,
  selectHeader,
  renderSelectCell,
  showRowNumbers = false,
  getRowNumber,
  renderHeaderLabel,
  getHeaderText,
  renderCell,
  getCellTitle,
  trailingColumns = [],
  onHeaderClick,
  emptyMessage = 'No records found.',
  className = '',
  maxHeightOffset = 140,
  topRow = null,
  reachMode = 'icons',
  onSetReachMode,
}) {
  const wrapRef = useRef(null);
  const tableRef = useRef(null);
  const thRefs = useRef({});
  const suppressClickRef = useRef(false);

  const [scrolledX, setScrolledX] = useState(false);
  const scrolledXRef = useRef(false);
  const [menu, setMenu] = useState(null); // { key, rect }
  const [drag, setDrag] = useState(null); // { key, label, x, y, lineX, lineTop, lineHeight }
  const dragRef = useRef(null);

  // ── Display order: pinned group first (in pin order), then the rest ─────
  const isPinned = (c) => !!c.is_pinned && !c._virtual;
  const pinnedCols = columns.filter(isPinned);
  const unpinnedCols = columns.filter((c) => !isPinned(c));
  const displayCols = [...pinnedCols, ...unpinnedCols];
  const anyPinned = pinnedCols.length > 0;

  // Checkbox (and row number) pin ONLY when at least one other column is pinned.
  const leadingKeys = ['_select', ...(showRowNumbers ? ['_row_num'] : [])];
  const pinnedChain = anyPinned ? [...leadingKeys, ...pinnedCols.map((c) => c.column_key)] : [];

  const widthOf = useCallback((key) => {
    if (key === '_select') return SELECT_W;
    if (key === '_row_num') return ROWNUM_W;
    return prefs.getWidth(key);
  }, [prefs]);

  // ── Pinned left offsets: computed from the REAL rendered widths ─────────
  const fallbackOffsets = useMemo(() => {
    const out = {};
    let left = 0;
    pinnedChain.forEach((k) => { out[k] = left; left += widthOf(k); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedChain.join('|'), widthOf]);

  const [measuredOffsets, setMeasuredOffsets] = useState({});
  const chainSig = pinnedChain.map((k) => `${k}:${widthOf(k)}`).join('|');

  useLayoutEffect(() => {
    const next = {};
    let left = 0;
    pinnedChain.forEach((k) => {
      next[k] = left;
      const el = thRefs.current[k];
      left += el ? el.getBoundingClientRect().width : widthOf(k);
    });
    setMeasuredOffsets((prev) => {
      const a = Object.keys(prev);
      const b = Object.keys(next);
      if (a.length === b.length && b.every((k) => prev[k] === next[k])) return prev;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainSig]);

  const offsetOf = (key) => (measuredOffsets[key] ?? fallbackOffsets[key] ?? 0);

  const visibleCount = prefs.viewDefs.filter((d) => d.is_visible).length;

  // ── Horizontal scroll state (edge shadow only while scrolled) ───────────
  const onScroll = (e) => {
    const s = e.currentTarget.scrollLeft > 0;
    if (s !== scrolledXRef.current) {
      scrolledXRef.current = s;
      setScrolledX(s);
    }
  };

  // ── Drag to reorder ─────────────────────────────────────────────────────
  const layoutRef = useRef({});
  layoutRef.current = {
    pinnedKeys: pinnedCols.filter(isPersistableColumn).map((c) => c.column_key),
    unpinnedKeys: unpinnedCols.filter(isPersistableColumn).map((c) => c.column_key),
    reorder: prefs.reorderColumns,
  };

  const computeDrop = useCallback(() => {
    const d = dragRef.current;
    if (!d) return null;
    const { pinnedKeys, unpinnedKeys } = layoutRef.current;
    const groupKeys = d.group === 'pinned' ? pinnedKeys : unpinnedKeys;
    const others = groupKeys.filter((k) => k !== d.key);
    const rects = others.map((k) => thRefs.current[k]?.getBoundingClientRect()).filter(Boolean);
    let index = 0;
    rects.forEach((r) => { if (d.lastX > r.left + r.width / 2) index += 1; });
    let lineX;
    if (rects.length === 0) lineX = thRefs.current[d.key]?.getBoundingClientRect().left ?? d.lastX;
    else if (index === 0) lineX = rects[0].left;
    else lineX = rects[index - 1].right;
    return { index, lineX, others };
  }, []);

  const refreshDragVisual = useCallback(() => {
    const d = dragRef.current;
    if (!d || !d.active || !wrapRef.current || !tableRef.current) return;
    const drop = computeDrop();
    if (!drop) return;
    d.dropIndex = drop.index;
    const wr = wrapRef.current.getBoundingClientRect();
    const tr = tableRef.current.getBoundingClientRect();
    const top = Math.max(wr.top, tr.top);
    const bottom = Math.min(wr.bottom, tr.bottom);
    const lineX = Math.max(wr.left, Math.min(wr.right, drop.lineX));
    setDrag({
      key: d.key,
      label: d.label,
      x: d.lastX,
      y: d.lastY,
      lineX,
      lineTop: top,
      lineHeight: Math.max(0, bottom - top),
    });
  }, [computeDrop]);

  const autoScrollLoop = useCallback(() => {
    const d = dragRef.current;
    const wrap = wrapRef.current;
    if (!d || !d.active || !wrap) return;
    const r = wrap.getBoundingClientRect();
    let step = 0;
    if (d.lastX < r.left + AUTOSCROLL_EDGE) {
      step = -Math.ceil(((r.left + AUTOSCROLL_EDGE - d.lastX) / AUTOSCROLL_EDGE) * AUTOSCROLL_MAX_STEP);
    } else if (d.lastX > r.right - AUTOSCROLL_EDGE) {
      step = Math.ceil(((d.lastX - (r.right - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE) * AUTOSCROLL_MAX_STEP);
    }
    if (step !== 0) {
      const before = wrap.scrollLeft;
      wrap.scrollLeft = before + step;
      if (wrap.scrollLeft !== before) refreshDragVisual();
    }
    d.raf = requestAnimationFrame(autoScrollLoop);
  }, [refreshDragVisual]);

  const endDrag = useCallback((commit) => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMoveRef.current);
    window.removeEventListener('pointerup', onPointerUpRef.current);
    window.removeEventListener('pointercancel', onPointerCancelRef.current);
    if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    if (!d.active) return;

    document.body.classList.remove('rd-dt-col-dragging');
    setDrag(null);

    // Never let the click that ends a drag trigger sorting / row clicks.
    suppressClickRef.current = true;
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, true);
    setTimeout(() => {
      window.removeEventListener('click', swallow, true);
      suppressClickRef.current = false;
    }, 0);

    if (!commit || d.dropIndex == null) return;
    const { pinnedKeys, unpinnedKeys, reorder } = layoutRef.current;
    const groupKeys = d.group === 'pinned' ? pinnedKeys : unpinnedKeys;
    const others = groupKeys.filter((k) => k !== d.key);
    const nextGroup = [...others.slice(0, d.dropIndex), d.key, ...others.slice(d.dropIndex)];
    const full = d.group === 'pinned' ? [...nextGroup, ...unpinnedKeys] : [...pinnedKeys, ...nextGroup];
    const current = [...pinnedKeys, ...unpinnedKeys];
    if (full.join('|') !== current.join('|')) reorder(full);
  }, []);

  const onPointerMoveRef = useRef(null);
  const onPointerUpRef = useRef(null);
  const onPointerCancelRef = useRef(null);

  onPointerMoveRef.current = onPointerMoveRef.current || ((e) => {
    const d = dragRef.current;
    if (!d) return;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.active = true;
      setMenu(null);
      window.getSelection?.()?.removeAllRanges?.();
      document.body.classList.add('rd-dt-col-dragging');
      d.raf = requestAnimationFrame(autoScrollLoopRef.current);
    }
    refreshDragVisualRef.current();
  });
  onPointerUpRef.current = onPointerUpRef.current || (() => endDragRef.current(true));
  onPointerCancelRef.current = onPointerCancelRef.current || (() => endDragRef.current(false));

  const autoScrollLoopRef = useRef(autoScrollLoop);
  autoScrollLoopRef.current = autoScrollLoop;
  const refreshDragVisualRef = useRef(refreshDragVisual);
  refreshDragVisualRef.current = refreshDragVisual;
  const endDragRef = useRef(endDrag);
  endDragRef.current = endDrag;

  useEffect(() => () => endDragRef.current(false), []);

  const onHeaderPointerDown = (e, col, label) => {
    if (e.button !== 0) return;
    if (e.target.closest(NO_DRAG_SELECTOR)) return;
    dragRef.current = {
      key: col.column_key,
      label,
      group: isPinned(col) ? 'pinned' : 'unpinned',
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      active: false,
      dropIndex: null,
      raf: null,
    };
    window.addEventListener('pointermove', onPointerMoveRef.current);
    window.addEventListener('pointerup', onPointerUpRef.current);
    window.addEventListener('pointercancel', onPointerCancelRef.current);
  };

  // ── Per-column cell classes / styles ────────────────────────────────────
  const colMeta = displayCols.map((col, i) => {
    const key = col.column_key;
    const pinned = isPinned(col);
    const fixed = isAlwaysClipped(col);
    const wrap = !fixed && col.wrap_mode === 'wrap';
    const w = widthOf(key);
    const cls = [
      'rd-dt-cell',
      pinned && 'rd-dt-pinned',
      pinned && i === pinnedCols.length - 1 && 'rd-dt-pin-last',
      fixed ? 'rd-dt-fixed' : wrap ? 'rd-dt-wrap' : 'rd-dt-clip',
      drag?.key === key && 'rd-dt-drag-source',
    ].filter(Boolean).join(' ');
    const style = { width: w, minWidth: w, maxWidth: w };
    if (pinned) style.left = offsetOf(key);
    return { col, key, pinned, fixed, wrap, w, cls, style };
  });

  const leadingCell = (key) => {
    const w = widthOf(key);
    const pinned = anyPinned;
    const cls = [
      key === '_select' ? 'rd-dt-select' : 'rd-dt-rownum',
      pinned && 'rd-dt-pinned',
    ].filter(Boolean).join(' ');
    const style = { width: w, minWidth: w, maxWidth: w };
    if (pinned) style.left = offsetOf(key);
    return { cls, style };
  };

  const selectMeta = leadingCell('_select');
  const rowNumMeta = showRowNumbers ? leadingCell('_row_num') : null;
  const totalCols = leadingKeys.length + displayCols.length + trailingColumns.length;

  const menuCol = menu ? displayCols.find((c) => c.column_key === menu.key) : null;

  return (
    <div
      ref={wrapRef}
      className={`rd-dt-shell${scrolledX ? ' is-scrolled-x' : ''} ${className}`.trim()}
      style={{ '--rd-dt-offset': `${maxHeightOffset}px` }}
      onScroll={onScroll}
    >
      <table ref={tableRef} className="data-table rd-dt">
        <thead>
          <tr>
            <th
              ref={(el) => { thRefs.current._select = el; }}
              className={selectMeta.cls}
              style={selectMeta.style}
            >
              {selectHeader}
            </th>
            {rowNumMeta && (
              <th
                ref={(el) => { thRefs.current._row_num = el; }}
                className={rowNumMeta.cls}
                style={rowNumMeta.style}
              >
                #
              </th>
            )}

            {colMeta.map(({ col, key, pinned, cls, style, w }) => {
              const persistable = isPersistableColumn(col);
              const headerText = getHeaderText ? getHeaderText(col) : col.column_label;
              return (
                <th
                  key={col.id || key}
                  ref={(el) => { thRefs.current[key] = el; }}
                  className={`rd-dt-th ${cls}`}
                  style={style}
                  data-col={key}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    onHeaderClick?.(col);
                  }}
                >
                  <div className="rd-dt-th__inner">
                    {persistable && (
                      <span
                        className="rd-dt-grip"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onHeaderPointerDown(e, col, headerText);
                        }}
                        title="Drag to reorder column"
                      >
                        <GripVertical size={12} />
                      </span>
                    )}
                    <span className="rd-dt-th__label" title={headerText}>
                      {renderHeaderLabel ? renderHeaderLabel(col) : col.column_label}
                    </span>
                    {pinned && <Pin size={11} className="rd-dt-th__pin" aria-label="Pinned" />}
                    {persistable && (
                      <button
                        type="button"
                        className="rd-dt-menu-btn"
                        aria-label={`${headerText} column options`}
                        aria-haspopup="menu"
                        aria-expanded={menu?.key === key}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menu?.key === key) { setMenu(null); return; }
                          setMenu({ key, rect: e.currentTarget.getBoundingClientRect() });
                        }}
                      >
                        <ChevronDown size={13} />
                      </button>
                    )}
                  </div>
                  <ResizeHandle
                    columnKey={key}
                    width={w}
                    minWidth={prefs.getColMinWidth ? prefs.getColMinWidth(col) : 80}
                    onResize={prefs.setWidth}
                    onReset={prefs.resetWidth}
                    onAutoFit={prefs.autoFitWidth || prefs.resetWidth}
                  />
                </th>
              );
            })}

            {trailingColumns.map((tc, i) => {
              const isLast = i === trailingColumns.length - 1;
              const w = tc.resizable ? prefs.getWidth(tc.key) : tc.width;
              // The last column has no fixed width so it absorbs spare space.
              const style = isLast
                ? { minWidth: tc.minWidth || w || 100, ...tc.thStyle }
                : { width: w, minWidth: w, maxWidth: w, ...tc.thStyle };
              return (
                <th key={tc.key} className="rd-dt-th rd-dt-trailing" style={style} data-col={tc.key}>
                  <div className="rd-dt-th__inner">
                    <span className="rd-dt-th__label" style={tc.labelStyle}>{tc.header}</span>
                  </div>
                  {tc.resizable && !isLast && (
                    <ResizeHandle
                      columnKey={tc.key}
                      width={w}
                      minWidth={tc.minWidth || 80}
                      onResize={prefs.setWidth}
                      onReset={prefs.resetWidth}
                      onAutoFit={prefs.autoFitWidth || prefs.resetWidth}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {topRow}
          {rows.length === 0 ? (
            <tr className="rd-dt-row rd-dt-empty">
              <td colSpan={totalCols} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const rowKey = getRowKey(row);
              const selected = !!isRowSelected?.(row);
              const { className: rowCls = '', ...rowProps } = getRowProps?.(row, rowIndex) || {};
              return (
                <tr
                  key={rowKey}
                  {...rowProps}
                  className={`rd-dt-row${selected ? ' is-selected' : ''} ${rowCls}`.trim()}
                >
                  <td className={selectMeta.cls} style={selectMeta.style} onClick={(e) => e.stopPropagation()}>
                    {renderSelectCell?.(row)}
                  </td>
                  {rowNumMeta && (
                    <td className={rowNumMeta.cls} style={rowNumMeta.style}>
                      {getRowNumber ? getRowNumber(row, rowIndex) : rowIndex + 1}
                    </td>
                  )}

                  {colMeta.map(({ col, key, cls, style, fixed, wrap }) => {
                    let title;
                    if (!fixed && !wrap && getCellTitle) {
                      const t = getCellTitle(row, col);
                      if (t != null && String(t).trim() !== '') title = String(t);
                    }
                    const cellProps = { className: cls, style, title, 'data-col': key };
                    return (
                      <React.Fragment key={col.id || key}>
                        {renderCell(row, col, cellProps, rowIndex)}
                      </React.Fragment>
                    );
                  })}

                  {trailingColumns.map((tc, i) => {
                    const isLast = i === trailingColumns.length - 1;
                    const w = tc.resizable ? prefs.getWidth(tc.key) : tc.width;
                    const style = isLast ? undefined : { width: w, minWidth: w, maxWidth: w };
                    const cellProps = { className: 'rd-dt-cell rd-dt-trailing rd-dt-clip', style, 'data-col': tc.key };
                    return (
                      <React.Fragment key={tc.key}>
                        {tc.renderCell(row, cellProps, rowIndex)}
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {menuCol && (
        <ColumnHeaderMenu
          col={menuCol}
          anchorRect={menu.rect}
          onClose={() => setMenu(null)}
          onTogglePin={() => prefs.togglePin(menuCol.column_key)}
          onSetWrap={(mode) => prefs.setWrap(menuCol.column_key, mode)}
          onHide={() => prefs.hideColumn(menuCol.column_key)}
          canHide={visibleCount > 1}
          reachMode={reachMode}
          onSetReachMode={onSetReachMode}
        />
      )}

      {drag && createPortal(
        <>
          <div
            className="rd-dt-drop-line"
            style={{ left: drag.lineX, top: drag.lineTop, height: drag.lineHeight }}
          />
          <div className="rd-dt-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
            {drag.label}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
