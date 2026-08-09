import React from 'react';
import { softBadgeStyle } from '../../lib/softBadgeStyle';

/** Shared status/priority/tag pill — muted tint, no heavy border. */
export default function Pill({
  label,
  color,
  className = '',
  style = {},
  as = 'span',
  ...rest
}) {
  const Tag = as;
  const text = label ?? '';
  if (!text && text !== 0) {
    return <span className="rd-empty-cell">—</span>;
  }

  return (
    <Tag
      className={`rd-pill ${className}`.trim()}
      style={{ ...softBadgeStyle(color), ...style }}
      {...rest}
    >
      {text}
    </Tag>
  );
}
