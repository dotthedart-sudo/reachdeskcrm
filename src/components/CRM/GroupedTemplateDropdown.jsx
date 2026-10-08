import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import {
  TEMPLATE_KINDS,
  sectionsForKind,
  myLibrarySectionName,
  filterTemplatesByKind,
  formatSectionLabel,
} from '../../lib/templateKinds';

export default function GroupedTemplateDropdown({
  value,
  onChange,
  templates = [],
  placeholder = 'None',
  kind = TEMPLATE_KINDS.MESSAGING,
  isTableInline = true,
}) {
  const SECTIONS = sectionsForKind(kind);
  const mySectionName = myLibrarySectionName(kind);
  // Hide empty starter placeholders (e.g. "Openers (add your script)") — nothing to use yet.
  const kindTemplates = filterTemplatesByKind(templates, kind)
    .filter((t) => !(t.is_starter && !String(t.body || t.content || '').trim()));

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
          <span>{groupName === 'OTHER TEMPLATES' ? 'Starter templates' : formatSectionLabel(groupName)} ({items.length})</span>
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
        {!search.trim() && kindTemplates.length === 0 && (
          <div className="rd-menu__empty" style={{ lineHeight: 1.5 }}>
            {kind === TEMPLATE_KINDS.CALLS ? 'No scripts yet. ' : 'No templates yet. '}
            <a href={kind === TEMPLATE_KINDS.CALLS ? '/templates?tab=scripts' : '/templates'} style={{ color: 'var(--accent-blue, #2563EB)' }}>
              {kind === TEMPLATE_KINDS.CALLS ? 'Write your first script' : 'Create a template'}
            </a>
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
        className={isTableInline ? 'rd-template-inline-btn' : 'form-select'}
        style={
          isTableInline
            ? {
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '2px 6px',
                height: '24px',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: '4px',
                color: value ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: '13px',
                boxSizing: 'border-box',
                transition: 'border-color 0.12s ease, background 0.12s ease',
              }
            : {
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '0.5rem 0.75rem',
                height: 'auto',
              }
        }
        onMouseEnter={(e) => {
          if (isTableInline) {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))';
          }
        }}
        onMouseLeave={(e) => {
          if (isTableInline) {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '6px' }}>
          {triggerLabel}
        </span>
        <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.6 }} />
      </button>
      {dropdownPanel}
    </div>
  );
}
