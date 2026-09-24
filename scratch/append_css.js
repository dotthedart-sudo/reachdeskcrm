import fs from 'fs';

const css = `
@media (min-width: 769px) {
  .mobile-only { display: none !important; }
}
@media (max-width: 768px) {
  .desktop-only { display: none !important; }
}

.mobile-search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--bg-primary);
  z-index: 1000;
  padding: 1rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}
.mobile-search-overlay-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.mobile-search-overlay-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-secondary);
  padding: 0.5rem 1rem;
  border-radius: 99px;
}
.mobile-search-overlay-input {
  border: none;
  background: transparent;
  outline: none;
  width: 100%;
}
.mobile-search-overlay-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  color: var(--text-secondary);
}
.mobile-search-overlay-results {
  margin-top: 1rem;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
}
`;

fs.appendFileSync('c:/Users/T15/reachdesk/src/index.css', css);
console.log('Appended successfully');
