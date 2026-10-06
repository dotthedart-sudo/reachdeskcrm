import React, { useState, useMemo } from 'react';
import { Globe, Clock, ChevronRight } from 'lucide-react';
import {
  inferTimezoneFromPhone,
  getLeadTimezone,
  getCountryLabelForTimezone,
  toCountryIso,
} from '../../lib/leadTimezone';
import CountryTimezonePicker from './CountryTimezonePicker';

/**
 * Phone Timezone Chip displayed underneath phone number inputs.
 * Shows country code, city/location, local time, and a "Change" button.
 * No emojis in UI (project rule) — uses clean Lucide icons.
 */
export default function PhoneTimezoneChip({
  lead,
  phone,
  timezone,
  timezone_source,
  listCountry,
  userCountry,
  onChangeTimezone,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const effectiveTz = useMemo(() => {
    if (timezone) return timezone;
    if (lead?.timezone) return lead.timezone;
    const currentPhone = phone !== undefined ? phone : lead?.phone;
    if (currentPhone) {
      const inferred = inferTimezoneFromPhone(currentPhone, {
        listCountry: listCountry || lead?.list_country || lead?.folder_default_country,
        userCountry,
      });
      return inferred.timezone || null;
    }
    return null;
  }, [timezone, lead, phone, listCountry, userCountry]);

  const chipInfo = useMemo(() => {
    if (!effectiveTz) {
      return {
        label: 'Unknown TZ',
        subtext: null,
      };
    }

    try {
      const now = new Date();
      const timeStr = new Intl.DateTimeFormat(undefined, {
        timeZone: effectiveTz,
        hour: 'numeric',
        minute: '2-digit',
      }).format(now);

      const countryName = getCountryLabelForTimezone(effectiveTz);
      const city = effectiveTz.split('/').pop()?.replace(/_/g, ' ') || '';
      const countryIso = toCountryIso(countryName) || '';

      const locationPart = countryIso ? `${countryIso} · ${city || countryName}` : (countryName || city);
      const label = locationPart ? `${locationPart} · ${timeStr}` : timeStr;

      return {
        label,
        subtext: timezone_source === 'manual' ? '(manual)' : null,
      };
    } catch {
      return {
        label: 'Unknown TZ',
        subtext: null,
      };
    }
  }, [effectiveTz, timezone_source]);

  const handlePickerChange = (patch) => {
    onChangeTimezone?.({
      timezone: patch.timezone,
      timezone_source: 'manual',
      timezoneTouched: true,
    });
    setPickerOpen(false);
  };

  return (
    <div className="rd-phone-tz-wrapper" style={{ marginTop: '0.35rem' }}>
      <div
        className="rd-phone-tz-chip"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          background: 'color-mix(in srgb, var(--text-muted) 10%, transparent)',
          border: '1px solid var(--border-subtle)',
          padding: '2px 8px',
          borderRadius: '12px',
        }}
      >
        <Globe size={11} style={{ opacity: 0.7 }} />
        <span>{chipInfo.label}</span>
        {chipInfo.subtext && (
          <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{chipInfo.subtext}</span>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary-purple, #8b5cf6)',
            cursor: 'pointer',
            padding: '0 0 0 4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            textDecoration: 'underline',
          }}
        >
          {pickerOpen ? 'close' : 'change'}
        </button>
      </div>

      {pickerOpen && (
        <div
          className="rd-phone-tz-picker-popover"
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <CountryTimezonePicker
            value={effectiveTz || ''}
            onChange={handlePickerChange}
          />
        </div>
      )}
    </div>
  );
}
