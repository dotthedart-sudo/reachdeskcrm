import React from 'react';
import { softBadgeStyle } from '../../lib/softBadgeStyle';

/** Shared status/priority/tag pill — 22px, padding 0 8px, 12px/500, radius 4px, 6px dot. */
export default function Pill({
  label,
  color,
  dot = true,
  dotColor,
  icon = null,
  children,
  className = '',
  style = {},
  as = 'span',
  ...rest
}) {
  const Tag = as;
  const content = children ?? label ?? '';
  if (!content && content !== 0) {
    return <span className="rd-empty-cell">—</span>;
  }

  const badgeStyles = softBadgeStyle(color);
  const resolvedDotColor = dotColor || color;

  return (
    <Tag
      className={`rd-pill ${className}`.trim()}
      style={{ ...badgeStyles, ...style }}
      {...rest}
    >
      {dot && (
        <span
          className="rd-pill__dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: resolvedDotColor || 'currentColor',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
      {icon && <span className="rd-pill__icon" style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      <span className="rd-pill__label">{content}</span>
    </Tag>
  );
}
