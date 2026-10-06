import { useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useCrmTableLayout } from './useCrmTableLayout';
import { getAllViewColumns } from './crmTableColumns';
import { computePillColumnMinWidth, computePillColumnAutoFitWidth, isPillColumn } from '../../lib/pillColumnWidths';
import { useAppContext } from '../../App';

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
export function useColumnPrefs({
  tableView,
  columnDefs,
  setColumnDefs,
  showToast: propsShowToast,
  statuses,
  callStatuses,
  customChannels,
  templates,
  leads,
  teamProfilesMap,
}) {
  const { showToast: appShowToast } = useAppContext() || {};
  const notifyError = useCallback((msg) => {
    const fn = propsShowToast || appShowToast;
    if (typeof fn === 'function') {
      fn(msg, 'error');
    } else {
      console.error(msg);
    }
  }, [propsShowToast, appShowToast]);

  const optionsContext = useMemo(() => ({
    statuses,
    callStatuses,
    customChannels,
    templates,
    columnDefs,
    leads,
    teamProfilesMap,
  }), [statuses, callStatuses, customChannels, templates, columnDefs, leads, teamProfilesMap]);

  // Legacy localStorage widths: used as the fallback default for columns with
  // no saved width yet, and as the store for non-definition columns (e.g. "Added By").
  const legacy = useCrmTableLayout(tableView, optionsContext);

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

    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const def = snapshot.find((d) => d.id === id);
          if (!def) return { error: null };
          const patch = patchesById[id];
          return supabase
            .from('column_definitions')
            .update(patch)
            .match({
              user_id: def.user_id,
              table_view: def.table_view,
              column_key: def.column_key,
            });
        }),
      );
      const failed = results.find((r) => r?.error);
      if (failed?.error) {
        console.error('Failed to save column preferences:', failed.error);
        setColumnDefs(snapshot);
        const errText = failed.error.message || failed.error.details || 'unknown error';
        notifyError('Failed to save column preferences: ' + errText);
      }
    } catch (err) {
      console.error('Failed to save column preferences:', err);
      setColumnDefs(snapshot);
      notifyError('Failed to save column preferences: ' + (err?.message || 'unknown error'));
    }
  }, [setColumnDefs, notifyError]);

  const getColMinWidth = useCallback((colOrKey) => {
    const def = typeof colOrKey === 'string' ? defsByKey.get(colOrKey) : colOrKey;
    return computePillColumnMinWidth(def || { column_key: typeof colOrKey === 'string' ? colOrKey : '' }, optionsContext);
  }, [defsByKey, optionsContext]);

  // ── Width ────────────────────────────────────────────────────────────────
  const getWidth = useCallback((key) => {
    const def = defsByKey.get(key);
    const minW = computePillColumnMinWidth(def || { column_key: key }, optionsContext);
    if (def?.width) return Math.max(def.width, minW);
    return Math.max(legacy.getWidth(key), minW);
  }, [defsByKey, legacy, optionsContext]);

  const setWidth = useCallback((key, width) => {
    const def = defsByKey.get(key);
    const minW = computePillColumnMinWidth(def || { column_key: key }, optionsContext);
    const next = Math.max(minW, Math.min(MAX_COL, Math.round(width)));
    if (!isPersistableColumn(def)) {
      legacy.setWidth(key, next);
      return;
    }
    // Instant local update (no DB write per mousemove)
    setColumnDefs((prev) => prev.map((c) => (c.id === def.id ? { ...c, width: next } : c)));
    clearTimeout(widthTimers.current[def.id]);
    widthTimers.current[def.id] = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('column_definitions')
          .update({ width: next })
          .match({
            user_id: def.user_id,
            table_view: def.table_view,
            column_key: def.column_key,
          });
        if (error) {
          console.error('Failed to save column width:', error);
          setColumnDefs((prev) => prev.map((c) => (c.id === def.id ? { ...c, width: def.width } : c)));
          const errText = error.message || error.details || 'unknown error';
          notifyError('Failed to save column width: ' + errText);
        }
      } catch (err) {
        console.error('Failed to save column width:', err);
        setColumnDefs((prev) => prev.map((c) => (c.id === def.id ? { ...c, width: def.width } : c)));
        notifyError('Failed to save column width: ' + (err?.message || 'unknown error'));
      }
    }, WIDTH_SAVE_DEBOUNCE_MS);
  }, [defsByKey, legacy, setColumnDefs, notifyError, optionsContext]);

  const resetWidth = useCallback((key) => {
    const def = defsByKey.get(key);
    legacy.resetWidth(key);
    if (!isPersistableColumn(def)) return;
    clearTimeout(widthTimers.current[def.id]);
    applyPatches({ [def.id]: { width: null } });
  }, [defsByKey, legacy, applyPatches]);

  const autoFitWidth = useCallback((key) => {
    const def = defsByKey.get(key);
    const autoW = computePillColumnAutoFitWidth(def || { column_key: key }, optionsContext);
    setWidth(key, autoW);
  }, [defsByKey, optionsContext, setWidth]);

  // When a user adds/renames a dropdown option to something longer, recompute minWidth and widen the column automatically
  useEffect(() => {
    viewDefs.forEach((def) => {
      if (!isPillColumn(def)) return;
      const minW = computePillColumnMinWidth(def, optionsContext);
      const currentW = def.width || legacy.getWidth(def.column_key);
      if (currentW < minW) {
        setWidth(def.column_key, minW);
      }
    });
  }, [viewDefs, optionsContext, legacy, setWidth]);

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
    if (Object.keys(patches).length) applyPatches(patches);
  }, [defsByKey, applyPatches]);

  const resetOrder = useCallback(() => {
    const current = viewDefs.filter((d) => isPersistableColumn(d));
    const sorted = [...current].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    applyPatches(orderPatches(sorted));
  }, [viewDefs, applyPatches]);

  const setColumnOrder = useCallback((orderedKeys) => {
    const keyMap = new Map();
    viewDefs.forEach((d) => keyMap.set(d.column_key, d));
    const ordered = orderedKeys.map((k) => keyMap.get(k)).filter(Boolean);
    applyPatches(orderPatches(ordered));
  }, [viewDefs, applyPatches]);

  return {
    viewDefs,
    getWidth,
    setWidth,
    resetWidth,
    autoFitWidth,
    getColMinWidth,
    togglePin,
    setWrap,
    hideColumn,
    showColumns,
    resetOrder,
    setColumnOrder,
    setColumnDefs,
  };
}
