import React, { useState, useEffect, useMemo } from 'react';
import { X, Globe, Clock, Check, HelpCircle, Phone, Info } from 'lucide-react';
import { 
  COUNTRY_TIMEZONE_OPTIONS, 
  inferTimezoneFromPhone, 
  getLeadTimezone,
  getCallWindowStatus,
  COUNTRY_TO_PRIMARY_TZ
} from '../../lib/leadTimezone';
import { formatTimeInZone } from '../../lib/linkUtils';
import { supabase } from '../../lib/supabase';

const POPULAR_TIMEZONES = [
  { timezone: 'America/New_York', label: 'New York (Eastern Time · UTC-4/5)' },
  { timezone: 'America/Chicago', label: 'Chicago (Central Time · UTC-5/6)' },
  { timezone: 'America/Denver', label: 'Denver (Mountain Time · UTC-6/7)' },
  { timezone: 'America/Los_Angeles', label: 'Los Angeles (Pacific Time · UTC-7/8)' },
  { timezone: 'America/Phoenix', label: 'Phoenix (MST · No DST)' },
  { timezone: 'America/Toronto', label: 'Toronto (Eastern Time)' },
  { timezone: 'Europe/London', label: 'London (GMT / BST)' },
  { timezone: 'Europe/Paris', label: 'Paris (CET / CEST)' },
  { timezone: 'Europe/Berlin', label: 'Berlin (CET / CEST)' },
  { timezone: 'Asia/Dubai', label: 'Dubai (GST · UTC+4)' },
  { timezone: 'Asia/Karachi', label: 'Karachi (PKT · UTC+5)' },
  { timezone: 'Asia/Kolkata', label: 'India (IST · UTC+5:30)' },
  { timezone: 'Asia/Singapore', label: 'Singapore (SGT · UTC+8)' },
  { timezone: 'Asia/Tokyo', label: 'Tokyo (JST · UTC+9)' },
  { timezone: 'Australia/Sydney', label: 'Sydney (AEST / AEDT)' },
  { timezone: 'Pacific/Auckland', label: 'Auckland (NZST / NZDT)' },
];

export default function ListSettingsModal({
  isOpen,
  onClose,
  folder,
  leads = [],
  currentUser,
  onSave,
}) {
  const [name, setName] = useState('');
  const [defaultCountry, setDefaultCountry] = useState('US');
  const [tzMode, setTzMode] = useState('from_number'); // 'from_number' | 'fixed'
  const [fixedTimezone, setFixedTimezone] = useState('America/New_York');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && folder) {
      setName(folder.name || '');
      setDefaultCountry(folder.default_country || currentUser?.default_country_code || 'US');
      if (folder.default_timezone) {
        setTzMode('fixed');
        setFixedTimezone(folder.default_timezone);
      } else {
        setTzMode('from_number');
        setFixedTimezone(
          COUNTRY_TO_PRIMARY_TZ[folder.default_country || 'US'] || 'America/New_York'
        );
      }
    }
  }, [isOpen, folder, currentUser]);

  const countryObj = useMemo(() => {
    return COUNTRY_TIMEZONE_OPTIONS.find((c) => c.code === defaultCountry) || {
      code: defaultCountry,
      name: defaultCountry,
      dial: '1',
      timezone: 'America/New_York',
    };
  }, [defaultCountry]);

  // Count leads in this list with manual timezone
  const manualLeadsCount = useMemo(() => {
    if (!folder?.id) return 0;
    return leads.filter((l) => l.folder_id === folder.id && l.timezone_source === 'manual').length;
  }, [leads, folder?.id]);

  // 3 sample leads from this list or simulated sample leads
  const sampleLeads = useMemo(() => {
    const listLeads = folder?.id ? leads.filter((l) => l.folder_id === folder.id) : [];
    if (listLeads.length >= 3) {
      return listLeads.slice(0, 3);
    }
    const placeholders = [
      { id: 'sample-1', first_name: 'David', last_name: 'Miller', phone: defaultCountry === 'GB' ? '07911123456' : '3125550143' },
      { id: 'sample-2', first_name: 'Elena', last_name: 'Rostova', phone: defaultCountry === 'GB' ? '02079460912' : '4155550198' },
      { id: 'sample-3', first_name: 'Marcus', last_name: 'Vance', phone: defaultCountry === 'GB' ? '01614960123' : '2125550187' },
    ];
    return [...listLeads, ...placeholders].slice(0, 3);
  }, [leads, folder?.id, defaultCountry]);

  const handleCountryChange = (newCode) => {
    setDefaultCountry(newCode);
    const matched = COUNTRY_TIMEZONE_OPTIONS.find((c) => c.code === newCode);
    if (matched?.timezone && tzMode === 'fixed' && !folder?.default_timezone) {
      setFixedTimezone(matched.timezone);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!name.trim() || !folder?.id || saving) return;

    setSaving(true);
    try {
      const updates = {
        name: name.trim(),
        default_country: defaultCountry,
        default_timezone: tzMode === 'fixed' ? fixedTimezone : null,
      };

      const { data, error } = await supabase
        .from('folders')
        .update(updates)
        .eq('id', folder.id)
        .select()
        .single();

      if (error) throw error;
      onSave?.(data);
      onClose?.();
    } catch (err) {
      console.error('Failed to update list settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !folder) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-primary, #FFFFFF)',
          border: '1px solid var(--border-color, #E8E8E6)',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid var(--border-color, #E8E8E6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #1A1A1A)' }}>
              List settings
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted, #8E8D8A)' }}>
              Configure defaults and timezone handling for this list
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted, #8E8D8A)',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* 1. List Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label 
                htmlFor="list-settings-name"
                style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}
              >
                List name
              </label>
              <input
                id="list-settings-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  height: '34px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #E8E8E6)',
                  backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                  color: 'var(--text-primary, #1A1A1A)',
                  padding: '0 10px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            {/* 2. Country Picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label 
                htmlFor="list-settings-country"
                style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}
              >
                Phone numbers in this list are from
              </label>
              <select
                id="list-settings-country"
                value={defaultCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                style={{
                  height: '34px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #E8E8E6)',
                  backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                  color: 'var(--text-primary, #1A1A1A)',
                  padding: '0 10px',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {COUNTRY_TIMEZONE_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} (+{c.dial})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #8E8D8A)' }}>
                Numbers typed without a + are read as {countryObj.name} numbers.
              </span>
            </div>

            {/* 3. Timezone radio cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}>
                Timezone strategy
              </label>

              {/* Radio Option 1: From number */}
              <div
                onClick={() => setTzMode('from_number')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${tzMode === 'from_number' ? 'var(--primary-color, #4361EE)' : 'var(--border-color, #E8E8E6)'}`,
                  backgroundColor: tzMode === 'from_number' ? 'var(--bg-card-hover, rgba(67, 97, 238, 0.04))' : 'var(--bg-primary, #FFFFFF)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="tzMode"
                  checked={tzMode === 'from_number'}
                  onChange={() => setTzMode('from_number')}
                  style={{ marginTop: '2px', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #1A1A1A)' }}>
                    From number
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #8E8D8A)' }}>
                    Infers city & timezone from each lead's phone number. No number? Uses your Settings timezone.
                  </span>
                </div>
              </div>

              {/* Radio Option 2: One timezone */}
              <div
                onClick={() => setTzMode('fixed')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${tzMode === 'fixed' ? 'var(--primary-color, #4361EE)' : 'var(--border-color, #E8E8E6)'}`,
                  backgroundColor: tzMode === 'fixed' ? 'var(--bg-card-hover, rgba(67, 97, 238, 0.04))' : 'var(--bg-primary, #FFFFFF)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <input
                    type="radio"
                    name="tzMode"
                    checked={tzMode === 'fixed'}
                    onChange={() => setTzMode('fixed')}
                    style={{ marginTop: '2px', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #1A1A1A)' }}>
                      One timezone — Same for every lead
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #8E8D8A)' }}>
                      Applies a single uniform timezone across all leads in this list.
                    </span>
                  </div>
                </div>

                {tzMode === 'fixed' && (
                  <div style={{ paddingLeft: '24px', marginTop: '2px' }}>
                    <select
                      value={fixedTimezone}
                      onChange={(e) => setFixedTimezone(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        height: '32px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color, #E8E8E6)',
                        backgroundColor: 'var(--bg-primary, #FFFFFF)',
                        color: 'var(--text-primary, #1A1A1A)',
                        padding: '0 8px',
                        fontSize: '12px',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {POPULAR_TIMEZONES.map((z) => (
                        <option key={z.timezone} value={z.timezone}>
                          {z.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Preview box with 3 sample leads */}
            <div
              style={{
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                border: '1px solid var(--border-color, #E8E8E6)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted, #8E8D8A)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Preview · Sample Leads Local Time
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sampleLeads.map((s, idx) => {
                  // Resolve timezone for sample lead with current settings
                  const simContext = {
                    listCountry: defaultCountry,
                    folderDefaultTimezone: tzMode === 'fixed' ? fixedTimezone : null,
                    userCountry: currentUser?.default_country_code,
                  };
                  const resolvedTz = tzMode === 'fixed' 
                    ? fixedTimezone 
                    : getLeadTimezone({ ...s, folder_default_country: defaultCountry }, simContext);
                  
                  const timeStr = resolvedTz ? formatTimeInZone(resolvedTz) : '--:--';
                  const city = resolvedTz ? resolvedTz.split('/').pop().replace(/_/g, ' ') : 'Unknown';
                  const callStatus = resolvedTz ? getCallWindowStatus({ ...s, timezone: resolvedTz }, new Date(), simContext).status : 'unknown';

                  const dotColor = callStatus === 'good' ? '#6EE7A0' 
                    : callStatus === 'early' ? '#FBBF24' 
                    : callStatus === 'late' ? '#C084FC' 
                    : '#B5B3AC';

                  const leadFullName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || `Sample Lead ${idx + 1}`;

                  return (
                    <div
                      key={s.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-primary, #FFFFFF)',
                        border: '1px solid var(--border-color, #E8E8E6)',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary, #1A1A1A)' }}>
                          {leadFullName}
                        </span>
                        <span style={{ color: 'var(--text-muted, #8E8D8A)', fontSize: '11px' }}>
                          ({s.phone || 'no phone'})
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: dotColor,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontWeight: 500, color: 'var(--text-primary, #1A1A1A)' }}>
                          {timeStr} · {city}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Note about manual timezone leads */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', fontSize: '11px', color: 'var(--text-muted, #8E8D8A)' }}>
                <Info size={12} style={{ flexShrink: 0 }} />
                <span>
                  {manualLeadsCount} {manualLeadsCount === 1 ? 'lead has' : 'leads have'} a timezone you set by hand. They keep it.
                </span>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div
            style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid var(--border-color, #E8E8E6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ height: '32px', padding: '0 12px', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn btn-primary"
              style={{ height: '32px', padding: '0 14px', fontSize: '13px' }}
            >
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
