const fs = require('fs');
let css = fs.readFileSync('c:/Users/T15/reachdesk/src/index.css', 'utf8');

const newCSS = `
/* MOBILE HEADER OVERRIDES */
.desktop-only { display: block; }
.mobile-only { display: none; }

@media (max-width: 768px) {
  .desktop-only { display: none !important; }
  .mobile-only { display: flex !important; }
  
  .mobile-search-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-page);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    padding: 1rem;
  }
  .mobile-search-overlay-header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
  }
  .mobile-search-overlay-input-wrap {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }
  .mobile-search-overlay-input-wrap svg {
    position: absolute;
    left: 12px;
    color: var(--text-muted);
  }
  .mobile-search-overlay-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    font-size: 1rem;
    color: var(--text-primary);
  }
  .mobile-search-overlay-close {
    background: transparent;
    border: none;
    color: var(--text-primary);
    padding: 0.5rem;
  }
  .mobile-search-overlay-results {
    flex: 1;
    overflow-y: auto;
  }
}
`;

css += '\n' + newCSS;
fs.writeFileSync('c:/Users/T15/reachdesk/src/index.css', css);
