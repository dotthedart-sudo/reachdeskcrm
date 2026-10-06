import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pin, Search } from 'lucide-react';
import {
  getLeadTimezone,
  getCallWindowStatus,
  COUNTRY_TIMEZONE_OPTIONS,
} from '../../lib/leadTimezone';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';
import { getSupportedTimeZones, getEffectiveUserTimeZone } from '../../lib/dateTime';

const POPULAR_CITY_ZONES = [
  { city: 'New York', country: 'United States', timezone: 'America/New_York', label: 'New York (ET)' },
  { city: 'Chicago', country: 'United States', timezone: 'America/Chicago', label: 'Chicago (CT)' },
  { city: 'Denver', country: 'United States', timezone: 'America/Denver', label: 'Denver (MT)' },
  { city: 'Los Angeles', country: 'United States', timezone: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { city: 'Phoenix', country: 'United States', timezone: 'America/Phoenix', label: 'Phoenix (MST)' },
  { city: 'Toronto', country: 'Canada', timezone: 'America/Toronto', label: 'Toronto (ET)' },
  { city: 'Vancouver', country: 'Canada', timezone: 'America/Vancouver', label: 'Vancouver (PT)' },
  { city: 'London', country: 'United Kingdom', timezone: 'Europe/London', label: 'London (GMT/BST)' },
  { city: 'Paris', country: 'France', timezone: 'Europe/Paris', label: 'Paris (CET)' },
  { city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', label: 'Berlin (CET)' },
  { city: 'Dubai', country: 'United Arab Emirates', timezone: 'Asia/Dubai', label: 'Dubai (GST)' },
  { city: 'Karachi', country: 'Pakistan', timezone: 'Asia/Karachi', label: 'Karachi (PKT)' },
  { city: 'Mumbai / Delhi', country: 'India', timezone: 'Asia/Kolkata', label: 'Kolkata (IST)' },
  { city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { city: 'Auckland', country: 'New Zealand', timezone: 'Pacific/Auckland', label: 'Auckland (NZST)' },
];

function formatTimeInZone(timeZone, at = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(at);
  } catch {
    return '--:--';
  }
}

export default function LocalTimeCell({
  lead,
  listCountry = null,
  userCountry = null,
  currentUser = null,
  userTimezone = null,
  at = new Date(),
  onSaveTimezone,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const effectiveUserTz = userTimezone || getEffectiveUserTimeZone(currentUser);
  const context = {
    listCountry: listCountry || lead?.folder_default_country,
    userCountry: userCountry || currentUser?.default_country_code,
    userTimezone: effectiveUserTz,
  };

  const tz = getLeadTimezone(lead, context);
  const isManual = lead?.timezone_source === 'manual';
  const { status } = getCallWindowStatus(lead, at, context);

  // 6px dot color mapping
  const dotColor = useMemo(() => {
    switch (status) {
      case 'good':
        return '#6EE7A0'; // green
      case 'early':
        return '#FBBF24'; // amber
      case 'late':
        return '#C084FC'; // purple
      case 'weekend':
      default:
        return '#B5B3AC'; // neutral
    }
  }, [status]);

  const formattedTime = useMemo(() => {
    if (!tz) return null;
    const timeStr = formatTimeInZone(tz, at);
    const city = tz.split('/').pop()?.replace(/_/g, ' ') || tz;
    return `${timeStr} · ${city}`;
  }, [tz, at]);

  const updatePos = () => {
    if (!triggerRef.current) return;
    setMenuPos(
      computePortalMenuPosition(triggerRef.current, {
        menuWidth: 280,
        menuHeight: 340,
      }),
    );
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onDoc = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
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

  const handleSelectTimezone = (newTz) => {
    onSaveTimezone?.(lead.id, newTz);
    setOpen(false);
    setQuery('');
  };

  // Build searchable items
  const allZoneItems = useMemo(() => {
    const list = [...POPULAR_CITY_ZONES];
    const seen = new Set(list.map((c) => c.timezone));

    COUNTRY_TIMEZONE_OPTIONS.forEach((c) => {
      if (!seen.has(c.timezone)) {
        seen.add(c.timezone);
        list.push({
          city: c.name,
          country: c.name,
          timezone: c.timezone,
          label: `${c.name} (+${c.dial})`,
        });
      }
    });

    getSupportedTimeZones().forEach((z) => {
      if (!seen.has(z)) {
        seen.add(z);
        const name = z.split('/').pop()?.replace(/_/g, ' ') || z;
        list.push({
          city: name,
          country: z.split('/')[0] || '',
          timezone: z,
          label: z,
        });
      }
    });

    return list;
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allZoneItems.slice(0, 30);
    return allZoneItems
      .filter((item) => (
        item.city.toLowerCase().includes(q)
        || item.country.toLowerCase().includes(q)
        || item.timezone.toLowerCase().includes(q)
        || item.label.toLowerCase().includes(q)
      ))
      .slice(0, 40);
  }, [query, allZoneItems]);

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      className="rd-menu"
      role="listbox"
      style={{ ...portalMenuStyle(menuPos), width: 280, maxHeight: 340, display: 'flex', flexDirection: 'column' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rd-menu__search" style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary, rgba(0,0,0,0.05))', borderRadius: 4, padding: '3px 8px' }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="search"
            className="rd-menu__search-input"
            placeholder="Search city, country, or timezone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 12, color: 'var(--text-primary)' }}
            autoFocus
          />
        </div>
      </div>

      <div className="rd-menu__list rd-menu__list--tall" style={{ flex: 1, overflowY: 'auto' }}>
        {filteredItems.length === 0 ? (
          <div className="rd-menu__empty" style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No matching timezones
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = item.timezone === tz;
            const currentLiveTime = formatTimeInZone(item.timezone, at);
            return (
              <button
                key={item.timezone + item.label}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`rd-menu__item${isSelected ? ' rd-menu__item--active' : ''}`}
                onClick={() => handleSelectTimezone(item.timezone)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  fontSize: 12,
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.timezone}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {currentLiveTime}
                  </span>
                  {isSelected && <Check size={13} style={{ color: 'var(--status-cold, #5B8FB9)' }} />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );

  if (!formattedTime) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          style={{
            border: '1px dashed var(--border-strong, #777)',
            background: 'transparent',
            color: 'var(--text-muted)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            cursor: 'pointer',
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
          title="Unknown timezone. Click to set manually."
        >
          Set timezone
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          color: 'var(--text-primary)',
          fontSize: 13,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
        }}
        title={`Timezone: ${tz}${isManual ? ' (manual choice)' : ''}. Click to change.`}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: dotColor,
            flexShrink: 0,
            display: 'inline-block',
          }}
          aria-hidden="true"
        />
        <span>{formattedTime}</span>
        {isManual && (
          <Pin
            size={10}
            style={{
              color: 'var(--text-muted)',
              opacity: 0.75,
              flexShrink: 0,
            }}
            title="Manually set timezone"
          />
        )}
      </button>
      {menu}
    </div>
  );
}
