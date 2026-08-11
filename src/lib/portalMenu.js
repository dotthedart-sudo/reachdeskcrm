/**
 * Position helpers for floating menus rendered via createPortal.
 * In-flow `position: absolute` menus get clipped by table cells with overflow:hidden.
 */

export function computePortalMenuPosition(triggerEl, {
  menuWidth = 260,
  menuHeight = 280,
  offset = 6,
} = {}) {
  if (!triggerEl) {
    return { top: 0, left: 0, width: menuWidth, openUp: false };
  }
  const rect = triggerEl.getBoundingClientRect();
  const width = Math.max(menuWidth, Math.min(rect.width, window.innerWidth - 16));
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
  const left = Math.min(
    Math.max(8, rect.left),
    Math.max(8, window.innerWidth - width - 8),
  );
  return {
    top: openUp ? rect.top - offset : rect.bottom + offset,
    left,
    width,
    openUp,
  };
}

export function portalMenuStyle(pos) {
  if (!pos) return { position: 'fixed', zIndex: 99999 };
  return {
    position: 'fixed',
    zIndex: 99999,
    top: pos.openUp ? undefined : pos.top,
    bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
    left: pos.left,
    width: pos.width,
  };
}
