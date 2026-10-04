import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../App";
import { searchLeads } from "../../lib/leadsQuery";
import { useDebounce } from "../../hooks/useDebounce";

export default function CompactSearch({ placeholder = "Search leads\u2026", className = "", width }) {
  // teamIds is already the resolved array of user IDs scoped to the workspace
  const { teamIds, session } = useAppContext() || {};
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const debouncedQuery = useDebounce(query, 250);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch results when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const userId = session?.user?.id;
    const ids = teamIds?.length ? teamIds : userId ? [userId] : [];
    if (!ids.length) return;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const data = await searchLeads(debouncedQuery, { userIds: ids }, 8);
        if (!cancelled) {
          setResults(data);
          setIsOpen(true);
          setActiveIdx(-1);
        }
      } catch (err) {
        console.error("[GlobalSearch] error:", err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [debouncedQuery, teamIds, session]);

  const handleSelect = useCallback((result) => {
    setQuery("");
    setIsOpen(false);
    setActiveIdx(-1);
    const params = new URLSearchParams();
    params.set("folder", result.folder_id || "unfiled");
    params.set("lead", result.id);
    navigate("/leads?" + params.toString());
  }, [navigate]);

  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        navigate("/leads?search=" + encodeURIComponent(query.trim()));
        setIsOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) {
        handleSelect(results[activeIdx]);
      } else if (results[0]) {
        handleSelect(results[0]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  };

  const showDropdown = isOpen && (loading || results.length > 0 || (debouncedQuery.trim() && !loading));

  return (
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
