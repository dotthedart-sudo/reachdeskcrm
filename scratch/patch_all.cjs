const fs = require('fs');

// 1. Update index.css
let css = fs.readFileSync('c:/Users/T15/reachdesk/src/index.css', 'utf8');
if (!css.includes('.desktop-only')) {
  css += `
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
  fs.writeFileSync('c:/Users/T15/reachdesk/src/index.css', css);
}

// 2. Update CompactSearch.jsx
let compactSearch = fs.readFileSync('c:/Users/T15/reachdesk/src/components/ui/CompactSearch.jsx', 'utf8');
if (!compactSearch.includes('isMobileSearchOpen')) {
  compactSearch = compactSearch.replace(
    'import { Search } from "lucide-react";', 
    'import { Search, X } from "lucide-react";'
  );
  compactSearch = compactSearch.replace(
    'const [isOpen, setIsOpen] = useState(false);',
    'const [isOpen, setIsOpen] = useState(false);\n  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);'
  );
  
  const returnIdx = compactSearch.indexOf('return (');
  const replacement = `  return (
    <>
      <button 
        type="button" 
        className="app-header-icon-btn mobile-only" 
        onClick={() => setIsMobileSearchOpen(true)}
        aria-label="Search"
      >
        <Search size={18} />
      </button>

      {isMobileSearchOpen && (
        <div className="mobile-search-overlay">
          <div className="mobile-search-overlay-header">
            <div className="mobile-search-overlay-input-wrap">
              <Search size={16} />
              <input
                autoFocus
                type="search"
                className="mobile-search-overlay-input"
                placeholder="Search leads..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (query.trim()) navigate("/leads?search=" + encodeURIComponent(query.trim()));
                    setIsMobileSearchOpen(false);
                    setIsOpen(false);
                  }
                }}
              />
            </div>
            <button type="button" className="mobile-search-overlay-close" onClick={() => { setIsMobileSearchOpen(false); setQuery(""); setIsOpen(false); }}>
              <X size={20} />
            </button>
          </div>
          <div className="mobile-search-overlay-results">
            {loading && <div className="rd-compact-search__dropdown-loading">Searching...</div>}
            {!loading && results.length === 0 && debouncedQuery.trim() && (
              <div className="rd-compact-search__dropdown-empty">No leads found for "{debouncedQuery}"</div>
            )}
            {!loading && results.map((result, idx) => (
              <button
                key={result.id}
                type="button"
                className="rd-compact-search__dropdown-item"
                onClick={() => { handleSelect(result); setIsMobileSearchOpen(false); }}
                style={{ width: '100%', padding: '1rem', borderBottom: '1px solid var(--border)' }}
              >
                <span className="rd-compact-search__dropdown-item__name">{result.name}</span>
                <span className="rd-compact-search__dropdown-item__folder">{result.folder_name || "Unfiled"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef} className={("rd-compact-search desktop-only " + className).trim()} style={width ? { width } : undefined}>
        <Search size={15} className="rd-compact-search__icon" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className={"rd-compact-search__input" + (showDropdown ? " open" : "")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder={placeholder}
          autoComplete="off"
          aria-label="Search leads"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        {showDropdown && (
          <div className="rd-compact-search__dropdown" role="listbox">
            {loading && <div className="rd-compact-search__dropdown-loading">Searching...</div>}
            {!loading && results.length === 0 && debouncedQuery.trim() && (
              <div className="rd-compact-search__dropdown-empty">No leads found for "{debouncedQuery}"</div>
            )}
            {!loading && results.map((result, idx) => (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                className={"rd-compact-search__dropdown-item" + (idx === activeIdx ? " active" : "")}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(result); }}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <span className="rd-compact-search__dropdown-item__name">{result.name}</span>
                <span className="rd-compact-search__dropdown-item__folder">{result.folder_name || "Unfiled"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
`;
  compactSearch = compactSearch.substring(0, returnIdx) + replacement;
  fs.writeFileSync('c:/Users/T15/reachdesk/src/components/ui/CompactSearch.jsx', compactSearch);
}

// 3. Update AppHeader.jsx
let appHeader = fs.readFileSync('c:/Users/T15/reachdesk/src/components/AppHeader.jsx', 'utf8');
if (!appHeader.includes('app-header__title desktop-only')) {
  appHeader = appHeader.replace(
    '<h1 className="app-header__title">{title || \'ReachDesk CRM\'}</h1>',
    '<h1 className="app-header__title desktop-only">{title || \'ReachDesk CRM\'}</h1>'
  );
  fs.writeFileSync('c:/Users/T15/reachdesk/src/components/AppHeader.jsx', appHeader);
}

// 4. Update AppHeaderActions.jsx
let appHeaderActions = fs.readFileSync('c:/Users/T15/reachdesk/src/components/AppHeaderActions.jsx', 'utf8');
if (!appHeaderActions.includes('<div className="desktop-only">')) {
  appHeaderActions = appHeaderActions.replace(
    '<ChatWidget profile={profile} />',
    '<div className="desktop-only"><ChatWidget profile={profile} /></div>'
  );
  fs.writeFileSync('c:/Users/T15/reachdesk/src/components/AppHeaderActions.jsx', appHeaderActions);
}

console.log('Patch complete.');
