/**
 * App-wide "Enter saves".
 *
 * - In a text field, Enter clicks the Save / Add / Create button of the panel it's in
 *   (modal, drawer, settings card…). Inside a <form>, the browser already does this.
 * - In a textarea or rich-text box, Ctrl/Cmd + Enter saves (plain Enter = new line).
 * - It never fires when the field handles Enter itself, when a dropdown is open,
 *   or when it can't tell which single button is "the" save button.
 */

const SAVE_LABEL = /^(save|update|add|create|apply|confirm|done|invite|send|log|rename|set|submit|continue)\b/i;
const SCOPE_SELECTOR = '[data-enter-scope], [role="dialog"], .modal-content, .lead-drawer__panel, .rd-script-panel';
const STOP_SELECTOR = '.main-content, .app-main, body';
const TEXT_TYPES = new Set(['', 'text', 'email', 'tel', 'url', 'number', 'search', 'password', 'date', 'datetime-local', 'time', 'month']);

function reactProps(el) {
  if (!el) return null;
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  return key ? el[key] : null;
}

function handlesEnterItself(el) {
  const p = reactProps(el);
  return !!(p && (p.onKeyDown || p.onKeyPress || p.onKeyUp));
}

function isVisible(el) {
  if (!el || el.disabled) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function saveButtonsIn(root) {
  const explicit = [...root.querySelectorAll('[data-enter-save]')].filter(isVisible);
  if (explicit.length) return explicit;
  return [...root.querySelectorAll('button, input[type="submit"]')].filter((b) => {
    if (!isVisible(b)) return false;
    if (b.closest('.rd-menu, [role="menu"], [role="listbox"]')) return false;
    if (b.type === 'submit') return true;
    const label = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
    return SAVE_LABEL.test(label);
  });
}

function findSaveButton(target) {
  // 1) Inside a dialog / drawer / explicit scope: pick its save button (prefer the primary one).
  const scope = target.closest(SCOPE_SELECTOR);
  if (scope) {
    const btns = saveButtonsIn(scope);
    if (btns.length === 1) return btns[0];
    const primary = btns.filter((b) => b.classList.contains('btn-primary'));
    if (primary.length === 1) return primary[0];
    return null;
  }
  // 2) Elsewhere (settings cards etc.): walk up a few levels until exactly one save button.
  let node = target.parentElement;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    if (node.matches(STOP_SELECTOR)) return null;
    const btns = saveButtonsIn(node);
    if (btns.length === 1) return btns[0];
    if (btns.length > 1) return null;
  }
  return null;
}

function onKeyDown(e) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.shiftKey || e.altKey) return;
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;

  const isTextarea = el.tagName === 'TEXTAREA';
  const isRich = el.isContentEditable;
  const isInput = el.tagName === 'INPUT' && TEXT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
  const isSelect = el.tagName === 'SELECT';
  if (!isTextarea && !isRich && !isInput && !isSelect) return;

  const modifier = e.ctrlKey || e.metaKey;
  if ((isTextarea || isRich) && !modifier) return; // plain Enter = new line

  if (el.getAttribute('aria-expanded') === 'true') return; // a dropdown/autocomplete is open
  if (el.closest('.rd-menu, [role="menu"], [role="listbox"], [data-enter-ignore]')) return;
  if (handlesEnterItself(el)) return;

  const form = el.closest('form');
  if (form) {
    // Browser already submits text inputs on Enter; add Ctrl/Cmd+Enter for textareas.
    if ((isTextarea || isRich) && modifier) {
      e.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
    }
    return;
  }

  const btn = findSaveButton(el);
  if (btn) {
    e.preventDefault();
    btn.click();
    return;
  }
  // Inline fields that save when you leave them (lead drawer, table cells): Enter = done.
  const p = reactProps(el);
  if (p && p.onBlur && (isInput || isSelect)) {
    e.preventDefault();
    el.blur();
  }
}

let installed = false;
export function installEnterToSave() {
  if (installed || typeof document === 'undefined') return () => {};
  installed = true;
  // Bubble phase: component handlers run first and can preventDefault to opt out.
  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    installed = false;
  };
}
