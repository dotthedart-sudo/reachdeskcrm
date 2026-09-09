import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../App';
import { getTeamIds, PLAN_LIMITS, getEffectivePlan, getEffectiveBillingCycle, getEffectiveUserTimeZone } from '../lib/utils';
import { LeadLimitModal, LeadLimitToast, getRemainingLeadQuota, shouldShowCountdownToast, prepareBulkImport, BulkImportLimitModal, getPlanLeadLimit } from '../lib/leadLimits';
import { PLAN_LIMITS as PLAN_FEATURE_FLAGS, normalizePlan } from '../lib/planConfig';
import {
  Search, Plus, Download, Upload, Trash2, Edit3, X,
  Filter, CheckSquare, Square, Folder, FolderPlus, LayoutGrid, ChevronRight,
  MoreVertical, Check, ThumbsUp, ThumbsDown, SkipForward, AlertCircle, ChevronDown, FileText,
  Settings as Gear, MessageCircle, Zap, ExternalLink, Lock, Lightbulb, Copy, Sparkles, Mail,
  Database, Info, Users, Phone, Gem
} from 'lucide-react';

import EditableDropdown, { DEFAULT_ACTION_OPTIONS } from './CRM/EditableDropdown';
import ColumnManager from './CRM/ColumnManager';
import LeadDrawer from './CRM/LeadDrawer';
import OutreachTracker from './CRM/OutreachTracker';
import CallQueueTable from './CRM/callActivity/CallQueueTable';
import CSVImporter from './CRM/CSVImporter';
import CSVImportModal from './CRM/CSVImportModal';
import ExportSheetsModal from './CRM/ExportSheetsModal';
import SheetsImportModal from './CRM/SheetsImportModal';
import FolderBrowser from './CRM/FolderBrowser';
import CallWindowBadge from './CRM/CallWindowBadge';
import ListSwitcher from './CRM/ListSwitcher';
import CopyableCell from './CRM/CopyableCell';
import ResizableTh from './CRM/ResizableTh';
import ResizableTr from './CRM/ResizableTr';
import { getTableColumns, getLeadCellCopyValue, CALL_QUEUE_DEFAULT_DEFS, CALL_ACTION_DEFAULT_OPTIONS } from './CRM/crmTableColumns';
import { useCrmTableLayout } from './CRM/useCrmTableLayout';
import './CRM/DataTableEnhancements.css';
import ConvertModal from './CRM/ConvertModal';
import LeadFormFields from './CRM/LeadFormFields';
import GroupedStatusDropdown, { DEFAULT_CALL_STATUSES } from './CRM/GroupedStatusDropdown';
import GroupedChannelDropdown from './CRM/GroupedChannelDropdown';
import { getChannelDefaults } from '../lib/customChannels';
import GroupedTemplateDropdown from './CRM/GroupedTemplateDropdown';
import CheckpointPopover from './CRM/CheckpointPopover';
import HelpPopover from './HelpPopover';
import { ReachIcons, PhonePopup, detectDomainIcon, detectPlatformLabel } from './icons/PlatformIcons';
import { updateLeadStatusAndCheckpoint, getSuggestionForStatus, REPLY_CHECK_STATUSES, FOLLOW_UP_CHECK_STATUSES, isClientStatus } from '../lib/reminders';
import PriorityDropdown from './CRM/PriorityDropdown';
import { exportLeads, exportNotes } from '../utils/exportUtils';
import { resolveLeadTimezoneForSave } from '../lib/leadTimezone';
import { teamMemberEmail } from '../lib/teamWorkspace';
import { logLeadTimelineEvent } from '../lib/leadTimeline';
import { displayCallStatus } from '../lib/callOutcomeRules';
import { logCallStatusChange } from '../lib/callActivity';
import { getListFolderSettings, setListFolderSettings, listFolderShowsLocalTime } from '../lib/listFolderSettings';
import { isTeamOwner } from '../lib/teamWorkspace';
import {
  fetchSharesForUser,
  fetchSharesForFolder,
  fetchSharesForFolders,
  shareCountForFolder as countSharesForFolder,
  canShareFolder as userCanShareFolder,
} from '../lib/folderShares';
import { softBadgeStyle } from '../lib/softBadgeStyle';
import {
  startGoogleSheetsOAuth,
  markSheetsScopeAck,
  needsSheetsReconnect,
} from '../lib/googleSheetsOAuth';

const ACTION_TO_TAKE_SEED = DEFAULT_ACTION_OPTIONS;
import ShareListModal from './CRM/ShareListModal';
import { mergeTemplateFields, normalizePhoneNumber, generatePrefilledUrl } from '../utils/templateMerge';
import { celebrateClosedWon } from '../utils/celebrateWin';
import { generateAIDraft } from '../utils/aiDraft';
import { fetchAllLeadsForScope } from '../lib/leadsQuery';
import RdSelect from './ui/RdSelect';
import { useFirstVisitReveal } from '../hooks/useFirstVisitReveal';

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f59e0b', // Amber/Yellow
  '#10b981', // Emerald/Green
  '#3b82f6', // Blue
  '#8b5cf6', // Violet/Purple
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#6b7280'  // Slate/Gray
];

const DEFAULT_STATUSES = [
  { label: 'Lead', color: '#3b82f6' },
  { label: 'Contacted', color: '#f59e0b' },
  { label: 'Positive Reply', color: '#8b5cf6' },
  { label: 'Proposal Sent', color: '#06b6d4' },
  { label: 'Invite Sent', color: '#6B9FD4' },
  { label: 'Followed up', color: '#10b981' },
  { label: 'Booked', color: '#ec4899' },
  { label: 'No show', color: '#ef4444' },
  { label: 'Rescheduled', color: '#a855f7' },
  { label: 'Not Interested', color: '#6b7280' },
  { label: 'Closed Won', color: '#22c55e' }
];

const SORT_OPTIONS = [
  { value: 'newest',    label: 'Recently Added' },
  { value: 'contacted', label: 'Recently Contacted' },
  { value: 'hot',       label: 'Hot First' },
  { value: 'name',      label: 'Name A → Z' },
  { value: 'status',    label: 'By Status' },
];

const CALL_SORT_OPTIONS = [
  { value: 'call_now', label: 'Call now first' },
  { value: 'newest', label: 'Recently added' },
  { value: 'name', label: 'Name A → Z' },
  { value: 'status', label: 'By status' },
];

const EMPTY_QUICK_ADD_FORM = {
  name: '',
  profileUrl: '',
  phone: '',
  platform: 'LinkedIn',
  priority: 'Warm',
  notes: '',
};

function splitLeadName(name) {
  const parts = (name || '').trim().split(/\s+/);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || null,
  };
}

function normalizeQuickAddProfileUrl(raw, platform) {
  const val = (raw || '').trim();
  if (!val) return null;

  if (val.startsWith('http://') || val.startsWith('https://')) {
    return val;
  }

  if (val.includes('.') || val.includes('/')) {
    return `https://${val}`;
  }

  const handle = val.replace(/^@/, '');
  if (platform === 'LinkedIn') return `https://linkedin.com/in/${handle}`;
  if (platform === 'Twitter') return `https://twitter.com/${handle}`;

  return `https://${val}`;
}

function mapProfileUrlToLeadFields(url, platformLabel) {
  const urlUpdates = { linkedin_url: null, instagram_url: null, twitter_url: null, website: null };
  if (!url) return { urlUpdates, links: [] };

  const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
  const detected = detectPlatformLabel(cleanUrl);
  const links = [{ url: cleanUrl, label: detected !== 'Website' ? detected : platformLabel }];

  if (cleanUrl.includes('linkedin.com')) urlUpdates.linkedin_url = cleanUrl;
  else if (cleanUrl.includes('instagram.com')) urlUpdates.instagram_url = cleanUrl;
  else if (cleanUrl.includes('twitter.com') || cleanUrl.includes('x.com')) urlUpdates.twitter_url = cleanUrl;
  else urlUpdates.website = cleanUrl;

  return { urlUpdates, links };
}

export default function CRM({
  currentUser, 
  teamProfilesMap = {}, 
  teamIds = [],
  isTeamView = false, 
  onRefreshReminders 
}) {
  const navigate = useNavigate();
  const { showToast, userSnippets } = useAppContext() || {};
  const { rootClass, blockClass } = useFirstVisitReveal();
  const [leads, setLeads] = useState([]);

  // Reach Link Click System states
  const [reachModalOpen, setReachModalOpen] = useState(false);
  const [reachLead, setReachLead] = useState(null);
  const [reachChannel, setReachChannel] = useState('');
  const [reachUrl, setReachUrl] = useState('');
  const [selectedReachTemplateId, setSelectedReachTemplateId] = useState('');
  const [reachTemplateBody, setReachTemplateBody] = useState('');
  const [reachTemplateSubject, setReachTemplateSubject] = useState('');
  const [reachWarning, setReachWarning] = useState('');
  const [reachDestination, setReachDestination] = useState('mailto');
  const [reachAiLoading, setReachAiLoading] = useState(false);
  const [reachAiError, setReachAiError] = useState('');
  const [reachAiInstructions, setReachAiInstructions] = useState('');
  const [folders, setFolders] = useState(() => {
    try {
      const saved = localStorage.getItem('crm_folders');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [userFolders, setUserFolders] = useState([]);
  const [folderShares, setFolderShares] = useState([]);
  const [teamMembersList, setTeamMembersList] = useState([]);

  const effectiveProfilesMap = useMemo(() => {
    const map = { ...(teamProfilesMap || {}) };
    teamMembersList.forEach((m) => {
      map[m.id] = { id: m.id, email: m.email, full_name: m.full_name };
    });
    return map;
  }, [teamProfilesMap, teamMembersList]);
  const [shareListTarget, setShareListTarget] = useState(null);
  const [shareListShares, setShareListShares] = useState([]);
  const [clients, setClients] = useState([]);
  const [statuses, setStatuses] = useState(() => {
    const defaults = DEFAULT_STATUSES;
    try {
      const saved = localStorage.getItem('crm_custom_statuses');
      return saved ? JSON.parse(saved) : defaults;
    } catch (e) {
      return defaults;
    }
  });
  const [callStatuses, setCallStatuses] = useState(DEFAULT_CALL_STATUSES);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Smart Folder modal and filters state
  const [showSmartFolderModal, setShowSmartFolderModal] = useState(false);
  const [smartFolderForm, setSmartFolderForm] = useState({ name: '', rules: [{ field: 'Status', operator: 'is', value: '' }] });
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortOption, setSortOption] = useState('newest');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [showLeadLimitBlockModal, setShowLeadLimitBlockModal] = useState(false);
  const [toastRemaining, setToastRemaining] = useState(null);
  const [importResult, setImportResult] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Folder names local state
  const [systemFolderNames, setSystemFolderNames] = useState(() => {
    try {
      const saved = localStorage.getItem('crm_system_folder_names');
      return saved ? JSON.parse(saved) : {
        all: 'All Leads',
        hot: 'Hot',
        warm: 'Warm',
        cold: 'Cold',
        calendly: 'Invite Sent',
        clients: 'Clients'
      };
    } catch {
      return {
        all: 'All Leads',
        hot: 'Hot',
        warm: 'Warm',
        cold: 'Cold',
        calendly: 'Invite Sent',
        clients: 'Clients'
      };
    }
  });

  // View, mode, and Folder states persisted in URL
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyOutreachView = searchParams.get('view') === 'outreach';
  const modeParam = searchParams.get('mode');
  const outreachMode = modeParam === 'calls' || legacyOutreachView
    ? 'calls'
    : (modeParam || (() => {
        try { return localStorage.getItem('crm_outreach_mode') || 'messages'; } catch { return 'messages'; }
      })());
  const callSubView = searchParams.get('callView') || 'queue';
  const view = legacyOutreachView && !modeParam
    ? 'contact_details'
    : (searchParams.get('view') || 'contact_details');
  const folderParam = searchParams.get('folder');
  const searchParam = searchParams.get('search');

  useEffect(() => {
    if (searchParam) setSearchQuery(searchParam);
  }, [searchParam]);
  const isBrowseMode = !folderParam;
  const activeFolderId = folderParam;
  const activeManualFolderId = folders.find((f) => f.id === activeFolderId)?.id || '';

  useEffect(() => {
    if (searchParams.get('view') === 'outreach' && !searchParams.get('mode')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('mode', 'calls');
        next.delete('view');
        if (!next.get('callView')) next.set('callView', 'queue');
        return next;
      }, { replace: true });
    }
  }, []);

  const handleModeChange = (newMode) => {
    try {
      localStorage.setItem('crm_outreach_mode', newMode);
      if (activeFolderId) localStorage.setItem(`crm_list_mode_${activeFolderId}`, newMode);
    } catch { /* ignore */ }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('mode', newMode);
      if (newMode === 'calls') {
        if (!next.get('callView')) next.set('callView', 'queue');
        if (next.get('view') === 'outreach') next.delete('view');
      } else {
        next.delete('callView');
        if (!next.get('view') || next.get('view') === 'outreach') next.set('view', 'pipeline');
      }
      return next;
    });
  };

  const handleCallSubViewChange = (sub) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('mode', 'calls');
      next.set('callView', sub);
      if (next.get('view') === 'outreach') next.delete('view');
      return next;
    });
  };

  const handleViewChange = (newView) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('view', newView);
      next.set('mode', 'messages');
      next.delete('callView');
      return next;
    });
    try { localStorage.setItem('crm_outreach_mode', 'messages'); } catch { /* ignore */ }
  };
  const [columnDefs, setColumnDefs] = useState(() => {
    try {
      const saved = localStorage.getItem('crm_columns');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const {
    getWidth,
    setWidth,
    resetWidth,
    getRowHeight,
    setRowHeight,
    resetRowHeight,
  } = useCrmTableLayout(outreachMode === 'calls' ? 'call_queue' : view);

  // Must be declared before activeListShowsLocalTime (used in its deps)
  const [listSettingsTick, setListSettingsTick] = useState(0);

  const activeListShowsLocalTime = useMemo(() => {
    if (!activeManualFolderId || outreachMode !== 'messages' || view === 'clients') return false;
    return listFolderShowsLocalTime(activeManualFolderId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- listSettingsTick refreshes localStorage-backed settings
  }, [activeManualFolderId, outreachMode, view, listSettingsTick]);

  const tableCols = useMemo(() => {
    const cols = getTableColumns(columnDefs, view);
    if (!activeListShowsLocalTime || view !== 'contact_details') return cols;
    if (cols.some((c) => c.column_key === 'local_time')) return cols;
    const phoneIdx = cols.findIndex((c) => c.column_key === 'phone');
    const localTimeCol = {
      id: 'list-local-time',
      column_key: 'local_time',
      column_label: 'Lead local time',
      column_type: 'computed',
      is_visible: true,
      is_default: false,
      sort_order: phoneIdx >= 0 ? phoneIdx + 1 : cols.length,
    };
    const next = [...cols];
    next.splice(phoneIdx >= 0 ? phoneIdx + 1 : next.length, 0, localTimeCol);
    return next;
  }, [columnDefs, view, activeListShowsLocalTime]);

  const cellWidth = (key) => ({
    width: getWidth(key),
    minWidth: getWidth(key),
    maxWidth: getWidth(key),
  });

  const handleCopyCell = () => {
    showToast?.('Copied to clipboard', 'success');
  };

  const [selectedLead, setSelectedLead] = useState(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState(null);
  const [pastedLink, setPastedLink] = useState('');

  const handleOpenLead = (lead, tab) => {
    setSelectedLead(lead);
    setDrawerInitialTab(tab || null);
  };

  const handleCopyPersonalizedMessage = (lead, templateId) => {
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

  const handleReachClick = (e, platform, url, lead) => {
    const mapKey = platform.toLowerCase();

    // 1. Classify channel type: messaging vs profile_only
    let channelKey = mapKey;
    let channelType = 'profile_only';
    let supportsPrefill = false;

    if (
      mapKey === 'email' ||
      mapKey === 'whatsapp' ||
      mapKey === 'sms' ||
      mapKey === 'linkedin_url' ||
      mapKey === 'instagram_url' ||
      mapKey === 'twitter_url' ||
      mapKey === 'linkedin' ||
      mapKey === 'instagram' ||
      mapKey === 'twitter' ||
      mapKey === 'x'
    ) {
      channelKey = mapKey.includes('linkedin') ? 'linkedin_url' : mapKey.includes('instagram') ? 'instagram_url' : mapKey.includes('twitter') ? 'twitter_url' : mapKey;
      channelType = 'messaging';
      supportsPrefill = ['email', 'whatsapp', 'sms'].includes(mapKey);
    } else {
      // For custom domain fields, detect via detectPlatformLabel
      const detectedLabel = detectPlatformLabel(url).toLowerCase();
      if (detectedLabel === 'linkedin' || detectedLabel === 'instagram' || detectedLabel === 'twitter') {
        channelKey = `${detectedLabel}_url`;
        channelType = 'messaging';
        supportsPrefill = false;
      }
    }

    // Fallback path: profile_only channels just open the url directly
    if (channelType === 'profile_only') {
      return; // Do NOT call e.preventDefault(), browser navigates naturally
    }

    // Intercept messaging channel
    e.preventDefault();

    // 2. Normalize Phone details if WhatsApp/SMS/Call
    let warningMsg = '';
    if (['whatsapp', 'sms', 'phone'].includes(channelKey)) {
      const defCode = currentUser?.default_country_code || '+92';
      const normResult = normalizePhoneNumber(lead.phone, defCode);
      if (!normResult.isValid) {
        warningMsg = normResult.error;
      }
    }

    // 3. User configuration check: always_draft_before_sending
    const alwaysDraft = currentUser?.always_draft_before_sending !== false;
    
    // Choose template to load (user-scoped last-used)
    const storedTmplId = localStorage.getItem(`reach_last_tmpl_${currentUser?.id}_${channelKey}`);
    const activeTemplates = templates || [];
    const initialTemplate = activeTemplates.find(t => t.id === storedTmplId) || activeTemplates[0];

    const initialSubject = initialTemplate?.subject || '';
    const initialBody = initialTemplate ? mergeTemplateFields(initialTemplate.body || '', lead, userSnippets, columnDefs) : '';

    if (alwaysDraft) {
      // Open Reach Draft Modal
      setReachLead(lead);
      setReachChannel(channelKey);
      setReachUrl(url);
      setSelectedReachTemplateId(initialTemplate?.id || '');
      setReachTemplateSubject(initialSubject);
      setReachTemplateBody(initialBody);
      setReachWarning(warningMsg);
      setReachDestination(channelKey === 'email' ? localStorage.getItem(`reach_last_dest_${currentUser?.id}_${channelKey}`) || 'mailto' : channelKey);
      setReachAiError('');
      setReachAiInstructions('');
      setReachAiLoading(false);
      setReachModalOpen(true);
    } else {
      // Auto-send (direct prefill url opening or clipboard copying)
      if (supportsPrefill) {
        const dest = channelKey === 'email' ? localStorage.getItem(`reach_last_dest_${currentUser?.id}_${channelKey}`) || 'mailto' : channelKey;
        const prefillResult = generatePrefilledUrl(
          channelKey,
          dest,
          { email: lead.email, phone: lead.phone },
          initialSubject,
          initialBody,
          currentUser?.default_country_code || '+92'
        );
        if (prefillResult.warning) {
          alert(`Warning: ${prefillResult.warning}`);
        }
        window.open(prefillResult.url, '_blank');
      } else {
        // Clipboard copy + open profile URL
        navigator.clipboard.writeText(initialBody);
        showToast?.(`Copied! Paste it on ${lead.first_name || 'their'} profile.`);
        window.open(url, '_blank');
      }
    }
  };

  const handleReachTemplateChange = (templateId) => {
    setSelectedReachTemplateId(templateId);
    const found = templates.find(t => t.id === templateId);
    if (found && reachLead) {
      const mergedBody = mergeTemplateFields(found.body || '', reachLead, userSnippets, columnDefs);
      setReachTemplateSubject(found.subject || '');
      setReachTemplateBody(mergedBody);
      localStorage.setItem(`reach_last_tmpl_${currentUser?.id}_${reachChannel}`, templateId);
    }
  };

  const handleGenerateReachAI = async () => {
    if (reachAiLoading || !reachLead) return;
    setReachAiLoading(true);
    setReachAiError('');

    try {
      const draft = await generateAIDraft({
        leadContext: reachLead,
        platform: reachChannel,
        extraInstructions: reachAiInstructions,
      });
      setReachTemplateBody(draft);
    } catch (err) {
      console.error('[Reach Modal AI] Error:', err);
      setReachAiError("Couldn't generate, try again");
    } finally {
      setReachAiLoading(false);
    }
  };

  const handleReachSend = async (dest) => {
    localStorage.setItem(`reach_last_dest_${currentUser?.id}_${reachChannel}`, dest);
    localStorage.setItem(`reach_last_tmpl_${currentUser?.id}_${reachChannel}`, selectedReachTemplateId);

    const isPrefill = ['email', 'whatsapp', 'sms'].includes(reachChannel);
    if (isPrefill) {
      const prefillResult = generatePrefilledUrl(
        reachChannel,
        dest,
        { email: reachLead.email, phone: reachLead.phone },
        reachTemplateSubject,
        reachTemplateBody,
        currentUser?.default_country_code || '+92'
      );
      window.open(prefillResult.url, '_blank');
    } else {
      navigator.clipboard.writeText(reachTemplateBody);
      showToast?.(`Copied! Paste it on ${reachLead?.first_name || 'their'} profile.`);
      window.open(reachUrl, '_blank');
    }

    if (reachLead?.id) {
      try {
        const updates = { last_contacted_at: new Date().toISOString() };
        if (selectedReachTemplateId) {
          const tmpl = templates.find((t) => t.id === selectedReachTemplateId);
          if (tmpl?.name) updates.template_used = tmpl.name;
        }
        const { data, error } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', reachLead.id)
          .select()
          .single();
        if (!error && data) {
          setLeads((prev) => prev.map((l) => (l.id === reachLead.id ? data : l)));
        }
        logLeadTimelineEvent({
          leadId: reachLead.id,
          userId: currentUser.id,
          teamId: currentUser.team_id || null,
          eventType: 'message_sent',
          summary: `Message sent via ${reachChannel}`,
          detail: {
            channel: reachChannel,
            template: updates.template_used || null,
          },
          timeZone: getEffectiveUserTimeZone(currentUser),
        }).catch(() => {});
      } catch (err) {
        console.error('Error updating lead after reach send:', err);
      }
    }

    setReachModalOpen(false);
  };

  const handleAddPastedLink = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const val = pastedLink.trim();
      if (!val) return;
      
      const label = detectPlatformLabel(val);
      const cleanUrl = val.startsWith('http') ? val : `https://${val}`;
      
      setLeadForm(prev => {
        const currentLinks = prev.links || [];
        if (currentLinks.some(l => l.url === cleanUrl)) {
          alert('This link is already in the list.');
          return prev;
        }
        return {
          ...prev,
          links: [...currentLinks, { url: cleanUrl, label }]
        };
      });
      setPastedLink('');
    }
  };

  const handleFolderChange = (value) => {
    if (!value) {
      setLeadForm(prev => ({ ...prev, folder_id: '' }));
    } else if (value.startsWith('sys:')) {
      const sysType = value.split(':')[1];
      if (sysType === 'hot') {
        setLeadForm(prev => ({ ...prev, folder_id: '', priority: 'Hot' }));
      } else if (sysType === 'warm') {
        setLeadForm(prev => ({ ...prev, folder_id: '', priority: 'Warm' }));
      } else if (sysType === 'cold') {
        setLeadForm(prev => ({ ...prev, folder_id: '', priority: 'Cold' }));
      } else if (sysType === 'calendly') {
        setLeadForm(prev => ({ ...prev, folder_id: '', status: 'Invite Sent' }));
      } else if (sysType === 'clients') {
        setLeadForm(prev => ({ ...prev, folder_id: '', status: 'Closed Won' }));
      }
    } else if (value.startsWith('manual:')) {
      const folderId = value.split(':')[1];
      setLeadForm(prev => ({ ...prev, folder_id: folderId }));
    }
  };

  const getFolderSelectValue = () => {
    if (leadForm.folder_id) {
      return `manual:${leadForm.folder_id}`;
    }
    return '';
  };
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [showCSVImporter, setShowCSVImporter] = useState(false);
  const [showBulkImportUpgradeModal, setShowBulkImportUpgradeModal] = useState(false);

  // Advanced Filter Drawer States
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState([]);
  const [filterPriorities, setFilterPriorities] = useState([]);
  const [filterActions, setFilterActions] = useState([]);
  const [filterCallActions, setFilterCallActions] = useState([]);
  const [filterProjects, setFilterProjects] = useState([]);
  const [filterDateRange, setFilterDateRange] = useState('all'); // 'all' | 'today' | '7days' | '30days'
  const [filterDateField, setFilterDateField] = useState('created_at'); // 'created_at' | 'last_contacted_at'

  // Modals state
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ ...EMPTY_QUICK_ADD_FORM });
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewImportModal, setShowNewImportModal] = useState(false);
  const [showExportSheetsModal, setShowExportSheetsModal] = useState(false);
  const [exportSheetsLeads, setExportSheetsLeads] = useState(null);
  const [exportSheetsOptions, setExportSheetsOptions] = useState({});
  const [showSheetsImportModal, setShowSheetsImportModal] = useState(false);
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [sheetsConnectedChecked, setSheetsConnectedChecked] = useState(false);
  const [sheetsNeedsReconnect, setSheetsNeedsReconnect] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [convertingLead, setConvertingLead] = useState(null);
  
  // Reply Type prompt state
  const [replyPromptLead, setReplyPromptLead] = useState(null);
  const [replyPromptStatus, setReplyPromptStatus] = useState('');
  const [replyType, setReplyType] = useState('positive'); // 'positive' | 'negative' | 'skip'
  const [replyTemplateId, setReplyTemplateId] = useState('');
  const [replyNotes, setReplyNotes] = useState('');
  const [nextStep, setNextStep] = useState(null); // 'proposal' | 'meeting' | 'skip' | null
  const [nextStepLink, setNextStepLink] = useState('');

  // Suggestions & Checkpoints states
  const [suggestionRules, setSuggestionRules] = useState([]);
  const [checkpointPopoverLead, setCheckpointPopoverLead] = useState(null);
  const [checkpointPopoverAnchor, setCheckpointPopoverAnchor] = useState(null);

  // Form states
  const [leadForm, setLeadForm] = useState({
    name: '', email: '', phone: '', company: '', niche: '',
    priority: 'Warm', status: 'Lead', notes: '', folder_id: '',
    template_used: '',
    links: [],
    custom_fields: {},
    timezone: '',
    timezone_source: '',
    timezoneTouched: false,
  });
  const [folderForm, setFolderForm] = useState({ name: '', color: '#A3A3A3' });
  const [importText, setImportText] = useState('');
  const [showCrmMoreMenu, setShowCrmMoreMenu] = useState(false);
  const [exporting, setExporting] = useState(null);

  const handleExportLeadsClick = async () => {
    if (exporting) return;
    setExporting('leads');
    setShowCrmMoreMenu(false);
    try {
      await exportLeads(currentUser.id, leads);
    } catch (err) {
      console.error('Export leads error:', err);
      alert('Failed to export leads: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleExportNotesClick = async () => {
    if (exporting) return;
    setExporting('notes');
    setShowCrmMoreMenu(false);
    try {
      await exportNotes(currentUser.id);
    } catch (err) {
      console.error('Export notes error:', err);
      alert('Failed to export notes: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  const [showBulkStatusMenu, setShowBulkStatusMenu] = useState(false);
  const [showBulkChannelMenu, setShowBulkChannelMenu] = useState(false);
  const [showBulkPriorityMenu, setShowBulkPriorityMenu] = useState(false);

  if (!currentUser) {
    return <div className="loading-container">Loading profile...</div>;
  }

  const plan = getEffectivePlan(currentUser);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;

  // 1. Fetch CRM Data
  const fetchData = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const teamIds = await getTeamIds(currentUser.id);
      if (!teamIds || teamIds.length === 0 || teamIds.includes(undefined) || teamIds.includes(null)) {
        setLoading(false);
        return;
      }

      const isOwner = isTeamOwner(currentUser);
      const sharesRes = await fetchSharesForUser(currentUser.id);
      const sharedFolderIds = sharesRes.map((s) => s.folder_id).filter(Boolean);

      const foldersPromise = isOwner
        ? supabase.from('folders').select('*').in('user_id', teamIds).order('sort_order', { ascending: true })
        : (async () => {
          const [ownRes, sharedRes] = await Promise.all([
            supabase.from('folders').select('*').eq('user_id', currentUser.id).order('sort_order', { ascending: true }),
            sharedFolderIds.length
              ? supabase.from('folders').select('*').in('id', sharedFolderIds).order('sort_order', { ascending: true })
              : Promise.resolve({ data: [] }),
          ]);
          const byId = new Map();
          [...(ownRes.data || []), ...(sharedRes.data || [])].forEach((f) => byId.set(f.id, f));
          return { data: [...byId.values()] };
        })();

      const smartFoldersPromise = isOwner
        ? supabase.from('user_folders').select('*').in('user_id', teamIds).order('created_at', { ascending: true })
        : supabase.from('user_folders').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true });

      const leadsPromise = fetchAllLeadsForScope({
        userIds: teamIds,
        sharedFolderIds: sharedFolderIds.length ? sharedFolderIds : null,
      });

      const teamMembersPromise = currentUser.team_id
        ? supabase.from('user_profiles').select('id, email, full_name, team_role').eq('team_id', currentUser.team_id)
        : Promise.resolve({ data: [] });

      const [
        foldersRes,
        smartFoldersRes,
        statusesRes,
        templatesRes,
        columnsRes,
        rawLeads,
        rulesRes,
        teamMembersRes,
      ] = await Promise.all([
        foldersPromise,
        smartFoldersPromise,
        supabase.from('custom_statuses').select('*').in('user_id', teamIds).order('sort_order', { ascending: true }),
        supabase.from('templates').select('id, title, platform, is_starter, content, kind').or(`user_id.in.(${teamIds.join(',')}),user_id.is.null`),
        supabase.from('column_definitions').select('*').in('user_id', teamIds).order('sort_order', { ascending: true }),
        leadsPromise,
        supabase.from('action_suggestion_rules').select('*'),
        teamMembersPromise,
      ]);

      if (columnsRes.error) throw columnsRes.error;

      const fData = foldersRes.data || [];
      const ufData = smartFoldersRes.data || [];
      const sData = statusesRes.data || [];
      const tData = templatesRes.data || [];
      const cols = columnsRes.data || [];
      const lData = (rawLeads || []).map(lead => {
        if (lead.priority && /🔥|⚡|📦|🧊/.test(lead.priority)) {
          let cleanPriority = lead.priority.replace(/🔥|⚡|📦|🧊/g, '').trim();
          if (cleanPriority.toLowerCase() === 'hot') cleanPriority = 'Hot';
          else if (cleanPriority.toLowerCase() === 'warm') cleanPriority = 'Warm';
          else if (cleanPriority.toLowerCase() === 'cold') cleanPriority = 'Cold';
          
          // Trigger background update in Supabase
          supabase
            .from('leads')
            .update({ priority: cleanPriority })
            .eq('id', lead.id)
            .then(({ error }) => {
              if (error) console.error(`Failed to migrate priority for lead ${lead.id}:`, error);
            });
          return { ...lead, priority: cleanPriority };
        }
        return lead;
      });
      const cData = lData.filter(l => isClientStatus(l.status));
      const rData = rulesRes.data || [];

      setFolders(fData);
      localStorage.setItem('crm_folders', JSON.stringify(fData));
      setUserFolders(ufData);
      let mergedShares = sharesRes || [];
      if (isOwner && fData.length > 0) {
        const teamFolderIds = fData
          .filter((f) => f.user_id !== currentUser.id)
          .map((f) => f.id);
        if (teamFolderIds.length > 0) {
          const teamShares = await fetchSharesForFolders(teamFolderIds);
          const shareById = new Map();
          [...mergedShares, ...teamShares].forEach((s) => shareById.set(s.id, s));
          mergedShares = [...shareById.values()];
        }
      }
      setFolderShares(mergedShares);
      setTeamMembersList(teamMembersRes.data || []);
      
      if (sData.length > 0) {
        const messagingStatuses = sData.filter((s) => !s.channel || s.channel === 'messaging');
        const myCallStatuses = sData.filter(
          (s) => s.user_id === currentUser.id && s.channel === 'calls',
        );
        if (messagingStatuses.length > 0) {
          setStatuses(messagingStatuses);
          localStorage.setItem('crm_custom_statuses', JSON.stringify(messagingStatuses));
        }
        if (myCallStatuses.length > 0) {
          setCallStatuses(myCallStatuses);
        }
      }
      
      const parsedTemplates = tData.map(tmpl => {
        let subject = '';
        let body = '';
        if (tmpl.content) {
          if (tmpl.content.startsWith('{') && tmpl.content.endsWith('}')) {
            try {
              const parsed = JSON.parse(tmpl.content);
              subject = parsed.subject || '';
              body = parsed.body || '';
            } catch (e) {
              console.error('Error parsing custom template JSON content:', e);
            }
          } else {
            body = tmpl.content;
          }
        }
        return {
          ...tmpl,
          subject,
          body
        };
      });
      setTemplates(parsedTemplates);
      
      setLeads(lData);
      setClients(cData);
      setSuggestionRules(rData);

      if (!cols || cols.length === 0) {
        const defaultDefs = [
          // ── Contact Details view — Default visible: Name, Status, Reach
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'name',              column_label: 'Name',             column_type: 'text',     is_visible: true,  is_default: true, sort_order: 0, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'status',            column_label: 'Status',           column_type: 'status',   is_visible: true,  is_default: true, sort_order: 1, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'outreach_channel',  column_label: 'Channel',          column_type: 'channel',  is_visible: true,  is_default: true, sort_order: 2, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'action_to_take',    column_label: 'Next step',        column_type: 'dropdown', is_visible: true,  is_default: true, sort_order: 3, dropdown_options: ACTION_TO_TAKE_SEED },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'platform',          column_label: 'Reach',            column_type: 'reach',    is_visible: true,  is_default: true, sort_order: 3, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'phone',             column_label: 'Phone',            column_type: 'text',     is_visible: true,  is_default: true, sort_order: 4, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'last_contacted_at', column_label: 'Last Contacted At',column_type: 'date',     is_visible: true,  is_default: true, sort_order: 5, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'email',             column_label: 'Email',            column_type: 'text',     is_visible: false, is_default: true, sort_order: 6, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'company',           column_label: 'Company',          column_type: 'text',     is_visible: false, is_default: true, sort_order: 7, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'instagram_url',     column_label: 'Instagram',        column_type: 'text',     is_visible: false, is_default: true, sort_order: 8, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'website',           column_label: 'Website',          column_type: 'text',     is_visible: false, is_default: true, sort_order: 9, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'priority',          column_label: 'Priority',         column_type: 'priority', is_visible: false, is_default: true, sort_order: 10, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'niche',             column_label: 'Niche',            column_type: 'text',     is_visible: false, is_default: true, sort_order: 11, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'template_used',     column_label: 'Template Used',   column_type: 'link',     is_visible: false, is_default: true, sort_order: 12, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'linkedin_url',      column_label: 'LinkedIn',         column_type: 'text',     is_visible: false, is_default: true, sort_order: 13, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'twitter_url',       column_label: 'Twitter / X',      column_type: 'text',     is_visible: false, is_default: true, sort_order: 14, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'contact_details', column_key: 'created_at',        column_label: 'Added On',         column_type: 'date',     is_visible: false, is_default: true, sort_order: 15, dropdown_options: [] },

          // ── Pipeline view — Default visible: Name, Priority, Status, Action to Take, Last Contacted At, Template Used, Reach
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'name',              column_label: 'Name',              column_type: 'text',     is_visible: true,  is_default: true, sort_order: 0, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'priority',          column_label: 'Priority',          column_type: 'dropdown', is_visible: true,  is_default: true, sort_order: 1, dropdown_options: [
            { label: 'Hot', color: '#ef4444' },
            { label: 'Warm', color: '#f59e0b' },
            { label: 'Cold', color: '#3b82f6' }
          ] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'status',            column_label: 'Status',            column_type: 'dropdown', is_visible: true,  is_default: true, sort_order: 2, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'outreach_channel',  column_label: 'Channel',           column_type: 'channel',  is_visible: true,  is_default: true, sort_order: 3, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'action_to_take',    column_label: 'Action to Take',    column_type: 'dropdown', is_visible: true,  is_default: true, sort_order: 4, dropdown_options: ACTION_TO_TAKE_SEED },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'last_contacted_at', column_label: 'Last Contacted At', column_type: 'date',     is_visible: true,  is_default: true, sort_order: 4, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'template_used',     column_label: 'Template Used',    column_type: 'link',     is_visible: true,  is_default: true, sort_order: 5, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'platform',          column_label: 'Reach',             column_type: 'reach',    is_visible: true,  is_default: true, sort_order: 6, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'niche',             column_label: 'Niche',             column_type: 'text',     is_visible: false, is_default: true, sort_order: 7, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'email',             column_label: 'Email',             column_type: 'text',     is_visible: false, is_default: true, sort_order: 8, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'phone',             column_label: 'Phone',             column_type: 'text',     is_visible: false, is_default: true, sort_order: 9, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'pipeline', column_key: 'company',           column_label: 'Company',           column_type: 'text',     is_visible: false, is_default: true, sort_order: 10, dropdown_options: [] },
          
          { user_id: currentUser.id, table_view: 'clients', column_key: 'name', column_label: 'Client Name', column_type: 'text', is_visible: true, is_default: true, sort_order: 0, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'clients', column_key: 'email', column_label: 'Email', column_type: 'text', is_visible: true, is_default: true, sort_order: 1, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'clients', column_key: 'phone', column_label: 'Phone', column_type: 'text', is_visible: true, is_default: true, sort_order: 2, dropdown_options: [] },
          { 
            user_id: currentUser.id, 
            table_view: 'clients', 
            column_key: 'project_status', 
            column_label: 'Project Status', 
            column_type: 'dropdown', 
            is_visible: true, 
            is_default: true, 
            sort_order: 3, 
            dropdown_options: [
              { label: 'Onboarding', color: '#A3A3A3' },
              { label: 'In Progress', color: '#D4D4D4' },
              { label: 'On Hold', color: '#525252' },
              { label: 'Completed', color: '#FFFFFF' }
            ] 
          },
          { user_id: currentUser.id, table_view: 'clients', column_key: 'contract_value', column_label: 'Contract Value', column_type: 'text', is_visible: true, is_default: true, sort_order: 4, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'clients', column_key: 'billing_invoice_link', column_label: 'Invoice Link', column_type: 'link', is_visible: true, is_default: true, sort_order: 5, dropdown_options: [] },
          { user_id: currentUser.id, table_view: 'clients', column_key: 'start_date', column_label: 'Start Date', column_type: 'date', is_visible: true, is_default: true, sort_order: 6, dropdown_options: [] },

          ...CALL_QUEUE_DEFAULT_DEFS.map((d, idx) => ({
            ...d,
            user_id: currentUser.id,
            sort_order: idx,
          })),
        ];

        const { data: seeded, error: seedErr } = await supabase
          .from('column_definitions')
          .insert(defaultDefs)
          .select();

        if (seedErr) throw seedErr;
        const seededList = seeded || [];
        setColumnDefs(seededList);
        localStorage.setItem('crm_columns', JSON.stringify(seededList));
      } else {
        // ── Deduplicate: keep only the first entry per (table_view, column_key) ──
        const seen = new Set();
        const dedupedCols = cols.filter(c => {
          const key = `${c.table_view}::${c.column_key}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // ── Seed any missing default columns for existing users ──
        const allDefaultKeys = [
          // contact_details
          { table_view: 'contact_details', column_key: 'name',              column_label: 'Name',             column_type: 'text',     is_visible: true,  sort_order: 0,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'status',            column_label: 'Status',           column_type: 'status',   is_visible: true,  sort_order: 1,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'outreach_channel',  column_label: 'Channel',          column_type: 'channel',  is_visible: true,  sort_order: 2,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'action_to_take',    column_label: 'Next step',        column_type: 'dropdown', is_visible: true,  sort_order: 3,  dropdown_options: ACTION_TO_TAKE_SEED },
          { table_view: 'contact_details', column_key: 'platform',          column_label: 'Reach',            column_type: 'reach',    is_visible: true,  sort_order: 3,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'phone',             column_label: 'Phone',            column_type: 'text',     is_visible: true,  sort_order: 4,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'last_contacted_at', column_label: 'Last Contacted At', column_type: 'date',    is_visible: true,  sort_order: 5,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'email',             column_label: 'Email',            column_type: 'text',     is_visible: false, sort_order: 6,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'company',           column_label: 'Company',          column_type: 'text',     is_visible: false, sort_order: 7,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'instagram_url',     column_label: 'Instagram',        column_type: 'text',     is_visible: false, sort_order: 8,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'website',           column_label: 'Website',          column_type: 'text',     is_visible: false, sort_order: 9,  dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'priority',          column_label: 'Priority',         column_type: 'priority', is_visible: false, sort_order: 10, dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'niche',             column_label: 'Niche',            column_type: 'text',     is_visible: false, sort_order: 11, dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'template_used',     column_label: 'Template Used',   column_type: 'link',     is_visible: false, sort_order: 12, dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'linkedin_url',      column_label: 'LinkedIn',          column_type: 'text',    is_visible: false, sort_order: 13, dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'twitter_url',       column_label: 'Twitter / X',       column_type: 'text',    is_visible: false, sort_order: 14, dropdown_options: [] },
          { table_view: 'contact_details', column_key: 'created_at',        column_label: 'Added On',          column_type: 'date',    is_visible: false, sort_order: 15, dropdown_options: [] },
          // pipeline
          { table_view: 'pipeline', column_key: 'name',              column_label: 'Name',              column_type: 'text',     is_visible: true,  sort_order: 0, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'priority',          column_label: 'Priority',          column_type: 'dropdown', is_visible: true,  sort_order: 1, dropdown_options: [
            { label: 'Hot', color: '#ef4444' }, { label: 'Warm', color: '#f59e0b' }, { label: 'Cold', color: '#3b82f6' }
          ] },
          { table_view: 'pipeline', column_key: 'status',            column_label: 'Status',            column_type: 'dropdown', is_visible: true,  sort_order: 2, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'outreach_channel',  column_label: 'Channel',           column_type: 'channel',  is_visible: true,  sort_order: 3, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'action_to_take',    column_label: 'Action to Take',    column_type: 'dropdown', is_visible: true,  sort_order: 4, dropdown_options: ACTION_TO_TAKE_SEED },
          { table_view: 'pipeline', column_key: 'last_contacted_at', column_label: 'Last Contacted At', column_type: 'date',     is_visible: true,  sort_order: 5, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'template_used',     column_label: 'Template Used',     column_type: 'link',     is_visible: true,  sort_order: 6, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'platform',          column_label: 'Reach',             column_type: 'reach',    is_visible: true,  sort_order: 7, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'niche',             column_label: 'Niche',             column_type: 'text',     is_visible: false, sort_order: 8, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'email',             column_label: 'Email',             column_type: 'text',     is_visible: false, sort_order: 9, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'phone',             column_label: 'Phone',             column_type: 'text',     is_visible: false, sort_order: 10, dropdown_options: [] },
          { table_view: 'pipeline', column_key: 'company',           column_label: 'Company',           column_type: 'text',     is_visible: false, sort_order: 11, dropdown_options: [] },
          ...CALL_QUEUE_DEFAULT_DEFS,
        ];

        const existingKeys = new Set(dedupedCols.map(c => `${c.table_view}::${c.column_key}`));
        const missingDefs = allDefaultKeys
          .filter(d => !existingKeys.has(`${d.table_view}::${d.column_key}`))
          .map(d => ({ ...d, user_id: currentUser.id, is_default: true }));

        if (missingDefs.length > 0) {
          const { data: newCols } = await supabase
            .from('column_definitions')
            .insert(missingDefs)
            .select();
          const combined = [...dedupedCols, ...(newCols || [])];
          setColumnDefs(combined);
          localStorage.setItem('crm_columns', JSON.stringify(combined));
        } else {
          setColumnDefs(dedupedCols);
          localStorage.setItem('crm_columns', JSON.stringify(dedupedCols));
        }
      }
    } catch (err) {
      console.error('Error fetching CRM data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDropdownChange = async (leadId, field, newVal) => {
    if (field === 'status') {
      handleStatusChange(leadId, newVal);
      return;
    }

    const targetData = view === 'clients' ? clients : leads;
    const targetSetData = view === 'clients' ? setClients : setLeads;
    const targetTable = view === 'clients' ? 'clients' : 'leads';

    const item = targetData.find(l => l.id === leadId);
    const originalVal = item ? item[field] : null;

    try {
      const updates = { [field]: newVal };
      // Pair timezone_source when timezone is set from Call Queue picker
      if (field === 'timezone') {
        updates.timezone_source = newVal ? 'manual' : null;
      }

      const { data, error } = await supabase.from(targetTable)
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      targetSetData(prev => prev.map(l => l.id === leadId ? data : l));

      if (targetTable === 'leads') {
        await supabase.from('lead_activity').insert({
          user_id: currentUser.id,
          lead_id: leadId,
          action_type: `${field.charAt(0).toUpperCase() + field.slice(1)} Updated`,
          action_detail: { from: originalVal || 'None', to: newVal }
        });

        const { logLeadTimelineEvent } = await import('../lib/leadTimeline');
        const isTimestamp = field === 'last_contacted_at' || field === 'last_called_at';
        logLeadTimelineEvent({
          leadId,
          userId: currentUser.id,
          teamId: currentUser.team_id || null,
          eventType: isTimestamp ? 'timestamp_corrected' : 'field_changed',
          summary: isTimestamp
            ? `${field === 'last_called_at' ? 'Last called' : 'Last contacted'} updated`
            : `${field.replace(/_/g, ' ')} → ${newVal || 'cleared'}`,
          detail: { field, from: originalVal || null, to: newVal },
          timeZone: getEffectiveUserTimeZone(currentUser),
          occurredAt: isTimestamp && newVal ? newVal : undefined,
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`Error updating field ${field}:`, err);
    }
  };

  const handleLeadFieldChange = (leadId, field, newVal) => handleDropdownChange(leadId, field, newVal);

  const resetListFilters = () => {
    setStatusFilter('');
    setPriorityFilter('');
    setFilterStatuses([]);
    setFilterPriorities([]);
    setFilterActions([]);
    setFilterCallActions([]);
    setFilterProjects([]);
    setFilterDateRange('all');
    setFilterDateField('created_at');
    setSearchQuery('');
  };

  const handleClearFilters = () => {
    resetListFilters();
  };

  const hasActiveListFilters = !!(
    searchQuery
    || statusFilter
    || priorityFilter
    || filterStatuses.length
    || filterPriorities.length
    || filterActions.length
    || filterCallActions.length
    || filterProjects.length
    || filterDateRange !== 'all'
  );

  const handleResetToDefault = async (targetView) => {
    const viewToReset = targetView || (outreachMode === 'calls' ? 'call_queue' : view);
    const label = viewToReset === 'call_queue' ? 'Cold Calls · Queue'
      : viewToReset === 'contact_details' ? 'Message · Contact' : 'Message · Pipeline';
    if (!confirm(`Reset ${label} columns to default? Custom columns for this view will be deleted.`)) return;
    try {
      await supabase
        .from('column_definitions')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('table_view', viewToReset);

      await fetchData();
    } catch (err) {
      console.error('Error resetting columns:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, activeFolderId]);

  // Auto-open lead from ?lead= query, sessionStorage, or custom event
  useEffect(() => {
    const openLeadById = async (leadId, preselectStatus = null) => {
      if (!leadId) return;
      const { data: lead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .maybeSingle();

      if (!error && lead) {
        const modifiedLead = preselectStatus ? { ...lead, status: preselectStatus } : lead;
        setSelectedLead(modifiedLead);
      }
    };

    const checkAutoOpen = async () => {
      if (!currentUser) return;

      const leadFromQuery = searchParams.get('lead');
      if (leadFromQuery) {
        await openLeadById(leadFromQuery);
        const next = new URLSearchParams(searchParams);
        next.delete('lead');
        setSearchParams(next, { replace: true });
        return;
      }

      const stored = sessionStorage.getItem('reachdesk_auto_open_lead');
      if (stored) {
        sessionStorage.removeItem('reachdesk_auto_open_lead');
        try {
          const { leadId, preselectStatus } = JSON.parse(stored);
          await openLeadById(leadId, preselectStatus || null);
        } catch (e) {
          console.error('[CRM] Error parsing auto-open lead:', e);
        }
      }
    };

    checkAutoOpen();

    window.addEventListener('reachdesk_trigger_auto_open', checkAutoOpen);
    return () => {
      window.removeEventListener('reachdesk_trigger_auto_open', checkAutoOpen);
    };
  }, [currentUser, searchParams]);

  // Google Sheets: check connection status & handle callback success banner
  useEffect(() => {
    async function checkSheetsConnection() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('sheets_integrations')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      const connected = !!data?.id;
      setSheetsConnected(connected);
      setSheetsNeedsReconnect(needsSheetsReconnect(connected));
      setSheetsConnectedChecked(true);
    }
    checkSheetsConnection();

    // Handle ?connected=sheets callback after OAuth
    const connectedParam = new URLSearchParams(window.location.search).get('connected');
    if (connectedParam === 'sheets') {
      markSheetsScopeAck();
      setSheetsConnected(true);
      setSheetsNeedsReconnect(false);
      showToast?.('Google Sheets connected successfully!', 'success');
      // Clean the URL param
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('connected');
      window.history.replaceState(null, '', nextUrl.toString());
    }
  }, [currentUser]);


  const totalLeadsCount = leads.length;
  const leadLimit = getPlanLeadLimit(plan, getEffectiveBillingCycle(currentUser)) || Infinity;
  const isLeadLimitReached = leadLimit !== Infinity && totalLeadsCount >= leadLimit;
  const planKey = normalizePlan(plan);
  const planFeatures = PLAN_FEATURE_FLAGS[planKey] || PLAN_FEATURE_FLAGS.trial;
  // CSV export is never plan-gated — only bulk import and Sheets integrations use flags below.
  const canUseIntegrations = planFeatures.sheetsIntegration ?? false;
  const canBulkImport = planFeatures.bulkImport ?? false;

  const handleOpenBulkImport = (openModal) => {
    if (!canBulkImport) {
      setShowBulkImportUpgradeModal(true);
      return;
    }
    if (isLeadLimitReached) return;
    openModal();
  };

  const leadLimitTooltip = 'Lead limit reached. Delete leads or upgrade.';

  const handleOpenAddLead = () => {
    if (isLeadLimitReached) {
      setShowLeadLimitBlockModal(true);
      return;
    }
    setLeadForm({
      name: '', email: '', phone: '', company: '', niche: '',
      priority: 'Warm', status: 'Lead', notes: '', folder_id: activeManualFolderId || '',
      template_used: '',
      links: [],
      custom_fields: {},
      timezone: '',
      timezone_source: '',
      timezoneTouched: false,
    });
    setPastedLink('');
    setShowAddLeadModal(true);
  };

  // Add Lead
  const handleAddLead = async (e) => {
    e.preventDefault();
    if (isLeadLimitReached) return;

    try {
      const parts = (leadForm.name || '').trim().split(' ');
      const first_name = parts[0] || '';
      const last_name = parts.slice(1).join(' ') || null;

      const linksArray = [...(leadForm.links || [])];
      if (pastedLink && pastedLink.trim()) {
        const val = pastedLink.trim();
        const cleanUrl = val.startsWith('http') ? val : `https://${val}`;
        const label = detectPlatformLabel(val);
        if (!linksArray.some(l => l.url === cleanUrl)) {
          linksArray.push({ url: cleanUrl, label });
        }
      }

      const urlUpdates = { linkedin_url: null, instagram_url: null, twitter_url: null, website: null };
      linksArray.forEach(link => {
        const url = typeof link === 'string' ? link : link.url;
        if (url.includes('linkedin.com')) urlUpdates.linkedin_url = url;
        else if (url.includes('instagram.com')) urlUpdates.instagram_url = url;
        else if (url.includes('twitter.com') || url.includes('x.com')) urlUpdates.twitter_url = url;
        else urlUpdates.website = url;
      });

      const finalCustomFields = {
        ...(leadForm.custom_fields || {}),
        links: linksArray
      };

      const tzFields = resolveLeadTimezoneForSave({
        timezone: leadForm.timezone,
        timezone_source: leadForm.timezone_source,
        timezoneManual: leadForm.timezoneTouched,
        phone: leadForm.phone,
        previousPhone: null,
        defaultCountryCode: currentUser?.default_country_code || '+92',
      });

      const { data, error } = await supabase.from('leads')
        .insert({
          first_name,
          last_name,
          email: leadForm.email || null,
          phone: leadForm.phone || null,
          company: leadForm.company || null,
          niche: leadForm.niche || null,
          linkedin_url: urlUpdates.linkedin_url,
          instagram_url: urlUpdates.instagram_url,
          twitter_url: urlUpdates.twitter_url,
          website: urlUpdates.website,
          priority: leadForm.priority || 'Warm',
          status: leadForm.status || 'Lead',
          notes: leadForm.notes || null,
          user_id: currentUser.id,
          folder_id: leadForm.folder_id || activeManualFolderId || null,
          template_used: leadForm.template_used || null,
          custom_fields: finalCustomFields,
          timezone: tzFields.timezone,
          timezone_source: tzFields.timezone_source,
        })
        .select()
        .single();

      if (error) throw error;
      setLeads(prev => [data, ...prev]);
      // If sticky filters would hide the new lead, clear them so it appears
      if (searchQuery || statusFilter || priorityFilter || filterStatuses.length || filterPriorities.length
        || filterActions.length || filterCallActions.length || filterProjects.length || filterDateRange !== 'all') {
        resetListFilters();
      }
      setShowAddLeadModal(false);

      // Check remaining quota for countdown toast
      try {
        const remaining = await getRemainingLeadQuota(currentUser.id);
        if (shouldShowCountdownToast(remaining)) {
          setToastRemaining(remaining);
        }
      } catch (quotaErr) {
        console.error('Error fetching remaining lead quota:', quotaErr);
      }
    } catch (err) {
      if (err?.message?.includes('Lead limit reached')) {
        setShowLeadLimitBlockModal(true);
      } else {
        console.error('Error adding lead:', err);
      }
    }
  };

  // Quick Add Lead
  const handleQuickAddSubmit = async (e) => {
    e.preventDefault();
    if (isLeadLimitReached) return;

    const { first_name, last_name } = splitLeadName(quickAddForm.name);
    if (!first_name) return;

    try {
      const profileUrl = normalizeQuickAddProfileUrl(quickAddForm.profileUrl, quickAddForm.platform);
      const { urlUpdates, links } = mapProfileUrlToLeadFields(profileUrl, quickAddForm.platform);
      const custom_fields = links.length > 0 ? { links } : {};

      const tzFields = resolveLeadTimezoneForSave({
        phone: quickAddForm.phone,
        previousPhone: null,
        defaultCountryCode: currentUser?.default_country_code || '+92',
      });

      const { data, error } = await supabase.from('leads')
        .insert({
          first_name,
          last_name,
          phone: quickAddForm.phone?.trim() || null,
          linkedin_url: urlUpdates.linkedin_url,
          instagram_url: urlUpdates.instagram_url,
          twitter_url: urlUpdates.twitter_url,
          website: urlUpdates.website,
          priority: quickAddForm.priority || 'Warm',
          status: 'Lead',
          notes: quickAddForm.notes?.trim() || null,
          user_id: currentUser.id,
          folder_id: activeManualFolderId || null,
          custom_fields,
          timezone: tzFields.timezone,
          timezone_source: tzFields.timezone_source,
        })
        .select()
        .single();

      if (error) throw error;
      setLeads(prev => [data, ...prev]);
      if (searchQuery || statusFilter || priorityFilter || filterStatuses.length || filterPriorities.length
        || filterActions.length || filterCallActions.length || filterProjects.length || filterDateRange !== 'all') {
        resetListFilters();
      }
      setShowQuickAddModal(false);
      setQuickAddForm({ ...EMPTY_QUICK_ADD_FORM });

      try {
        const remaining = await getRemainingLeadQuota(currentUser.id);
        if (shouldShowCountdownToast(remaining)) {
          setToastRemaining(remaining);
        }
      } catch (quotaErr) {
        console.error('Error fetching remaining lead quota:', quotaErr);
      }
    } catch (err) {
      if (err?.message?.includes('Lead limit reached')) {
        setShowLeadLimitBlockModal(true);
      } else {
        console.error('Error quick adding lead:', err);
      }
    }
  };

  const handleAddNewCustomField = async (name, type) => {
    if (!name.trim()) return;
    try {
      const { data, error } = await supabase
        .from('column_definitions')
        .insert({
          user_id: currentUser.id,
          table_view: view === 'pipeline' ? 'pipeline' : 'contact_details',
          column_key: name.trim().toLowerCase().replace(/\s+/g, '_'),
          column_label: name.trim(),
          column_type: type,
          is_visible: true,
          is_default: false,
          sort_order: columnDefs.length
        })
        .select()
        .single();
      if (error) throw error;
      setColumnDefs(prev => [...prev, data]);
    } catch (err) {
      console.error('Error adding custom field:', err);
      alert('Failed to add custom field: ' + err.message);
    }
  };

  const handleRemoveCustomFieldVal = (columnKey) => {
    setLeadForm(prev => {
      const updatedFields = { ...(prev.custom_fields || {}) };
      delete updatedFields[columnKey];
      return {
        ...prev,
        custom_fields: updatedFields
      };
    });
  };

  // Open Edit Lead
  const handleOpenEditLead = (lead) => {
    setActiveLead(lead);
    const existingLinks = lead.custom_fields?.links ? [...lead.custom_fields.links] : [];
    
    // Ensure all URL columns are also present in existingLinks to pre-populate correctly
    const addIfMissing = (url, label) => {
      if (url && !existingLinks.some(l => l.url === url)) {
        existingLinks.push({ url, label });
      }
    };
    
    addIfMissing(lead.linkedin_url, 'LinkedIn');
    addIfMissing(lead.instagram_url, 'Instagram');
    addIfMissing(lead.twitter_url, 'Twitter');
    addIfMissing(lead.website, 'Website');

    setLeadForm({
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      niche: lead.niche || '',
      priority: lead.priority || 'Warm',
      status: lead.status || 'Lead',
      notes: lead.notes || '',
      folder_id: lead.folder_id || '',
      template_used: lead.template_used || '',
      links: existingLinks,
      custom_fields: lead.custom_fields || {},
      timezone: lead.timezone || '',
      timezone_source: lead.timezone_source || '',
      timezoneTouched: lead.timezone_source === 'manual',
    });
    setPastedLink('');
    setShowEditLeadModal(true);
  };

  // Edit Lead
  const handleEditLead = async (e) => {
    e.preventDefault();
    try {
      const parts = (leadForm.name || '').trim().split(' ');
      const first_name = parts[0] || '';
      const last_name = parts.slice(1).join(' ') || null;

      const linksArray = [...(leadForm.links || [])];
      if (pastedLink && pastedLink.trim()) {
        const val = pastedLink.trim();
        const cleanUrl = val.startsWith('http') ? val : `https://${val}`;
        const label = detectPlatformLabel(val);
        if (!linksArray.some(l => l.url === cleanUrl)) {
          linksArray.push({ url: cleanUrl, label });
        }
      }

      const urlUpdates = { linkedin_url: null, instagram_url: null, twitter_url: null, website: null };
      linksArray.forEach(link => {
        const url = typeof link === 'string' ? link : link.url;
        if (url.includes('linkedin.com')) urlUpdates.linkedin_url = url;
        else if (url.includes('instagram.com')) urlUpdates.instagram_url = url;
        else if (url.includes('twitter.com') || url.includes('x.com')) urlUpdates.twitter_url = url;
        else urlUpdates.website = url;
      });

      const finalCustomFields = {
        ...(leadForm.custom_fields || {}),
        links: linksArray
      };

      const tzFields = resolveLeadTimezoneForSave({
        timezone: leadForm.timezone,
        timezone_source: leadForm.timezone_source,
        timezoneManual: leadForm.timezoneTouched,
        phone: leadForm.phone,
        previousPhone: activeLead?.phone,
        defaultCountryCode: currentUser?.default_country_code || '+92',
      });

      const { data, error } = await supabase.from('leads')
        .update({
          first_name,
          last_name,
          email: leadForm.email || null,
          phone: leadForm.phone || null,
          company: leadForm.company || null,
          niche: leadForm.niche || null,
          linkedin_url: urlUpdates.linkedin_url,
          instagram_url: urlUpdates.instagram_url,
          twitter_url: urlUpdates.twitter_url,
          website: urlUpdates.website,
          priority: leadForm.priority || 'Warm',
          status: leadForm.status || 'Lead',
          notes: leadForm.notes || null,
          folder_id: leadForm.folder_id || null,
          template_used: leadForm.template_used || null,
          custom_fields: finalCustomFields,
          timezone: tzFields.timezone,
          timezone_source: tzFields.timezone_source,
        })
        .eq('id', activeLead.id)
        .select()
        .single();

      if (error) throw error;
      setLeads(prev => prev.map(l => l.id === activeLead.id ? data : l));
      // Only re-trigger checkpoint/reminder logic if the status was actually changed
      if (leadForm.status !== activeLead.status) {
        await updateLeadStatusAndCheckpoint({
          lead: data,
          newStatus: leadForm.status,
          suggestionRules,
          currentUser
        });
        if (leadForm.status === 'Closed Won') {
          celebrateClosedWon();
        }
      }
      setShowEditLeadModal(false);
      if (onRefreshReminders) onRefreshReminders();
    } catch (err) {
      console.error('Error updating lead:', err);
    }
  };

  // Handle lead status inline change (with Reply Prompt triggers)
  const handleStatusChange = async (leadId, newStatus) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const lowerStatus = newStatus.toLowerCase().replace(/[\s_]+/g, '_');
    const isReplyTrigger = ['positive_reply', 'booked'].includes(lowerStatus);

    if (isReplyTrigger && !lead.reply_type) {
      // Show Reply Prompt Modal
      setReplyPromptLead(lead);
      setReplyPromptStatus(newStatus);
      setReplyType('positive');
      setReplyTemplateId('');
      setReplyNotes('');
      setNextStep(null);
      setNextStepLink('');
      return;
    }

    try {
      const updatedLead = await updateLeadStatusAndCheckpoint({
        lead,
        newStatus,
        suggestionRules,
        currentUser
      });

      if (updatedLead?.draftCreated && showToast) {
        showToast(`Draft invoice generated for ${[updatedLead.first_name, updatedLead.last_name].filter(Boolean).join(' ') || 'Lead'}`);
      }

      setLeads(prev => prev.map(l => l.id === leadId ? updatedLead : l));
      if (onRefreshReminders) onRefreshReminders();

      if (newStatus === 'Closed Won' && lead.status !== 'Closed Won') {
        celebrateClosedWon();
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleCallStatusChange = async (leadId, newCallStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || !currentUser?.id) return null;

    try {
      const result = await logCallStatusChange({
        userId: currentUser.id,
        leadId,
        newCallStatus,
        teamId: currentUser.team_id || null,
        timeZone: getEffectiveUserTimeZone(currentUser),
        profile: currentUser,
      });
      if (!result) return null;

      setLeads((prev) => prev.map((l) => (
        l.id === leadId ? { ...l, ...result.leadUpdates } : l
      )));
      if (onRefreshReminders) onRefreshReminders();
      return result;
    } catch (err) {
      console.error('Error updating call status:', err);
      return null;
    }
  };

  const refreshCallStatuses = async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from('custom_statuses')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('channel', 'calls')
      .order('sort_order', { ascending: true });
    if (data?.length) setCallStatuses(data);
  };

  const handleCallLeadUpdated = (leadUpdates) => {
    if (!leadUpdates?.id) return;
    setLeads((prev) => prev.map((l) => (
      l.id === leadUpdates.id ? { ...l, ...leadUpdates } : l
    )));
  };

  // Save Reply Type Prompt
  const handleSaveReplyPrompt = async (forcedNextStep = null, forcedLink = null) => {
    if (!replyPromptLead) return;
    try {
      const repType = replyType === 'skip' ? null : replyType;

      // 1. Insert Outreach Log
      const { error: logErr } = await supabase.from('outreach_log').insert({
        user_id: currentUser.id,
        lead_id: replyPromptLead.id,
        template_id: replyTemplateId || null,
        reply_received: replyType !== 'skip',
        reply_type: repType,
        reply_notes: replyNotes,
        sent: true,
        sent_at: new Date().toISOString()
      });

      if (logErr) throw logErr;

      // Determine next status and custom action_to_take if user chose proposal/meeting step
      let targetStatus = replyPromptStatus;
      const extraUpdates = {
        reply_type: repType,
        template_used: replyTemplateId || null
      };

      const isBooked = (replyPromptStatus || '').toLowerCase() === 'booked';
      const activeNextStep = forcedNextStep !== null ? forcedNextStep : nextStep;
      const activeLink = forcedLink !== null ? forcedLink : nextStepLink;

      if (replyType === 'positive' && !isBooked) {
        if (activeNextStep === 'proposal') {
          targetStatus = 'Proposal Sent';
          if (activeLink) {
            extraUpdates.action_to_take = activeLink;
          }
        } else if (activeNextStep === 'meeting') {
          targetStatus = 'Invite Sent';
          if (activeLink) {
            extraUpdates.action_to_take = activeLink;
          }
        }
      }

      // 2. Update Lead status and reply details via unified checkpoint logic
      const updatedLead = await updateLeadStatusAndCheckpoint({
        lead: replyPromptLead,
        newStatus: targetStatus,
        suggestionRules,
        currentUser,
        extraUpdates
      });

      if (updatedLead?.draftCreated && showToast) {
        showToast(`Draft invoice generated for ${[updatedLead.first_name, updatedLead.last_name].filter(Boolean).join(' ') || 'Lead'}`);
      }

      const replySummary = replyType === 'skip'
        ? 'Reply skipped'
        : `Reply logged${repType ? `: ${repType}` : ''}`;
      logLeadTimelineEvent({
        leadId: replyPromptLead.id,
        userId: currentUser.id,
        teamId: currentUser.team_id || null,
        eventType: 'reply_logged',
        summary: replySummary,
        detail: {
          reply_type: repType,
          reply_notes: replyNotes || null,
          template_id: replyTemplateId || null,
          new_status: targetStatus,
        },
        timeZone: getEffectiveUserTimeZone(currentUser),
      }).catch(() => {});

      setLeads(prev => prev.map(l => l.id === replyPromptLead.id ? updatedLead : l));
      setReplyPromptLead(null);
      setNextStep(null);
      setNextStepLink('');
      if (onRefreshReminders) onRefreshReminders();
    } catch (err) {
      console.error('Error saving reply prompt:', err);
    }
  };

  // Convert to Client
  const handleConvertSubmit = async (lead, clientData) => {
    try {
      // 1. Update Lead lifecycle stage and status to Client
      const updatedLead = await updateLeadStatusAndCheckpoint({
        lead,
        newStatus: 'Client',
        suggestionRules,
        currentUser,
        extraUpdates: { lifecycle_stage: 'client' }
      });

      // 2. Insert into Clients
      const { data: newClient, error: clientErr } = await supabase.from('clients')
        .insert({
          lead_id: lead.id,
          user_id: currentUser.id,
          ...clientData,
          contract_value: clientData.contract_value ? parseFloat(clientData.contract_value) : null
        })
        .select()
        .single();
      
      if (clientErr) throw clientErr;

      // 2b. Link existing lead_notes to this new client
      await supabase.from('lead_notes')
        .update({ client_id: newClient.id })
        .eq('lead_id', lead.id);

      // 3. Update States
      setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));
      setClients(prev => [newClient, ...prev]);
      setConvertingLead(null);
      
      // Optionally update selectedLead if the drawer is open
      if (selectedLead && selectedLead.id === lead.id) {
        setSelectedLead(updatedLead);
      }
      if (activeLead && activeLead.id === lead.id) {
        setActiveLead(updatedLead);
      }
      
      alert('Successfully converted to client!');
    } catch (err) {
      console.error('Error converting lead to client:', err);
      alert('Failed to convert: ' + err.message);
    }
  };

  // ── Folders Management CRUD ───────────────────────────────────────────────

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.from('folders')
        .insert({
          user_id: currentUser.id,
          assignee_id: currentUser.id,
          name: folderForm.name,
          color: folderForm.color,
          sort_order: folders.length
        })
        .select()
        .single();

      if (error) throw error;
      setFolders(prev => [...prev, data]);
      setFolderForm({ name: '', color: '#A3A3A3' });
      setShowFolderModal(false);
      handleSelectFolder(data.id);
    } catch (err) {
      console.error('Error creating folder:', err);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    const leadsInFolder = leads.filter(l => l.folder_id === folderId);
    
    let deleteLeads = false;
    if (leadsInFolder.length > 0) {
      const choice = window.confirm(
        `Folder contains ${leadsInFolder.length} leads. \n\nClick [OK] to move leads to "All Leads".\nClick [Cancel] to delete all leads inside this folder too.`
      );
      deleteLeads = !choice;
    } else {
      if (!confirm('Delete this folder?')) return;
    }

    try {
      if (deleteLeads) {
        const leadIds = leadsInFolder.map(l => l.id);
        // Delete logs, then leads
        await supabase.from('outreach_log').delete().in('lead_id', leadIds);
        await supabase.from('leads').delete().in('id', leadIds);
        setLeads(prev => prev.filter(l => l.folder_id !== folderId));
      } else {
        // Remove leads folder reference
        await supabase.from('leads').update({ folder_id: null }).eq('folder_id', folderId);
        setLeads(prev => prev.map(l => l.folder_id === folderId ? { ...l, folder_id: null } : l));
      }

      await supabase.from('folders').delete().eq('id', folderId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      if (activeFolderId === folderId) handleSelectFolder('home');
    } catch (err) {
      console.error('Error deleting folder:', err);
    }
  };

  const handleDeleteSmartFolder = async (folderId) => {
    if (!confirm('Delete this smart folder?')) return;
    try {
      await supabase.from('user_folders').delete().eq('id', folderId);
      setUserFolders(prev => prev.filter(uf => uf.id !== folderId));
      if (activeFolderId === folderId) handleSelectFolder('home');
    } catch (err) {
      console.error('Error deleting smart folder:', err);
    }
  };

  const matchRule = (lead, rule) => {
    const { field, operator, value } = rule;
    if (!field) return true;
    if (value == null || String(value).trim() === '') return false;
    
    let leadValue = '';
    if (field === 'Status') {
      leadValue = lead.status || '';
    } else if (field === 'Priority') {
      leadValue = lead.priority || '';
    } else if (field === 'Tag') {
      leadValue = lead.niche || lead.tags || lead.tag || '';
    } else if (field === 'Channel') {
      leadValue = lead.outreach_channel || '';
    }

    const leadStr = String(leadValue).toLowerCase();
    const ruleStr = String(value).toLowerCase();

    let isMatch = leadStr === ruleStr;
    if (field === 'Status') {
      const normalizeStatus = (val) => {
        if (!val) return '';
        const lower = val.toLowerCase().trim();
        if (lower === 'booked' || lower === 'call booked') return 'booked';
        if (lower === 'no show' || lower === 'no show / rescheduled') return 'no show';
        return lower.replace(/_/g, ' ');
      };
      isMatch = normalizeStatus(leadValue) === normalizeStatus(value);
    } else if (field === 'Priority') {
      isMatch = leadStr === ruleStr || matchesPriority(leadValue, value);
    }

    if (operator === 'is') {
      return isMatch;
    } else if (operator === 'is not') {
      return !isMatch;
    }
    return true;
  };

  const matchesPriority = (leadPriority, filterValue) => {
    if (!filterValue || filterValue === 'All') return true;
    if (!leadPriority) return false;
    
    const norm = leadPriority.toLowerCase();
    if (filterValue === 'High') {
      return norm.includes('hot') || norm.includes('high');
    }
    if (filterValue === 'Medium') {
      return norm.includes('warm') || norm.includes('medium');
    }
    if (filterValue === 'Low') {
      return norm.includes('cold') || norm.includes('low');
    }
    return false;
  };

  const leadMatchesFolder = (lead, folderId) => {
    if (!folderId || folderId === 'all') return true;
    if (folderId === 'unfiled') return !lead.folder_id;
    if (folderId === 'hot') return lead.priority?.toLowerCase() === 'hot';
    if (folderId === 'warm') return lead.priority?.toLowerCase() === 'warm';
    if (folderId === 'cold') return lead.priority?.toLowerCase() === 'cold';
    if (folderId === 'needs-followup') {
      return lead.next_checkpoint_at && new Date(lead.next_checkpoint_at) <= new Date();
    }
    if (folderId === 'recently-followed-up') {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      return lead.last_contacted_at && new Date(lead.last_contacted_at) >= fiveDaysAgo;
    }
    if (folderId === 'calendly') {
      return lead.status?.toLowerCase() === 'calendly_sent' || lead.status === 'Invite Sent';
    }
    if (folderId === 'clients') return isClientStatus(lead.status);

    const smartFolder = userFolders.find((uf) => uf.id === folderId);
    if (smartFolder) {
      const rules = smartFolder.filter_config?.rules || [];
      return rules.length === 0 || rules.every((rule) => matchRule(lead, rule));
    }
    if (folders.find((f) => f.id === folderId)) {
      return lead.folder_id === folderId;
    }
    return true;
  };

  const getLeadCountForFolder = (folderId) => leads.filter((l) => leadMatchesFolder(l, folderId)).length;

  const getActiveFolderLabel = () => {
    if (!activeFolderId || activeFolderId === 'all') return systemFolderNames.all || 'All Leads';
    if (activeFolderId === 'unfiled') return 'Unfiled leads';
    const systemLabels = {
      hot: systemFolderNames.hot || 'Hot',
      warm: systemFolderNames.warm || 'Warm',
      cold: systemFolderNames.cold || 'Cold',
      'needs-followup': systemFolderNames['needs-followup'] || 'Needs Follow-Up',
      'recently-followed-up': systemFolderNames['recently-followed-up'] || 'Recently Followed Up',
      calendly: systemFolderNames.calendly || 'Invite Sent',
      clients: systemFolderNames.clients || 'Clients',
    };
    if (systemLabels[activeFolderId]) return systemLabels[activeFolderId];
    const manual = folders.find((f) => f.id === activeFolderId);
    if (manual) return manual.name;
    const smart = userFolders.find((uf) => uf.id === activeFolderId);
    if (smart) return smart.name;
    return 'List';
  };

  const handleRenameFolder = async (folderId, newName) => {
    if (['all', 'hot', 'warm', 'cold', 'needs-followup', 'recently-followed-up', 'calendly', 'clients'].includes(folderId)) {
      setSystemFolderNames(prev => {
        const next = { ...prev, [folderId]: newName };
        localStorage.setItem('crm_system_folder_names', JSON.stringify(next));
        return next;
      });
      return;
    }
    const smartFolder = userFolders.find((uf) => uf.id === folderId);
    if (smartFolder) {
      try {
        const { error } = await supabase.from('user_folders')
          .update({ name: newName })
          .eq('id', folderId);
        if (error) throw error;
        setUserFolders((prev) => prev.map((uf) => (uf.id === folderId ? { ...uf, name: newName } : uf)));
      } catch (err) {
        console.error('Error renaming smart folder:', err);
      }
      return;
    }
    try {
      const { error } = await supabase.from('folders')
        .update({ name: newName })
        .eq('id', folderId);
      if (error) throw error;
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
    } catch (err) {
      console.error('Error renaming folder:', err);
    }
  };

  const triggerRename = (folderId, currentName) => {
    const newName = prompt('Enter new folder name:', currentName);
    if (newName && newName.trim()) {
      handleRenameFolder(folderId, newName.trim());
    }
  };

  const handleAssignFolder = async (folderId, assigneeId, table = 'folders') => {
    if (!folderId || !assigneeId) return;
    try {
      const { error } = await supabase.from(table)
        .update({ assignee_id: assigneeId })
        .eq('id', folderId);
      if (error) throw error;
      if (table === 'user_folders') {
        setUserFolders((prev) => prev.map((uf) => (
          uf.id === folderId ? { ...uf, assignee_id: assigneeId } : uf
        )));
      } else {
        setFolders((prev) => prev.map((f) => (
          f.id === folderId ? { ...f, assignee_id: assigneeId } : f
        )));
      }
    } catch (err) {
      console.error('Error assigning folder:', err);
      alert(err.message || 'Could not update assignee');
    }
  };

  // ── Bulk Actions & Quick Clean ────────────────────────────────────────────

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = (filteredLeads) => {
    const allIds = filteredLeads.map(l => l.id);
    const areAllSelected = allIds.every(id => selectedIds.includes(id));
    if (areAllSelected) {
      setSelectedIds(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...allIds])));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} leads?`)) return;

    try {
      await supabase.from('outreach_log').delete().in('lead_id', selectedIds);
      await supabase.from('leads').delete().in('id', selectedIds);

      setLeads(prev => prev.filter(l => !selectedIds.includes(l.id)));
      setSelectedIds([]);
    } catch (err) {
      console.error('Error during bulk delete:', err);
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    try {
      const updatedLeads = await Promise.all(
        selectedIds.map(id => {
          const lead = leads.find(l => l.id === id);
          return updateLeadStatusAndCheckpoint({
            lead,
            newStatus,
            suggestionRules,
            currentUser
          });
        })
      );

      const draftsCreated = updatedLeads.filter(l => l?.draftCreated);
      if (draftsCreated.length > 0 && showToast) {
        if (draftsCreated.length === 1) {
          const u = draftsCreated[0];
          showToast(`Draft invoice generated for ${[u.first_name, u.last_name].filter(Boolean).join(' ') || 'Lead'}`);
        } else {
          showToast(`Draft invoices generated for ${draftsCreated.length} leads`);
        }
      }

      setLeads(prev => prev.map(l => {
        const u = updatedLeads.find(item => item.id === l.id);
        return u ? u : l;
      }));

      // Trigger confetti if status changed to Closed Won
      if (newStatus === 'Closed Won') {
        const anyChangedToClosedWon = selectedIds.some(id => {
          const lead = leads.find(l => l.id === id);
          return lead && lead.status !== 'Closed Won';
        });
        if (anyChangedToClosedWon) {
          celebrateClosedWon();
        }
      }

      setSelectedIds([]);
      setShowBulkStatusMenu(false);
      if (onRefreshReminders) onRefreshReminders();
    } catch (err) {
      console.error('Error during bulk status update:', err);
    }
  };

  const handleBulkChannelChange = async (newChannel) => {
    try {
      await supabase.from('leads')
        .update({ outreach_channel: newChannel })
        .in('id', selectedIds)
        .eq('user_id', currentUser.id);

      setLeads(prev => prev.map(l => selectedIds.includes(l.id) ? { ...l, outreach_channel: newChannel } : l));
      setSelectedIds([]);
      setShowBulkChannelMenu(false);
    } catch (err) {
      console.error('Error during bulk channel update:', err);
    }
  };

  const handleBulkMoveToFolder = async (folderId) => {
    try {
      const fid = folderId || null;
      await supabase.from('leads').update({ folder_id: fid }).in('id', selectedIds);
      setLeads(prev => prev.map(l => selectedIds.includes(l.id) ? { ...l, folder_id: fid } : l));
      setSelectedIds([]);
    } catch (err) {
      console.error('Error during bulk folder movement:', err);
    }
  };

  const handleBulkMoveAllInViewToFolder = async (folderId) => {
    if (!folderId) return;
    const ids = sortedLeads.map((l) => l.id);
    if (ids.length === 0) return;
    try {
      await supabase.from('leads').update({ folder_id: folderId }).in('id', ids);
      setLeads((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, folder_id: folderId } : l)));
      setSelectedIds([]);
    } catch (err) {
      console.error('Error assigning all leads in view:', err);
      alert(err.message || 'Failed to assign leads to list.');
    }
  };

  const handleQuickCleanSelect = (type) => {
    setShowCrmMoreMenu(false);
    if (type === 'not_interested') {
      setSelectedIds(leads.filter(l => l.status === 'Not Interested').map(l => l.id));
    } else if (type === 'no_reply_24h') {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      setSelectedIds(leads.filter(l => 
        l.status === 'Contacted' && !l.reply_type && new Date(l.created_at) < oneDayAgo
      ).map(l => l.id));
    } else if (type === 'current_folder') {
      setSelectedIds(leads.filter(l => l.folder_id === activeManualFolderId).map(l => l.id));
    }
  };

  // ── CSV Import ────────────────────────────────────────────────────────────

  const handleImportCSVSubmit = async (e) => {
    e.preventDefault();
    if (!canBulkImport) {
      setShowBulkImportUpgradeModal(true);
      return;
    }
    if (isLeadLimitReached) {
      alert('Lead limit reached. Delete leads or upgrade to import more.');
      return;
    }

    const lines = importText.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      alert('CSV must contain a header row and at least one lead row.');
      return;
    }

    // Simple parser
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const firstIdx = headers.indexOf('first name') !== -1 ? headers.indexOf('first name') : headers.indexOf('name');
    const lastIdx = headers.indexOf('last name');
    const emailIdx = headers.indexOf('email');
    const companyIdx = headers.indexOf('company');
    const phoneIdx = headers.indexOf('phone');
    const roleIdx = headers.indexOf('role');

    // Only first name (or name) column is required
    if (firstIdx === -1) {
      alert('CSV headers must include a "First Name" or "Name" column.');
      return;
    }

    const importedLeads = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < headers.length) continue;

      let fName = cols[firstIdx] || '';
      let lName = lastIdx !== -1 ? cols[lastIdx] : '';

      // Split first/last name if only Name was supplied
      if (firstIdx !== -1 && lastIdx === -1) {
        const nameParts = fName.split(' ');
        fName = nameParts[0] || '';
        lName = nameParts.slice(1).join(' ') || '';
      }

      importedLeads.push({
        user_id: currentUser.id,
        first_name: fName,
        last_name: lName,
        email: emailIdx !== -1 ? (cols[emailIdx] || '') : '',
        phone: phoneIdx !== -1 ? (cols[phoneIdx] || '') : '',
        company: companyIdx !== -1 ? cols[companyIdx] : '',
        platform: 'LinkedIn',
        status: statuses[0]?.label || 'Lead',
        priority: 'Warm',
        niche: roleIdx !== -1 ? cols[roleIdx] : '',
        folder_id: activeManualFolderId || null
      });
    }

    try {
      const { toImport, skippedCount } = await prepareBulkImport(currentUser.id, importedLeads);

      let data = [];
      if (toImport.length > 0) {
        const { data: insertedData, error } = await supabase.from('leads').insert(toImport).select();
        if (error) throw error;
        data = insertedData || [];
        setLeads(prev => [...data, ...prev]);
      }

      setShowImportModal(false);
      setImportText('');

      if (skippedCount > 0) {
        setImportResult({ imported: toImport.length, skipped: skippedCount });
      } else {
        alert(`Imported ${data.length} leads successfully!`);
      }
    } catch (err) {
      console.error('Error importing leads:', err);
    }
  };

  // ── Render Helpers ────────────────────────────────────────────────────────

  const getStatusStyle = (statusVal) => {
    const match = statuses.find(s => s.label.toLowerCase() === (statusVal || '').toLowerCase());
    if (match) {
      return {
        ...softBadgeStyle(match.color),
        borderRadius: '6px',
        padding: '0.2rem 0.55rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      };
    }
    return {
      background: '#374151',
      color: '#D1D5DB',
      border: '1px solid rgba(209,213,219,0.3)',
      borderRadius: '6px',
      padding: '0.2rem 0.55rem',
      fontSize: '0.75rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    };
  };

  const filteredLeads = leads.filter(l => {
    // Search
    const fullSearch = `${l.first_name || ''} ${l.last_name || ''} ${l.company || ''} ${l.email || ''}`.toLowerCase();
    const searchMatch = fullSearch.includes(searchQuery.toLowerCase());

    // Folder filter — browse mode shows the list picker instead of the table
    let folderMatch = true;
    if (!isBrowseMode && activeFolderId) {
      folderMatch = leadMatchesFolder(l, activeFolderId);
    } else if (!isBrowseMode) {
      folderMatch = true;
    }

    // Status filter matches case-insensitively (supports code and labels)
    const statusMatch = !statusFilter || (() => {
      const normalizeStatus = (val) => {
        if (!val) return '';
        const lower = val.toLowerCase().trim();
        if (lower === 'booked' || lower === 'call booked') return 'booked';
        if (lower === 'no show' || lower === 'no show / rescheduled') return 'no show';
        return lower.replace(/_/g, ' ');
      };
      const statusValue = outreachMode === 'calls' && callSubView === 'queue'
        ? displayCallStatus(l.call_status)
        : l.status;
      return normalizeStatus(statusValue) === normalizeStatus(statusFilter);
    })();

    // Priority filter matches via helper
    const priorityMatch = matchesPriority(l.priority, priorityFilter);

    // Multi-select status filter from Drawer
    const statusDrawerMatch = filterStatuses.length === 0 || 
      filterStatuses.includes(l.status);

    // Multi-select priority filter from Drawer
    const priorityDrawerMatch = filterPriorities.length === 0 ||
      filterPriorities.includes(l.priority);

    // Multi-select action filter from Drawer
    const actionDrawerMatch = filterActions.length === 0 ||
      filterActions.includes(l.action_to_take);

    // Multi-select project filter from Drawer (supports null/undefined comparison dynamically)
    const projectDrawerMatch = filterProjects.length === 0 ||
      filterProjects.includes(l.project);

    // Date range filter
    let dateRangeMatch = true;
    if (filterDateRange !== 'all') {
      const dateVal = l[filterDateField];
      if (!dateVal) {
        dateRangeMatch = false;
      } else {
        const dateMs = new Date(dateVal).getTime();
        const nowMs = Date.now();
        if (filterDateRange === 'today') {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          dateRangeMatch = dateMs >= startOfToday.getTime();
        } else if (filterDateRange === '7days') {
          const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
          dateRangeMatch = dateMs >= sevenDaysAgo;
        } else if (filterDateRange === '30days') {
          const thirtyDaysAgo = nowMs - 30 * 24 * 60 * 60 * 1000;
          dateRangeMatch = dateMs >= thirtyDaysAgo;
        }
      }
    }
    // Multi-select call-action filter (Cold Calls mode)
    const callActionMatch = filterCallActions.length === 0 ||
      filterCallActions.includes(l.call_action);

    return searchMatch && folderMatch && statusMatch && priorityMatch && statusDrawerMatch && priorityDrawerMatch && actionDrawerMatch && callActionMatch && projectDrawerMatch && dateRangeMatch;
  });

  // Apply sort
  const sortedLeads = [...filteredLeads].sort((a, b) => {
    switch (sortOption) {
      case 'newest':
        return new Date(b.created_at) - new Date(a.created_at) || (a.id || '').localeCompare(b.id || '');
      
      case 'contacted': {
        const aDate = a.last_contacted_at ? new Date(a.last_contacted_at) : new Date(0);
        const bDate = b.last_contacted_at ? new Date(b.last_contacted_at) : new Date(0);
        return bDate - aDate;
      }
      
      case 'hot': {
        const priorityOrder = { 'Hot': 0, 'Warm': 1, 'Cold': 2 };
        const aPriority = priorityOrder[a.priority] ?? 3;
        const bPriority = priorityOrder[b.priority] ?? 3;
        return aPriority - bPriority;
      }
      
      case 'name': {
        const aName = (a.first_name || '').toLowerCase();
        const bName = (b.first_name || '').toLowerCase();
        return aName.localeCompare(bName);
      }
      
      case 'status': {
        if (outreachMode === 'calls' && callSubView === 'queue') {
          const callStatusOrder = DEFAULT_CALL_STATUSES.map((s) => s.label.toLowerCase());
          const aStatus = callStatusOrder.indexOf(displayCallStatus(a.call_status).toLowerCase());
          const bStatus = callStatusOrder.indexOf(displayCallStatus(b.call_status).toLowerCase());
          return (aStatus === -1 ? 99 : aStatus) - (bStatus === -1 ? 99 : bStatus);
        }
        const statusOrder = [
          'lead',
          'contacted',
          'waiting',
          'positive reply',
          'proposal sent',
          'Invite Sent',
          'booked',
          'no show',
          'no show / rescheduled',
          'rescheduled',
          'followed up',
          'not interested',
          'closed won',
          'client'
        ];
        const aStatus = statusOrder.indexOf((a.status || '').toLowerCase().trim());
        const bStatus = statusOrder.indexOf((b.status || '').toLowerCase().trim());
        return (aStatus === -1 ? 99 : aStatus) - (bStatus === -1 ? 99 : bStatus);
      }

      case 'call_now': {
        const score = (lead) => {
          const action = (lead.call_action || '').trim();
          if (action === 'Call now') return 0;
          if (!action) return 1;
          if (action === 'Callback scheduled') return 2;
          if (action === 'Try again tomorrow') return 4;
          return 3;
        };
        return score(a) - score(b);
      }
      
      default:
        return 0;
    }
  });

  const listLeadIdSet = useMemo(() => new Set(sortedLeads.map((l) => l.id)), [sortedLeads]);

  const filteredClients = clients.filter(c => {
    const fullSearch = `${c.name} ${c.email} ${c.phone}`.toLowerCase();
    const searchMatch = fullSearch.includes(searchQuery.toLowerCase());
    return searchMatch;
  });

  const handleSelectFolder = (id) => {
    resetListFilters();
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === null || id === 'home') {
        next.delete('folder');
      } else {
        next.set('folder', id);
        try {
          const savedMode = localStorage.getItem(`crm_list_mode_${id}`)
            || localStorage.getItem('crm_outreach_mode')
            || 'messages';
          next.set('mode', savedMode);
          if (savedMode === 'calls') {
            if (!next.get('callView')) next.set('callView', 'queue');
          } else {
            next.delete('callView');
            if (!next.get('view') || next.get('view') === 'outreach') next.set('view', 'pipeline');
          }
        } catch { /* ignore */ }
      }
      return next;
    });
    if (view === 'clients' && id !== 'home' && id !== null) {
      handleViewChange('contact_details');
    }
  };

  const activeList = view === 'clients' ? filteredClients : sortedLeads;
  const totalFiltered = activeList.length;
  const folderListTotal = !isBrowseMode && activeFolderId && view !== 'clients'
    ? getLeadCountForFolder(activeFolderId)
    : null;
  const paginatedList = activeList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const currentExportFolder = folders.find((f) => f.id === activeFolderId);
  const canExportCurrentFolder = !!currentExportFolder && view !== 'clients';

  const slugifyExportLabel = (label) => String(label || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';

  const getFolderExportOptions = (folderId) => ({
    includeLocalTime: !!getListFolderSettings(folderId).showLocalTime,
    defaultCountryCode: currentUser?.default_country_code || '+92',
  });

  const handleExportLeadsSubset = async (subset, label = 'all', options = {}) => {
    if (exporting) return;
    setExporting('leads');
    setShowCrmMoreMenu(false);
    try {
      const filename = label === 'all'
        ? 'reachdesk-leads.csv'
        : `reachdesk-leads-${slugifyExportLabel(label)}.csv`;
      await exportLeads(currentUser.id, subset, filename, options);
    } catch (err) {
      console.error('Export leads error:', err);
      alert('Failed to export leads: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleExportFolder = (folderId) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const subset = leads.filter((l) => l.folder_id === folderId);
    handleExportLeadsSubset(subset, folder.name, getFolderExportOptions(folderId));
  };

  const handleExportFolderSheets = (folderId) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const subset = leads.filter((l) => l.folder_id === folderId);
    openExportSheetsForLeads(subset, getFolderExportOptions(folderId));
  };

  const handleToggleFolderLocalTime = (folderId, showLocalTime) => {
    setListFolderSettings(folderId, { showLocalTime });
    setListSettingsTick((t) => t + 1);
  };

  const openExportSheetsForLeads = (subset, options = {}) => {
    setShowCrmMoreMenu(false);
    if (!sheetsConnected || sheetsNeedsReconnect) {
      startGoogleSheetsOAuth(`${window.location.pathname}${window.location.search}`);
      return;
    }
    setExportSheetsOptions(options);
    setExportSheetsLeads(subset);
    setShowExportSheetsModal(true);
  };



  return (
    <div
      className={`crm-workspace flex w-full${isBrowseMode ? '' : ' crm-workspace--list'}${rootClass}`}
      style={isBrowseMode ? undefined : { minHeight: 'calc(100vh - 120px)' }}
    >
      {/* Leads Table Content Section — no Lists sidebar; switch lists via breadcrumb */}
      <div className={`flex-col gap-4 page-stack${blockClass}`} style={{ flex: isBrowseMode ? undefined : 1, textAlign: 'left', minWidth: 0, width: '100%' }}>
        {canUseIntegrations && sheetsNeedsReconnect && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: 8,
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}>
            <span>
              Reconnect Google Sheets to continue importing and exporting. Google now requires updated access permissions.
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => startGoogleSheetsOAuth(`${window.location.pathname}${window.location.search}`)}
            >
              Reconnect Sheets
            </button>
          </div>
        )}
        {isBrowseMode ? (
          <FolderBrowser
            folders={folders}
            userFolders={userFolders}
            systemFolderNames={systemFolderNames}
            getLeadCount={getLeadCountForFolder}
            totalLeads={leads.length}
            unfiledCount={getLeadCountForFolder('unfiled')}
            onSelectFolder={handleSelectFolder}
            onCreateList={() => setShowFolderModal(true)}
            onCreateSmartList={() => {
              setSmartFolderForm({ name: '', rules: [{ field: 'Status', operator: 'is', value: '' }] });
              setShowSmartFolderModal(true);
            }}
            onImportCsv={() => handleOpenBulkImport(() => setShowCSVImporter(true))}
            onImportSheets={() => setShowSheetsImportModal(true)}
            onRenameFolder={triggerRename}
            onDeleteFolder={handleDeleteFolder}
            onDeleteSmartFolder={handleDeleteSmartFolder}
            onExportFolder={handleExportFolder}
            onExportFolderSheets={handleExportFolderSheets}
            onShareFolder={async (folder) => {
              try {
                const shares = await fetchSharesForFolder(folder.id);
                setShareListShares(shares);
                setShareListTarget(folder);
              } catch (err) {
                alert(err.message || 'Could not load list sharing');
              }
            }}
            canExportSheets={canUseIntegrations}
            getFolderSettings={getListFolderSettings}
            onToggleFolderLocalTime={handleToggleFolderLocalTime}
            canBulkImport={canBulkImport}
            canUseIntegrations={canUseIntegrations}
            hasLeads={leads.length > 0}
            currentUser={currentUser}
            teamProfilesMap={effectiveProfilesMap}
            teamIds={teamIds}
            folderShares={folderShares}
            shareCountForFolder={(folderId) => countSharesForFolder(folderId, folderShares)}
            canShareFolder={(folder) => userCanShareFolder(folder, currentUser)}
            onAssignFolder={handleAssignFolder}
          />
        ) : (
        <>
        <nav className="crm-list-breadcrumb" aria-label="List location">
          <button type="button" className="crm-list-breadcrumb-link" onClick={() => handleSelectFolder('home')}>
            Lists
          </button>
          <ChevronRight size={14} className="crm-list-breadcrumb-sep" aria-hidden />
          <ListSwitcher
            activeFolderId={activeFolderId}
            currentLabel={getActiveFolderLabel()}
            folders={folders}
            userFolders={userFolders}
            systemFolderNames={systemFolderNames}
            getLeadCount={getLeadCountForFolder}
            onSelectFolder={handleSelectFolder}
            teamProfilesMap={effectiveProfilesMap}
            currentUserId={currentUser?.id}
          />
          {!isBrowseMode && folders.length > 0 && activeList.length > 0 && (
            <select
              className="form-select btn-sm"
              defaultValue=""
              style={{ marginLeft: '0.5rem', maxWidth: 180, fontSize: '0.8rem' }}
              onChange={(e) => {
                const val = e.target.value;
                if (val) handleBulkMoveAllInViewToFolder(val);
                e.target.value = '';
              }}
            >
              <option value="" disabled>Assign all {activeList.length} in view…</option>
              {folders.filter((f) => f.user_id === currentUser?.id).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}
        </nav>

        {/* Outreach mode switcher */}
        <div
          className="flex gap-2"
          style={{
            marginBottom: '0.75rem',
            padding: '0.25rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            width: 'fit-content',
          }}
        >
          <button
            type="button"
            onClick={() => handleModeChange('messages')}
            className={`btn btn-sm ${outreachMode === 'messages' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '6px' }}
          >
            <Mail size={13} /> Message Outreach
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('calls')}
            className={`btn btn-sm ${outreachMode === 'calls' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Phone size={13} /> Cold Calls
          </button>
        </div>

        {outreachMode === 'messages' ? (
        <>
        {/* Message sub-views */}
        <div className="crm-tabs">
          <button
            type="button"
            onClick={() => handleViewChange('contact_details')}
            className={`crm-tab ${view === 'contact_details' ? 'crm-tab--active' : ''}`}
          >
            Contact Details
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('pipeline')}
            className={`crm-tab ${view === 'pipeline' ? 'crm-tab--active' : ''}`}
          >
            Pipeline View
          </button>
        </div>
        </>
        ) : (
        <>
        {/* Calls sub-views */}
        <div className="crm-tabs">
          <button
            type="button"
            onClick={() => handleCallSubViewChange('queue')}
            className={`crm-tab ${callSubView === 'queue' ? 'crm-tab--active' : ''}`}
          >
            Call Queue
          </button>
          <button
            type="button"
            onClick={() => handleCallSubViewChange('log')}
            className={`crm-tab ${callSubView === 'log' ? 'crm-tab--active' : ''}`}
          >
            Call Log
          </button>
        </div>
        </>
        )}

        {outreachMode === 'calls' ? (
          callSubView === 'queue' ? (
            <>
            <div className="flex justify-between align-center" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
              <div className="flex gap-2 align-center" style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search leads…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input w-full"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>
              <div className="flex gap-2 align-center" style={{ flexWrap: 'wrap' }}>
                <select
                  className="form-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ width: 'auto', minWidth: 130, fontSize: '0.85rem' }}
                >
                  <option value="">Status: All</option>
                  {(callStatuses.length > 0 ? callStatuses : DEFAULT_CALL_STATUSES).map((st) => (
                    <option key={st.label} value={st.label}>{st.label}</option>
                  ))}
                </select>
                <select
                  className="form-input"
                  value={filterCallActions[0] || ''}
                  onChange={(e) => setFilterCallActions(e.target.value ? [e.target.value] : [])}
                  style={{ width: 'auto', minWidth: 150, fontSize: '0.85rem' }}
                >
                  <option value="">Call step: All</option>
                  {CALL_ACTION_DEFAULT_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.label}>{opt.label}</option>
                  ))}
                </select>
                <select
                  className="form-input"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  style={{ width: 'auto', minWidth: 140, fontSize: '0.85rem' }}
                >
                  {CALL_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <CallQueueTable
              leads={sortedLeads}
              columnDefs={columnDefs}
              getWidth={getWidth}
              setWidth={setWidth}
              resetWidth={resetWidth}
              getRowHeight={getRowHeight}
              setRowHeight={setRowHeight}
              resetRowHeight={resetRowHeight}
              currentUser={currentUser}
              teamId={currentUser?.team_id || null}
              onOpenLead={handleOpenLead}
              onCallStatusChange={handleCallStatusChange}
              onFieldChange={handleLeadFieldChange}
              onCopied={handleCopyCell}
              onRefresh={refreshCallStatuses}
              onLeadUpdated={handleCallLeadUpdated}
              onOpenColumnManager={() => setShowColumnManager(true)}
              showNoteSharing={!!currentUser?.team_id}
              suggestionRules={suggestionRules}
              templates={templates}
              onUpdateColumnDef={(id, newOpts) => {
                setColumnDefs((prev) => prev.map((c) => (c.id === id ? { ...c, dropdown_options: newOpts } : c)));
              }}
            />
            </>
          ) : (
            <OutreachTracker
              currentUser={currentUser}
              leads={sortedLeads}
              onOpenLead={handleOpenLead}
              embedded
              leadIdSet={listLeadIdSet}
              hideSessionControls
              onGoToQueue={() => handleCallSubViewChange('queue')}
            />
          )
        ) : (
        <>
        {/* Toolbar */}
        <div className="crm-toolbar">
          <div className="crm-toolbar__search">
            <span className="crm-toolbar__search-icon">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input w-full"
            />
          </div>

          <div className="crm-toolbar__actions">
            <div className="crm-toolbar__more">
              <button
                type="button"
                onClick={() => setShowCrmMoreMenu(!showCrmMoreMenu)}
                className="btn btn-secondary btn-sm"
                disabled={!!exporting}
              >
                <MoreVertical size={14} /> More <ChevronDown size={14} />
              </button>
              {showCrmMoreMenu && (
                <div className="crm-more-menu">
                  <div className="crm-more-menu__label">Quick clean</div>
                  <button type="button" onClick={() => handleQuickCleanSelect('not_interested')} className="dropdown-item" style={{ background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}>
                    Select &quot;Not Interested&quot;
                  </button>
                  <button type="button" onClick={() => handleQuickCleanSelect('no_reply_24h')} className="dropdown-item" style={{ background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}>
                    Select No Reply (24h+)
                  </button>
                  <button type="button" onClick={() => handleQuickCleanSelect('current_folder')} className="dropdown-item" style={{ background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}>
                    Select Current Folder
                  </button>

                  <div className="crm-more-menu__divider" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowCrmMoreMenu(false);
                      handleOpenBulkImport(() => setShowNewImportModal(true));
                    }}
                    className="dropdown-item"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}
                    disabled={isLeadLimitReached}
                    title={isLeadLimitReached ? leadLimitTooltip : undefined}
                  >
                    <Upload size={14} /> Import CSV
                  </button>

                  {canUseIntegrations && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowCrmMoreMenu(false);
                        if (!sheetsConnected || sheetsNeedsReconnect) {
                          startGoogleSheetsOAuth(`${window.location.pathname}${window.location.search}`);
                        } else {
                          setShowSheetsImportModal(true);
                        }
                      }}
                      className="dropdown-item"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}
                      disabled={isLeadLimitReached}
                      title={isLeadLimitReached ? leadLimitTooltip : (!sheetsConnectedChecked ? 'Checking connection…' : undefined)}
                    >
                      <Database size={14} />
                      {sheetsNeedsReconnect
                        ? 'Reconnect Sheets to Import'
                        : sheetsConnected
                          ? 'Import from Sheets'
                          : 'Connect Sheets to Import'}
                    </button>
                  )}

                  <div className="crm-more-menu__divider" />
                  <div className="crm-more-menu__label">Export</div>

                  <button type="button" onClick={() => handleExportLeadsClick()} className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}>
                    <Download size={14} /> Export all leads (CSV)
                  </button>
                  {canExportCurrentFolder && (
                    <button
                      type="button"
                      onClick={() => handleExportLeadsSubset(activeList, currentExportFolder.name)}
                      className="dropdown-item"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}
                    >
                      <Download size={14} /> Export this folder (CSV)
                    </button>
                  )}
                  <button type="button" onClick={handleExportNotesClick} className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', width: '100%' }}>
                    <FileText size={14} /> Export Notes (TXT)
                  </button>
                  {canUseIntegrations && (
                    <>
                      <button
                        type="button"
                        onClick={() => openExportSheetsForLeads(leads)}
                        className="dropdown-item"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-secondary)', width: '100%', fontSize: '0.875rem' }}
                      >
                        <Download size={14} />
                        {sheetsNeedsReconnect
                          ? 'Reconnect Sheets to Export'
                          : sheetsConnected
                            ? 'Export all to Google Sheets'
                            : 'Connect Sheets to Export'}
                      </button>
                      {canExportCurrentFolder && sheetsConnected && (
                        <button
                          type="button"
                          onClick={() => openExportSheetsForLeads(activeList, getFolderExportOptions(activeFolderId))}
                          className="dropdown-item"
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer', color: 'var(--text-secondary)', width: '100%', fontSize: '0.875rem' }}
                        >
                          <Download size={14} /> Export folder to Google Sheets
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleOpenAddLead}
              className="btn btn-primary btn-sm"
              disabled={isLeadLimitReached}
              title={isLeadLimitReached ? leadLimitTooltip : undefined}
              style={isLeadLimitReached ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              <Plus size={16} /> Add Lead
            </button>
          </div>
        </div>

        {/* 🔍 Filter Bar Row */}
        {view !== 'clients' && (
          <div className="flex gap-4 align-center" style={{ marginTop: '0.75rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', flexWrap: 'wrap', border: '1px solid var(--border-color)' }}>
            
            <button
              type="button"
              onClick={() => setShowFilterDrawer(true)}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                padding: '0.35rem 0.75rem',
                position: 'relative'
              }}
            >
              <Filter size={14} /> Advanced Filters
              {(filterStatuses.length > 0 || filterPriorities.length > 0 || filterActions.length > 0 || filterProjects.length > 0 || filterDateRange !== 'all') && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--accent-blue)',
                  boxShadow: '0 0 6px var(--accent-blue)'
                }} />
              )}
            </button>

            <div className="flex gap-2 align-center">
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="form-select"
                style={{ minWidth: '150px', fontSize: '0.8rem', padding: '0.35rem 0.5rem', height: 'auto' }}
              >
                <option value="">All</option>
                {statuses.length > 0 ? (
                  statuses.map(s => (
                    <option key={s.id || s.label} value={s.label}>{s.label}</option>
                  ))
                ) : (
                  DEFAULT_STATUSES.map(s => (
                    <option key={s.label} value={s.label}>{s.label}</option>
                  ))
                )}
              </select>
            </div>

            <div className="flex gap-2 align-center">
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Priority:</span>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="form-select"
                style={{ minWidth: '120px', fontSize: '0.8rem', padding: '0.35rem 0.5rem', height: 'auto' }}
              >
                <option value="">All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="sort-btn"
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  height: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="6" y1="12" x2="18" y2="12"/>
                  <line x1="9" y1="18" x2="15" y2="18"/>
                </svg>
                Sort
                {sortOption !== 'newest' && (
                  <span className="sort-active-dot" />
                )}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6,9 12,15 18,9"/>
                </svg>
              </button>

              {sortDropdownOpen && (
                <>
                  {/* Backdrop to close on outside click */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    onClick={() => setSortDropdownOpen(false)}
                  />
                  <div className="sort-dropdown" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`sort-option ${sortOption === opt.value ? 'active' : ''}`}
                        onClick={() => {
                          setSortOption(opt.value);
                          setSortDropdownOpen(false);
                        }}
                      >
                        <span>{opt.label}</span>
                        {sortOption === opt.value && (
                          <svg style={{ marginLeft: 'auto' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20,6 9,17 4,12"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {(statusFilter || priorityFilter || filterStatuses.length > 0 || filterPriorities.length > 0 || filterActions.length > 0 || filterProjects.length > 0 || filterDateRange !== 'all') && (
              <button
                onClick={() => {
                  setStatusFilter('');
                  setPriorityFilter('');
                  handleClearFilters();
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', height: 'auto' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* Bulk Actions Menu Overlay */}
        {selectedIds.length > 0 && (
          <div className="bulk-action-bar">
            <div className="bulk-action-bar__meta">
              <span>{selectedIds.length} leads selected</span>
              {selectedIds.length === paginatedList.length && activeList.length > paginatedList.length && (
                <button 
                  onClick={() => setSelectedIds(activeList.map(l => l.id))} 
                  className="btn btn-secondary btn-sm bulk-action-bar__link"
                >
                  Select all {activeList.length} leads in this view
                </button>
              )}
              {selectedIds.length === activeList.length && activeList.length > paginatedList.length && (
                <button 
                  onClick={() => setSelectedIds(paginatedList.map(l => l.id))} 
                  className="btn btn-secondary btn-sm bulk-action-bar__link"
                >
                  Clear selection (keep current page only)
                </button>
              )}
            </div>
            <div className="bulk-action-bar__actions">
              {/* Change Status Dropdown */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowBulkStatusMenu(!showBulkStatusMenu)} className="btn btn-secondary btn-sm">
                  Change Status ▾
                </button>
                 {showBulkStatusMenu && (
                  <div className="rd-menu rd-menu--anchored" style={{ right: 0, left: 'auto', minWidth: 160, zIndex: 9999 }}>
                    <div className="rd-menu__list">
                      {(statuses.length > 0 ? statuses : DEFAULT_STATUSES).map(s => (
                        <button
                          key={s.label}
                          type="button"
                          className="rd-menu__item"
                          onClick={() => { handleBulkStatusChange(s.label); setShowBulkStatusMenu(false); }}
                        >
                          <span className="rd-menu__item-label">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Change Channel Dropdown */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowBulkChannelMenu(!showBulkChannelMenu)} className="btn btn-secondary btn-sm">
                  Change Channel ▾
                </button>
                 {showBulkChannelMenu && (
                  <div className="rd-menu rd-menu--anchored" style={{ right: 0, left: 'auto', minWidth: 160, zIndex: 9999 }}>
                    <div className="rd-menu__list">
                      {getChannelDefaults('messaging').map(c => (
                        <button
                          key={c.label}
                          type="button"
                          className="rd-menu__item"
                          onClick={() => { handleBulkChannelChange(c.label); setShowBulkChannelMenu(false); }}
                        >
                          <span className="rd-menu__item-label">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {folders.length > 0 && (
                <RdSelect
                  size="sm"
                  ariaLabel="Move to list"
                  placeholder="Move to list"
                  value=""
                  options={[
                    { value: '__unfiled__', label: '(Unfiled)' },
                    ...folders.map((f) => ({ value: f.id, label: f.name })),
                  ]}
                  onChange={(val) => handleBulkMoveToFolder(val === '__unfiled__' ? '' : val)}
                />
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!!exporting}
                onClick={() => {
                  const subset = leads.filter((l) => selectedIds.includes(l.id));
                  handleExportLeadsSubset(subset, 'selected');
                }}
              >
                <Download size={12} /> Export selected
              </button>
              {canUseIntegrations && sheetsConnected && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openExportSheetsForLeads(leads.filter((l) => selectedIds.includes(l.id)))}
                >
                  <Download size={12} /> Sheets
                </button>
              )}

              <button onClick={handleBulkDelete} className="btn btn-danger btn-sm" style={{ backgroundColor: 'var(--danger-color)', color: 'white' }}>
                <Trash2 size={12} /> Delete Selected
              </button>
              
              <button onClick={() => setSelectedIds([])} className="btn btn-secondary btn-sm">
                Clear
              </button>
            </div>
          </div>
        )}

        {/* First Lead Prompt Banner */}
        {(() => {
          const hasOneLeadInState = leads.length === 1 && (leads[0].status || '').toLowerCase() === 'lead';
          const isPromptDismissed = localStorage.getItem('rd_first_lead_prompt_dismissed') === 'true';
          if (hasOneLeadInState && !isPromptDismissed) {
            return (
              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid var(--accent-blue, #5B8FB9)',
                borderRadius: '6px',
                padding: '0.75rem 1.25rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary, #C9D1D9)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Info size={13} style={{ color: 'var(--accent-blue, #5B8FB9)', flexShrink: 0 }} />
                  <span>
                    Great start! Now mark <strong data-ph-mask>{[leads[0].first_name, leads[0].last_name].filter(Boolean).join(' ') || 'your lead'}</strong> as <strong>"Contacted"</strong> to start your automated follow-up sequence.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('rd_first_lead_prompt_dismissed', 'true');
                    // force re-render
                    setLeads([...leads]);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #8B949E)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 600,
                    padding: '2px 6px'
                  }}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            );
          }
          return null;
        })()}

        {/* Lead Table or Empty State */}
        {leads.length === 0 && !loading ? (
          <div className="card empty-state">
            <div className="empty-state-icon" style={{ width: 56, height: 56, color: 'var(--accent-blue)', background: 'var(--bg-selected)', borderColor: 'var(--border)' }}>
              <Users size={28} />
            </div>
            <h3 className="empty-state-title">Your CRM is Empty</h3>
            <p className="empty-state-desc">
              Add your first lead to start tracking outreach, template performance, and automated follow-ups.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
              <button onClick={() => setShowAddLeadModal(true)} className="btn btn-primary">
                <Plus size={14} /> Add Lead Manually
              </button>
              <button onClick={() => handleOpenBulkImport(() => setShowCSVImporter(true))} className="btn btn-secondary">
                <Upload size={14} /> Import CSV
              </button>
              {canUseIntegrations && (
                <button onClick={() => setShowSheetsImportModal(true)} className="btn btn-secondary">
                  <Database size={14} /> Import from Sheets
                </button>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Need help? Read our <Link to="/get-started#how-it-works" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>quick-start guide</Link>.
            </p>
          </div>
        ) : (
          <div className="card crm-leads-table-scroll">
            <table className="data-table data-table--resizable" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--bg-tertiary)' }}>
                <th style={{ width: '40px', minWidth: '40px', maxWidth: '40px' }}>
                  <button 
                    type="button"
                    onClick={() => handleSelectAll(paginatedList)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 0 }}
                  >
                    {paginatedList.length > 0 && paginatedList.every(l => selectedIds.includes(l.id)) ? (
                      <CheckSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                {view === 'contact_details' && (
                  <th style={{ width: '36px', minWidth: '36px', maxWidth: '36px', userSelect: 'none' }}>#</th>
                )}
                {tableCols.map(col => {
                  const isProject = col.column_key === 'project';
                  const userPlan = plan;
                  const isProjectUnlocked = !['trial', 'starter'].includes(userPlan);
                  return (
                    <ResizableTh
                      key={col.id}
                      columnKey={col.column_key}
                      width={getWidth(col.column_key)}
                      onResize={setWidth}
                      onReset={resetWidth}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col.column_key === 'status' ? (
                          <>
                            Status
                            <HelpPopover title="Status & Checkpoints" align="left">
                              The checkpoint bubble next to Status tracks whether a lead has replied or needs a follow-up check. Click it to log outcomes and automatically schedule/cancel reminders.
                            </HelpPopover>
                          </>
                        ) : col.column_key === 'platform' ? (
                          <>
                            Reach
                            <HelpPopover title="Reach Link System" align="left">
                              Click a lead's Reach icon to open their outreach channel (LinkedIn, email, etc.) and optionally select a template. The app tracks that you reached out and updates Last Contacted.
                            </HelpPopover>
                          </>
                        ) : col.column_key === 'action_to_take' ? (
                          'Next step'
                        ) : col.column_label}
                        {isProject && !isProjectUnlocked && (
                          <Lock size={12} style={{ color: 'var(--text-muted)' }} title="Locked on Starter/Trial plans" />
                        )}
                      </div>
                    </ResizableTh>
                  );
                })}
                {isTeamView && (
                  <ResizableTh columnKey="_added_by" width={getWidth('_added_by')} onResize={setWidth} onReset={resetWidth}>
                    Added By
                  </ResizableTh>
                )}
                <th style={{ textAlign: 'right', width: 100, minWidth: 100 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <HelpPopover title="Column Manager" align="right">
                      Customise which columns appear in your CRM table, in what order, and for which view (Contact Details / Pipeline / Clients). Add custom columns on Pro/Teams.
                    </HelpPopover>
                    <button 
                      type="button"
                      onClick={() => setShowColumnManager(true)}
                      className="btn-icon" 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                      title="Manage Columns"
                    >
                      <Gear size={16} />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={tableCols.length + (isTeamView ? 3 : 2) + (view === 'contact_details' ? 1 : 0)} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No records found matching current parameters.
                  </td>
                </tr>
              ) : (
                paginatedList.map((lead, rowIndex) => {
                  const isSelected = selectedIds.includes(lead.id);
                  const addedByEmail = teamMemberEmail(teamProfilesMap[lead.user_id]);

                  return (
                    <ResizableTr
                      key={lead.id}
                      rowKey={lead.id}
                      height={getRowHeight(lead.id)}
                      onResize={setRowHeight}
                      onReset={resetRowHeight}
                      onClick={() => setSelectedLead(lead)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        background: isSelected ? 'rgba(91, 143, 185, 0.06)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => handleToggleSelect(lead.id)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 0 }}
                        >
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      {view === 'contact_details' && (
                        <td style={{ padding: '0.75rem 0.5rem 0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', userSelect: 'none', fontVariantNumeric: 'tabular-nums' }}>
                          {(currentPage - 1) * pageSize + rowIndex + 1}
                        </td>
                      )}
                      
                      {tableCols.map(col => {
                        const isCustom = !col.is_default;
                        const cellValue = isCustom ? lead.custom_fields?.[col.column_key] : lead[col.column_key];
                        const copyValue = getLeadCellCopyValue(lead, col);
                        const tdProps = { key: col.id, style: cellWidth(col.column_key) };

                        if (col.column_key === 'name') {
                          const displayName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—';
                          return (
                            <td {...tdProps}>
                              <CopyableCell value={copyValue} onCopied={handleCopyCell}>
                                <span style={{ fontWeight: 600 }} data-ph-mask>{displayName}</span>
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_key === 'template_used') {
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CopyableCell value={lead.template_used || ''} onCopied={handleCopyCell} variant="inline">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <GroupedTemplateDropdown
                                      value={lead.template_used || ''}
                                      onChange={(val) => handleDropdownChange(lead.id, 'template_used', val)}
                                      templates={templates}
                                      placeholder="None"
                                    />
                                  </div>
                                  {lead.template_used && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyPersonalizedMessage(lead, lead.template_used)}
                                      className="btn btn-secondary btn-sm"
                                      style={{
                                        padding: '4px 6px',
                                        minHeight: 'auto',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderColor: 'var(--border)',
                                        borderRadius: '3px',
                                        flexShrink: 0,
                                      }}
                                      title="Copy personalized message"
                                    >
                                      <Copy size={13} />
                                    </button>
                                  )}
                                </div>
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_key === 'status') {
                          const currentStatus = cellValue || 'Lead';
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CopyableCell value={currentStatus} onCopied={handleCopyCell} variant="inline">
                                <GroupedStatusDropdown
                                  value={currentStatus}
                                  onChange={(newVal) => handleDropdownChange(lead.id, 'status', newVal)}
                                  isTableInline={true}
                                  onUpdate={fetchData}
                                />
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_key === 'outreach_channel' || col.column_type === 'channel') {
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CopyableCell value={lead.outreach_channel || ''} onCopied={handleCopyCell} variant="inline">
                                <GroupedChannelDropdown
                                  value={lead.outreach_channel}
                                  onChange={(newVal) => handleDropdownChange(lead.id, 'outreach_channel', newVal)}
                                  isTableInline={true}
                                  onUpdate={fetchData}
                                  channel="messaging"
                                />
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_key === 'priority') {
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CopyableCell value={lead.priority || ''} onCopied={handleCopyCell} variant="inline">
                                <PriorityDropdown
                                  value={lead.priority}
                                  onChange={(val) => handleDropdownChange(lead.id, 'priority', val)}
                                  onUpdate={fetchData}
                                />
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_type === 'dropdown') {
                          const isActionToTake = col.column_key === 'action_to_take';
                          const expectedSuggestion = isActionToTake ? getSuggestionForStatus(lead.status, suggestionRules, currentUser) : null;
                          const suggestionsEnabled = currentUser?.suggestions_enabled !== false;
                          const remindersEnabled = currentUser?.reminders_enabled !== false;
                          const isSuggestionMismatch = suggestionsEnabled && expectedSuggestion && cellValue !== expectedSuggestion;
                          const isCheckpointDue = remindersEnabled && lead.next_checkpoint_at && new Date(lead.next_checkpoint_at) <= new Date();
                          const showLightbulb = isActionToTake && (isSuggestionMismatch || isCheckpointDue);

                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CopyableCell value={cellValue || ''} onCopied={handleCopyCell} variant="inline">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <EditableDropdown
                                  value={cellValue}
                                  columnDef={col}
                                  onChange={(val) => {
                                    if (isCustom) {
                                      const custom = { ...(lead.custom_fields || {}) };
                                      custom[col.column_key] = val;
                                      supabase.from('leads').update({ custom_fields: custom }).eq('id', lead.id).then(() => {
                                        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, custom_fields: custom } : l));
                                        supabase.from('lead_activity').insert({
                                          user_id: currentUser.id,
                                          lead_id: lead.id,
                                          action_type: 'Field Updated',
                                          action_detail: { field: col.column_key, from: lead.custom_fields?.[col.column_key] || 'None', to: val }
                                        });
                                      });
                                    } else {
                                      handleDropdownChange(lead.id, col.column_key, val);
                                    }
                                  }}
                                  onUpdateColumnDef={(id, newOpts) => {
                                    setColumnDefs(prev => prev.map(c => c.id === id ? { ...c, dropdown_options: newOpts } : c));
                                  }}
                                />
                                {showLightbulb && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCheckpointPopoverLead(lead);
                                      setCheckpointPopoverAnchor(e.currentTarget);
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      color: isCheckpointDue ? '#ef4444' : '#f59e0b',
                                    }}
                                    title={
                                      isCheckpointDue 
                                        ? 'Action checkpoint is due!' 
                                        : `Suggested action: "${expectedSuggestion}"`
                                    }
                                  >
                                    <Lightbulb size={16} />
                                  </button>
                                )}
                                </div>
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_type === 'link') {
                          const linkHref = cellValue?.startsWith('http') ? cellValue : cellValue ? `https://${cellValue}` : null;
                          let domain = '—';
                          if (cellValue) {
                            try { domain = new URL(linkHref).hostname.replace('www.', ''); }
                            catch { domain = cellValue.slice(0, 22); }
                          }
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CopyableCell value={cellValue || ''} onCopied={handleCopyCell}>
                                {linkHref ? (
                                  <a href={linkHref} target="_blank" rel="noopener noreferrer"
                                    style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <ExternalLink size={11} />{domain}
                                  </a>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_type === 'date') {
                          let formatted = '—';
                          if (cellValue) {
                            try {
                              const d = new Date(cellValue);
                              if (!isNaN(d)) {
                                formatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                              }
                            } catch {}
                          }
                          return (
                            <td {...tdProps} style={{ ...tdProps.style, fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              <CopyableCell value={formatted === '—' ? '' : formatted} onCopied={handleCopyCell}>
                                {formatted}
                              </CopyableCell>
                            </td>
                          );
                        }

                        if (col.column_key === 'platform' || col.column_type === 'reach' || col.column_type === 'system') {
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <ReachIcons lead={lead} columnDefs={columnDefs} onReachClick={handleReachClick} />
                            </td>
                          );
                        }

                        // ── Clickable URL columns ──────────────────────────────
                        if (['linkedin_url', 'instagram_url', 'twitter_url', 'website'].includes(col.column_key) && cellValue) {
                          const url = cellValue.startsWith('http') ? cellValue : `https://${cellValue}`;
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()} data-ph-mask>
                              <CopyableCell value={cellValue} onCopied={handleCopyCell}>
                                <a href={url} target="_blank" rel="noopener noreferrer"
                                  style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontSize: '0.85rem' }}
                                >
                                  {cellValue}
                                </a>
                              </CopyableCell>
                            </td>
                          );
                        }

                        // ── Clickable email ────────────────────────────────────
                        if (col.column_key === 'email' && cellValue) {
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CopyableCell value={cellValue} onCopied={handleCopyCell}>
                                <a href={`mailto:${cellValue}`}
                                  style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontSize: '0.85rem' }}
                                  data-ph-mask
                                >
                                  {cellValue}
                                </a>
                              </CopyableCell>
                            </td>
                          );
                        }

                        // ── Lead local time (list setting) ───────────────────
                        if (col.column_key === 'local_time') {
                          const defaultCountryCode = currentUser?.default_country_code || '+92';
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()}>
                              <CallWindowBadge
                                lead={lead}
                                defaultCountryCode={defaultCountryCode}
                                showLocalTime
                                editable
                                onTimezoneChange={(tz) => handleLeadFieldChange(lead.id, 'timezone', tz || '')}
                              />
                            </td>
                          );
                        }

                        // ── Phone popup ────────────────────────────────────────
                        if (col.column_key === 'phone') {
                          return (
                            <td {...tdProps} onClick={(e) => e.stopPropagation()} data-ph-mask>
                              <CopyableCell value={cellValue || ''} onCopied={handleCopyCell} variant="inline">
                                <PhonePopup phone={cellValue} />
                              </CopyableCell>
                            </td>
                          );
                        }

                        return (
                          <td {...tdProps} data-ph-mask>
                            <CopyableCell value={copyValue} onCopied={handleCopyCell}>
                              {cellValue || '—'}
                            </CopyableCell>
                          </td>
                        );
                      })}

                      {isTeamView && (
                        <td style={{ ...cellWidth('_added_by'), fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <CopyableCell value={addedByEmail || ''} onCopied={handleCopyCell}>
                            {addedByEmail || 'Unknown'}
                          </CopyableCell>
                        </td>
                      )}
                      
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleOpenEditLead(lead)} className="btn btn-secondary btn-sm" title="Edit Lead">
                            <Edit3 size={12} />
                          </button>
                          
                          {/* Folder dropdown selector directly from row */}
                          {folders.length > 0 && (
                            <select
                              value={lead.folder_id || ''}
                              onChange={(e) => handleBulkMoveToFolder(e.target.value)}
                              style={{ width: '80px', fontSize: '0.75rem', padding: '0.1rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)' }}
                              onClick={(e) => { e.stopPropagation(); setSelectedIds([lead.id]); }}
                            >
                              <option value="">Move...</option>
                              <option value="">(All)</option>
                              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                    </ResizableTr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Pagination Section */}
        <div className="flex justify-between align-center" style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="flex gap-4 align-center" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>
              Showing {totalFiltered === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalFiltered)} of {totalFiltered} leads
              {folderListTotal != null && hasActiveListFilters && folderListTotal !== totalFiltered && (
                <span style={{ marginLeft: '0.35rem', color: 'var(--status-warm)' }}>
                  ({folderListTotal} in this list)
                </span>
              )}
            </span>
            {hasActiveListFilters && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleClearFilters}
                style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem' }}
              >
                Clear filters
              </button>
            )}
            <div className="flex align-center gap-1">
              <span>Page Size:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="form-select"
                style={{ width: '80px', padding: '0.15rem 0.35rem', fontSize: '0.8rem', height: 'auto' }}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="btn btn-secondary btn-sm"
              style={{ minWidth: '70px' }}
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(totalFiltered / pageSize)))}
              disabled={currentPage * pageSize >= totalFiltered}
              className="btn btn-secondary btn-sm"
              style={{ minWidth: '70px' }}
            >
              Next
            </button>
          </div>
        </div>
        </>
        )}
        </>
        )}
      </div>

      {/* Add Lead Modal */}
      {showAddLeadModal && (
        <div className="modal-backdrop">
          <div className="modal-content rd-modal">
            <div className="rd-modal-header">
              <div>
                <h3>Add lead</h3>
                <p className="rd-modal-sub">Name is enough — everything else is optional.</p>
              </div>
              <button type="button" onClick={() => setShowAddLeadModal(false)} className="rd-modal-close" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddLead} className="rd-modal-form">
              <div className="rd-modal-body">
                <LeadFormFields
                  leadForm={leadForm}
                  setLeadForm={setLeadForm}
                  pastedLink={pastedLink}
                  setPastedLink={setPastedLink}
                  onAddPastedLink={handleAddPastedLink}
                  getFolderSelectValue={getFolderSelectValue}
                  onFolderChange={handleFolderChange}
                  folders={folders}
                  userFolders={userFolders}
                  plan={plan}
                  templates={templates}
                  onStatusUpdate={fetchData}
                  showCustomFields
                  columnDefs={columnDefs}
                  view={view}
                  defaultCountryCode={currentUser?.default_country_code || '+92'}
                  onClearCustomField={handleRemoveCustomFieldVal}
                  newFieldName={newFieldName}
                  setNewFieldName={setNewFieldName}
                  newFieldType={newFieldType}
                  setNewFieldType={setNewFieldType}
                  onAddCustomField={handleAddNewCustomField}
                />
              </div>
              <div className="rd-modal-footer">
                <button type="button" onClick={() => setShowAddLeadModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Quick Add Button for Mobile */}
      <button 
        className="floating-quick-add-btn" 
        onClick={() => {
          if (isLeadLimitReached) {
            setShowLeadLimitBlockModal(true);
            return;
          }
          setQuickAddForm({ ...EMPTY_QUICK_ADD_FORM });
          setShowQuickAddModal(true);
        }}
        aria-label="Quick add lead"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>

      {/* Minimal Quick Add Modal */}
      {showQuickAddModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content rd-modal rd-modal-quick-add">
            <div className="rd-modal-header">
              <div>
                <h3>Quick add</h3>
                <p className="rd-modal-sub">Capture a lead in seconds.</p>
              </div>
              <button type="button" onClick={() => setShowQuickAddModal(false)} className="rd-modal-close" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleQuickAddSubmit} className="rd-modal-form">
              <div className="rd-modal-body">
                <div className="rd-form">
                  <div className="rd-form-group">
                    <label className="form-label" htmlFor="quick-name">Name *</label>
                    <input
                      id="quick-name"
                      type="text"
                      required
                      placeholder="e.g. Sophie Laurent"
                      value={quickAddForm.name}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, name: e.target.value })}
                      className="form-input"
                      autoFocus
                    />
                  </div>
                  <div className="rd-form-group">
                    <label className="form-label" htmlFor="quick-profile-url">Profile URL</label>
                    <input
                      id="quick-profile-url"
                      type="text"
                      placeholder="Paste LinkedIn or profile link…"
                      value={quickAddForm.profileUrl}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, profileUrl: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="rd-form-group">
                    <label className="form-label" htmlFor="quick-phone">Phone</label>
                    <input
                      id="quick-phone"
                      type="text"
                      placeholder="+1…"
                      value={quickAddForm.phone}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, phone: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="rd-form-row">
                    <div className="rd-form-group">
                      <label className="form-label" htmlFor="quick-source">Found via</label>
                      <select
                        id="quick-source"
                        value={quickAddForm.platform}
                        onChange={(e) => setQuickAddForm({ ...quickAddForm, platform: e.target.value })}
                        className="form-select"
                      >
                        <option value="LinkedIn">LinkedIn</option>
                        <option value="Cold Email">Cold Email</option>
                        <option value="Twitter">Twitter</option>
                        <option value="WhatsApp">WhatsApp</option>
                      </select>
                    </div>
                    <div className="rd-form-group">
                      <label className="form-label" htmlFor="quick-priority">Priority</label>
                      <select
                        id="quick-priority"
                        value={quickAddForm.priority}
                        onChange={(e) => setQuickAddForm({ ...quickAddForm, priority: e.target.value })}
                        className="form-select"
                      >
                        <option value="Cold">Cold</option>
                        <option value="Warm">Warm</option>
                        <option value="Hot">Hot</option>
                      </select>
                    </div>
                  </div>
                  <div className="rd-form-group">
                    <label className="form-label" htmlFor="quick-notes">Notes</label>
                    <input
                      id="quick-notes"
                      type="text"
                      placeholder="Context for the next follow-up…"
                      value={quickAddForm.notes}
                      onChange={(e) => setQuickAddForm({ ...quickAddForm, notes: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>
              <div className="rd-modal-footer">
                <button type="button" onClick={() => setShowQuickAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {showEditLeadModal && (
        <div className="modal-backdrop">
          <div className="modal-content rd-modal">
            <div className="rd-modal-header">
              <div>
                <h3>Edit lead</h3>
                <p className="rd-modal-sub">Update contact details and pipeline status.</p>
              </div>
              <button type="button" onClick={() => setShowEditLeadModal(false)} className="rd-modal-close" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditLead} className="rd-modal-form">
              <div className="rd-modal-body">
                <LeadFormFields
                  leadForm={leadForm}
                  setLeadForm={setLeadForm}
                  pastedLink={pastedLink}
                  setPastedLink={setPastedLink}
                  onAddPastedLink={handleAddPastedLink}
                  getFolderSelectValue={getFolderSelectValue}
                  onFolderChange={handleFolderChange}
                  folders={folders}
                  userFolders={userFolders}
                  plan={plan}
                  templates={templates}
                  onStatusUpdate={fetchData}
                  defaultCountryCode={currentUser?.default_country_code || '+92'}
                />
              </div>
              <div className="rd-modal-footer">
                <button type="button" onClick={() => setShowEditLeadModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📁 Create Folder Modal */}
      {showFolderModal && (
        <div className="modal-backdrop">
          <div className="modal-content rd-modal rd-modal-sm">
            <div className="rd-modal-header">
              <div>
                <h3>Create list</h3>
                <p className="rd-modal-sub">A named group of leads — like a file in Google Drive.</p>
              </div>
              <button type="button" onClick={() => setShowFolderModal(false)} className="rd-modal-close" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="rd-modal-form">
              <div className="rd-modal-body">
                <div className="rd-form">
                  <div className="rd-form-group">
                    <label className="form-label" htmlFor="folder-name">List name *</label>
                    <input
                      id="folder-name"
                      type="text"
                      required
                      autoFocus
                      value={folderForm.name}
                      onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                      className="form-input"
                      placeholder="e.g. VIP Prospects"
                    />
                  </div>
                  <div className="rd-form-group">
                    <span className="form-label">Color</span>
                    <div className="rd-color-dots">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`rd-color-dot ${folderForm.color === c ? 'is-selected' : ''}`}
                          onClick={() => setFolderForm({ ...folderForm, color: c })}
                          style={{ background: c }}
                          aria-label={`Color ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rd-modal-footer">
                <button type="button" onClick={() => setShowFolderModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create list</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📥 Import CSV Modal */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="modal-content rd-modal">
            <div className="rd-modal-header">
              <div>
                <h3>Import CSV</h3>
                <p className="rd-modal-sub">First row must include Name (or First/Last) and Email.</p>
              </div>
              <button type="button" onClick={() => setShowImportModal(false)} className="rd-modal-close" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleImportCSVSubmit} className="rd-modal-form">
              <div className="rd-modal-body">
                <div className="rd-form-group">
                  <label className="form-label" htmlFor="import-csv">Paste CSV</label>
                  <textarea
                    id="import-csv"
                    className="form-textarea rd-mono-textarea"
                    placeholder={"First Name,Last Name,Email,Company\nAhmed,Khan,ahmed@test.com,Acme"}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="rd-modal-footer">
                <button type="button" onClick={() => setShowImportModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Import leads</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🚀 Reach Message Draft Modal Overlay */}
      {reachModalOpen && reachLead && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '90%', padding: '1.75rem', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={18} style={{ color: 'var(--accent-blue)' }} />
                <span>Draft Message ({reachChannel === 'email' ? 'Email' : reachChannel === 'whatsapp' ? 'WhatsApp' : reachChannel === 'sms' ? 'SMS' : 'Social Profile'})</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setReachModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-col gap-4" style={{ textAlign: 'left' }}>
              {/* Lead Details */}
              <div style={{ background: 'var(--bg-page)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <strong>Lead:</strong> {reachLead.first_name} {reachLead.last_name || ''} ({reachLead.company || 'No Company'})
              </div>

              {/* Validation Warning */}
              {reachWarning && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '6px', background: 'rgba(224, 82, 82, 0.1)', border: '1px solid rgba(224, 82, 82, 0.25)', color: 'var(--status-hot)', fontSize: '0.8rem' }}>
                  <AlertCircle size={16} />
                  <span><strong>Warning:</strong> {reachWarning}</span>
                </div>
              )}

              {/* Template Picker & AI Option */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Select Template</label>
                  {['trial', 'starter', 'pro', 'teams'].includes(plan) ? (
                    <button
                      type="button"
                      onClick={handleGenerateReachAI}
                      disabled={reachAiLoading}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
                    >
                      <Sparkles size={12} style={{ color: 'var(--accent-blue)' }} />
                      {reachAiLoading ? 'Generating...' : 'Generate with AI'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Available on Pro plan"
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '0.25rem 0.5rem', opacity: 0.7, cursor: 'not-allowed' }}
                    >
                      <Lock size={12} /> Available on Pro
                    </button>
                  )}
                </div>
                <select
                  value={selectedReachTemplateId}
                  onChange={(e) => handleReachTemplateChange(e.target.value)}
                  className="form-select"
                  style={{ width: '100%', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', height: '36px', borderRadius: '4px' }}
                >
                  <option value="">(No Template - Free Text)</option>
                  {(templates || []).map(t => (
                    <option key={t.id} value={t.id}>{t.title} ({t.platform})</option>
                  ))}
                </select>
                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder='AI prompt instructions (optional, e.g. "mention 20% discount")'
                    value={reachAiInstructions}
                    onChange={(e) => setReachAiInstructions(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !reachAiLoading) handleGenerateReachAI(); }}
                    disabled={reachAiLoading}
                    style={{ flex: 1, fontSize: '0.78rem', height: '30px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0 8px' }}
                  />
                </div>
                {reachAiError && (
                  <div style={{ color: 'var(--danger-color)', fontSize: '0.75rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <AlertCircle size={12} /> {reachAiError}
                  </div>
                )}
              </div>

              {/* Subject (Email Only) */}
              {reachChannel === 'email' && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Subject</label>
                  <input
                    type="text"
                    className="form-input"
                    value={reachTemplateSubject}
                    onChange={(e) => setReachTemplateSubject(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', height: '36px', borderRadius: '4px', padding: '0 8px' }}
                  />
                </div>
              )}

              {/* Message Body Preview & Edit */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Personalized Preview</label>
                <textarea
                  className="form-textarea"
                  value={reachTemplateBody}
                  onChange={(e) => setReachTemplateBody(e.target.value)}
                  style={{ width: '100%', minHeight: '160px', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '4px', padding: '8px', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.5 }}
                />
              </div>

              {/* Destination/Send Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setReachModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ height: '36px' }}
                >
                  Cancel
                </button>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {reachChannel === 'email' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReachSend('mailto')}
                        className="btn btn-secondary"
                        style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
                      >
                        <Mail size={14} /> Device Mail App
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReachSend('gmail')}
                        className="btn btn-secondary"
                        style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
                      >
                        Gmail Web
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReachSend('outlook')}
                        className="btn btn-secondary"
                        style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
                      >
                        Outlook Web
                      </button>
                    </>
                  ) : reachChannel === 'whatsapp' ? (
                    <button
                      type="button"
                      onClick={() => handleReachSend('whatsapp')}
                      className="btn btn-primary"
                      style={{ height: '36px', background: '#25D366', borderColor: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      Open WhatsApp
                    </button>
                  ) : reachChannel === 'sms' ? (
                    <button
                      type="button"
                      onClick={() => handleReachSend('sms')}
                      className="btn btn-primary"
                      style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      Send SMS
                    </button>
                  ) : (
                    // LinkedIn, Instagram, Twitter (no prefill support)
                    <button
                      type="button"
                      onClick={() => handleReachSend(reachChannel)}
                      className="btn btn-primary"
                      style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <Copy size={14} /> Copy & Open Profile
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 💬 Reply Type Prompt Overlay Dialog */}
      {replyPromptLead && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '450px', width: '90%', padding: '1.5rem', borderRadius: '12px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><MessageCircle size={18} /> Reply from {replyPromptLead.first_name} {replyPromptLead.last_name}</span>
              </h3>
            </div>
            <div className="flex-col gap-3" style={{ textAlign: 'left', marginTop: '1rem' }}>
              
              {replyPromptStatus && replyPromptStatus.toLowerCase() !== 'booked' && (
                <div className="form-group">
                  <label className="form-label">Was this a positive reply?</label>
                  <div className="flex gap-2 w-block" style={{ width: '100%' }}>
                    <button 
                      type="button" 
                      onClick={() => {
                        setReplyType('positive');
                        setNextStep(null);
                        setNextStepLink('');
                      }}
                      className={`btn btn-sm ${replyType === 'positive' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, justifyContent: 'center', gap: '0.25rem' }}
                    >
                      <ThumbsUp size={14} /> Positive
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        setReplyType('negative');
                        setNextStep(null);
                        setNextStepLink('');
                      }}
                      className={`btn btn-sm ${replyType === 'negative' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, justifyContent: 'center', gap: '0.25rem', borderColor: replyType === 'negative' ? 'var(--danger-color)' : 'var(--border-color)', color: replyType === 'negative' ? '#ef4444' : 'var(--text-primary)' }}
                    >
                      <ThumbsDown size={14} /> Negative
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        setReplyType('skip');
                        setNextStep(null);
                        setNextStepLink('');
                      }}
                      className={`btn btn-sm ${replyType === 'skip' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, justifyContent: 'center', gap: '0.25rem' }}
                    >
                      <SkipForward size={14} /> Skip
                    </button>
                  </div>
                </div>
              )}

              {replyType === 'positive' && replyPromptStatus && replyPromptStatus.toLowerCase() !== 'booked' && (
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label className="form-label">Great! What's the next step?</label>
                  <div className="flex gap-2 w-block" style={{ width: '100%' }}>
                    <button 
                      type="button" 
                      onClick={() => setNextStep('proposal')}
                      className={`btn btn-sm ${nextStep === 'proposal' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Send Proposal
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setNextStep('meeting')}
                      className={`btn btn-sm ${nextStep === 'meeting' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Send Meeting Link
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleSaveReplyPrompt('skip')}
                      className={`btn btn-sm btn-secondary`}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              )}

              {replyType === 'positive' && nextStep && nextStep !== 'skip' && replyPromptStatus && replyPromptStatus.toLowerCase() !== 'booked' && (
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label className="form-label">
                    {nextStep === 'proposal' 
                      ? "Paste your proposal link or describe the next step:" 
                      : "Paste your meeting/calendar link (Calendly, Google Meet, etc.):"}
                  </label>
                  <input 
                    type="text" 
                    value={nextStepLink} 
                    onChange={e => setNextStepLink(e.target.value)} 
                    placeholder={nextStep === 'proposal' ? "e.g. https://proposal.com/123" : "e.g. https://calendly.com/user"}
                    className="form-input" 
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Which template did you use? (optional)</label>
                <GroupedTemplateDropdown 
                  value={replyTemplateId} 
                  onChange={setReplyTemplateId} 
                  templates={templates} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Quick conversation note:</label>
                <input 
                  type="text" 
                  value={replyNotes} 
                  onChange={e => setReplyNotes(e.target.value)} 
                  placeholder="e.g. Wants a call on Friday"
                  className="form-input" 
                />
              </div>

              <div className="flex justify-end gap-2 mt-4" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setReplyPromptLead(null)} className="btn btn-secondary">Cancel</button>
                <button type="button" onClick={handleSaveReplyPrompt} className="btn btn-primary">Save Conversation</button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Column Manager Modal */}
      <ColumnManager
        isOpen={showColumnManager}
        onClose={() => setShowColumnManager(false)}
        view={outreachMode === 'calls' ? 'call_queue' : view}
        columns={columnDefs}
        onUpdateColumns={(newCols) => {
          setColumnDefs(newCols.sort((a, b) => a.sort_order - b.sort_order));
        }}
        onResetToDefault={handleResetToDefault}
        userId={currentUser.id}
        currentUser={currentUser}
      />

      {/* Convert to Client Modal */}
      {convertingLead && (
        <ConvertModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onConvert={handleConvertSubmit}
        />
      )}

      {/* Lead Detail Slide-out Drawer */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          initialTab={drawerInitialTab}
          isClientView={view === 'clients'}
          onClose={() => {
            setSelectedLead(null);
            setDrawerInitialTab(null);
          }}
          onUpdateLead={(updated) => {
            if (view === 'clients') {
              setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
            } else {
              setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
            }
            setSelectedLead(updated);
          }}
          columnDefs={columnDefs}
          currentUser={currentUser}
          templates={templates}
          onConvertToClient={setConvertingLead}
          onRefresh={fetchData}
          statuses={statuses}
          suggestionRules={suggestionRules}
        />
      )}

      {/* CSV Mapping Importer Modal */}
      <CSVImporter
        isOpen={showCSVImporter}
        onClose={() => setShowCSVImporter(false)}
        onImportComplete={() => {
          fetchData();
          setShowCSVImporter(false);
        }}
        columnDefs={columnDefs}
        currentUser={currentUser}
        folderId={activeManualFolderId || null}
        folders={folders.filter((f) => f.user_id === currentUser?.id)}
      />

      {/* NEW CSV Import Modal */}
      {showNewImportModal && (
        <CSVImportModal 
          onClose={() => setShowNewImportModal(false)}
          onImportComplete={() => {
            setShowNewImportModal(false);
            fetchData();
          }}
        />
      )}

      {/* Google Sheets Export Modal */}
      {showExportSheetsModal && (
        <ExportSheetsModal
          leads={exportSheetsLeads ?? leads}
          currentUser={currentUser}
          includeLocalTime={!!exportSheetsOptions.includeLocalTime}
          onClose={() => {
            setShowExportSheetsModal(false);
            setExportSheetsLeads(null);
            setExportSheetsOptions({});
          }}
        />
      )}

      <ShareListModal
        open={!!shareListTarget}
        onClose={() => {
          setShareListTarget(null);
          setShareListShares([]);
        }}
        folder={shareListTarget}
        teamMembers={teamMembersList}
        currentUser={currentUser}
        existingShares={shareListShares}
        onSaved={() => {
          setShareListTarget(null);
          setShareListShares([]);
          fetchData();
        }}
      />

      {/* Google Sheets Import Modal */}
      {showSheetsImportModal && (
        <SheetsImportModal
          currentUserId={currentUser.id}
          onClose={() => setShowSheetsImportModal(false)}
          onImportComplete={(folderId) => {
            setShowSheetsImportModal(false);
            fetchData();
            if (folderId) handleSelectFolder(folderId);
          }}
        />
      )}


      {showSmartFolderModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <h3>Create auto list</h3>
              <button onClick={() => setShowSmartFolderModal(false)} className="theme-toggle"><X size={18} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!smartFolderForm.name.trim()) return;
              const rules = smartFolderForm.rules || [];
              const incomplete = rules.filter((r) => r.field && !(r.value || '').trim());
              if (incomplete.length > 0) {
                alert('Each rule needs a value. Remove empty rules or pick a status/priority/tag.');
                return;
              }
              try {
                const newFolder = {
                  user_id: currentUser.id,
                  assignee_id: currentUser.id,
                  name: smartFolderForm.name,
                  filter_config: {
                    rules: smartFolderForm.rules
                  }
                };
                const { data, error } = await supabase
                  .from('user_folders')
                  .insert(newFolder)
                  .select()
                  .single();
                if (error) throw error;
                setUserFolders(prev => [...prev, data]);
                setShowSmartFolderModal(false);
                setSmartFolderForm({ name: '', rules: [{ field: 'Status', operator: 'is', value: '' }] });
                handleSelectFolder(data.id);
              } catch (err) {
                console.error('Error creating smart folder:', err);
                alert('Failed to create smart folder: ' + err.message);
              }
            }} className="flex-col gap-3">
              <div className="form-group">
                <label className="form-label">Folder Name *</label>
                <input 
                  type="text" 
                  required 
                  value={smartFolderForm.name} 
                  onChange={e => setSmartFolderForm({...smartFolderForm, name: e.target.value})} 
                  className="form-input" 
                  placeholder="e.g. Hot LinkedIn Leads" 
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Rules (all rules must match)</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
                  Leads matching these rules appear in this list automatically — you don&apos;t assign them manually.
                  {smartFolderForm.rules.length === 0 && (
                    <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--status-warm)' }}>
                      No rules = all leads match this auto list.
                    </span>
                  )}
                </p>
                <div className="flex-col gap-2" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  {smartFolderForm.rules.map((rule, idx) => (
                    <div key={idx} className="flex gap-2 align-center" style={{ flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      <div style={{ flex: 1, minWidth: '120px' }}>
                        <RdSelect
                          value={rule.field}
                          onChange={val => {
                            const newRules = [...smartFolderForm.rules];
                            newRules[idx].field = val;
                            newRules[idx].value = ''; // Reset value
                            setSmartFolderForm({...smartFolderForm, rules: newRules});
                          }}
                          options={[
                            { value: 'Status', label: 'Status' },
                            { value: 'Priority', label: 'Priority' },
                            { value: 'Tag', label: 'Tag' },
                            { value: 'Channel', label: 'Channel' },
                          ]}
                          ariaLabel="Rule Field"
                          placeholder="Select field"
                        />
                      </div>

                      <select
                        value={rule.operator}
                        onChange={e => {
                          const newRules = [...smartFolderForm.rules];
                          newRules[idx].operator = e.target.value;
                          setSmartFolderForm({...smartFolderForm, rules: newRules});
                        }}
                        className="form-select"
                        style={{ flex: 1, minWidth: '100px' }}
                      >
                        <option value="is">is</option>
                        <option value="is not">is not</option>
                      </select>

                      {rule.field === 'Status' ? (
                        <select
                          value={rule.value}
                          onChange={e => {
                            const newRules = [...smartFolderForm.rules];
                            newRules[idx].value = e.target.value;
                            setSmartFolderForm({...smartFolderForm, rules: newRules});
                          }}
                          className="form-select"
                          style={{ flex: 1.5, minWidth: '150px' }}
                          required
                        >
                          <option value="">-- Select Status --</option>
                          {statuses.length > 0 ? (
                            statuses.map(s => (
                              <option key={s.id || s.label} value={s.label}>{s.label}</option>
                            ))
                          ) : (
                            DEFAULT_STATUSES.map(s => (
                              <option key={s.label} value={s.label}>{s.label}</option>
                            ))
                          )}
                        </select>
                      ) : rule.field === 'Priority' ? (
                        <select
                          value={rule.value}
                          onChange={e => {
                            const newRules = [...smartFolderForm.rules];
                            newRules[idx].value = e.target.value;
                            setSmartFolderForm({...smartFolderForm, rules: newRules});
                          }}
                          className="form-select"
                          style={{ flex: 1.5, minWidth: '120px' }}
                          required
                        >
                          <option value="">-- Select Priority --</option>
                          <option value="Hot">Hot</option>
                          <option value="Warm">Warm</option>
                          <option value="Cold">Cold</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={rule.value}
                          onChange={e => {
                            const newRules = [...smartFolderForm.rules];
                            newRules[idx].value = e.target.value;
                            setSmartFolderForm({...smartFolderForm, rules: newRules});
                          }}
                          placeholder="Value..."
                          className="form-input"
                          style={{ flex: 1.5, minWidth: '150px' }}
                          required
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const newRules = smartFolderForm.rules.filter((_, rIdx) => rIdx !== idx);
                          setSmartFolderForm({...smartFolderForm, rules: newRules});
                        }}
                        className="btn btn-secondary btn-icon"
                        style={{ padding: '0.35rem', color: 'var(--danger-color)' }}
                        disabled={smartFolderForm.rules.length <= 1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setSmartFolderForm({
                      ...smartFolderForm,
                      rules: [...smartFolderForm.rules, { field: 'Status', operator: 'is', value: '' }]
                    });
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignSelf: 'flex-start' }}
                >
                  <Plus size={14} /> Add Rule
                </button>
              </div>

              <div className="flex justify-between mt-4">
                <button 
                  type="button" 
                  onClick={() => setShowSmartFolderModal(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Create auto list</button>
              </div>
            </form>
          </div>
        </div>
      )}



      <LeadLimitModal
        open={showLeadLimitBlockModal}
        plan={plan}
        limit={leadLimit || 0}
        onCleanup={() => { setShowLeadLimitBlockModal(false); navigate('/leads'); }}
        onUpgrade={() => { setShowLeadLimitBlockModal(false); navigate('/upgrade'); }}
        onClose={() => setShowLeadLimitBlockModal(false)}
      />

      {toastRemaining !== null && (
        <LeadLimitToast
          remaining={toastRemaining}
          onUpgrade={() => { setToastRemaining(null); navigate('/upgrade'); }}
          onCleanup={() => { setToastRemaining(null); navigate('/leads'); }}
          onDismiss={() => setToastRemaining(null)}
        />
      )}

      <BulkImportLimitModal
        open={!!importResult}
        importedCount={importResult?.imported ?? 0}
        skippedCount={importResult?.skipped ?? 0}
        plan={plan}
        onCleanup={() => { setImportResult(null); navigate('/leads'); }}
        onUpgrade={() => { setImportResult(null); navigate('/upgrade'); }}
        onClose={() => setImportResult(null)}
      />

      {showBulkImportUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', width: '90%', maxWidth: '420px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <Gem size={40} style={{ color: 'var(--primary-magenta)', alignSelf: 'center' }} />
            <h3 style={{ margin: 0, color: 'var(--primary-magenta)' }}>Unlock Bulk CSV Import</h3>
            <p className="color-muted" style={{ fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
              CSV bulk import is available on <strong>Pro</strong> and above. Starter plans can add leads one at a time or connect Google Sheets.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button onClick={() => setShowBulkImportUpgradeModal(false)} className="btn btn-secondary btn-sm">Close</button>
              <button onClick={() => { setShowBulkImportUpgradeModal(false); navigate('/upgrade'); }} className="btn btn-primary btn-sm">
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔍 Advanced Filter Drawer */}
      {showFilterDrawer && (
        <div className="modal-backdrop" style={{ justifyContent: 'flex-end', backdropFilter: 'blur(3px)' }}>
          <div 
            className="modal-content"
            style={{
              maxWidth: '380px',
              height: '100vh',
              borderRadius: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.3)',
              borderLeft: '0.5px solid var(--border)',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              animation: 'slideInRight 0.3s ease-out',
              textAlign: 'left',
              padding: '1.5rem',
              background: 'var(--bg-card)'
            }}
          >
            {/* Header */}
            <div className="modal-header" style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-heading)' }}>
                <Filter size={16} /> Advanced Filters
              </h3>
              <button type="button" onClick={() => setShowFilterDrawer(false)} className="theme-toggle"><X size={18} /></button>
            </div>

            {/* Scrollable filters list */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingRight: '4px' }}>
              
              {/* Priorities filter */}
              <div>
                  <span className="rd-section-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Priority</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {['Hot', 'Warm', 'Cold'].map(pr => (
                    <label key={pr} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input 
                        type="checkbox" 
                        checked={filterPriorities.includes(pr)} 
                        onChange={() => {
                          setFilterPriorities(prev => prev.includes(pr) ? prev.filter(x => x !== pr) : [...prev, pr]);
                        }} 
                        style={{ accentColor: 'var(--accent-blue)' }}
                      />
                      {pr}
                    </label>
                  ))}
                </div>
              </div>

              {/* Statuses filter */}
              <div>
                <span className="rd-section-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Lead status</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px' }}>
                  {statuses.map(st => (
                    <label key={st.id || st.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input 
                        type="checkbox" 
                        checked={filterStatuses.includes(st.label)} 
                        onChange={() => {
                          setFilterStatuses(prev => prev.includes(st.label) ? prev.filter(x => x !== st.label) : [...prev, st.label]);
                        }} 
                        style={{ accentColor: 'var(--accent-blue)' }}
                      />
                      {st.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions to Take filter */}
              <div>
                <span className="rd-section-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Action to take</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px' }}>
                  {[
                    'Send first pitch', 'Wait for reply', 'Send a follow up',
                    'Send a different pitch', 'Send proposal', 'Send Calendly',
                    'Prepare for call', 'Send invoice', 'No action needed'
                  ].map(act => (
                    <label key={act} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input 
                        type="checkbox" 
                        checked={filterActions.includes(act)} 
                        onChange={() => {
                          setFilterActions(prev => prev.includes(act) ? prev.filter(x => x !== act) : [...prev, act]);
                        }} 
                        style={{ accentColor: 'var(--accent-blue)' }}
                      />
                      {act}
                    </label>
                  ))}
                </div>
              </div>

              {/* Projects filter (gated) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
                  <span className="rd-section-label">Project</span>
                  {!(!['trial', 'starter'].includes(plan)) && (
                    <Lock size={11} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {!(!['trial', 'starter'].includes(plan)) ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', border: '1px dashed var(--border)' }}>
                    Gated feature. Upgrade to Pro/Teams to categorize and filter leads by project.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px' }}>
                    {Array.from(new Set(leads.map(l => l.project).filter(Boolean))).length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No projects defined yet.</span>
                    ) : (
                      Array.from(new Set(leads.map(l => l.project).filter(Boolean))).map(proj => (
                        <label key={proj} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          <input 
                            type="checkbox" 
                            checked={filterProjects.includes(proj)} 
                            onChange={() => {
                              setFilterProjects(prev => prev.includes(proj) ? prev.filter(x => x !== proj) : [...prev, proj]);
                            }} 
                            style={{ accentColor: 'var(--accent-blue)' }}
                          />
                          {proj}
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Date Filters */}
              <div>
                <span className="rd-section-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Date range</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Filter field:</span>
                    <select 
                      value={filterDateField} 
                      onChange={e => setFilterDateField(e.target.value)} 
                      className="form-select"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', height: 'auto', width: 'auto' }}
                    >
                      <option value="created_at">Added Date</option>
                      <option value="last_contacted_at">Last Contacted</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                      { label: 'All Time', value: 'all' },
                      { label: 'Today', value: 'today' },
                      { label: 'Last 7 Days', value: '7days' },
                      { label: 'Last 30 Days', value: '30days' }
                    ].map(preset => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setFilterDateRange(preset.value)}
                        className={`btn btn-sm ${filterDateRange === preset.value ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            {/* Footer Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button 
                type="button" 
                onClick={handleClearFilters}
                className="btn btn-secondary" 
                style={{ flex: 1, fontSize: '0.8rem', justifyContent: 'center' }}
              >
                Clear All
              </button>
              <button 
                type="button" 
                onClick={() => setShowFilterDrawer(false)}
                className="btn btn-primary" 
                style={{ flex: 1, fontSize: '0.8rem', justifyContent: 'center' }}
              >
                Apply Filters
              </button>
            </div>

          </div>
        </div>
      )}

      {checkpointPopoverLead && (
        <CheckpointPopover
          lead={checkpointPopoverLead}
          anchorEl={checkpointPopoverAnchor}
          suggestionRules={suggestionRules}
          currentUser={currentUser}
          onClose={() => {
            setCheckpointPopoverLead(null);
            setCheckpointPopoverAnchor(null);
          }}
          onResolved={(updatedLead) => {
            setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
            if (onRefreshReminders) onRefreshReminders();
          }}
        />
      )}
    </div>
  );
}
