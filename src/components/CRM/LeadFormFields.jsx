import { useState, useEffect } from 'react';
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import GroupedStatusDropdown from './GroupedStatusDropdown';
import GroupedTemplateDropdown from './GroupedTemplateDropdown';
import GroupedChannelDropdown from './GroupedChannelDropdown';
import { detectDomainIcon } from '../icons/PlatformIcons';
import { inferTimezoneFromPhone } from '../../lib/leadTimezone';
import CountryTimezonePicker from './CountryTimezonePicker';

/**
 * Shared Add/Edit lead fields — sectioned layout matching Auth spacing.
 */
export default function LeadFormFields({
  leadForm,
  setLeadForm,
  pastedLink,
  setPastedLink,
  onAddPastedLink,
  getFolderSelectValue,
  onFolderChange,
  folders = [],
  userFolders = [],
  plan,
  templates = [],
  onStatusUpdate,
  showCustomFields = false,
  columnDefs = [],
  view = 'pipeline',
  onClearCustomField,
  newFieldName = '',
  setNewFieldName,
  newFieldType = 'text',
  setNewFieldType,
  onAddCustomField,
  defaultCountryCode = '+92',
}) {
  const handleDetectTimezone = () => {
    const { timezone } = inferTimezoneFromPhone(leadForm.phone, defaultCountryCode);
    if (timezone) {
      setLeadForm((prev) => ({
        ...prev,
        timezone,
        timezone_source: 'phone',
        timezoneTouched: false,
      }));
    }
  };

  const handlePhoneBlur = () => {
    if (leadForm.timezoneTouched || !leadForm.phone?.trim()) return;
    const { timezone } = inferTimezoneFromPhone(leadForm.phone, defaultCountryCode);
    if (timezone) {
      setLeadForm((prev) => ({
        ...prev,
        timezone,
        timezone_source: 'phone',
      }));
    }
  };
  const customCols = columnDefs.filter(
    (c) => !c.is_default && c.table_view === (view === 'pipeline' ? 'pipeline' : 'contact_details')
  );

  const hasExtra =
    (leadForm.links && leadForm.links.length > 0) ||
    (pastedLink && pastedLink.trim()) ||
    (showCustomFields && customCols.length > 0);

  const [moreOpen, setMoreOpen] = useState(Boolean(hasExtra));

  return (
    <div className="rd-form">
      <section className="rd-form-section">
        <h4 className="rd-form-section-title">Contact</h4>

        <div className="rd-form-group">
          <label className="form-label" htmlFor="lead-name">Name *</label>
          <input
            id="lead-name"
            type="text"
            required
            autoFocus
            placeholder="e.g. Sophie Laurent"
            value={leadForm.name}
            onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="rd-form-row">
          <div className="rd-form-group">
            <label className="form-label" htmlFor="lead-email">Email</label>
            <input
              id="lead-email"
              type="email"
              value={leadForm.email}
              onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
              className="form-input"
              placeholder="name@company.com"
            />
          </div>
          <div className="rd-form-group">
            <label className="form-label" htmlFor="lead-phone">Phone</label>
            <input
              id="lead-phone"
              type="text"
              value={leadForm.phone}
              onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
              onBlur={handlePhoneBlur}
              className="form-input"
              placeholder="+1…"
            />
          </div>
        </div>

        <div className="rd-form-group">
          <CountryTimezonePicker
            id="lead-timezone"
            value={leadForm.timezone || ''}
            onChange={(patch) => setLeadForm({ ...leadForm, ...patch })}
          />
          <div style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleDetectTimezone}>
              Detect from phone
            </button>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
            Used for “good time to call” hints. Search by country or dial code if the number has no country code.
          </span>
        </div>

        <div className="rd-form-row">
          <div className="rd-form-group">
            <label className="form-label" htmlFor="lead-company">Company</label>
            <input
              id="lead-company"
              type="text"
              value={leadForm.company}
              onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
              className="form-input"
            />
          </div>
          <div className="rd-form-group">
            <label className="form-label" htmlFor="lead-niche">Niche</label>
            <input
              id="lead-niche"
              type="text"
              placeholder="e.g. SaaS founders"
              value={leadForm.niche}
              onChange={(e) => setLeadForm({ ...leadForm, niche: e.target.value })}
              className="form-input"
            />
          </div>
        </div>
      </section>

      <section className="rd-form-section">
        <h4 className="rd-form-section-title">Pipeline</h4>

        <div className="rd-form-row">
          <div className="rd-form-group">
            <label className="form-label" htmlFor="lead-priority">Priority</label>
            <select
              id="lead-priority"
              value={leadForm.priority}
              onChange={(e) => setLeadForm({ ...leadForm, priority: e.target.value })}
              className="form-select"
            >
              <option value="Cold">Cold</option>
              <option value="Warm">Warm</option>
              <option value="Hot">Hot</option>
            </select>
          </div>
          <div className="rd-form-group">
            <label className="form-label">Status</label>
            <GroupedStatusDropdown
              value={leadForm.status}
              onChange={(val) => setLeadForm({ ...leadForm, status: val })}
              onUpdate={onStatusUpdate}
            />
          </div>
          <div className="rd-form-group">
            <label className="form-label">Channel</label>
            <GroupedChannelDropdown
              value={leadForm.outreach_channel}
              onChange={(val) => setLeadForm({ ...leadForm, outreach_channel: val })}
              channel="messaging"
            />
          </div>
        </div>

        <div className="rd-form-row">
          <div className="rd-form-group">
            <label className="form-label" htmlFor="lead-folder">Folder</label>
            <select
              id="lead-folder"
              value={getFolderSelectValue()}
              onChange={(e) => onFolderChange(e.target.value)}
              className="form-select"
            >
              <option value="">No folder</option>
              <optgroup label="System">
                <option value="sys:hot">Hot</option>
                <option value="sys:warm">Warm</option>
                <option value="sys:cold">Cold</option>
                <option value="sys:calendly">Invite Sent</option>
                <option value="sys:clients">Clients</option>
              </optgroup>
              {folders.length > 0 && (
                <optgroup label="Manual">
                  {folders.map((f) => (
                    <option key={f.id} value={`manual:${f.id}`}>{f.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Smart">
                {userFolders.map((uf) => (
                  <option key={uf.id} value={`smart:${uf.id}`} disabled>
                    {uf.name} (rule-based)
                  </option>
                ))}
                {plan === 'starter' && userFolders.length === 0 && (
                  <option value="" disabled>Upgrade to Pro for Smart Folders</option>
                )}
              </optgroup>
            </select>
          </div>
          <div className="rd-form-group">
            <label className="form-label">Template</label>
            <GroupedTemplateDropdown
              value={leadForm.template_used}
              onChange={(val) => setLeadForm({ ...leadForm, template_used: val })}
              templates={templates}
              placeholder="None"
            />
          </div>
        </div>

        <div className="rd-form-group">
          <label className="form-label" htmlFor="lead-notes">Notes</label>
          <textarea
            id="lead-notes"
            value={leadForm.notes}
            onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
            className="form-textarea rd-form-notes"
            placeholder="Context for the next follow-up…"
          />
        </div>
      </section>

      <section className="rd-form-section rd-form-section-more">
        <button
          type="button"
          className="rd-more-toggle"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
        >
          {moreOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Links & custom fields
        </button>

        {moreOpen && (
          <div className="rd-more-body">
            <div className="rd-form-group">
              <label className="form-label">Links</label>
              {leadForm.links?.length > 0 && (
                <ul className="rd-link-list">
                  {leadForm.links.map((link, idx) => {
                    const detected = detectDomainIcon(link.url);
                    const IconComp = detected.icon;
                    return (
                      <li key={`${link.url}-${idx}`} className="rd-link-chip">
                        <IconComp size={14} color={detected.color} aria-hidden />
                        <span title={link.url}>{link.url}</span>
                        <button
                          type="button"
                          className="rd-link-remove"
                          title="Remove link"
                          onClick={() => {
                            setLeadForm((prev) => ({
                              ...prev,
                              links: prev.links.filter((_, i) => i !== idx),
                            }));
                          }}
                        >
                          <X size={12} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="rd-link-add">
                <input
                  type="text"
                  placeholder="Paste LinkedIn, site, or any URL…"
                  value={pastedLink}
                  onChange={(e) => setPastedLink(e.target.value)}
                  onKeyDown={onAddPastedLink}
                  className="form-input"
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  title="Add link"
                  onClick={() => onAddPastedLink({ key: 'Enter', preventDefault: () => {} })}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {showCustomFields && (
              <>
                {customCols.length > 0 && (
                  <div className="rd-form-row">
                    {customCols.map((col) => {
                      const val = leadForm.custom_fields?.[col.column_key] || '';
                      return (
                        <div key={col.id} className="rd-form-group">
                          <div className="rd-field-label-row">
                            <label className="form-label">{col.column_label}</label>
                            <button
                              type="button"
                              className="rd-link-remove"
                              title="Clear value"
                              onClick={() => onClearCustomField?.(col.column_key)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                          <input
                            type={col.column_type === 'number' ? 'number' : col.column_type === 'link' ? 'url' : 'text'}
                            value={val}
                            onChange={(e) => setLeadForm((prev) => ({
                              ...prev,
                              custom_fields: {
                                ...(prev.custom_fields || {}),
                                [col.column_key]: e.target.value,
                              },
                            }))}
                            className="form-input"
                            placeholder={`Enter ${col.column_label.toLowerCase()}…`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="rd-new-field">
                  <div className="rd-form-group" style={{ flex: 2 }}>
                    <label className="form-label">New field</label>
                    <input
                      type="text"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName?.(e.target.value)}
                      placeholder="e.g. TikTok, Skype…"
                      className="form-input"
                    />
                  </div>
                  <div className="rd-form-group" style={{ flex: 1 }}>
                    <label className="form-label">Type</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType?.(e.target.value)}
                      className="form-select"
                    >
                      <option value="text">Text</option>
                      <option value="link">Link</option>
                      <option value="number">Number</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary rd-new-field-btn"
                    onClick={() => {
                      onAddCustomField?.(newFieldName, newFieldType);
                      setNewFieldName?.('');
                    }}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
