/**
 * Shared soft badge styling — muted tint background, readable text, 6px dot.
 * Clamps custom channel colors for high contrast and readability in dark mode.
 */

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Clamp dark mode text color so it remains vividly legible against dark backgrounds.
 * E.g., maps dark tones to warm #FBBF24, green #6EE7A0, blue #93C5FD, red #FCA5A5, neutral #B5B3AC.
 */
export function clampDarkColor(color) {
  if (!color) return '#B5B3AC';
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // If low saturation (grays/neutrals)
  if (s < 15) return '#B5B3AC';

  // Hue based mapped readable tones
  if (h >= 340 || h < 15) return '#FCA5A5'; // Red / Rose
  if (h >= 15 && h < 50) return '#FBBF24';  // Orange / Amber
  if (h >= 50 && h < 80) return '#FDE047';  // Yellow
  if (h >= 80 && h < 165) return '#6EE7A0'; // Green / Emerald
  if (h >= 165 && h < 205) return '#67E8F9'; // Cyan / Teal
  if (h >= 205 && h < 260) return '#93C5FD'; // Blue / Sky
  if (h >= 260 && h < 310) return '#C084FC'; // Purple / Violet
  if (h >= 310 && h < 340) return '#F472B6'; // Pink

  // Fallback: clamp lightness to 70%
  const targetL = Math.max(68, Math.min(82, l > 40 ? l + 15 : 72));
  const targetS = Math.max(70, Math.min(95, s));
  return hslToHex(h, targetS, targetL);
}

export function softBadgeStyle(color, opts = {}) {
  const c = color || '#8B949E';
  const darkC = clampDarkColor(c);
  const rgb = hexToRgb(c);
  const bgAlpha = opts.bgAlpha ?? 0.12;
  const lightBg = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${bgAlpha})` : 'rgba(100,116,139,0.12)';

  return {
    '--pill-color-light': c,
    '--pill-color-dark': darkC,
    '--pill-bg-light': lightBg,
    '--pill-bg-dark': 'rgba(255,255,255,0.07)',
    '--pill-dot-color': c,
    color: 'var(--pill-color, var(--pill-color-light))',
    backgroundColor: 'var(--pill-bg, var(--pill-bg-light))',
    border: 'none',
  };
}

export function softDotStyle(color) {
  const c = color || '#8B949E';
  const darkC = clampDarkColor(c);
  return {
    backgroundColor: 'var(--pill-dot-color, var(--pill-color-light))',
    '--pill-color-light': c,
    '--pill-color-dark': darkC,
  };
}

