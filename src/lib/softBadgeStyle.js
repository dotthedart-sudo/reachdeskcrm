/**
 * Shared soft badge styling — muted tint background, darker text, no heavy border.
 */

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function softBadgeStyle(color, opts = {}) {
  const c = color || '#64748b';
  const rgb = hexToRgb(c);
  const bgAlpha = opts.bgAlpha ?? 0.1;
  if (!rgb) {
    return {
      backgroundColor: 'rgba(100,116,139,0.1)',
      color: c,
      border: 'none',
    };
  }
  return {
    backgroundColor: `rgba(${rgb.r},${rgb.g},${rgb.b},${bgAlpha})`,
    color: c,
    border: 'none',
  };
}

export function softDotStyle(color) {
  return { backgroundColor: color || '#64748b' };
}
