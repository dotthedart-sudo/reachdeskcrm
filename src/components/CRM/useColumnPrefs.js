import { useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useCrmTableLayout } from './useCrmTableLayout';
import { getAllViewColumns } from './crmTableColumns';

const MIN_COL = 64;
const MAX_COL = 560;
const WIDTH_SAVE_DEBOUNCE_MS = 500;

/** Virtual columns (no column_definitions row) can't be persisted. */
export function isPersistableColumn(col) {
  return !!col && !col._virtual && typeof col.id === 'string' && col.id.length > 20;
}

/**
 * Column preferences for one table_view, backed ONLY by column_definitions
 * (per user + table_view): visibility, order, width, pin and wrap.
 *
 * Every change is optimistic: local state updates immediately, the DB write
 * happens in the background and is rolled back if it fails.
 * Width writes are debounced per column.
 */
export function useColumnPrefs({ tableView, columnDefs, setColumnDefs }) {
  // Legacy localStorage widths: used as the fallback default for columns with
  // no saved width yet, and as the store for non-definition columns (e.g. "Added By").
  const legacy = useCrmTableLayout(tableView);

  const viewDefs = useMemo(() => getAllViewColumns(columnDefs, tableView), [columnDefs, tableView]);
  const defsByKey = useMemo(() => {
    const m = new Map();
    viewDefs.forEach((d) => m.set(d.column_key, d));
    return m;
  }, [viewDefs]);

  const defsRef = useRef(columnDefs);
  defsRef.current = columnDefs;
  const widthTimers = useRef({});

  // Keep the local cache (used for instant first paint) in sync.
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem('crm_columns', JSON.stringify(columnDefs)); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [columnDefs]);

  useEffect(() => () => {
    Object.values(widthTimers.current).forEach(clearTimeout);
  }, []);

  /** Optimistically apply { [id]: patch } and persist; roll back on failure. */
  const applyPatches = useCallback(async (patchesById) => {
    const ids = Object.keys(patchesById);
    if (ids.length === 0) return;
    const snapshot = defsRef.current;
    setColumnDefs((prev) => prev.map((c) => (patchesById[c.id] ? { ...c, ...patchesById[c.id] } : c)));

    const results = await Promise.all(
      ids.map((id) => supabase.from('column_definitions').update(patchesById[id]).eq('id', id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      console.error('Failed to save column preferences:', failed.error);
      setColumnDefs(snapshot);
    }
  }, [setColumnDefs]);

  // ── Width ────────────────────────────────────────────────────────────────
  const getWidth = useCallback((key) => {
    const def = defsByKey.get(key);
    if (def?.width) return def.width;
    return legacy.getWidth(key);
  }, [defsByKey, legacy]);

  const setWidth = useCallback((key, width) => {
    const next = Math.max(MIN_COL, Math.min(MAX_COL, Math.round(width)));
    const def = defsByKey.get(key);
    if (!isPersistableColumn(def)) {
      legacy.setWidth(key, next);
      return;
    }
    // Instant local update (no DB write per mousemove)
    setColumnDefs((prev) => prev.map((c) => (c.id === def.id ? { ...c, width: next } : c)));
    clearTimeout(widthTimers.current[def.id]);
    widthTimers.current[def.id] = setTimeout(async () => {
      const { error } = await supabase.from('column_definitions').update({ width: next }).eq('id', def.id);
      if (error) console.error('Failed to save column width:', error);
    }, WIDTH_SAVE_DEBOUNCE_MS);
  }, [defsByKey, legacy, setColumnDefs]);

  const resetWidth = useCallback((key) => {
    const def = defsByKey.get(key);
    legacy.resetWidth(key);
    if (!isPersistableColumn(def)) return;
    clearTimeout(widthTimers.current[def.id]);
    applyPatches({ [def.id]: { width: null } });
  }, [defsByKey, legacy, applyPatches]);

  // ── Order helpers ────────────────────────────────────────────────────────
  /** Turn a full ordered list of defs into sort_order patches (only changed rows). */
  const orderPatches = (ordered, extra = {}) => {
    const patches = {};
    ordered.forEach((d, idx) => {
      const p = { ...(extra[d.id] || {}) };
      if (d.sort_order !== idx) p.sort_order = idx;
      if (Object.keys(p).length) patches[d.id] = p;
    });
    Object.keys(extra).forEach((id) => {
      if (!patches[id]) patches[id] = extra[id];
    });
    return patches;
  };

  // ── Pin ──────────────────────────────────────────────────────────────────
  const togglePin = useCallback((key) => {
    const def = defsByKey.get(key);
    if (!isPersistableColumn(def)) return;
    if (def.is_pinned) {
      // Unpin: stays where it is in sort order (right after the pinned group).
      applyPatches({ [def.id]: { is_pinned: false } });
      return;
    }
    // Pin: move to the end of the pinned group, so pinned columns keep pin order.
    const rest = viewDefs.filter((d) => d.id !== def.id);
    let lastPinnedIdx = -1;
    rest.forEach((d, i) => { if (d.is_pinned && d.is_visible) lastPinnedIdx = i; });
    const ordered = [...rest.slice(0, lastPinnedIdx + 1), def, ...rest.slice(lastPinnedIdx + 1)];
    applyPatches(orderPatches(ordered, { [def.id]: { is_pinned: true } }));
  }, [defsByKey, viewDefs, applyPatches]);

  // ── Wrap ─────────────────────────────────────────────────────────────────
  const setWrap = useCallback((key, mode) => {
    const def = defsByKey.get(key);
    if (!isPersistableColumn(def) || def.wrap_mode === mode) return;
    applyPatches({ [def.id]: { wrap_mode: mode } });
  }, [defsByKey, applyPatches]);

  // ── Hide / show ──────────────────────────────────────────────────────────
  const hideColumn = useCallback((key) => {
    const def = defsByKey.get(key);
    if (!isPersistableColumn(def)) return;
    const visibleCount = viewDefs.filter((d) => d.is_visible).length;
    if (visibleCount <= 1) return;
    applyPatches({ [def.id]: { is_visible: false, is_pinned: false } });
  }, [defsByKey, viewDefs, applyPatches]);

  const showColumns = useCallback((keys) => {
    const patches = {};
    keys.forEach((k) => {
      const def = defsByKey.get(k);
      if (isPersistableColumn(def) && !def.is_visible) patches[def.id] = { is_visible: true };
    });
    applyPatches(patches);
  }, [defsByKey, applyPatches]);

  // ── Reorder (drag) ───────────────────────────────────────────────────────
  /**
   * orderedVisibleKeys: the new left-to-right order of the visible, persistable
   * columns. Hidden columns keep their relative slots.
   */
  const reorderColumns = useCallback((orderedVisibleKeys) => {
    const visibleSet = new Set(orderedVisibleKeys);
    const queue = orderedVisibleKeys.map((k) => defsByKey.get(k)).filter(Boolean);
    const ordered = viewDefs.map((d) => (visibleSet.has(d.column_key) ? queue.shift() : d));
    applyPatches(orderPatches(ordered));
  }, [defsByKey, viewDefs, applyPatches]);

  return {
    tableView,
    viewDefs,
    getWidth,
    setWidth,
    resetWidth,
    getRowHeight: legacy.getRowHeight,
    setRowHeight: legacy.setRowHeight,
    resetRowHeight: legacy.resetRowHeight,
    togglePin,
    setWrap,
    hideColumn,
    showColumns,
    reorderColumns,
  };
}
