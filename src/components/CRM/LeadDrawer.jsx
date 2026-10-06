/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, no-extra-boolean-cast */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  MoreHorizontal, 
  Phone, 
  Mail, 
  Calendar, 
  Clock, 
  Building, 
  Folder, 
  Check, 
  Plus, 
  Trash2, 
  Pencil, 
  FileText, 
  Receipt, 
  Activity as ActivityIcon, 
  Copy, 
  ExternalLink,
  MessageSquare,
  UserCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppContext } from '../../App';
import { fetchLeadCallTimeline } from '../../lib/callActivity';
import { isTeamOwner } from '../../lib/teamWorkspace';
import LogCallModal from './callActivity/LogCallModal';
import LogMessageModal from './LogMessageModal';
import GroupedStatusDropdown from './GroupedStatusDropdown';
import GroupedChannelDropdown from './GroupedChannelDropdown';
import PriorityDropdown from './PriorityDropdown';
import DateTimePickerCell from './DateTimePickerCell';
import ActivityTimelineRow from './ActivityTimelineRow';
import LocalTimeCell from './LocalTimeCell';
import LeadLinkChips from './LeadLinkChips';
import RichTextEditor from './RichTextEditor';
import { PhonePopup } from '../icons/PlatformIcons';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';
import { 
  updateLeadStatusAndCheckpoint, 
  getSuggestionForStatus, 
  isClientStatus,
  REPLY_CHECK_STATUSES,
  FOLLOW_UP_CHECK_STATUSES
} from '../../lib/reminders';
import { isCheckpointDue } from '../../lib/checkpointNotifications';
import { getCallActionForStatus, displayCallStatus } from '../../lib/callOutcomeRules';
import { fetchLeadTimeline, logLeadTimelineEvent, updateTimelineEventOccurredAt } from '../../lib/leadTimeline';
import { getEffectiveUserTimeZone } from '../../lib/dateTime';
import { getLeadTimezone, inferTimezoneFromPhone } from '../../lib/leadTimezone';
import { 
  extractLeadLinksArray, 
  syncLegacyLinkColumns, 
  normalizeUrl, 
  detectPlatform 
} from '../../lib/linkUtils';
import { celebrateClosedWon } from '../../utils/celebrateWin';
import './LeadDrawer.css';

export default function LeadDrawer({
  lead,
  leadsList = [],
  onSelectLead,
  onClose,
  onUpdateLead,
  onDeleteLead,
  columnDefs = [],
  currentUser,
  templates = [],
  folders = [],
  userFolders = [],
  onConvertToClient,
  isClientView = false,
  currentViewName = null,
  onRefresh,
  statuses = [],
  suggestionRules = [],
  initialTab = null,
}) {
  const { showToast, userSnippets, teamProfilesMap = {} } = useAppContext() || {};
  const isOwner = isTeamOwner(currentUser);

  const [formData, setFormData] = useState({});
  const [activeTab, setActiveTab] = useState(initialTab === 'calls' ? 'calls' : 'activity'); // 'activity' | 'notes' | 'calls' | 'invoices'

  // More menu portal
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState(null);
  const moreTriggerRef = useRef(null);

  // Move to list menu portal
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [listMenuPos, setListMenuPos] = useState(null);
  const listTriggerRef = useRef(null);

  // Convert modal
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertForm, setConvertForm] = useState({
    company: '',
    phone: '',
    project_status: 'Onboarding',
    start_date: new Date().toISOString().split('T')[0],
    contract_value: '',
    invoice_link: ''
  });

  // Action modals
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [logMessageOpen, setLogMessageOpen] = useState(false);

  // Notes state
  const [leadNotes, setLeadNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [selectedNoteContent, setSelectedNoteContent] = useState('');
  const [noteSaveStatus, setNoteSaveStatus] = useState('');
  const noteSaveTimeoutRef = useRef(null);
  const titleInputRef = useRef(null);

  // Timeline / Activity state
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [callAttempts, setCallAttempts] = useState([]);
  const [callAttemptsLoading, setCallAttemptsLoading] = useState(false);

  // Quick activity/note composer in Activity tab
  const [composerText, setComposerText] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);

  // Invoices state
  const [invoices, setInvoices] = useState([]);

  // Follow-up popover state
  const [showFollowupPicker, setShowFollowupPicker] = useState(false);

  // Sync state when lead changes
  useEffect(() => {
    if (lead) {
      const parsedLinks = extractLeadLinksArray(lead);
      setFormData({
        ...lead,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        links: parsedLinks,
      });

      fetchNotes();
      fetchActivities();
      fetchCallAttempts();
      fetchTimeline();
      fetchInvoices();

      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [lead?.id]);

  // Lead navigation (prev / next)
  const currentLeadIndex = useMemo(() => {
    if (!leadsList || !leadsList.length || !lead) return -1;
    return leadsList.findIndex((l) => l.id === lead.id);
  }, [leadsList, lead?.id]);

  const totalLeadsCount = leadsList?.length || 0;
  const hasPrev = currentLeadIndex > 0;
  const hasNext = currentLeadIndex >= 0 && currentLeadIndex < totalLeadsCount - 1;

  const handlePrevLead = () => {
    if (hasPrev && onSelectLead) {
      onSelectLead(leadsList[currentLeadIndex - 1]);
    }
  };

  const handleNextLead = () => {
    if (hasNext && onSelectLead) {
      onSelectLead(leadsList[currentLeadIndex + 1]);
    }
  };

  // List folder lookup
  const currentFolder = (folders || []).find((f) => f.id === (formData.folder_id || lead?.folder_id))
    || (userFolders || []).find((f) => f.id === (formData.folder_id || lead?.folder_id))
    || null;

  const listName = currentFolder?.name || 'Main List';
  const listCountry = currentFolder?.default_country || null;
  const userCountry = currentUser?.default_country_code || null;

  // Avatar Initials
  const leadName = (formData.name !== undefined ? formData.name : `${formData.first_name || ''} ${formData.last_name || ''}`).trim() || 'Unnamed';
  const initials = useMemo(() => {
    const parts = leadName.split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [leadName]);

  // Subtitle: Role at Company · City
  const roleText = formData.role || formData.title || formData.niche || '';
  const companyText = formData.company || '';
  const cityText = formData.city || formData.location || (formData.timezone ? formData.timezone.split('/').pop().replace(/_/g, ' ') : '');
  
  const headerSubtitle = useMemo(() => {
    const parts = [];
    if (roleText && companyText) parts.push(`${roleText} at ${companyText}`);
    else if (roleText) parts.push(roleText);
    else if (companyText) parts.push(companyText);
    else parts.push('No company');

    if (cityText) parts.push(cityText);
    return parts.join(' · ');
  }, [roleText, companyText, cityText]);

  // Helper to persist field changes
  const saveLeadField = async (fieldKey, value, extraUpdates = {}) => {
    if (!lead?.id) return;
    try {
      const updates = { [fieldKey]: value, ...extraUpdates };
      setFormData((prev) => ({ ...prev, ...updates }));

      const targetTable = isClientView ? 'clients' : 'leads';
      const { error } = await supabase
        .from(targetTable)
        .update(updates)
        .eq('id', lead.id);

      if (error) throw error;
      if (onUpdateLead) onUpdateLead({ ...lead, ...formData, ...updates });
    } catch (err) {
      console.error(`Failed to update ${fieldKey}:`, err);
      showToast?.(`Failed to update ${fieldKey}`);
    }
  };

  // Handle Name update
  const handleNameBlur = () => {
    const currentName = (formData.name || '').trim();
    const parts = currentName.split(' ');
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || null;

    if (first_name !== lead.first_name || last_name !== lead.last_name) {
      saveLeadField('first_name', first_name, { last_name });
      logActivity('Field Updated', { field: 'name', to: currentName });
    }
  };

  // Handle Status change
  const handleStatusChange = async (newStatus) => {
    try {
      const updated = await updateLeadStatusAndCheckpoint({
        lead: { ...lead, ...formData },
        newStatus,
        suggestionRules,
        currentUser,
      });
      setFormData((prev) => ({ ...prev, ...updated }));
      if (onUpdateLead) onUpdateLead(updated);
      if (newStatus === 'Closed Won' && lead?.status !== 'Closed Won') {
        celebrateClosedWon();
      }
      if (onRefresh) onRefresh();
      logActivity('Status Updated', { from: lead?.status || 'Lead', to: newStatus });
    } catch (err) {
      console.error('Error updating status:', err);
      showToast?.('Failed to update status');
    }
  };

  // Handle Links update
  const handleLinksChange = async (newLinks) => {
    const legacyColumns = syncLegacyLinkColumns(newLinks);
    const updates = {
      links: newLinks,
      ...legacyColumns,
    };
    setFormData((prev) => ({ ...prev, ...updates }));
    try {
      const targetTable = isClientView ? 'clients' : 'leads';
      const { error } = await supabase
        .from(targetTable)
        .update(updates)
        .eq('id', lead.id);
      if (error) throw error;
      if (onUpdateLead) onUpdateLead({ ...lead, ...formData, ...updates });
    } catch (err) {
      console.error('Failed to update links:', err);
      showToast?.('Failed to save link');
    }
  };

  // Follow-up display formatted in lead's local time
  const followupDisplay = useMemo(() => {
    const cp = formData.next_checkpoint_at ?? lead?.next_checkpoint_at;
    if (!cp) return null;
    try {
      const d = new Date(cp);
      if (isNaN(d.getTime())) return null;
      const userFormatted = d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const tz = getLeadTimezone(formData, { listCountry, userCountry });
      if (tz) {
        const leadTime = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(d);
        const city = tz.split('/').pop().replace(/_/g, ' ');
        return `${userFormatted} (${leadTime} in ${city})`;
      }
      return userFormatted;
    } catch {
      return null;
    }
  }, [formData.next_checkpoint_at, formData.timezone, listCountry, userCountry]);

  // ── Multi-note queries ──
  async function fetchNotes() {
    if (!lead?.id) return;
    setNotesLoading(true);
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const notes = data || [];
      setLeadNotes(notes);
      if (notes.length > 0) {
        setSelectedNoteId((prev) => (prev && notes.find((n) => n.id === prev) ? prev : notes[0].id));
        setSelectedNoteContent(notes[0].content || '');
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setNotesLoading(false);
    }
  }

  const createNote = async () => {
    if (!lead?.id) return;
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .insert({
          user_id: currentUser.id,
          lead_id: lead.id,
          title: `Note ${leadNotes.length + 1}`,
          content: '',
        })
        .select()
        .single();

      if (error) throw error;
      setLeadNotes((prev) => [...prev, data]);
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
      const remaining = leadNotes.filter((n) => n.id !== noteId);
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
    if (!trimmed) {
      setEditingTitleId(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .update({ title: trimmed })
        .eq('id', editingTitleId)
        .select()
        .single();
      if (error) throw error;
      setLeadNotes((prev) => prev.map((n) => (n.id === data.id ? data : n)));
    } catch (err) {
      console.error('Error updating note title:', err);
    } finally {
      setEditingTitleId(null);
    }
  };

  // ── Invoices ──
  const fetchInvoices = async () => {
    if (!lead?.id) return;
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (!error && data) setInvoices(data);
    } catch (e) {
      console.error('Error fetching invoices:', e);
    }
  };

  // ── Activities & Timeline ──
  async function fetchActivities() {
    if (!lead?.id) return;
    setActivitiesLoading(true);
    try {
      const targetLeadId = isClientView ? lead.lead_id : lead.id;
      if (!targetLeadId) return;
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
  }

  async function fetchCallAttempts() {
    if (!lead?.id) return;
    setCallAttemptsLoading(true);
    try {
      const targetLeadId = isClientView ? lead.lead_id : lead.id;
      if (!targetLeadId) return;
      const data = await fetchLeadCallTimeline(targetLeadId);
      setCallAttempts(data || []);
    } catch (err) {
      console.error('Error fetching call timeline:', err);
    } finally {
      setCallAttemptsLoading(false);
    }
  }

  async function fetchTimeline() {
    if (!lead?.id) return;
    setTimelineLoading(true);
    try {
      const targetLeadId = isClientView ? lead.lead_id : lead.id;
      if (!targetLeadId) return;
      const data = await fetchLeadTimeline(targetLeadId);
      setTimeline(data || []);
    } catch (err) {
      console.error('Error fetching timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  }

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
          action_detail: detail || {},
        })
        .select()
        .single();

      if (error) throw error;
      setActivities((prev) => [data, ...prev]);

      const eventType = type === 'Note Added' || type === 'Note Updated'
        ? 'note_added'
        : type === 'Status Updated'
          ? 'status_changed'
          : 'field_changed';
      const summary = type === 'Status Updated' && detail?.to ? `Status → ${detail.to}` : type;

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

  // Quick activity submit from top composer in Activity tab
  const handleComposerSubmit = async (e) => {
    e?.preventDefault();
    const text = composerText.trim();
    if (!text || composerSubmitting) return;

    setComposerSubmitting(true);
    try {
      await logActivity('Note Added', { note: text });
      setComposerText('');
      showToast?.('Activity logged');
    } catch (err) {
      console.error('Failed to log activity:', err);
    } finally {
      setComposerSubmitting(false);
    }
  };

  // Convert to client submit
  const handleConvertSubmit = async (e) => {
    e?.preventDefault();
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
          phone: convertForm.phone || null,
        },
      });

      setFormData((prev) => ({
        ...prev,
        status: 'Client',
        lifecycle_stage: 'client',
        project_status: convertForm.project_status,
        start_date: convertForm.start_date,
        contract_value: convertForm.contract_value,
        invoice_link: convertForm.invoice_link,
        company: convertForm.company,
        phone: convertForm.phone,
      }));

      if (onUpdateLead) onUpdateLead(data);
      setShowConvertModal(false);
      showToast?.('Successfully converted to client');
    } catch (err) {
      console.error('Error converting lead to client:', err);
      showToast?.('Failed to convert: ' + err.message);
    }
  };

  // Open "⋯" menu
  const handleOpenMoreMenu = () => {
    if (!moreTriggerRef.current) return;
    setMoreMenuPos(
      computePortalMenuPosition(moreTriggerRef.current, {
        menuWidth: 190,
        menuHeight: 180,
      })
    );
    setMoreMenuOpen(true);
  };

  // Open "Move to list" menu
  const handleOpenListMenu = () => {
    if (!listTriggerRef.current) return;
    setListMenuPos(
      computePortalMenuPosition(listTriggerRef.current, {
        menuWidth: 200,
        menuHeight: 220,
      })
    );
    setListMenuOpen(true);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="lead-drawer__backdrop" onClick={onClose} aria-hidden="true" />

      {/* Slide-out Panel (480px) */}
      <div className="lead-drawer__panel">
        
        {/* Top bar: prev/next + "3 of 128 in List" + ⋯ menu + close */}
        <div className="lead-drawer__topbar">
          <div className="lead-drawer__topbar-nav">
            <button
              type="button"
              className="lead-drawer__icon-btn"
              disabled={!hasPrev}
              onClick={handlePrevLead}
              title="Previous lead"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="lead-drawer__icon-btn"
              disabled={!hasNext}
              onClick={handleNextLead}
              title="Next lead"
            >
              <ChevronRight size={16} />
            </button>

            <span className="lead-drawer__topbar-count">
              {currentLeadIndex >= 0
                ? `${currentLeadIndex + 1} of ${totalLeadsCount} in ${currentViewName || listName || 'All leads'}`
                : (currentViewName || listName ? `In ${currentViewName || listName}` : 'All leads')}
            </span>
          </div>

          <div className="lead-drawer__topbar-actions">
            <button
              ref={moreTriggerRef}
              type="button"
              className="lead-drawer__icon-btn"
              onClick={handleOpenMoreMenu}
              title="More options"
            >
              <MoreHorizontal size={16} />
            </button>
            <button
              type="button"
              className="lead-drawer__icon-btn"
              onClick={onClose}
              title="Close drawer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Header: Avatar, Name, Role at Company · City, Action Buttons */}
        <div className="lead-drawer__header">
          <div className="lead-drawer__profile-row">
            <div className="lead-drawer__avatar">
              {initials}
            </div>

            <div className="lead-drawer__profile-info">
              <input
                type="text"
                value={formData.name !== undefined ? formData.name : leadName}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onBlur={handleNameBlur}
                className="lead-drawer__title"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  width: '100%',
                  outline: 'none',
                }}
              />
              <span className="lead-drawer__subtitle">
                {headerSubtitle}
              </span>
            </div>
          </div>

          <div className="lead-drawer__actions-row">
            <button
              type="button"
              className="lead-drawer__action-btn lead-drawer__action-btn--primary"
              onClick={() => setLogCallOpen(true)}
            >
              <Phone size={13} /> Log call
            </button>

            <button
              type="button"
              className="lead-drawer__action-btn lead-drawer__action-btn--secondary"
              onClick={() => setShowFollowupPicker(true)}
            >
              <Calendar size={13} /> Follow-up
            </button>

            <button
              type="button"
              className="lead-drawer__action-btn lead-drawer__action-btn--secondary"
              onClick={() => setLogMessageOpen(true)}
            >
              <Mail size={13} /> Draft message
            </button>
          </div>
        </div>

        {/* Scrollable Content: PIPELINE, CONTACT & Lower Tabs */}
        <div className="lead-drawer__content">
          
          {/* 1. PIPELINE Section (Always Visible) */}
          <div className="lead-drawer__section">
            <div className="lead-drawer__section-title">Pipeline</div>

            {/* Status */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Status</div>
              <div className="lead-drawer__row-value">
                <GroupedStatusDropdown
                  compact={true}
                  value={formData.status || 'Lead'}
                  onChange={handleStatusChange}
                  statuses={statuses}
                />
              </div>
            </div>

            {/* Priority */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Priority</div>
              <div className="lead-drawer__row-value">
                <PriorityDropdown
                  value={formData.priority || 'Cold'}
                  onChange={(val) => {
                    saveLeadField('priority', val);
                    logActivity('Field Updated', { field: 'priority', to: val });
                  }}
                  onUpdate={onRefresh}
                />
              </div>
            </div>

            {/* Next step */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Next step</div>
              <div className="lead-drawer__row-value">
                <input
                  type="text"
                  placeholder="e.g. Send demo video"
                  value={formData.action_to_take || formData.call_action || ''}
                  onChange={(e) => setFormData({ ...formData, action_to_take: e.target.value })}
                  onBlur={() => {
                    saveLeadField('action_to_take', formData.action_to_take || null);
                    logActivity('Field Updated', { field: 'action_to_take', to: formData.action_to_take });
                  }}
                  className="lead-drawer__inline-input"
                />
              </div>
            </div>

            {/* Follow-up */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Follow-up</div>
              <div className="lead-drawer__row-value">
                <DateTimePickerCell
                  mode="future"
                  value={formData.next_checkpoint_at || null}
                  timeZone={getEffectiveUserTimeZone(currentUser)}
                  onChange={(iso) => {
                    saveLeadField('next_checkpoint_at', iso || null, { next_checkpoint_manual: true, checkpoint_notified_at: null });
                    logActivity('Field Updated', { field: 'next_checkpoint_at', to: iso });
                  }}
                />
                {followupDisplay && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {followupDisplay}
                  </span>
                )}
              </div>
            </div>

            {/* Channel */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Channel</div>
              <div className="lead-drawer__row-value">
                <GroupedChannelDropdown
                  compact={true}
                  value={formData.outreach_channel || 'Email'}
                  onChange={(val) => {
                    saveLeadField('outreach_channel', val);
                    logActivity('Field Updated', { field: 'outreach_channel', to: val });
                  }}
                  channel="messaging"
                />
              </div>
            </div>
          </div>

          {/* 2. CONTACT Section (Always Visible) */}
          <div className="lead-drawer__section">
            <div className="lead-drawer__section-title">Contact</div>

            {/* Email */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Email</div>
              <div className="lead-drawer__row-value">
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  onBlur={() => {
                    saveLeadField('email', formData.email?.trim() || null);
                    logActivity('Field Updated', { field: 'email', to: formData.email });
                  }}
                  className="lead-drawer__inline-input"
                  style={{ maxWidth: '240px' }}
                />
                {formData.email && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(formData.email);
                      showToast?.('Email copied to clipboard');
                    }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)' }}
                    title="Copy email"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Phone (ONCE - no duplicate) */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Phone</div>
              <div className="lead-drawer__row-value">
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  onBlur={() => {
                    const cleanPhone = formData.phone?.trim() || null;
                    let patch = { phone: cleanPhone };
                    if (cleanPhone && formData.timezone_source !== 'manual') {
                      const inferred = inferTimezoneFromPhone(cleanPhone, { listCountry, userCountry });
                      if (inferred?.timezone) {
                        patch.timezone = inferred.timezone;
                        patch.timezone_source = 'phone';
                      }
                    }
                    saveLeadField('phone', cleanPhone, patch);
                    logActivity('Field Updated', { field: 'phone', to: cleanPhone });
                  }}
                  className="lead-drawer__inline-input"
                  style={{ maxWidth: '180px' }}
                />
                {formData.phone && (
                  <PhonePopup phone={formData.phone} />
                )}
              </div>
            </div>

            {/* Local time */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Local time</div>
              <div className="lead-drawer__row-value">
                <LocalTimeCell
                  lead={formData}
                  listCountry={listCountry}
                  userCountry={userCountry}
                  onSaveTimezone={async (tz) => {
                    const patch = { timezone: tz, timezone_source: 'manual' };
                    setFormData((prev) => ({ ...prev, ...patch }));
                    await saveLeadField('timezone', tz, { timezone_source: 'manual' });
                    logActivity('Timezone Updated', { timezone: tz });
                  }}
                />
                {formData.timezone_source === 'manual' && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    (set by hand)
                  </span>
                )}
              </div>
            </div>

            {/* Company */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">Company</div>
              <div className="lead-drawer__row-value">
                <input
                  type="text"
                  placeholder="Company name"
                  value={formData.company || ''}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  onBlur={() => {
                    saveLeadField('company', formData.company?.trim() || null);
                    logActivity('Field Updated', { field: 'company', to: formData.company });
                  }}
                  className="lead-drawer__inline-input"
                />
              </div>
            </div>

            {/* List */}
            <div className="lead-drawer__row">
              <div className="lead-drawer__row-label">List</div>
              <div className="lead-drawer__row-value">
                <button
                  ref={listTriggerRef}
                  type="button"
                  onClick={handleOpenListMenu}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    color: 'var(--primary-color, #4361EE)',
                    cursor: 'pointer',
                  }}
                >
                  <Folder size={13} />
                  <span>{listName}</span>
                </button>
              </div>
            </div>

            {/* Links row */}
            <div className="lead-drawer__row" style={{ alignItems: 'flex-start', paddingTop: '4px' }}>
              <div className="lead-drawer__row-label" style={{ paddingTop: '3px' }}>Links</div>
              <div className="lead-drawer__row-value" style={{ flexWrap: 'wrap' }}>
                <LeadLinkChips
                  links={formData.links || []}
                  onChange={handleLinksChange}
                />
              </div>
            </div>

          </div>

          {/* 3. Lower Tabs: Activity · Notes · Calls · Invoices */}
          <div className="lead-drawer__tabs">
            <button
              type="button"
              className={`lead-drawer__tab ${activeTab === 'activity' ? 'lead-drawer__tab--active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              <ActivityIcon size={13} /> Activity
            </button>
            <button
              type="button"
              className={`lead-drawer__tab ${activeTab === 'notes' ? 'lead-drawer__tab--active' : ''}`}
              onClick={() => setActiveTab('notes')}
            >
              <FileText size={13} /> Notes ({leadNotes.length})
            </button>
            <button
              type="button"
              className={`lead-drawer__tab ${activeTab === 'calls' ? 'lead-drawer__tab--active' : ''}`}
              onClick={() => setActiveTab('calls')}
            >
              <Phone size={13} /> Calls ({callAttempts.length})
            </button>
            <button
              type="button"
              className={`lead-drawer__tab ${activeTab === 'invoices' ? 'lead-drawer__tab--active' : ''}`}
              onClick={() => setActiveTab('invoices')}
            >
              <Receipt size={13} /> Invoices ({invoices.length})
            </button>
          </div>

          {/* Tab Panes */}
          <div className="lead-drawer__tab-pane">

            {/* TAB: Activity (Default with composer on top + unified timeline) */}
            {activeTab === 'activity' && (
              <>
                {/* Note/Activity Composer on top */}
                <form onSubmit={handleComposerSubmit} className="lead-drawer__composer">
                  <textarea
                    placeholder="Write an update, note, or log an interaction..."
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    className="lead-drawer__composer-input"
                  />
                  <div className="lead-drawer__composer-footer">
                    <button
                      type="submit"
                      disabled={!composerText.trim() || composerSubmitting}
                      className="btn btn-primary btn-sm"
                      style={{ height: '26px', padding: '0 10px', fontSize: '12px' }}
                    >
                      {composerSubmitting ? 'Logging...' : 'Log activity'}
                    </button>
                  </div>
                </form>

                {/* Unified timeline */}
                {timelineLoading || callAttemptsLoading || activitiesLoading ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '13px' }}>
                    Loading activity...
                  </div>
                ) : timeline.length === 0 && callAttempts.length === 0 && activities.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                    No activity yet. Log a note or interaction above.
                  </div>
                ) : timeline.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
              </>
            )}

            {/* TAB: Notes */}
            {activeTab === 'notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Lead Notes ({leadNotes.length})
                  </span>
                  <button
                    type="button"
                    onClick={createNote}
                    className="btn btn-primary btn-sm"
                    style={{ height: '26px', padding: '0 8px', fontSize: '12px' }}
                  >
                    <Plus size={12} /> New Note
                  </button>
                </div>

                {leadNotes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                    No notes yet. Click <strong>+ New Note</strong> to start.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {leadNotes.map((n) => (
                      <div
                        key={n.id}
                        className={`lead-note-card ${selectedNoteId === n.id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedNoteId(n.id);
                          setSelectedNoteContent(n.content || '');
                        }}
                      >
                        <FileText size={13} className="lead-drawer__note-icon" />

                        {editingTitleId === n.id ? (
                          <input
                            ref={titleInputRef}
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onBlur={commitTitleEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitTitleEdit();
                              if (e.key === 'Escape') setEditingTitleId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="lead-drawer__note-title-input"
                          />
                        ) : (
                          <span className="lead-drawer__note-title">
                            {n.title || 'Untitled'}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTitleId(n.id);
                            setEditingTitleValue(n.title || '');
                          }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                          title="Rename"
                        >
                          <Pencil size={11} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteLeadNote(n.id);
                          }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', padding: '2px' }}
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Note Editor */}
                {selectedNoteId && leadNotes.some((n) => n.id === selectedNoteId) && (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Editing note
                      </span>
                      {noteSaveStatus === 'saving' && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Saving...</span>
                      )}
                      {noteSaveStatus === 'saved' && (
                        <span style={{ fontSize: '11px', color: 'var(--success-color)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Check size={11} /> Saved
                        </span>
                      )}
                    </div>

                    <div style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                      <RichTextEditor
                        key={selectedNoteId}
                        content={selectedNoteContent}
                        onChange={(json) => {
                          setSelectedNoteContent(json);
                          setLeadNotes((prev) => prev.map((n) => (n.id === selectedNoteId ? { ...n, content: json } : n)));
                          setNoteSaveStatus('saving');
                          if (noteSaveTimeoutRef.current) clearTimeout(noteSaveTimeoutRef.current);
                          noteSaveTimeoutRef.current = setTimeout(() => {
                            setNoteSaveStatus('saved');
                          }, 1000);
                        }}
                        placeholder="Write note contents..."
                        readOnly={false}
                        noteId={selectedNoteId}
                        noteType="lead"
                        userId={currentUser?.id}
                        currentTitle={leadNotes.find((n) => n.id === selectedNoteId)?.title}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Calls */}
            {activeTab === 'calls' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Call Attempts ({callAttempts.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setLogCallOpen(true)}
                    className="btn btn-primary btn-sm"
                    style={{ height: '26px', padding: '0 8px', fontSize: '12px' }}
                  >
                    <Phone size={12} /> Log Call
                  </button>
                </div>

                {callAttempts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                    No call attempts logged for this lead yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {callAttempts.map((call) => (
                      <div
                        key={call.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-primary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {call.outcome || 'Call logged'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {call.occurred_at ? new Date(call.occurred_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                        {call.note && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {call.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Invoices */}
            {activeTab === 'invoices' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Linked Invoices ({invoices.length})
                </span>

                {invoices.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                    No invoices linked to this lead yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {invoices.map((inv) => (
                      <div
                        key={inv.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-primary)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {inv.invoice_number}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {new Date(inv.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {inv.total?.toLocaleString() || 0} {inv.currency || 'USD'}
                          </span>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 500,
                              backgroundColor: inv.status?.toLowerCase() === 'draft' ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.15)',
                              color: inv.status?.toLowerCase() === 'draft' ? 'var(--text-muted)' : '#10b981',
                            }}
                          >
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* More Options Menu Portal */}
      {moreMenuOpen && moreMenuPos && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1200 }}
            onClick={() => setMoreMenuOpen(false)}
          />
          <div
            style={{
              ...portalMenuStyle(moreMenuPos, { minWidth: '180px' }),
              zIndex: 1201,
            }}
          >
            {!isClientView && !isClientStatus(formData.status) && (
              <button
                type="button"
                className="rd-menu-item"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setConvertForm({
                    company: formData.company || '',
                    phone: formData.phone || '',
                    project_status: 'Onboarding',
                    start_date: new Date().toISOString().split('T')[0],
                    contract_value: '',
                    invoice_link: '',
                  });
                  setShowConvertModal(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '7px 10px',
                  fontSize: '12px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                <UserCheck size={13} style={{ color: 'var(--primary-color)' }} />
                <span>Convert to Client</span>
              </button>
            )}

            <button
              type="button"
              className="rd-menu-item"
              onClick={() => {
                setMoreMenuOpen(false);
                handleOpenListMenu();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <Folder size={13} style={{ color: 'var(--primary-color)' }} />
              <span>Move to list...</span>
            </button>

            <button
              type="button"
              className="rd-menu-item"
              onClick={() => {
                setMoreMenuOpen(false);
                navigator.clipboard.writeText(`${leadName}\n${formData.email || ''}\n${formData.phone || ''}`);
                showToast?.('Lead info copied');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <Copy size={13} style={{ color: 'var(--text-muted)' }} />
              <span>Copy contact info</span>
            </button>

            <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

            <button
              type="button"
              className="rd-menu-item"
              onClick={() => {
                setMoreMenuOpen(false);
                if (onDeleteLead && confirm(`Delete ${leadName}?`)) {
                  onDeleteLead(lead.id);
                  onClose();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--danger-color, #EF4444)',
              }}
            >
              <Trash2 size={13} />
              <span>Delete lead</span>
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Move to List Menu Portal */}
      {listMenuOpen && listMenuPos && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1200 }}
            onClick={() => setListMenuOpen(false)}
          />
          <div
            style={{
              ...portalMenuStyle(listMenuPos, { minWidth: '190px', maxHeight: '220px' }),
              zIndex: 1201,
            }}
          >
            <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Move to list
            </div>
            {(userFolders?.length ? userFolders : folders).map((f) => {
              const isSel = f.id === (formData.folder_id || lead?.folder_id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="rd-menu-item"
                  onClick={async () => {
                    setListMenuOpen(false);
                    await saveLeadField('folder_id', f.id);
                    showToast?.(`Moved to ${f.name}`);
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
                    <Folder size={12} style={{ color: 'var(--primary-color)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                      {f.name}
                    </span>
                  </span>
                  {isSel && <Check size={12} style={{ color: 'var(--primary-color)' }} />}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}

      {/* Convert to Client Modal */}
      {showConvertModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '90%' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                Convert to Client
              </h2>
              <button onClick={() => setShowConvertModal(false)} className="theme-toggle">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConvertSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={convertForm.company}
                  onChange={(e) => setConvertForm({ ...convertForm, company: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  type="text"
                  className="form-input"
                  value={convertForm.phone}
                  onChange={(e) => setConvertForm({ ...convertForm, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Project Status</label>
                <select
                  className="form-select"
                  value={convertForm.project_status}
                  onChange={(e) => setConvertForm({ ...convertForm, project_status: e.target.value })}
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
                  onChange={(e) => setConvertForm({ ...convertForm, start_date: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contract Value</label>
                <input
                  type="number"
                  className="form-input"
                  value={convertForm.contract_value}
                  onChange={(e) => setConvertForm({ ...convertForm, contract_value: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 mt-4" style={{ paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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

      {/* Log Call Modal */}
      <LogCallModal
        open={logCallOpen}
        onClose={() => setLogCallOpen(false)}
        fixedLead={lead}
        userId={currentUser?.id}
        teamId={currentUser?.team_id || null}
        profile={currentUser}
        showNoteSharing={!!currentUser?.team_id}
        onLogged={async ({ leadUpdates } = {}) => {
          if (leadUpdates && onUpdateLead) onUpdateLead(leadUpdates);
          await Promise.all([fetchCallAttempts(), fetchTimeline()]);
        }}
        timeZone={getEffectiveUserTimeZone(currentUser)}
      />

      {/* Log Message Modal */}
      <LogMessageModal
        open={logMessageOpen}
        onClose={() => setLogMessageOpen(false)}
        lead={lead}
        userId={currentUser?.id}
        teamId={currentUser?.team_id || null}
        timeZone={getEffectiveUserTimeZone(currentUser)}
        onLogged={async ({ leadUpdates } = {}) => {
          if (leadUpdates && onUpdateLead) onUpdateLead(leadUpdates);
          await fetchTimeline();
        }}
      />
    </>
  );
}
