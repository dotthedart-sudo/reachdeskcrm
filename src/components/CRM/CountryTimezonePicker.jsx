import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { COUNTRY_TIMEZONE_OPTIONS, getCountryLabelForTimezone } from '../../lib/leadTimezone';
import { getSupportedTimeZones } from '../../lib/dateTime';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';

/**
 * Searchable country / dial-code picker that sets an IANA timezone.
 * Also offers full IANA list under Advanced.
 * Menu is portaled so parent overflow (tables/drawers) cannot clip it.
 */
export default function CountryTimezonePicker({
  value = '',
  onChange,
  id = 'lead-timezone-country',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const zones = getSupportedTimeZones();

  const sortedOptions = useMemo(
    () => [...COUNTRY_TIMEZONE_OPTIONS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedOptions;
    return sortedOptions.filter((c) => (
      c.name.toLowerCase().includes(q)
      || c.dial.includes(q.replace(/^\+/, ''))
      || `+${c.dial}`.includes(q)
      || c.timezone.toLowerCase().includes(q)
    ));
  }, [query, sortedOptions]);

  const selected = sortedOptions.find((c) => c.timezone === value) || null;
  const countryHint = value ? getCountryLabelForTimezone(value) : null;

  const updatePos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos(computePortalMenuPosition(triggerRef.current, {
      menuWidth: Math.max(260, rect.width),
      menuHeight: 360,
    }));
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onDoc = (e) => {
      const inRoot = rootRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inRoot && !inPanel) setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const pick = (country) => {
    onChange?.({
      timezone: country.timezone,
      timezone_source: 'country',
      timezoneTouched: true,
    });
    setQuery('');
    setOpen(false);
  };

  const clearSelection = () => {
    onChange?.({ timezone: '', timezone_source: '', timezoneTouched: false });
    setQuery('');
    setOpen(false);
  };

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      className="rd-menu rd-country-picker__menu"
      role="listbox"
      style={portalMenuStyle(menuPos)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rd-menu__search">
        <input
          id={`${id}-search`}
          type="search"
          className="rd-menu__search-input"
          placeholder="Search country or dial code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </div>
      <div className="rd-menu__list rd-menu__list--tall">
        <button
          type="button"
          role="option"
          className={`rd-menu__item${!value ? ' rd-menu__item--active' : ''}`}
          onClick={clearSelection}
        >
          <span className="rd-menu__item-label">No country selected</span>
        </button>
        {filtered.length === 0 ? (
          <div className="rd-menu__empty">No matching countries</div>
        ) : (
          filtered.map((c) => {
            const active = c.timezone === value;
            return (
              <button
                key={`${c.dial}-${c.timezone}-${c.name}`}
                type="button"
                role="option"
                aria-selected={active}
                className={`rd-menu__item${active ? ' rd-menu__item--active' : ''}`}
                onClick={() => pick(c)}
              >
                <span className="rd-menu__item-label">{c.name}</span>
                <span className="rd-menu__item-meta">+{c.dial}</span>
                {active && <Check size={14} className="rd-select__check" />}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className="rd-country-picker flex-col gap-2" ref={rootRef}>
      <label className="form-label" htmlFor={`${id}-trigger`}>Country / dial code</label>

      <div className="rd-select rd-select--full">
        <button
          ref={triggerRef}
          id={`${id}-trigger`}
          type="button"
          className="rd-select__trigger"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((p) => !p)}
        >
          <span className={`rd-select__value${!selected ? ' rd-select__value--placeholder' : ''}`}>
            {selected
              ? `${selected.name} (+${selected.dial})`
              : 'Select country / dial code…'}
          </span>
          <ChevronDown size={14} className="rd-select__chevron" aria-hidden />
        </button>
        {menu}
      </div>

      {value && (
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Timezone: {value.replace(/_/g, ' ')}
          {countryHint ? ` · ${countryHint}` : ''}
        </p>
      )}

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setShowAdvanced((v) => !v)}
        style={{ alignSelf: 'flex-start' }}
      >
        {showAdvanced ? 'Hide advanced zones' : 'Advanced: all timezones'}
      </button>

      {showAdvanced && (
        <select
          className="form-input"
          value={value || ''}
          onChange={(e) => {
            const tz = e.target.value;
            onChange?.({ timezone: tz, timezone_source: tz ? 'manual' : '', timezoneTouched: !!tz });
          }}
        >
          <option value="">Select IANA timezone…</option>
          {zones.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      )}
    </div>
  );
}
