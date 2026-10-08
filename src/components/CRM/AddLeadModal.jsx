import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Folder, 
  Check, 
  Sparkles,
  Clock,
  Building
} from 'lucide-react';
import { 
  normalizeUrl, 
  detectPlatform, 
  syncLegacyLinkColumns, 
  autoDetectCompanyFromEmail, 
  getTimezoneHintFromPhone 
} from '../../lib/linkUtils';
import { inferTimezoneFromPhone } from '../../lib/leadTimezone';
import LeadLinkChips from './LeadLinkChips';
import GroupedStatusDropdown from './GroupedStatusDropdown';
import GroupedChannelDropdown from './GroupedChannelDropdown';
import PriorityDropdown from './PriorityDropdown';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';
import { createPortal } from 'react-dom';

export default function AddLeadModal({
  isOpen,
  onClose,
  onAddLead,
  folders = [],
  userFolders = [],
  activeFolderId = null,
  currentUser = null,
  statuses = [],
  isLeadLimitReached = false,
}) {
  const [selectedFolderId, setSelectedFolderId] = useState(activeFolderId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState('');
  const [showExpander, setShowExpander] = useState(false);
  const [status, setStatus] = useState('Lead');
  const [priority, setPriority] = useState('Cold');
  const [channel, setChannel] = useState('Email');
  const [niche, setNiche] = useState('');
  const [note, setNote] = useState('');
  const [company, setCompany] = useState('');
  const [manualCompany, setManualCompany] = useState(false);
  const [addAnother, setAddAnother] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Folder switcher popover
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const folderTriggerRef = useRef(null);
  const [folderMenuPos, setFolderMenuPos] = useState(null);

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(activeFolderId);
      setName('');
      setEmail('');
      setPhone('');
      setLinks([]);
      setLinkInput('');
      setShowExpander(false);
      setStatus('Lead');
      setPriority('Cold');
      setChannel('Email');
      setNiche('');
      setNote('');
      setCompany('');
      setManualCompany(false);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, activeFolderId]);

  // Current folder object
  const currentFolder = (folders || []).find((f) => f.id === selectedFolderId) 
    || (userFolders || []).find((f) => f.id === selectedFolderId)
    || null;

  const currentFolderName = currentFolder?.name || 'Main List';
  const listCountry = currentFolder?.default_country || null;
  const listTimezone = currentFolder?.default_timezone || null;
  const userCountry = currentUser?.default_country_code || null;

  // Auto-detect company from email
  const detectedCompany = autoDetectCompanyFromEmail(email);

  useEffect(() => {
    if (!manualCompany && detectedCompany) {
      setCompany(detectedCompany);
    } else if (!manualCompany && !detectedCompany && !email) {
      setCompany('');
    }
  }, [detectedCompany, manualCompany, email]);

  // Timezone hint from phone
  const phoneTimezoneHint = getTimezoneHintFromPhone(phone, { listCountry, userCountry });

  const handleAddLinkFromInput = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    const clean = normalizeUrl(trimmed);
    const platform = detectPlatform(clean);
    if (!links.some(l => (typeof l === 'string' ? l : l.url) === clean)) {
      setLinks([...links, { url: clean, platform }]);
    }
    setLinkInput('');
  };

  const handleLinkKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddLinkFromInput();
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!name.trim() || submitting || isLeadLimitReached) return;

    // Add any pending link in linkInput
    let finalLinks = [...links];
    if (linkInput.trim()) {
      const clean = normalizeUrl(linkInput.trim());
      const platform = detectPlatform(clean);
      if (!finalLinks.some(l => (typeof l === 'string' ? l : l.url) === clean)) {
        finalLinks.push({ url: clean, platform });
      }
    }

    setSubmitting(true);
    try {
      const parts = name.trim().split(' ');
      const first_name = parts[0] || '';
      const last_name = parts.slice(1).join(' ') || null;

      // Sync legacy link columns
      const legacyLinks = syncLegacyLinkColumns(finalLinks);

      // Infer timezone from phone or inherit from list
      let resolvedTz = null;
      let resolvedTzSource = null;

      if (phone.trim()) {
        const inferred = inferTimezoneFromPhone(phone, { listCountry, userCountry });
        if (inferred?.timezone) {
          resolvedTz = inferred.timezone;
          resolvedTzSource = 'phone';
        }
      }

      if (!resolvedTz && listTimezone) {
        resolvedTz = listTimezone;
        resolvedTzSource = 'list';
      }

      const newLeadData = {
        first_name,
        last_name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        niche: niche.trim() || null,
        outreach_channel: channel || null,
        priority: priority || 'Cold',
        status: status || 'Lead',
        notes: note.trim() || null,
        folder_id: selectedFolderId || null,
        links: finalLinks,
        ...legacyLinks,
        timezone: resolvedTz,
        timezone_source: resolvedTzSource,
      };

      await onAddLead?.(newLeadData, addAnother);

      if (addAnother) {
        // Reset inputs for next lead
        setName('');
        setEmail('');
        setPhone('');
        setLinks([]);
        setLinkInput('');
        setNote('');
        setCompany('');
        setManualCompany(false);
        nameInputRef.current?.focus();
      } else {
        onClose?.();
      }
    } catch (err) {
      console.error('Failed to add lead:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenFolderMenu = () => {
    if (!folderTriggerRef.current) return;
    setFolderMenuPos(
      computePortalMenuPosition(folderTriggerRef.current, {
        menuWidth: 220,
        menuHeight: 240,
      })
    );
    setFolderMenuOpen(true);
  };

  if (!isOpen) return null;

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
        zIndex: 1050,
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
          maxWidth: '480px',
          backgroundColor: 'var(--bg-primary, #FFFFFF)',
          border: '1px solid var(--border-color, #E8E8E6)',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          // Fit the screen (phones included): header + footer stay put, the fields scroll.
          maxHeight: 'calc(100dvh - 32px)',
          // The shared .modal-content adds 2rem padding + gap; this modal has its own header/body/footer spacing.
          padding: 0,
          gap: 0,
        }}
      >
        {/* Header */}
        <div 
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid var(--border-color, #E8E8E6)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #1A1A1A)' }}>
              Add lead
            </h3>
            <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #8E8D8A)' }}>To</span>
              <button
                ref={folderTriggerRef}
                type="button"
                onClick={handleOpenFolderMenu}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--primary-color, #4361EE)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <span>{currentFolderName}</span>
                <ChevronDown size={12} />
              </button>
            </div>
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
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div
            className="rd-modal-scroll"
            style={{
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            
            {/* Field 1: Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label 
                htmlFor="lead-add-name" 
                style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}
              >
                Name *
              </label>
              <input
                id="lead-add-name"
                ref={nameInputRef}
                type="text"
                required
                autoFocus
                placeholder="e.g. Sophie Laurent"
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

            {/* Field 2: Email & Phone on one row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label 
                    htmlFor="lead-add-email" 
                    style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}
                  >
                    Email
                  </label>
                  <input
                    id="lead-add-email"
                    type="email"
                    placeholder="sophie@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label 
                    htmlFor="lead-add-phone" 
                    style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}
                  >
                    Phone
                  </label>
                  <input
                    id="lead-add-phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
              </div>

              {/* Muted hints under email & phone */}
              {(detectedCompany || phoneTimezoneHint) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                  {detectedCompany && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted, #8E8D8A)' }}>
                      <Building size={11} style={{ flexShrink: 0 }} />
                      <span>Company: <strong style={{ color: 'var(--text-primary, #1A1A1A)' }}>{detectedCompany}</strong> from the email</span>
                    </div>
                  )}
                  {phoneTimezoneHint && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted, #8E8D8A)' }}>
                      <Clock size={11} style={{ flexShrink: 0 }} />
                      <span>{phoneTimezoneHint}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Field 3: Link */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label 
                htmlFor="lead-add-link" 
                style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}
              >
                Link
              </label>
              
              {links.length > 0 && (
                <LeadLinkChips
                  links={links}
                  onChange={setLinks}
                  allowAdd={false}
                />
              )}

              <input
                id="lead-add-link"
                type="text"
                placeholder="Paste LinkedIn, Instagram or website"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={handleLinkKeyDown}
                onBlur={handleAddLinkFromInput}
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

            {/* Field 4: "+ Status, priority, note" expander */}
            <div style={{ marginTop: '2px' }}>
              <button
                type="button"
                onClick={() => setShowExpander(!showExpander)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 0',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--primary-color, #4361EE)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {showExpander ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{showExpander ? 'Fewer options' : '+ Status, priority, note'}</span>
              </button>

              {showExpander && (
                <div 
                  style={{
                    marginTop: '10px',
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                    border: '1px solid var(--border-color, #E8E8E6)',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted, #8E8D8A)' }}>
                        Status
                      </label>
                      <GroupedStatusDropdown
                        value={status}
                        onChange={setStatus}
                        statuses={statuses}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted, #8E8D8A)' }}>
                        Priority
                      </label>
                      <PriorityDropdown
                        value={priority}
                        onChange={setPriority}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted, #8E8D8A)' }}>
                        Channel
                      </label>
                      <GroupedChannelDropdown
                        value={channel}
                        onChange={setChannel}
                        channel="messaging"
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted, #8E8D8A)' }}>
                        Niche
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dental, SaaS"
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                        style={{
                          height: '30px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color, #E8E8E6)',
                          backgroundColor: 'var(--bg-primary, #FFFFFF)',
                          color: 'var(--text-primary, #1A1A1A)',
                          padding: '0 8px',
                          fontSize: '12px',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted, #8E8D8A)' }}>
                      Company
                    </label>
                    <input
                      type="text"
                      placeholder="Company name"
                      value={company}
                      onChange={(e) => {
                        setCompany(e.target.value);
                        setManualCompany(true);
                      }}
                      style={{
                        height: '30px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color, #E8E8E6)',
                        backgroundColor: 'var(--bg-primary, #FFFFFF)',
                        color: 'var(--text-primary, #1A1A1A)',
                        padding: '0 8px',
                        fontSize: '12px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted, #8E8D8A)' }}>
                      Note
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Initial notes or context..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      style={{
                        borderRadius: '4px',
                        border: '1px solid var(--border-color, #E8E8E6)',
                        backgroundColor: 'var(--bg-primary, #FFFFFF)',
                        color: 'var(--text-primary, #1A1A1A)',
                        padding: '6px 8px',
                        fontSize: '12px',
                        outline: 'none',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div 
            style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid var(--border-color, #E8E8E6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary, #6B7280)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={addAnother}
                onChange={(e) => setAddAnother(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>Add another</span>
            </label>

            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="btn btn-primary"
              style={{
                height: '32px',
                padding: '0 14px',
                fontSize: '13px',
                fontWeight: 500,
                borderRadius: '6px',
              }}
            >
              {submitting ? 'Adding...' : 'Add lead'}
            </button>
          </div>
        </form>
      </div>

      {/* List / Folder Selection Menu Portal */}
      {folderMenuOpen && folderMenuPos && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1200 }}
            onClick={() => setFolderMenuOpen(false)}
          />
          <div
            style={{
              ...portalMenuStyle(folderMenuPos, { minWidth: '200px', maxHeight: '240px' }),
              zIndex: 1201,
            }}
          >
            <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Choose list
            </div>
            {(userFolders?.length ? userFolders : folders).map((f) => {
              const isSel = f.id === selectedFolderId;
              return (
                <button
                  key={f.id}
                  type="button"
                  className="rd-menu-item"
                  onClick={() => {
                    setSelectedFolderId(f.id);
                    setFolderMenuOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '12px',
                    textAlign: 'left',
                    background: isSel ? 'var(--bg-card-hover)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Folder size={13} style={{ color: 'var(--primary-color)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {f.name}
                    </span>
                  </span>
                  {isSel && <Check size={13} style={{ color: 'var(--primary-color)' }} />}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
