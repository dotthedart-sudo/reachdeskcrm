import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ExternalLink, X, Phone } from 'lucide-react';
import { mergeTemplateFields } from '../../../utils/templateMerge';
import './ScriptViewerPanel.css';

/**
 * Read-along call script. Opens as a side panel so the table (phone number,
 * local time, status) stays visible while you're on the call. Full screen on phones.
 * Lead fields and snippets are filled in; anything still in [brackets] is highlighted.
 */
export default function ScriptViewerPanel({
  open,
  script,
  lead,
  snippets = [],
  columnDefs = [],
  onClose,
  onCopied,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const merged = useMemo(() => {
    if (!script) return '';
    // Empty lead fields would merge to blank text ("I noticed  is…"). Keep them as
    // [placeholders] instead so they show up highlighted and you know to ad-lib.
    const filled = { ...(lead || {}) };
    ['company', 'niche', 'email', 'phone', 'project'].forEach((k) => {
      if (!String(filled[k] || '').trim()) filled[k] = `[${k}]`;
    });
    return mergeTemplateFields(script.body || script.content || '', filled, snippets, columnDefs);
  }, [script, lead, snippets, columnDefs]);

  // Split so unfilled [placeholders] can be highlighted.
  const parts = useMemo(() => merged.split(/(\[[^\]\n]{1,40}\])/g), [merged]);
  const unfilled = parts.filter((p) => /^\[[^\]]+\]$/.test(p)).length;

  if (!open || !script) return null;

  const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim() || 'this lead';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(merged);
      onCopied?.('Script copied');
    } catch {
      onCopied?.('Could not copy');
    }
  };

  return createPortal(
    <aside className="rd-script-panel" role="dialog" aria-label={`Call script: ${script.title || 'Script'}`}>
      <header className="rd-script-panel__head">
        <div style={{ minWidth: 0 }}>
          <div className="rd-script-panel__eyebrow">Call script</div>
          <h3 className="rd-script-panel__title" title={script.title}>{script.title || 'Untitled script'}</h3>
          <div className="rd-script-panel__lead">
            <span>For {leadName}</span>
            {lead?.phone && (
              <a href={`tel:${lead.phone}`} className="rd-script-panel__phone" onClick={(e) => e.stopPropagation()}>
                <Phone size={12} /> {lead.phone}
              </a>
            )}
          </div>
        </div>
        <button type="button" className="rd-script-panel__icon" onClick={onClose} aria-label="Close script">
          <X size={18} />
        </button>
      </header>

      <div className="rd-script-panel__body">
        {merged.trim() ? (
          <p className="rd-script-panel__text">
            {parts.map((p, i) => (/^\[[^\]]+\]$/.test(p)
              ? <mark key={i} className="rd-script-panel__gap" title="Not filled: add this to the lead or your snippets">{p}</mark>
              : <React.Fragment key={i}>{p}</React.Fragment>))}
          </p>
        ) : (
          <p className="rd-script-panel__empty">This script is empty. Add the words you want to say in Templates → Scripts.</p>
        )}
      </div>

      <footer className="rd-script-panel__foot">
        <span className="rd-script-panel__hint">
          {unfilled > 0 ? `${unfilled} field${unfilled > 1 ? 's' : ''} not filled` : 'Lead details filled in'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-secondary btn-sm" href="/templates?tab=scripts" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ExternalLink size={13} /> Edit
          </a>
          <button type="button" className="btn btn-primary btn-sm" onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Copy size={13} /> Copy
          </button>
        </div>
      </footer>
    </aside>,
    document.body,
  );
}
