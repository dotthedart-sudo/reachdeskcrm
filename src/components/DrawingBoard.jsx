import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';

import { useAppContext } from '../App';
import '../styles/excalidraw.css'; // Local wrapper for Excalidraw CSS

// Lazy-load so Excalidraw doesn't block the main bundle
const Excalidraw = lazy(() =>
  import('@excalidraw/excalidraw').then(module => ({
    default: module.Excalidraw
  }))
);

/* ─────────────────────────────────────────────
   Error boundary — prevents a canvas crash from
   taking down the whole editor page.
───────────────────────────────────────────── */
class NotesErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Notes Canvas Error Boundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-color)',
          margin: '2rem auto',
          maxWidth: '500px',
          borderRadius: '8px',
          background: 'var(--bg-tertiary)'
        }}>
          <h3 style={{ color: 'var(--danger-color)', marginBottom: '0.5rem' }}>Drawing Canvas Error</h3>
          <p className="color-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            The drawing canvas failed to load or render.
          </p>
          <pre style={{
            textAlign: 'left',
            background: 'rgba(0,0,0,0.2)',
            padding: '0.75rem',
            borderRadius: '6px',
            overflowX: 'auto',
            fontSize: '0.8rem',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '0.75rem' }}
            onClick={() => window.location.reload()}
          >
            Reload Canvas
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─────────────────────────────────────────────
   Helper: parse saved JSON → safe initialData.
   collaborators MUST be a Map, never an array.
───────────────────────────────────────────── */
function parseInitialData(initialContent, viewBackgroundColor, isDark) {
  try {
    if (initialContent) {
      const parsed = JSON.parse(initialContent);
      return {
        elements: parsed.elements || [],
        appState: {
          collaborators: new Map(), // MUST be Map, not array
          viewBackgroundColor: isDark ? '#08080F' : '#ffffff',
          theme: isDark ? 'dark' : 'light',
          zoom: parsed.appState?.zoom || { value: 1 },
        },
      };
    }
  } catch (_) {
    // fall through to defaults on bad JSON
  }
  return {
    elements: [],
    appState: {
      collaborators: new Map(),
      viewBackgroundColor,
      theme: isDark ? 'dark' : 'light',
    },
  };
}

/* ─────────────────────────────────────────────
   DrawingBoard component
───────────────────────────────────────────── */
export default function DrawingBoard({ initialContent, onSave, saveRef }) {
  const { theme } = useAppContext() || {};
  const isDark = theme ? (theme === 'dark') : (!document.documentElement.classList.contains('light') && localStorage.getItem('reachdesk_theme') !== 'light');
  const canvasBackground = isDark ? '#08080F' : '#ffffff';

  // Stable initial data — computed once at mount
  const [initialData] = useState(() => parseInitialData(initialContent, canvasBackground, isDark));

  // Keep track of the last saved content to prevent unnecessary updates & infinite save loops
  const lastSavedContentRef = useRef(
    initialContent || JSON.stringify({
      elements: initialData.elements,
      appState: {
        viewBackgroundColor: initialData.appState.viewBackgroundColor,
        zoom: initialData.appState.zoom || { value: 1 }
      }
    })
  );

  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const saveTimeout = useRef(null);
  const latestDataRef = useRef({ elements: initialData.elements, appState: initialData.appState });

  // Once the API is ready, sync background colour and theme
  useEffect(() => {
    if (!excalidrawAPI) return;
    excalidrawAPI.updateScene({
      appState: {
        collaborators: new Map(),
        viewBackgroundColor: canvasBackground,
        theme: isDark ? 'dark' : 'light',
      },
    });
  }, [excalidrawAPI, canvasBackground, isDark]);

  const saveSnapshot = useCallback((elementsToSave, stateToSave) => {
    try {
      const els = elementsToSave || excalidrawAPI?.getSceneElements() || latestDataRef.current.elements;
      const state = stateToSave || excalidrawAPI?.getAppState() || latestDataRef.current.appState;
      
      const snapshot = {
        elements: els,
        appState: {
          viewBackgroundColor: state.viewBackgroundColor,
          zoom: state.zoom,
        },
      };
      const serialized = JSON.stringify(snapshot);
      
      // ONLY save if content has actually changed!
      if (serialized === lastSavedContentRef.current) {
        return Promise.resolve();
      }
      
      return Promise.resolve(onSave(serialized)).then((result) => {
        if (result) {
          lastSavedContentRef.current = serialized;
        }
      });
    } catch (err) {
      console.error('Error saving canvas state:', err);
      return Promise.resolve();
    }
  }, [excalidrawAPI, onSave]);

  const handleChange = useCallback((els, state) => {
    latestDataRef.current = { elements: els, appState: state };
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveSnapshot(els, state);
    }, 1500); // 1.5s debounce
  }, [saveSnapshot]);

  // Hook up external saveRef for parent components to trigger immediate saves
  useEffect(() => {
    if (saveRef) {
      saveRef.current = () => {
        clearTimeout(saveTimeout.current);
        const { elements: els, appState: state } = latestDataRef.current;
        return saveSnapshot(els, state);
      };
    }
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [saveRef, saveSnapshot]);

  // Flush on unmount to prevent losing data
  useEffect(() => {
    return () => {
      clearTimeout(saveTimeout.current);
      if (saveTimeout.current) {
        const { elements: els, appState: state } = latestDataRef.current;
        saveSnapshot(els, state);
      }
    };
  }, [saveSnapshot]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: 0,
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: canvasBackground,
    }}>
      <NotesErrorBoundary>
        <Suspense fallback={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            backgroundColor: canvasBackground,
            color: 'var(--text-muted)',
          }}>
            Loading canvas…
          </div>
        }>
          <Excalidraw
            excalidrawAPI={(api) => {
              setExcalidrawAPI(api);
            }}
            initialData={{
              ...initialData,
              appState: {
                ...initialData?.appState,
                currentItemFontFamily: 3
              }
            }}
            onChange={handleChange}
            theme={isDark ? 'dark' : 'light'}
            // Fix 3 — hide the built-in welcome screen
            UIOptions={{ welcomeScreen: false }}
          />
        </Suspense>
      </NotesErrorBoundary>
    </div>
  
  );
}