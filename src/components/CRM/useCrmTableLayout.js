import { useCallback, useEffect, useRef, useState } from 'react';
import { computePillColumnMinWidth, computePillColumnAutoFitWidth } from '../../lib/pillColumnWidths';

const WIDTH_PREFIX = 'crm_column_widths_';
const ROW_PREFIX = 'crm_row_heights_';

const DEFAULT_WIDTHS = {
  name: 180,
  priority: 110,
  status: 140,
  call_status: 140,
  outcome: 140,
  outreach_channel: 110,
  channel: 110,
  action_to_take: 150,
  call_action: 150,
  next_checkpoint_at: 130,
  due: 130,
  last_contacted_at: 130,
  last_called: 160,
  last_activity: 160,
  platform: 90,
  reach: 90,
  phone: 140,
  local_time: 166,
  email: 180,
  company: 160,
  niche: 140,
  template_used: 150,
  script_used: 150,
  attempts: 80,
  created_at: 130,
  linkedin_url: 160,
  instagram_url: 160,
  twitter_url: 160,
  website: 160,
  project: 140,
  _added_by: 140,
};

const DEFAULT_ROW_HEIGHT = 44;
const MIN_COL = 64;
const MAX_COL = 560;
const MIN_ROW = 32;
const MAX_ROW = 200;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function defaultRowState() {
  return { defaultHeight: DEFAULT_ROW_HEIGHT, byId: {} };
}

function loadLayout(view) {
  return {
    widths: readJson(`${WIDTH_PREFIX}${view}`, {}),
    rowState: readJson(`${ROW_PREFIX}${view}`, defaultRowState()),
  };
}

/**
 * Persisted column widths + row heights for a CRM table view.
 * Computes minimum widths to prevent any pill clipping.
 */
export function useCrmTableLayout(view, context = {}) {
  const [layout, setLayout] = useState(() => loadLayout(view));
  const viewRef = useRef(view);
  const hydrated = useRef(true);

  useEffect(() => {
    if (viewRef.current === view) return;
    viewRef.current = view;
    hydrated.current = false;
    setLayout(loadLayout(view));
  }, [view]);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(`${WIDTH_PREFIX}${view}`, JSON.stringify(layout.widths));
      localStorage.setItem(`${ROW_PREFIX}${view}`, JSON.stringify(layout.rowState));
    } catch { /* ignore */ }
  }, [layout, view]);

  const getColMinWidth = useCallback(
    (colOrKey) => {
      const colObj = typeof colOrKey === 'string' ? { column_key: colOrKey } : (colOrKey || {});
      return computePillColumnMinWidth(colObj, context);
    },
    [context]
  );

  const getWidth = useCallback(
    (key) => {
      const colObj = typeof key === 'string' ? { column_key: key } : (key || {});
      const colKey = colObj.column_key || colObj.key || key;
      const minW = computePillColumnMinWidth(colObj, context);
      const specDefault = DEFAULT_WIDTHS[colKey] || 130;
      const effectiveDefault = Math.max(specDefault, minW);
      const stored = layout.widths[colKey];
      if (stored != null) {
        return Math.max(stored, minW);
      }
      return effectiveDefault;
    },
    [layout.widths, context],
  );

  const setWidth = useCallback((key, width) => {
    const colObj = typeof key === 'string' ? { column_key: key } : (key || {});
    const colKey = colObj.column_key || colObj.key || key;
    const minW = computePillColumnMinWidth(colObj, context);
    const next = Math.max(minW, Math.min(MAX_COL, Math.round(width)));
    setLayout((prev) => ({
      ...prev,
      widths: { ...prev.widths, [colKey]: next },
    }));
  }, [context]);

  const resetWidth = useCallback((key) => {
    const colObj = typeof key === 'string' ? { column_key: key } : (key || {});
    const colKey = colObj.column_key || colObj.key || key;
    setLayout((prev) => {
      const widths = { ...prev.widths };
      delete widths[colKey];
      return { ...prev, widths };
    });
  }, []);

  const autoFitWidth = useCallback((key) => {
    const colObj = typeof key === 'string' ? { column_key: key } : (key || {});
    const colKey = colObj.column_key || colObj.key || key;
    const autoW = computePillColumnAutoFitWidth(colObj, context);
    setWidth(colKey, autoW);
  }, [context, setWidth]);

  const getRowHeight = useCallback(
    (rowId) => {
      if (rowId != null && layout.rowState.byId?.[rowId] != null) {
        return layout.rowState.byId[rowId];
      }
      return layout.rowState.defaultHeight || DEFAULT_ROW_HEIGHT;
    },
    [layout.rowState],
  );

  const setRowHeight = useCallback((rowId, height) => {
    const next = Math.max(MIN_ROW, Math.min(MAX_ROW, Math.round(height)));
    setLayout((prev) => {
      if (rowId == null) {
        return {
          ...prev,
          rowState: { ...prev.rowState, defaultHeight: next },
        };
      }
      return {
        ...prev,
        rowState: {
          ...prev.rowState,
          byId: { ...(prev.rowState.byId || {}), [rowId]: next },
        },
      };
    });
  }, []);

  const resetRowHeight = useCallback((rowId) => {
    setLayout((prev) => {
      if (rowId == null) {
        return {
          ...prev,
          rowState: { ...prev.rowState, defaultHeight: DEFAULT_ROW_HEIGHT },
        };
      }
      const byId = { ...(prev.rowState.byId || {}) };
      delete byId[rowId];
      return { ...prev, rowState: { ...prev.rowState, byId } };
    });
  }, []);

  return {
    getWidth,
    setWidth,
    resetWidth,
    autoFitWidth,
    getColMinWidth,
    getRowHeight,
    setRowHeight,
    resetRowHeight,
    defaultRowHeight: layout.rowState.defaultHeight || DEFAULT_ROW_HEIGHT,
  };
}

/** @deprecated Prefer useCrmTableLayout — kept for width-only call sites */
export function useCrmColumnWidths(view) {
  const { getWidth, setWidth, resetWidth } = useCrmTableLayout(view);
  return { getWidth, setWidth, resetWidth };
}
