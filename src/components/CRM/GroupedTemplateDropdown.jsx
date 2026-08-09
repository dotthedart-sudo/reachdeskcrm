import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import {
  TEMPLATE_KINDS,
  sectionsForKind,
  myLibrarySectionName,
  filterTemplatesByKind,
} from '../../lib/templateKinds';

export default function GroupedTemplateDropdown({
  value,
  onChange,
  templates = [],
  placeholder = '-- Select template (optional) --',
  kind = TEMPLATE_KINDS.MESSAGING,
}) {
  const SECTIONS = sectionsForKind(kind);
  const mySectionName = myLibrarySectionName(kind);
  const kindTemplates = filterTemplatesByKind(templates, kind);

  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 260, openUp: false });
  const [search, setSearch] = useState('');

  const [expandedGroups, setExpandedGroups] = useState(() => {
    const initial = { [mySectionName]: true, 'OTHER TEMPLATES': true };
    SECTIONS.forEach((sec) => { initial[sec] = true; });
    return initial;
  });

  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (e) => {
      const isInsideTrigger = triggerRef.current && triggerRef.current.contains(e.target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!isInsideTrigger && !isInsideDropdown) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      const width = Math.max(rect.width, 280);
      setDropdownPos({
        left: Math.min(rect.left, window.innerWidth - width - 8),
        width,
        openUp,
        top: openUp ? rect.top - 4 : rect.bottom + 4,
      });
    }
    setIsOpen((prev) => !prev);
  };

  const toggleGroup = (groupName, e) => {
    e.stopPropagation();
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handleSelect = (tempId) => {
    onChange(tempId || null);
    setIsOpen(false);
  };

  const myTemplates = [];
  const sectionTemplates = {};
  SECTIONS.forEach((sec) => {
    sectionTemplates[sec] = [];
  });
  const otherTemplates = [];

  kindTemplates.forEach((t) => {
    if (search.trim() && !t.title?.toLowerCase().includes(search.toLowerCase())) {
      return;
    }

    if (!t.is_starter) {
      myTemplates.push(t);
    } else if (SECTIONS.includes(t.platform)) {
      sectionTemplates[t.platform].push(t);
    } else {
      otherTemplates.push(t);
    }
  });

  const selectedTemplate = kindTemplates.find((t) => t.id === value);
  const triggerLabel = selectedTemplate ? selectedTemplate.title : placeholder;
  const noResults = search.trim()
    && myTemplates.length === 0
    && otherTemplates.length === 0
    && SECTIONS.every((sec) => sectionTemplates[sec].length === 0);

  const renderGroup = (groupName, items) => {
    if (items.length === 0 && !search.trim()) return null;
    if (items.length === 0 && search.trim()) return null;

    const isExpanded = expandedGroups[groupName];

    return (
      <div key={groupName}>
        <button
          type="button"
          className="rd-menu__group-label"
          onClick={(e) => toggleGroup(groupName, e)}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
          }}
        >
          <span>{groupName} ({items.length})</span>
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {isExpanded && items.map((item) => {
          const isSelected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              className={`rd-menu__item${isSelected ? ' rd-menu__item--active' : ''}`}
              onClick={() => handleSelect(item.id)}
            >
              <span className="rd-menu__item-label">{item.title}</span>
              {isSelected && <Check size={14} className="rd-select__check" />}
            </button>
          );
        })}
      </div>
    );
  };

  const dropdownPanel = isOpen && createPortal(
    <div
      ref={dropdownRef}
      className="rd-menu"
      style={{
        position: 'fixed',
        top: dropdownPos.openUp ? undefined : dropdownPos.top,
        bottom: dropdownPos.openUp ? window.innerHeight - dropdownPos.top : undefined,
        left: dropdownPos.left,
        zIndex: 99999,
        width: `${dropdownPos.width}px`,
      }}
    >
      <div className="rd-menu__search">
        <input
          type="text"
          className="rd-menu__search-input"
          placeholder={kind === TEMPLATE_KINDS.CALLS ? 'Search scripts…' : 'Search templates…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="rd-menu__list rd-menu__list--tall">
        <button
          type="button"
          className={`rd-menu__item${!value ? ' rd-menu__item--active' : ''}`}
          onClick={() => handleSelect(null)}
        >
          <span className="rd-menu__item-label">{placeholder}</span>
        </button>
        {renderGroup(mySectionName, myTemplates)}
        {SECTIONS.map((sec) => renderGroup(sec, sectionTemplates[sec]))}
        {renderGroup('OTHER TEMPLATES', otherTemplates)}
        {noResults && (
          <div className="rd-menu__empty">
            {kind === TEMPLATE_KINDS.CALLS ? 'No scripts found' : 'No templates found'}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className="form-select"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
          cursor: 'pointer',
          padding: '0.5rem 0.75rem',
          height: 'auto',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>
          {triggerLabel}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
      {dropdownPanel}
    </div>
  );
}
