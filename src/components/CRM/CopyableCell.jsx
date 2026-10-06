import React from 'react';
import { Copy } from 'lucide-react';

export default function CopyableCell({
  value,
  children,
  onCopied,
  className = '',
  stopPropagation = true,
  showWhenEmpty = false,
  variant = 'text',
}) {
  const text = value != null && value !== '' ? String(value).trim() : '';
  const canCopy = showWhenEmpty ? !!text : !!text && text !== '—';

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!canCopy) return;
    navigator.clipboard.writeText(text);
    onCopied?.(text);
  };

  const btn = canCopy ? (
    <button
      type="button"
      className="copyable-cell__btn"
      onClick={handleCopy}
      title="Copy"
      aria-label="Copy to clipboard"
    >
      <Copy size={12} />
    </button>
  ) : null;

  if (variant === 'inline') {
    return (
      <div
        className={`copyable-cell copyable-cell--inline ${className}`.trim()}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      >
        <div className="copyable-cell__slot" title={text || undefined}>{children}</div>
        {btn}
      </div>
    );
  }

  return (
    <div
      className={`copyable-cell ${className}`.trim()}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <span className="copyable-cell__content" title={text || undefined}>{children ?? (text || '—')}</span>
      {btn}
    </div>
  );
}
