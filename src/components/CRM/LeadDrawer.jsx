/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, no-extra-boolean-cast */
import { useState, useEffect, useRef } from 'react';
import { X, Calendar, User, FileText, Activity as ActivityIcon, Plus, Trash2, Pencil, Check, Receipt, Lock, Copy, Phone, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppContext } from '../../App';
import { fetchLeadCallTimeline } from '../../lib/callActivity';
import LogCallModal from './callActivity/LogCallModal';
import LogMessageModal from './LogMessageModal';
import EditableDropdown, { DEFAULT_ACTION_OPTIONS } from './EditableDropdown';
import RichTextEditor from './RichTextEditor';
import GroupedStatusDropdown from './GroupedStatusDropdown';
import GroupedTemplateDropdown from './GroupedTemplateDropdown';
import GroupedChannelDropdown from './GroupedChannelDropdown';
import {
  updateLeadStatusAndCheckpoint,
  getSuggestionForStatus,
  isClientStatus,
  REPLY_CHECK_STATUSES,
  FOLLOW_UP_CHECK_STATUSES,
} from '../../lib/reminders';
import { isCheckpointDue } from '../../lib/checkpointNotifications';
import { getCallActionForStatus, displayCallStatus } from '../../lib/callOutcomeRules';
import { CALL_ACTION_DEFAULT_OPTIONS } from './crmTableColumns';
import PriorityDropdown from './PriorityDropdown';
import DateTimePickerCell from './DateTimePickerCell';
import ActivityTimelineRow from './ActivityTimelineRow';
import { fetchLeadTimeline, logLeadTimelineEvent, updateTimelineEventOccurredAt } from '../../lib/leadTimeline';
import { getEffectiveUserTimeZone } from '../../lib/dateTime';
import { mergeTemplateFields } from '../../utils/templateMerge';
import { celebrateClosedWon } from '../../utils/celebrateWin';
import { TEMPLATE_KINDS } from '../../lib/templateKinds';
import './LeadDrawer.css';
export default function LeadDrawer({
  lead,
  onClose,
  onUpdateLead,
  columnDefs,
  currentUser,
  templates = [],
  onConvertToClient,
  isClientView,
  onRefresh,
  statuses = [],
  suggestionRules = [],
  initialTab = null,
}) {
  const [activeTab, setActiveTab] = useState('contact'); // 'contact' | 'pipeline' | 'notes' | 'activity'
  const { showToast, userSnippets } = useAppContext() || {};
  const [formData, setFormData] = useState({});
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    if (lead?.id) {
      fetchInvoices();
    }
  }, [lead?.id]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setInvoices(data);
      }
    } catch (e) {
      console.error('Error fetching invoices:', e);
    }
  };
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(true);
  const [convertForm, setConvertForm] = useState({
    company: '',
    phone: '',
    project_status: 'Onboarding',
    start_date: new Date().toISOString().split('T')[0],
    contract_value: '',
    invoice_link: ''
  });

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await updateLeadStatusAndCheckpoint({
        lead,
        newStatus: 'Client',
        suggestionRules,
        currentUser,
        extraUpdates: {
          lifecycle_stage: 'client',
          project_status: convertForm.project_status,
          start_date: convertForm.start_date || null,
          contract_value: convertForm.contract_value ? parseFloat(convertForm.contract_value) : null,
          invoice_link: convertForm.invoice_link || null,
          company: convertForm.company || null,
          phone: convertForm.phone || null
        }
      });

      setFormData(prev => ({
        ...prev,
        status: 'Client',
        lifecycle_stage: 'client',
        project_status: convertForm.project_status,
        start_date: convertForm.start_date,
        contract_value: convertForm.contract_value,
        invoice_link: convertForm.invoice_link,
        company: convertForm.company,
        phone: convertForm.phone
      }));

      if (onUpdateLead) {
        onUpdateLead(data);
      }
      setShowConvertModal(false);
      alert('Successfully converted to client!');
    } catch (err) {
      console.error('Error converting lead to client:', err);
      alert('Failed to convert: ' + err.message);
    }
  };

  // Multi-note state
  const [leadNotes, setLeadNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [selectedNoteContent, setSelectedNoteContent] = useState('');
  const [noteSaveStatus, setNoteSaveStatus] = useState('');
  const noteSaveTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setNoteSaveStatus('');
    if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
  }, [selectedNoteId]);

  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [callAttempts, setCallAttempts] = useState([]);
  const [callAttemptsLoading, setCallAttemptsLoading] = useState(false);
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [logMessageOpen, setLogMessageOpen] = useState(false);

  const titleInputRef = useRef(null);

  useEffect(() => {
    if (lead) {
      setFormData({
        ...lead,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
      });
      fetchNotes();
      fetchActivities();
      fetchCallAttempts();
      fetchTimeline();
      setShowSuggestion(true);
      if (initialTab === 'calls') {
        setActiveTab('activity');
      } else if (
        isCheckpointDue(lead, {
          remindersEnabled: currentUser?.reminders_enabled !== false,
        })
      ) {
        // Deep-link from bell/push: show checkpoint actions on Pipeline tab
        setActiveTab('pipeline');
      }
    }
  }, [lead, initialTab]);

  // Focus title input when entering edit mode
  useEffect(() => {
    if (editingTitleId && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitleId]);

  // ── Multi-note helpers ──
  async function fetchNotes() {
    if (!lead) return;
    setNotesLoading(true);
    try {
      let query = supabase.from('lead_notes').select('*').order('created_at', { ascending: true });
      if (isClientView) {
        query = query.eq('client_id', lead.id);
      } else {
        query = query.eq('lead_id', lead.id);
      }
      const { data, error } = await query;

      if (error) throw error;
      const notes = data || [];
      setLeadNotes(notes);
      if (notes.length > 0) {
        setSelectedNoteId(prev => prev && notes.find(n => n.id === prev) ? prev : notes[0].id);
        const first = notes[0];
        setSelectedNoteContent(first.content || '');
      }
    } catch (err) {
      console.error('Error fetching lead notes:', err);
    } finally {
      setNotesLoading(false);
    }
  };

  const createNote = async () => {
    if (!lead) return;
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .insert({
          user_id: currentUser.id,
          lead_id: lead.id,
          title: `Note ${leadNotes.length + 1}`,
          content: ''
        })
        .select()
        .single();

      if (error) throw error;
      setLeadNotes(prev => [...prev, data]);
      setSelectedNoteId(data.id);
      setSelectedNoteContent('');
      await logActivity('Note Added', { note_title: data.title });
    } catch (err) {
      console.error('Error creating note:', err);
    }
  };

  const deleteLeadNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      const { error } = await supabase.from('lead_notes').delete().eq('id', noteId);
      if (error) throw error;
      const remaining = leadNotes.filter(n => n.id !== noteId);
      setLeadNotes(remaining);
      if (selectedNoteId === noteId) {
        const next = remaining[0] || null;
        setSelectedNoteId(next?.id || null);
        setSelectedNoteContent(next?.content || '');
      }
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const commitTitleEdit = async () => {
    if (!editingTitleId) return;
    const trimmed = editingTitleValue.trim();
    if (!trimmed) { setEditingTitleId(null); return; }
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .update({ title: trimmed })
        .eq('id', editingTitleId)
        .select().single();
      if (error) throw error;
      setLeadNotes(prev => prev.map(n => n.id === data.id ? data : n));
    } catch (err) {
      console.error('Error updating note title:', err);
    } finally {
      setEditingTitleId(null);
    }
  };

  const handleSelectNote = (note) => {
    setSelectedNoteId(note.id);
    setSelectedNoteContent(note.content || '');
  };

  const selectedNote = leadNotes.find(n => n.id === selectedNoteId) || null;

  async function fetchActivities() {
    if (!lead) return;
    setActivitiesLoading(true);
    try {
      const targetLeadId = isClientView ? lead.lead_id : lead.id;
      if (!targetLeadId) {
        setActivities([]);
        return;
      }
      const { data, error } = await supabase
        .from('lead_activity')
        .select('*')
        .eq('lead_id', targetLeadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActivities(data || []);
    } catch (err) {
      console.error('Error fetching activities:', err);
    } finally {
      setActivitiesLoading(false);
    }
  };

  async function fetchCallAttempts() {
    if (!lead) return;
    const targetLeadId = isClientView ? lead.lead_id : lead.id;
    if (!targetLeadId) {
      setCallAttempts([]);
      return;
    }
    setCallAttemptsLoading(true);
    try {
      const data = await fetchLeadCallTimeline(targetLeadId);
      setCallAttempts(data);
    } catch (err) {
      console.error('Error fetching call timeline:', err);
      setCallAttempts([]);
    } finally {
      setCallAttemptsLoading(false);
    }
  };

  async function fetchTimeline() {
    if (!lead) return;
    const targetLeadId = isClientView ? lead.lead_id : lead.id;
    if (!targetLeadId) {
      setTimeline([]);
      return;
    }
    setTimelineLoading(true);
    try {
      const data = await fetchLeadTimeline(targetLeadId);
      setTimeline(data || []);
    } catch (err) {
      console.error('Error fetching lead timeline:', err);
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleCallLogged = async ({ leadUpdates } = {}) => {
    if (leadUpdates && onUpdateLead) onUpdateLead(leadUpdates);
    await Promise.all([fetchCallAttempts(), fetchTimeline()]);
  };

  const handleMessageLogged = async ({ leadUpdates } = {}) => {
    if (leadUpdates && onUpdateLead) onUpdateLead(leadUpdates);
    await fetchTimeline();
  };

  const logActivity = async (type, detail) => {
    try {
      const targetLeadId = isClientView ? lead.lead_id : lead.id;
      if (!targetLeadId) return;

      const { data, error } = await supabase
        .from('lead_activity')
        .insert({
          user_id: currentUser.id,
          lead_id: targetLeadId,
          action_type: type,
          action_detail: detail || {}
        })
        .select()
        .single();

      if (error) throw error;
      setActivities(prev => [data, ...prev]);

      const eventType = type === 'Note Added' || type === 'Note Updated'
        ? 'note_added'
        : type === 'Status Updated'
          ? 'status_changed'
          : 'field_changed';
      const summary = type === 'Status Updated' && detail?.to
        ? `Status → ${detail.to}`
        : type;
      logLeadTimelineEvent({
        leadId: targetLeadId,
        userId: currentUser.id,
        teamId: currentUser.team_id || null,
        eventType,
        summary,
        detail: detail || {},
        timeZone: getEffectiveUserTimeZone(currentUser),
      }).then((row) => {
        if (row) setTimeline((prev) => [row, ...prev]);
      }).catch(() => {});
    } catch (err) {
      console.error('Error logging activity:', err);
    }
  };

  const handleNameBlur = async () => {
    const currentName = (formData.name !== undefined ? formData.name : `${lead.first_name || ''} ${lead.last_name || ''}`).trim();
    const parts = currentName.split(' ');
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || null;

    if (first_name === lead.first_name && (last_name === lead.last_name || (!last_name && !lead.last_name))) return;

    try {
      const table = isClientView ? 'clients' : 'leads';
      const { data, error } = await supabase
        .from(table)
        .update({ first_name, last_name })
        .eq('id', lead.id)
        .select()
        .single();

      if (error) throw error;
      if (onUpdateLead) onUpdateLead(data);
      await logActivity('Name Updated', { from: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(), to: currentName });
    } catch (err) {
      console.error('Error auto-saving name:', err);
    }
  };

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomFieldChange = (key, value) => {
    const custom = { ...(formData.custom_fields || {}) };
    custom[key] = value;
    setFormData(prev => ({ ...prev, custom_fields: custom }));
  };

  const handleFieldBlur = async (field, isCustom = false, customKey = '') => {
    let value = isCustom ? formData.custom_fields?.[customKey] : formData[field];
    let originalValue = isCustom ? lead.custom_fields?.[customKey] : lead[field];

    if (value === originalValue) return;

    try {
      let updateObj = {};
      if (isCustom) {
        updateObj = { custom_fields: formData.custom_fields };
      } else {
        updateObj = { [field]: value };
      }

      const table = isClientView ? 'clients' : 'leads';

      const { data, error } = await supabase
        .from(table)
        .update(updateObj)
        .eq('id', lead.id)
        .select()
        .single();

      if (error) throw error;

      if (onUpdateLead) {
        onUpdateLead(data);
      }

      // Log the action
      const displayField = isCustom ? customKey : field;
      await logActivity('Field Updated', {
        field: displayField,
        from: originalValue || 'None',
        to: value || 'None'
      });
    } catch (err) {
      console.error('Error auto-saving lead:', err);
    }
  };

  const handleCopyPersonalizedMessage = (templateId) => {
    if (!templateId) return;
    const foundTmpl = templates.find(t => t.id === templateId);
    if (!foundTmpl) {
      showToast?.('Template not found', 'error');
      return;
    }
    const merged = mergeTemplateFields(foundTmpl.body || '', lead, userSnippets, columnDefs);
    navigator.clipboard.writeText(merged);
    showToast?.(`Personalized message for ${lead.first_name || 'Lead'} copied!`);
  };

  const handleDropdownChange = async (arg1, arg2, arg3) => {
    let leadId, field, value;
    if (arg3 !== undefined) {
      leadId = arg1;
      field = arg2;
      value = arg3;
    } else {
      leadId = lead.id;
      field = arg1;
      value = arg2;
    }

    let originalValue = lead[field];
    const updateValue = value === '' ? null : value;
    if (updateValue === originalValue) return;

    const table = isClientView ? 'clients' : 'leads';

    try {
      let data;
      if (field === 'status' && !isClientView) {
        data = await updateLeadStatusAndCheckpoint({
          lead,
          leadId,
          newStatus: updateValue,
          suggestionRules,
          currentUser
        });
        if (data?.draftCreated && showToast) {
          showToast(`Draft invoice generated for ${[data.first_name, data.last_name].filter(Boolean).join(' ') || 'Lead'}`);
        }
        if (updateValue === 'Closed Won' && lead.status !== 'Closed Won') {
          celebrateClosedWon();
        }
      } else {
        const { data: updatedData, error } = await supabase
          .from(table)
          .update({ [field]: updateValue })
          .eq('id', leadId)
          .select()
          .single();
        if (error) throw error;
        data = updatedData;
      }

      handleFieldChange(field, updateValue);
      if (onUpdateLead) {
        onUpdateLead(data);
      }

      await logActivity(`${field.charAt(0).toUpperCase() + field.slice(1)} Updated`, {
        from: originalValue || 'None',
        to: updateValue || 'None'
      });
    } catch (err) {
      console.error('Error saving dropdown change:', err);
    }
  };

  if (!lead) return null;

  // Group columns for view-specific categories (exclude system name, platform, and explicit link/phone fields from automatic standard rendering)
  const EXCLUDED_KEYS = new Set(['name', 'platform', 'reach', 'linkedin_url', 'instagram_url', 'twitter_url', 'website', 'phone']);
  const contactCols = columnDefs
    .filter(c => c.table_view === 'contact_details' && !EXCLUDED_KEYS.has(c.column_key))
    .filter((c, index, self) => self.findIndex(t => t.column_key === c.column_key) === index);
  const pipelineCols = columnDefs
    .filter(c => c.table_view === 'pipeline' && !EXCLUDED_KEYS.has(c.column_key))
    .filter((c, index, self) => self.findIndex(t => t.column_key === c.column_key) === index);

  return (
    <>
      <div className="lead-drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="lead-drawer__panel">
      {/* Drawer Header */}
      <div className="lead-drawer__header">
        <div className="lead-drawer__header-main">
          <div>
            <h3 className="lead-drawer__title" data-ph-mask>
              {isClientView ? formData.name || 'Unnamed Client' : (formData.name !== undefined ? formData.name : `${formData.first_name || ''} ${formData.last_name || ''}`.trim()) || 'Unnamed Lead'}
            </h3>
            {!isClientView && (
              <span className="lead-drawer__subtitle" data-ph-mask>
                {formData.company || 'No Company'}
              </span>
            )}
          </div>
          {!isClientView && !isClientStatus(formData.status) && (
            <button
              onClick={() => {
                setConvertForm({
                  company: formData.company || '',
                  phone: formData.phone || '',
                  project_status: 'Onboarding',
                  start_date: new Date().toISOString().split('T')[0],
                  contract_value: '',
                  invoice_link: ''
                });
                setShowConvertModal(true);
              }}
              className="btn btn-primary btn-sm"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 600 }}
            >
              Convert to Client
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-icon lead-drawer__close"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="crm-tabs lead-drawer__tabs">
        <button
          type="button"
          onClick={() => setActiveTab('contact')}
          className={`crm-tab ${activeTab === 'contact' ? 'crm-tab--active' : ''}`}
        >
          <User size={14} /> Info
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pipeline')}
          className={`crm-tab ${activeTab === 'pipeline' ? 'crm-tab--active' : ''}`}
        >
          <Calendar size={14} /> Pipeline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`crm-tab ${activeTab === 'notes' ? 'crm-tab--active' : ''}`}
        >
          <FileText size={14} /> Notes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`crm-tab ${activeTab === 'activity' ? 'crm-tab--active' : ''}`}
        >
          <ActivityIcon size={14} /> Activity
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`crm-tab ${activeTab === 'invoices' ? 'crm-tab--active' : ''}`}
        >
          <Receipt size={14} /> Invoices
        </button>
      </div>

      {/* Drawer Body Container */}
      <div className="lead-drawer__body">
        
        {/* Contact Info Tab */}
        {activeTab === 'contact' && (
          <div className="rd-form rd-drawer-form">
            <div style={{ display: 'flex', gap: '8px', margin: '0 0 var(--space-2)' }}>
              {(() => {
                const match = statuses.find(s => s.label.toLowerCase() === (lead.status || '').toLowerCase());
                const bg = match ? `${match.color}22` : '#374151';
                const text = match ? match.color : '#D1D5DB';
                const label = match ? match.label : (lead.status || 'Lead');
                return (
                  <span className="lead-drawer__status-badge" style={{
                    background: bg,
                    color: text,
                  }}>
                    {label}
                  </span>
                );
              })()}
              <PriorityDropdown
                value={formData.priority !== undefined ? formData.priority : lead.priority}
                onChange={(newVal) => handleDropdownChange('priority', newVal)}
                onUpdate={onRefresh}
              />
            </div>

            <section className="rd-form-section">
              <h4 className="rd-form-section-title">Contact</h4>
            
            {/* Single Name Field */}
            <div className="rd-form-group" data-ph-mask>
              <label className="form-label">Name</label>
              <input
                type="text"
                value={formData.name !== undefined ? formData.name : `${formData.first_name || ''} ${formData.last_name || ''}`.trim()}
                onChange={e => handleFieldChange('name', e.target.value)}
                onBlur={handleNameBlur}
                className="form-input"
              />
            </div>

            {/* Standard fields */}
            {contactCols.filter(c => c.is_default).map(col => {
              const isCustom = false;
              const val = formData[col.column_key] || '';
              
              return (
                <div key={col.id} className="rd-form-group" data-ph-mask>
                  <label className="form-label">{col.column_label}</label>
                  {col.column_key === 'priority' || col.column_type === 'priority' ? (
                    <PriorityDropdown
                      value={val}
                      onChange={(newVal) => handleDropdownChange('priority', newVal)}
                      onUpdate={onRefresh}
                    />
                  ) : col.column_type === 'dropdown' ? (
                    <EditableDropdown
                      value={val}
                      columnDef={col}
                      onChange={(newVal) => handleDropdownChange(col.column_key, newVal)}
                      onUpdateColumnDef={fetchNotes}
                    />
                  ) : col.column_type === 'date' || col.column_key === 'last_contacted_at' || col.column_key === 'last_called_at' ? (
                    <DateTimePickerCell
                      value={val || null}
                      timeZone={getEffectiveUserTimeZone(currentUser)}
                      onChange={(iso) => {
                        handleFieldChange(col.column_key, iso || '');
                        handleFieldBlur(col.column_key, false, '');
                      }}
                    />
                  ) : (
                    <input
                      type={col.column_type === 'number' ? 'number' : 'text'}
                      value={val}
                      onChange={e => handleFieldChange(col.column_key, e.target.value)}
                      onBlur={() => handleFieldBlur(col.column_key, false, '')}
                      className="form-input"
                    />
                  )}
                </div>
              );
            })}
            </section>

            {/* Links & Contact Section */}
            <section className="rd-form-section">
              <h4 className="rd-form-section-title">Links & contact</h4>
            <div className="rd-form-group" data-ph-mask>
              <label className="form-label">LinkedIn</label>
              <input
                type="url"
                placeholder="https://linkedin.com/in/..."
                value={formData.linkedin_url || ''}
                onChange={e => handleFieldChange('linkedin_url', e.target.value)}
                onBlur={() => handleFieldBlur('linkedin_url')}
                className="form-input"
              />
            </div>
            <div className="rd-form-group" data-ph-mask>
              <label className="form-label">Instagram</label>
              <input
                type="url"
                placeholder="https://instagram.com/..."
                value={formData.instagram_url || ''}
                onChange={e => handleFieldChange('instagram_url', e.target.value)}
                onBlur={() => handleFieldBlur('instagram_url')}
                className="form-input"
              />
            </div>
            <div className="rd-form-group" data-ph-mask>
              <label className="form-label">Twitter / X</label>
              <input
                type="url"
                placeholder="https://twitter.com/..."
                value={formData.twitter_url || ''}
                onChange={e => handleFieldChange('twitter_url', e.target.value)}
                onBlur={() => handleFieldBlur('twitter_url')}
                className="form-input"
              />
            </div>
            <div className="rd-form-group" data-ph-mask>
              <label className="form-label">Website</label>
              <input
                type="url"
                placeholder="https://..."
                value={formData.website || ''}
                onChange={e => handleFieldChange('website', e.target.value)}
                onBlur={() => handleFieldBlur('website')}
                className="form-input"
              />
            </div>
            <div className="rd-form-group" data-ph-mask>
              <label className="form-label">Phone</label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={e => handleFieldChange('phone', e.target.value)}
                onBlur={() => handleFieldBlur('phone')}
                className="form-input"
              />
            </div>

            <div className="rd-form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                Project
                {!(!['trial', 'starter'].includes((currentUser?.plan || 'trial').toLowerCase())) && (
                  <Lock size={12} style={{ color: 'var(--text-muted)' }} title="Locked on Starter/Trial plans" />
                )}
              </label>
              <input
                type="text"
                disabled={!(!['trial', 'starter'].includes((currentUser?.plan || 'trial').toLowerCase()))}
                placeholder={!(!['trial', 'starter'].includes((currentUser?.plan || 'trial').toLowerCase())) ? "Locked on Starter/Trial" : "e.g. VA Services, Newsletters"}
                value={!(!['trial', 'starter'].includes((currentUser?.plan || 'trial').toLowerCase())) ? "" : (formData.project || '')}
                onChange={e => handleFieldChange('project', e.target.value)}
                onBlur={() => handleFieldBlur('project')}
                className="form-input"
              />
            </div>
            </section>

            {/* Custom non-default fields if any */}
            {contactCols.filter(c => !c.is_default).map(col => {
              const valRaw = formData.custom_fields?.[col.column_key];
              const val = col.column_type === 'link' && Array.isArray(valRaw) ? valRaw.join(', ') : (valRaw || '');
              return (
                <div key={col.id} className="form-group" data-ph-mask>
                  <label className="form-label">{col.column_label}</label>
                  {col.column_type === 'dropdown' ? (
                    <EditableDropdown
                      value={val}
                      columnDef={col}
                      onChange={(newVal) => {
                        const custom = { ...(formData.custom_fields || {}) };
                        custom[col.column_key] = newVal;
                        handleFieldChange('custom_fields', custom);
                        supabase.from(isClientView ? 'clients' : 'leads').update({ custom_fields: custom }).eq('id', lead.id).then(() => {
                          if (onUpdateLead) onUpdateLead({ ...lead, custom_fields: custom });
                          logActivity('Field Updated', { field: col.column_key, from: lead.custom_fields?.[col.column_key] || 'None', to: newVal });
                        });
                      }}
                      onUpdateColumnDef={fetchNotes}
                    />
                  ) : col.column_type === 'date' ? (
                    <DateTimePickerCell
                      value={val || null}
                      timeZone={getEffectiveUserTimeZone(currentUser)}
                      onChange={(iso) => {
                        handleCustomFieldChange(col.column_key, iso || '');
                        handleFieldBlur(col.column_key, true, col.column_key);
                      }}
                    />
                  ) : (
                    <input
                      type={col.column_type === 'number' ? 'number' : 'text'}
                      value={val}
                      onChange={e => handleCustomFieldChange(col.column_key, col.column_type === 'link' ? e.target.value.split(',').map(s=>s.trim()).filter(Boolean) : e.target.value)}
                      onBlur={() => handleFieldBlur(col.column_key, true, col.column_key)}
                      className="form-input"
                      placeholder={col.column_type === 'link' ? 'https://...' : ''}
                    />
                  )}
                </div>
              );
            })}

          </div>
        )}

        {/* Pipeline Tab */}
        {activeTab === 'pipeline' && (
          <div className="flex-col gap-3">
            {(() => {
              const status = formData.status || lead?.status || 'Lead';
              const checkpointAt = formData.next_checkpoint_at ?? lead?.next_checkpoint_at;
              const due = isCheckpointDue(
                { ...lead, ...formData, status, next_checkpoint_at: checkpointAt },
                { remindersEnabled: currentUser?.reminders_enabled !== false },
              );
              if (!due) return null;

              const firstName =
                (formData.first_name || lead?.first_name || 'they').split(' ')[0] || 'they';
              const isReplyCheck = REPLY_CHECK_STATUSES.includes(status);
              const isFollowUpCheck = FOLLOW_UP_CHECK_STATUSES.includes(status);

              const handleCheckpointOutcome = async (newStatus, extra = {}) => {
                try {
                  const updated = await updateLeadStatusAndCheckpoint({
                    lead: { ...lead, ...formData },
                    newStatus,
                    suggestionRules,
                    currentUser,
                    extraUpdates: extra,
                  });
                  setFormData((prev) => ({ ...prev, ...updated }));
                  if (onUpdateLead) onUpdateLead(updated);
                  if (newStatus === 'Closed Won' && lead?.status !== 'Closed Won') {
                    celebrateClosedWon();
                  }
                  if (onRefresh) onRefresh();
                } catch (err) {
                  console.error('Error updating checkpoint outcome:', err);
                  showToast?.('Failed to update status');
                }
              };

              return (
                <div
                  style={{
                    padding: '0.85rem',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    borderRadius: '8px',
                    background: 'rgba(139, 92, 246, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {isReplyCheck
                      ? `Did ${firstName} reply?`
                      : isFollowUpCheck
                        ? `Did you follow up with ${firstName}?`
                        : 'Follow-up due'}
                  </div>
                  {isReplyCheck && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'var(--success-color)', color: 'var(--success-color)', fontWeight: 600 }}
                        onClick={() => handleCheckpointOutcome('Positive Reply', { reply_type: 'positive' })}
                      >
                        Positive reply
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'var(--text-primary)', color: 'var(--text-primary)', fontWeight: 600 }}
                        onClick={() => handleCheckpointOutcome('Booked', { reply_type: 'positive' })}
                      >
                        Call booked
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'var(--warning-color)', color: 'var(--warning-color)', fontWeight: 600 }}
                        onClick={() => handleCheckpointOutcome('No Show / Rescheduled')}
                      >
                        No show
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)', fontWeight: 600 }}
                        onClick={() => handleCheckpointOutcome('Not Interested', { reply_type: 'negative' })}
                      >
                        Negative reply
                      </button>
                    </div>
                  )}
                  {isFollowUpCheck && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ fontWeight: 600 }}
                      onClick={() => handleCheckpointOutcome('Waiting')}
                    >
                      Mark as done
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Priority Status Dropdowns */}
            {pipelineCols.map(col => {
              const isCustom = !col.is_default;
              const valRaw = isCustom ? formData.custom_fields?.[col.column_key] : formData[col.column_key];
              const val = col.column_type === 'link' && Array.isArray(valRaw) ? valRaw.join(', ') : (valRaw || '');
              
              if (col.column_key === 'template_used') {
                return (
                  <div key={col.id} className="form-group">
                    <label className="form-label">{col.column_label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <GroupedTemplateDropdown
                          value={val || ''}
                          onChange={newVal => handleDropdownChange('template_used', newVal)}
                          templates={templates}
                          placeholder="None"
                        />
                      </div>
                      {val && (
                        <button
                          type="button"
                          onClick={() => handleCopyPersonalizedMessage(val)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            padding: '6px 8px',
                            minHeight: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderColor: 'var(--border)',
                            borderRadius: '3px'
                          }}
                          title="Copy personalized message"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              if (col.column_key === 'status') {
                const currentStatus = val || 'Lead';
                return (
                  <div key={col.id} className="form-group">
                    <label className="form-label">{col.column_label}</label>
                    <GroupedStatusDropdown
                      value={currentStatus}
                      onChange={(newVal) => handleDropdownChange('status', newVal)}
                    />
                  </div>
                );
              }

              if (col.column_key === 'outreach_channel' || col.column_type === 'channel') {
                return (
                  <div key={col.id} className="form-group">
                    <label className="form-label">{col.column_label}</label>
                    <GroupedChannelDropdown
                      value={val}
                      onChange={(newVal) => handleDropdownChange('outreach_channel', newVal)}
                      channel="messaging"
                    />
                  </div>
                );
              }

              if (col.column_key === 'action_to_take') {
                const suggestionsEnabled = currentUser?.suggestions_enabled !== false;
                const expectedSuggestion = getSuggestionForStatus(formData.status || 'Lead', suggestionRules, currentUser);
                const isMismatch = suggestionsEnabled && expectedSuggestion && val !== expectedSuggestion;

                return (
                  <div key={col.id} className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <label className="form-label" style={{ margin: 0 }}>{col.column_label}</label>
                      {isMismatch && showSuggestion && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => handleDropdownChange('action_to_take', expectedSuggestion)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              background: 'transparent',
                              border: '0.5px solid var(--border-strong)',
                              borderRadius: '4px',
                              color: 'var(--success-color)',
                              cursor: 'pointer',
                              transition: 'var(--transition-fast)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            title={`Apply Suggested: "${expectedSuggestion}"`}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSuggestion(false)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              background: 'transparent',
                              border: '0.5px solid var(--border-strong)',
                              borderRadius: '4px',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              transition: 'var(--transition-fast)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            title="Dismiss Suggestion"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <EditableDropdown
                      value={val}
                      columnDef={col}
                      onChange={(newVal) => handleDropdownChange(col.column_key, newVal)}
                      onUpdateColumnDef={fetchNotes}
                    />
                  </div>
                );
              }

              return (
                <div key={col.id} className="form-group">
                  <label className="form-label">{col.column_label}</label>
                  {col.column_type === 'dropdown' ? (
                    <EditableDropdown
                      value={val}
                      columnDef={col}
                      onChange={(newVal) => {
                        if (isCustom) {
                          const custom = { ...(formData.custom_fields || {}) };
                          custom[col.column_key] = newVal;
                          handleFieldChange('custom_fields', custom);
                          supabase.from(isClientView ? 'clients' : 'leads').update({ custom_fields: custom }).eq('id', lead.id).then(() => {
                            if (onUpdateLead) onUpdateLead({ ...lead, custom_fields: custom });
                            logActivity('Field Updated', { field: col.column_key, from: lead.custom_fields?.[col.column_key] || 'None', to: newVal });
                          });
                        } else {
                          handleDropdownChange(col.column_key, newVal);
                        }
                      }}
                      onUpdateColumnDef={fetchNotes}
                    />
                  ) : col.column_type === 'date' || col.column_key === 'last_contacted_at' || col.column_key === 'last_called_at' ? (
                    <DateTimePickerCell
                      value={val || null}
                      timeZone={getEffectiveUserTimeZone(currentUser)}
                      onChange={(iso) => {
                        if (isCustom) {
                          handleCustomFieldChange(col.column_key, iso || '');
                        } else {
                          handleFieldChange(col.column_key, iso || '');
                        }
                        handleFieldBlur(col.column_key, isCustom, col.column_key);
                      }}
                    />
                  ) : (
                    <input
                      type={col.column_type === 'number' ? 'number' : 'text'}
                      value={val}
                      onChange={e => {
                        const nextVal = col.column_type === 'link' ? e.target.value.split(',').map(s=>s.trim()).filter(Boolean) : e.target.value;
                        isCustom ? handleCustomFieldChange(col.column_key, nextVal) : handleFieldChange(col.column_key, nextVal);
                      }}
                      onBlur={() => handleFieldBlur(col.column_key, isCustom, col.column_key)}
                      className="form-input"
                    />
                  )}
                </div>
              );
            })}

            {!isClientView && initialTab === 'calls' && (
              <div className="form-group">
                <label className="form-label">Script</label>
                <GroupedTemplateDropdown
                  value={formData.script_used || ''}
                  onChange={(newVal) => handleDropdownChange('script_used', newVal)}
                  templates={templates}
                  kind={TEMPLATE_KINDS.CALLS}
                  placeholder="None"
                />
              </div>
            )}

            {!isClientView && (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Call next step</label>
                  {(() => {
                    const expected = getCallActionForStatus(displayCallStatus(formData.call_status), currentUser?.id, currentUser);
                    const val = formData.call_action || '';
                    const isMismatch = currentUser?.suggestions_enabled !== false && expected && val !== expected;
                    if (!isMismatch || !showSuggestion) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => handleDropdownChange('call_action', expected)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem' }}
                      >
                        Apply: {expected}
                      </button>
                    );
                  })()}
                </div>
                <EditableDropdown
                  value={formData.call_action || ''}
                  columnDef={{
                    id: 'drawer-call-action',
                    column_key: 'call_action',
                    column_label: 'Call next step',
                    column_type: 'dropdown',
                    dropdown_options: columnDefs.find((c) => c.column_key === 'call_action' && c.table_view === 'call_queue')?.dropdown_options?.length
                      ? columnDefs.find((c) => c.column_key === 'call_action' && c.table_view === 'call_queue').dropdown_options
                      : CALL_ACTION_DEFAULT_OPTIONS,
                  }}
                  onChange={(newVal) => handleDropdownChange('call_action', newVal)}
                />
              </div>
            )}

            {/* Pipeline Notes */}
            <div className="form-group">
              <label className="form-label">Pipeline Notes</label>
              <textarea
                value={formData.pipeline_notes || ''}
                onChange={e => handleFieldChange('pipeline_notes', e.target.value)}
                onBlur={() => handleFieldBlur('pipeline_notes')}
                className="form-textarea"
                placeholder="Specific context about the status of this deal..."
                style={{ minHeight: '120px' }}
              />
            </div>
          </div>
        )}

        {/* Notes Tab – Multi-note with RichTextEditor */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {notesLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading notes...</div>
            ) : (
              <>
                {/* Note card list + New Note button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Notes ({leadNotes.length})
                    </span>
                    <button
                      onClick={createNote}
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                    >
                      <Plus size={13} /> New Note
                    </button>
                  </div>

                  {leadNotes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                      No notes yet. Click <strong>+ New Note</strong> to start.
                    </div>
                  ) : (
                    leadNotes.map(n => (
                      <div
                        key={n.id}
                        className={`lead-note-card ${selectedNoteId === n.id ? 'active' : ''}`}
                        onClick={() => handleSelectNote(n)}
                      >
                        <FileText size={13} className="lead-drawer__note-icon" />

                        {/* Inline title edit */}
                        {editingTitleId === n.id ? (
                          <input
                            ref={titleInputRef}
                            value={editingTitleValue}
                            onChange={e => setEditingTitleValue(e.target.value)}
                            onBlur={commitTitleEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitTitleEdit(); if (e.key === 'Escape') setEditingTitleId(null); }}
                            onClick={e => e.stopPropagation()}
                            className="lead-drawer__note-title-input"
                          />
                        ) : (
                          <span className="lead-drawer__note-title" data-ph-mask>
                            {n.title || 'Untitled'}
                          </span>
                        )}

                        {/* Edit title btn */}
                        <button
                          onClick={e => { e.stopPropagation(); setEditingTitleId(n.id); setEditingTitleValue(n.title || ''); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          title="Rename note"
                        >
                          <Pencil size={11} />
                        </button>

                        {/* Delete btn */}
                        <button
                          onClick={e => { e.stopPropagation(); deleteLeadNote(n.id); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', padding: '0.1rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          title="Delete note"
                        >
                      <Trash2 size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Rich Text Editor for selected note */}
                {selectedNote && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '16px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Editing: <strong data-ph-mask>{selectedNote.title || 'Untitled'}</strong>
                      </span>
                      {noteSaveStatus === 'saving' && (
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>Saving...</span>
                      )}
                      {noteSaveStatus === 'saved' && (
                        <span style={{ fontSize: '11px', color: '#22C55E', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Check size={11} /> Saved</span>
                      )}
                    </div>
                    <div style={{ borderRadius: '8px', overflow: 'hidden' }}>
                      <RichTextEditor
                        key={selectedNote.id}
                        content={selectedNoteContent}
                        onChange={json => {
                          setSelectedNoteContent(json);
                          setLeadNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, content: json } : n));
                          setNoteSaveStatus('saving');
                          if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
                          noteSaveTimeoutRef.current = setTimeout(() => {
                            setNoteSaveStatus('saved');
                          }, 1000);
                        }}
                        placeholder="Write your note here..."
                        readOnly={false}
                        noteId={selectedNote.id}
                        noteType="lead"
                        userId={currentUser?.id}
                        currentTitle={selectedNote.title}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Activity Tab — unified timeline */}
        {activeTab === 'activity' && (
          <div className="flex-col gap-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h4 style={{ fontSize: '0.9rem', margin: 0, fontWeight: 600 }}>Activity</h4>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLogMessageOpen(true)}>
                  <Mail size={12} /> Log message
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setLogCallOpen(true)}>
                  <Phone size={12} /> Log call
                </button>
              </div>
            </div>

            {timelineLoading || callAttemptsLoading || activitiesLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading activity…</div>
            ) : timeline.length === 0 && callAttempts.length === 0 && activities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem', border: '1px dashed var(--border-color)', borderRadius: 6 }}>
                No activity yet. Log a call or message to start the timeline.
              </div>
            ) : timeline.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {timeline.map((ev) => (
                  <ActivityTimelineRow
                    key={ev.id}
                    event={ev}
                    showLead={false}
                    editableWhen
                    onSaveWhen={async (event, iso) => {
                      const updated = await updateTimelineEventOccurredAt(
                        event.id,
                        iso,
                        getEffectiveUserTimeZone(currentUser),
                      );
                      if (updated) {
                        setTimeline((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {callAttempts.map((call) => (
                  <ActivityTimelineRow
                    key={call.id}
                    showLead={false}
                    event={{
                      event_type: 'call_logged',
                      summary: `Call: ${call.outcome}`,
                      occurred_at: call.occurred_at || call.created_at,
                      actor_full_name: call.caller_name,
                      actor_email: call.caller_email,
                      detail: { note: call.note, outcome: call.outcome },
                    }}
                  />
                ))}
                {activities.map((act) => (
                  <ActivityTimelineRow
                    key={act.id}
                    showLead={false}
                    event={{
                      event_type: act.action_type === 'Status Updated' ? 'status_changed' : 'field_changed',
                      summary: act.action_type,
                      occurred_at: act.created_at,
                      detail: act.action_detail || {},
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="flex-col gap-3" style={{ textAlign: 'left' }}>
            <h4 style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>Linked Invoices</h4>
            {invoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No invoices linked to this lead yet. Invoices are automatically drafted when status is set to Booked or Rescheduled.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {invoices.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <div className="flex-col" style={{ gap: '0.2rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }} data-ph-mask>{inv.invoice_number}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Created {new Date(inv.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex align-center gap-3">
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }} data-ph-mask>{inv.total?.toLocaleString() || 0} {inv.currency || 'USD'}</span>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor: inv.status?.toLowerCase() === 'draft' ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.15)',
                        color: inv.status?.toLowerCase() === 'draft' ? 'var(--text-muted)' : '#10b981',
                        textTransform: 'capitalize'
                      }}>
                        {inv.status}
                      </span>
                      {inv.status?.toLowerCase() === 'draft' ? (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Draft — not published
                        </span>
                      ) : (
                        <button
                          onClick={() => window.open(`${window.location.origin}/i/${inv.id}`, '_blank')}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          View
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {showConvertModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                Convert to Client
              </h2>
              <button onClick={() => setShowConvertModal(false)} className="theme-toggle">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConvertSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" data-ph-mask>
                <label className="form-label">Company Name</label>
                <input 
                  type="text"
                  className="form-input"
                  value={convertForm.company}
                  onChange={(e) => setConvertForm({...convertForm, company: e.target.value})}
                  required
                />
              </div>

              <div className="form-group" data-ph-mask>
                <label className="form-label">Phone</label>
                <input 
                  type="text"
                  className="form-input"
                  value={convertForm.phone}
                  onChange={(e) => setConvertForm({...convertForm, phone: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Project Status</label>
                <select 
                  className="form-select"
                  value={convertForm.project_status}
                  onChange={(e) => setConvertForm({...convertForm, project_status: e.target.value})}
                >
                  <option value="Onboarding">Onboarding</option>
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input 
                  type="date"
                  className="form-input"
                  value={convertForm.start_date}
                  onChange={(e) => setConvertForm({...convertForm, start_date: e.target.value})}
                />
              </div>

              <div className="form-group" data-ph-mask>
                <label className="form-label">Contract Value</label>
                <input 
                  type="number"
                  className="form-input"
                  value={convertForm.contract_value}
                  onChange={(e) => setConvertForm({...convertForm, contract_value: e.target.value})}
                />
              </div>

              <div className="form-group" data-ph-mask>
                <label className="form-label">Invoice/Billing Link</label>
                <input 
                  type="url"
                  className="form-input"
                  value={convertForm.invoice_link}
                  onChange={(e) => setConvertForm({...convertForm, invoice_link: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 mt-4" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowConvertModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Conversion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <LogCallModal
        open={logCallOpen}
        onClose={() => setLogCallOpen(false)}
        fixedLead={lead}
        userId={currentUser?.id}
        teamId={currentUser?.team_id || null}
        profile={currentUser}
        showNoteSharing={!!currentUser?.team_id}
        onLogged={handleCallLogged}
        timeZone={getEffectiveUserTimeZone(currentUser)}
      />
      <LogMessageModal
        open={logMessageOpen}
        onClose={() => setLogMessageOpen(false)}
        lead={lead}
        userId={currentUser?.id}
        teamId={currentUser?.team_id || null}
        timeZone={getEffectiveUserTimeZone(currentUser)}
        onLogged={handleMessageLogged}
      />
      </div>
    </>
  );
}
