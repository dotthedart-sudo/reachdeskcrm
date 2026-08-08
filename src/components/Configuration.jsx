import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../App';
import { getAiCreditLimit } from '../lib/aiCredits';
import {
  ensureProTeamWorkspace,
  getSeatsUsed,
  getTeamOwnerProfileForMember,
  getTeamSeatLimit,
  hasTeamsPageAccess,
  isProTeamOwner,
  isTeamMember,
  canPurchaseExtraSeats,
} from '../lib/teamWorkspace';
import { getAppUrl } from '../utils/domain';
import { exportLeads, exportNotes } from '../utils/exportUtils';
import { BRAND_NAME } from '../config/brand';
import { getDialerPrefs, setDialerPrefs } from '../lib/callDialer';
import {
  DEFAULT_CALL_OUTCOME_RULES,
  DEFAULT_CALL_STATUS_RULES,
} from '../lib/callOutcomeRules';
import {
  buildCallRulesMigrationPatch,
  clearMigratedCallRulesLocalStorage,
  DEFAULT_MESSAGING_ACTION_RULES,
  getCallOutcomeRulesForEditor,
  getCallStatusRulesForEditor,
  getMessagingRulesForEditor,
} from '../lib/automationRules';
import { getSuggestionForStatus } from '../lib/reminders';
import { getBrowserTimeZone, getSupportedTimeZones } from '../lib/dateTime';
import SettingsNav from './Configuration/SettingsNav';
import ProfilePanel from './Configuration/ProfilePanel';
import AutomationsPanel from './Configuration/AutomationsPanel';
import SnippetsPanel from './Configuration/SnippetsPanel';
import TeamPanel from './Configuration/TeamPanel';
import BillingPanel from './Configuration/BillingPanel';
import IntegrationsPanel from './Configuration/IntegrationsPanel';
import DataExportPanel from './Configuration/DataExportPanel';
import {
  startGoogleSheetsOAuth,
  markSheetsScopeAck,
  clearSheetsScopeAck,
} from '../lib/googleSheetsOAuth';
import CancelSubscriptionModal from './Configuration/CancelSubscriptionModal';
import ExtraSeatsPurchaseModal from './billing/ExtraSeatsPurchaseModal';
import { getExtraSeats } from '../lib/planConfig';
import { resolveSettingsTab } from './Configuration/settingsTabs';
import './Configuration.css';

export default function Configuration({
  brandName,
  currencySymbol,
  webhookUrl,
  bankAccount,
  bankIban,
  onSaveSettings,
  currentUser,
  leadsCount,
  templatesCount = 0,
  onRefreshStatuses,
  onRefreshProfile
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userSnippets = [], handleAddSnippet, handleDeleteSnippet, handleUpdateSnippet } = useAppContext();
  const [activeTab, setActiveTab] = useState('profile');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [snippetError, setSnippetError] = useState('');
  const [snippetSuccess, setSnippetSuccess] = useState('');
  const [editingSnippetId, setEditingSnippetId] = useState(null);
  const [editingKey, setEditingKey] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const [editError, setEditError] = useState('');

  const onCreateSnippet = async (e) => {
    e.preventDefault();
    setSnippetError('');
    setSnippetSuccess('');
    const key = newKey.trim().toLowerCase();
    const val = newValue.trim();

    if (!key) {
      setSnippetError('Key is required');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      setSnippetError('Key must be alphanumeric and underscores only');
      return;
    }

    const defaultKeys = ['name', 'first_name', 'last_name', 'email', 'company', 'niche', 'phone', 'status', 'priority', 'action_to_take', 'last_contacted_at', 'project'];
    const isDuplicate = defaultKeys.includes(key) || userSnippets.some(s => s.snippet_key.toLowerCase() === key);
    if (isDuplicate) {
      setSnippetError('Snippet key already exists (or is a reserved keyword)');
      return;
    }

    try {
      await handleAddSnippet({ snippet_key: key, snippet_value: val });
      setNewKey('');
      setNewValue('');
      setSnippetSuccess('Snippet created successfully!');
      setTimeout(() => setSnippetSuccess(''), 3000);
    } catch (err) {
      setSnippetError(err.message || 'Failed to create snippet');
    }
  };

  const onDeleteSnippetClick = async (id) => {
    if (!confirm('Are you sure you want to delete this snippet?')) return;
    try {
      await handleDeleteSnippet(id);
    } catch (err) {
      alert(err.message || 'Failed to delete snippet');
    }
  };

  const onStartEdit = (snip) => {
    setEditingSnippetId(snip.id);
    setEditingKey(snip.snippet_key);
    setEditingValue(snip.snippet_value);
    setEditError('');
  };

  const onSaveEdit = async (id) => {
    setEditError('');
    const key = editingKey.trim().toLowerCase();
    const val = editingValue.trim();

    if (!key) {
      setEditError('Key is required');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      setEditError('Key must be alphanumeric / underscores');
      return;
    }

    const defaultKeys = ['name', 'first_name', 'last_name', 'email', 'company', 'niche', 'phone', 'status', 'priority', 'action_to_take', 'last_contacted_at', 'project'];
    const isDuplicate = defaultKeys.includes(key) || userSnippets.some(s => s.id !== id && s.snippet_key.toLowerCase() === key);
    if (isDuplicate) {
      setEditError('Snippet key already exists');
      return;
    }

    try {
      await handleUpdateSnippet(id, { snippet_key: key, snippet_value: val });
      setEditingSnippetId(null);
    } catch (err) {
      setEditError(err.message || 'Failed to update snippet');
    }
  };

  const [localBrand, setLocalBrand] = useState(brandName);
  const [localCurrency, setLocalCurrency] = useState(currencySymbol);
  const [localWebhook, setLocalWebhook] = useState(webhookUrl);

  // Cancellation / resume states
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [extraSeatsModalOpen, setExtraSeatsModalOpen] = useState(false);
  const [billingActionLoading, setBillingActionLoading] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');
  const [cancelErrorMsg, setCancelErrorMsg] = useState('');
  const [resumeSuccessMsg, setResumeSuccessMsg] = useState('');
  const [resumeErrorMsg, setResumeErrorMsg] = useState('');
  const [aiUsage, setAiUsage] = useState({ used: 0, limit: 0, loading: true });

  // Profile Settings States
  const [profileName, setProfileName] = useState(currentUser?.full_name || '');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(currentUser?.avatar_url || '');
  const [profileAvatarFile, setProfileAvatarFile] = useState(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profileDefaultCurrency, setProfileDefaultCurrency] = useState(currentUser?.default_currency || 'PKR');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationSuccess, setAutomationSuccess] = useState('');
  const [automationError, setAutomationError] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(currentUser?.reminders_enabled !== false);
  const [reminderNotificationMode, setReminderNotificationMode] = useState(
    currentUser?.reminder_notification_mode === 'instant' ? 'instant' : 'digest',
  );
  const [reminderDigestHour, setReminderDigestHour] = useState(
    Number.isFinite(currentUser?.reminder_digest_hour) ? Number(currentUser.reminder_digest_hour) : 9,
  );
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(currentUser?.suggestions_enabled !== false);
  const [suggestionsAutoApply, setSuggestionsAutoApply] = useState(currentUser?.suggestions_auto_apply !== false);
  const [callSuggestionsAutoApply, setCallSuggestionsAutoApply] = useState(
    currentUser?.call_suggestions_auto_apply !== false,
  );
  const [messagingActionRules, setMessagingActionRules] = useState(() =>
    DEFAULT_MESSAGING_ACTION_RULES.map((r) => ({ ...r })),
  );
  const [monthlyRevenueTarget, setMonthlyRevenueTarget] = useState(currentUser?.monthly_revenue_target || '');
  const [alwaysDraft, setAlwaysDraft] = useState(currentUser?.always_draft_before_sending !== false);
  const [defaultCountryCode, setDefaultCountryCode] = useState(currentUser?.default_country_code || '+92');
  const dialerPrefsInit = getDialerPrefs(currentUser?.id);
  const [defaultDialer, setDefaultDialer] = useState(dialerPrefsInit.dialer);
  const [ghlDialerUrl, setGhlDialerUrl] = useState(dialerPrefsInit.ghlUrl);
  const [customDialerUrl, setCustomDialerUrl] = useState(dialerPrefsInit.customUrl);
  const [profileTimezone, setProfileTimezone] = useState(currentUser?.timezone || '');
  const [callOutcomeRules, setCallOutcomeRules] = useState(DEFAULT_CALL_OUTCOME_RULES);
  const [callStatusRules, setCallStatusRules] = useState(DEFAULT_CALL_STATUS_RULES);
  const browserTimezone = useMemo(() => getBrowserTimeZone(), []);
  const timezoneOptions = useMemo(() => getSupportedTimeZones(), []);

  const [exporting, setExporting] = useState(null); // 'leads' | 'notes' | null

  // â”€â”€ Google Calendar Integration State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [calIntegration, setCalIntegration] = useState(null); // row from calendar_integrations
  const [calLoading, setCalLoading] = useState(true);
  const [calDisconnecting, setCalDisconnecting] = useState(false);
  const [calSuccessMsg, setCalSuccessMsg] = useState('');

  // â”€â”€ Google Sheets Integration State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [sheetsIntegration, setSheetsIntegration] = useState(null); // row from sheets_integrations
  const [sheetsLoading, setSheetsLoading] = useState(true);
  const [sheetsDisconnecting, setSheetsDisconnecting] = useState(false);
  const [sheetsSuccessMsg, setSheetsSuccessMsg] = useState('');

  const handleExportLeadsClick = async () => {
    if (exporting) return;
    setExporting('leads');
    try {
      await exportLeads(currentUser.id);
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
    try {
      await exportNotes(currentUser.id);
    } catch (err) {
      console.error('Export notes error:', err);
      alert('Failed to export notes: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  // Team states
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamInvitations, setTeamInvitations] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  // Load Team Members
  const loadTeam = async () => {
    if (!isProTeamOwner(currentUser)) {
      setTeamLoading(false);
      return;
    }

    setTeamLoading(true);
    try {
      let teamId = currentUser.team_id;
      if (!teamId) {
        teamId = await ensureProTeamWorkspace(currentUser.id);
        if (onRefreshProfile) await onRefreshProfile();
      }
      if (!teamId) {
        setTeamMembers([]);
        setTeamInvitations([]);
        return;
      }

      const { data: members, error: mErr } = await supabase
        .from('user_profiles')
        .select('id, email, team_role, plan')
        .eq('team_id', teamId);

      if (mErr) throw mErr;
      setTeamMembers(members || []);

      const { data: invites, error: iErr } = await supabase
        .from('team_invitations')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'pending');

      if (iErr) throw iErr;
      setTeamInvitations(invites || []);
    } catch (err) {
      console.error('Error loading team details:', err);
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) return;

    let cancelled = false;

    async function loadAutomationEditorState() {
      const { data: globalRules } = await supabase.from('action_suggestion_rules').select('*');
      if (cancelled) return;

      setMessagingActionRules(getMessagingRulesForEditor(currentUser, globalRules || []));
      setCallOutcomeRules(getCallOutcomeRulesForEditor(currentUser, currentUser.id));
      setCallStatusRules(getCallStatusRulesForEditor(currentUser, currentUser.id));
      setCallSuggestionsAutoApply(currentUser.call_suggestions_auto_apply !== false);

      const patch = buildCallRulesMigrationPatch(currentUser, currentUser.id);
      if (patch) {
        const { error } = await supabase
          .from('user_profiles')
          .update(patch)
          .eq('id', currentUser.id);
        if (!error) {
          clearMigratedCallRulesLocalStorage(currentUser.id);
          if (onRefreshProfile) await onRefreshProfile();
        }
      }
    }

    loadAutomationEditorState();

    return () => {
      cancelled = true;
    };
  }, [
    currentUser?.id,
    currentUser?.messaging_action_rules,
    currentUser?.call_status_rules,
    currentUser?.call_outcome_rules,
    currentUser?.call_suggestions_auto_apply,
  ]);

  useEffect(() => {
    if (currentUser) {
      if (isProTeamOwner(currentUser)) {
        loadTeam();
      } else {
        setTeamMembers([]);
        setTeamInvitations([]);
        setTeamLoading(false);
      }
      setProfileName(currentUser.full_name || '');
      setProfileAvatarUrl(currentUser.avatar_url || '');
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      setProfileDefaultCurrency(currentUser.default_currency || 'PKR');
      setProfileTimezone(currentUser.timezone || '');
      setRemindersEnabled(currentUser.reminders_enabled !== false);
      setReminderNotificationMode(
        currentUser.reminder_notification_mode === 'instant' ? 'instant' : 'digest',
      );
      setReminderDigestHour(
        Number.isFinite(currentUser.reminder_digest_hour) ? Number(currentUser.reminder_digest_hour) : 9,
      );
      setSuggestionsEnabled(currentUser.suggestions_enabled !== false);
      setSuggestionsAutoApply(currentUser.suggestions_auto_apply !== false);
      setCallSuggestionsAutoApply(currentUser.call_suggestions_auto_apply !== false);
      setMonthlyRevenueTarget(currentUser.monthly_revenue_target || '');
      setAlwaysDraft(currentUser.always_draft_before_sending !== false);
      setDefaultCountryCode(currentUser.default_country_code || '+92');
      setLocalBrand(brandName);
      setLocalCurrency(currencySymbol);
      setLocalWebhook(webhookUrl);
    }
  }, [currentUser, brandName, currencySymbol, webhookUrl]);

  useEffect(() => {
    async function fetchAiUsage() {
      if (!currentUser?.id) {
        setAiUsage({ used: 0, limit: 0, loading: false });
        return;
      }
      setAiUsage((prev) => ({ ...prev, loading: true }));
      try {
        const { data, error } = await supabase.functions.invoke('get-ai-usage');
        if (error) throw error;
        setAiUsage({
          used: data?.used ?? 0,
          limit: data?.limit ?? getAiCreditLimit(currentUser.plan),
          loading: false,
        });
      } catch (err) {
        console.warn('Failed to load AI usage:', err);
        setAiUsage({
          used: 0,
          limit: getAiCreditLimit(currentUser.plan),
          loading: false,
        });
      }
    }
    fetchAiUsage();
  }, [currentUser?.id, currentUser?.plan]);

  const canAccessTeam = currentUser
    ? isProTeamOwner(currentUser) || hasTeamsPageAccess(currentUser)
    : false;
  const isMember = isTeamMember(currentUser);
  const [teamOwnerLabel, setTeamOwnerLabel] = useState('');

  useEffect(() => {
    if (!isMember || !currentUser) {
      setTeamOwnerLabel('');
      return;
    }
    getTeamOwnerProfileForMember(currentUser)
      .then((owner) => {
        if (!owner) {
          setTeamOwnerLabel('');
          return;
        }
        const label = owner.full_name || owner.email || 'your workspace owner';
        setTeamOwnerLabel(label);
      })
      .catch(() => setTeamOwnerLabel(''));
  }, [isMember, currentUser?.id, currentUser?.team_id]);

  useEffect(() => {
    if (!currentUser) return;
    setActiveTab(resolveSettingsTab(location.search, canAccessTeam, isMember));
  }, [location.search, canAccessTeam, isMember, currentUser]);

  const handleTabChange = (tabId) => {
    navigate(`/settings?tab=${tabId}`, { replace: true });
  };

  // â”€â”€ Fetch calendar integration status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    async function fetchCalIntegration() {
      if (!currentUser?.id) { setCalLoading(false); return; }
      const { data } = await supabase
        .from('calendar_integrations')
        .select('id, connected_at, watch_expiration, is_active')
        .eq('user_id', currentUser.id)
        .eq('provider', 'google')
        .maybeSingle();
      setCalIntegration(data?.is_active ? data : null);
      setCalLoading(false);
    }
    fetchCalIntegration();
  }, [currentUser?.id]);

  // â”€â”€ Show success banner if redirected back after OAuth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'google') {
      setActiveTab('integrations');
      setCalSuccessMsg('Google Calendar connected successfully! Leads will now be auto-marked as Booked when they appear in your calendar.');
      window.history.replaceState({}, '', '/settings?tab=integrations');
      setTimeout(() => setCalSuccessMsg(''), 8000);
    }
  }, [location.search]);

  // â”€â”€ Connect Google Calendar (initiates OAuth with CSRF state) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleConnectCalendar = () => {
    const state = crypto.randomUUID();
    sessionStorage.setItem('google_oauth_state', state);
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = encodeURIComponent(getAppUrl('/auth/google/callback'));
    // calendar.events = read + create/update events; calendar.readonly = list/watch calendars
    const scope = encodeURIComponent(
      'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly'
    );
    window.location.href = [
      'https://accounts.google.com/o/oauth2/v2/auth',
      `?client_id=${clientId}`,
      `&redirect_uri=${redirectUri}`,
      '&response_type=code',
      `&scope=${scope}`,
      '&access_type=offline',
      '&prompt=consent',
      `&state=${state}`,
    ].join('');
  };

  // â”€â”€ Disconnect Google Calendar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDisconnectCalendar = async () => {
    if (!confirm(`Disconnect Google Calendar? ${BRAND_NAME} will no longer auto-detect bookings from your calendar.`)) return;
    setCalDisconnecting(true);
    try {
      // Step 1: Get the current access token to revoke
      const { data: integration } = await supabase
        .from('calendar_integrations')
        .select('access_token, watch_channel_id, watch_resource_id')
        .eq('user_id', currentUser.id)
        .eq('provider', 'google')
        .single();

      if (integration) {
        // Step 2: Revoke the token at Google's end
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${integration.access_token}`, { method: 'POST' });
        } catch (revokeErr) {
          console.warn('Token revocation error (non-fatal):', revokeErr);
        }

        // Step 3: Stop the active watch channel via edge function
        if (integration.watch_channel_id) {
          try {
            await supabase.functions.invoke('setup-calendar-watch', {
              body: { action: 'stop', userId: currentUser.id },
            });
          } catch (stopErr) {
            console.warn('Watch stop error (non-fatal):', stopErr);
          }
        }
      }

      // Step 4: Remove/deactivate the DB row
      await supabase
        .from('calendar_integrations')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('provider', 'google');

      setCalIntegration(null);
      setCalSuccessMsg('Google Calendar disconnected. You can reconnect anytime.');
      setTimeout(() => setCalSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Disconnect error:', err);
      alert('Failed to disconnect: ' + (err.message || String(err)));
    } finally {
      setCalDisconnecting(false);
    }
  };

  // â”€â”€ Fetch Sheets integration status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    async function fetchSheetsIntegration() {
      if (!currentUser?.id) { setSheetsLoading(false); return; }
      const { data } = await supabase
        .from('sheets_integrations')
        .select('id, connected_at, is_active')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      setSheetsIntegration(data?.is_active ? data : null);
      setSheetsLoading(false);
    }
    fetchSheetsIntegration();
  }, [currentUser?.id]);

  // ── Show sheets success banner if redirected back after OAuth ───────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'sheets') {
      markSheetsScopeAck();
      setActiveTab('integrations');
      setSheetsSuccessMsg('Google Sheets connected successfully! You can now import and export leads directly.');
      window.history.replaceState({}, '', '/settings?tab=integrations');
      setTimeout(() => setSheetsSuccessMsg(''), 8000);
    }
  }, [location.search]);

  // ── Connect Google Sheets (initiates OAuth with CSRF state) ──────────────
  const handleConnectSheets = () => {
    startGoogleSheetsOAuth('/settings?tab=integrations');
  };

  // â”€â”€ Disconnect Google Sheets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDisconnectSheets = async () => {
    if (!confirm(`Disconnect Google Sheets? ${BRAND_NAME} will no longer be able to export or import leads from your sheets.`)) return;
    setSheetsDisconnecting(true);
    try {
      const { data: integration } = await supabase
        .from('sheets_integrations')
        .select('access_token')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (integration?.access_token) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${integration.access_token}`, { method: 'POST' });
        } catch (revokeErr) {
          console.warn('Token revocation error (non-fatal):', revokeErr);
        }
      }

      await supabase
        .from('sheets_integrations')
        .delete()
        .eq('user_id', currentUser.id);

      setSheetsIntegration(null);
      clearSheetsScopeAck();
      setSheetsSuccessMsg('Google Sheets disconnected. You can reconnect anytime.');
      setTimeout(() => setSheetsSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Disconnect error:', err);
      alert('Failed to disconnect: ' + (err.message || String(err)));
    } finally {
      setSheetsDisconnecting(false);
    }
  };

  const handleProfileAvatarChange = (e) => {
    setProfileError('');
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSizeBytes = 2 * 1024 * 1024;

    if (!allowedTypes.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setProfileError('Only JPG, JPEG, PNG, or WebP images are allowed.');
      e.target.value = '';
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      return;
    }

    if (file.size > maxSizeBytes) {
      setProfileError('File size must be less than 2MB.');
      e.target.value = '';
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      return;
    }

    setProfileAvatarFile(file);
    setProfileAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileSaving(true);

    const trimmedName = profileName.trim();
    if (trimmedName.length < 2 || !/^[a-zA-Z\s]+$/.test(trimmedName)) {
      setProfileError('Please enter your real name.');
      setProfileSaving(false);
      return;
    }

    try {
      let finalAvatarUrl = profileAvatarUrl;

      if (profileAvatarFile) {
        const fileExt = profileAvatarFile.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(fileName, profileAvatarFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadErr) {
          throw new Error(`Profile photo upload failed: ${uploadErr.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        finalAvatarUrl = urlData?.publicUrl || null;
      }

      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({
          full_name: trimmedName,
          avatar_url: finalAvatarUrl,
          default_currency: profileDefaultCurrency || 'PKR',
          monthly_revenue_target: monthlyRevenueTarget ? Number(monthlyRevenueTarget) : null,
          timezone: profileTimezone.trim() || null,
        })
        .eq('id', currentUser.id);

      if (updateErr) throw updateErr;

      onSaveSettings(localBrand, localCurrency, localWebhook, '', '');

      if (profileDefaultCurrency) {
        localStorage.setItem('reachdesk_currency_symbol', profileDefaultCurrency);
      }

      setProfileSuccess('Profile updated successfully!');
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      if (onRefreshProfile) {
        await onRefreshProfile();
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveAutomations = async (e) => {
    e.preventDefault();
    setAutomationError('');
    setAutomationSuccess('');
    setAutomationSaving(true);

    try {
      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({
          reminders_enabled: remindersEnabled,
          reminder_notification_mode: reminderNotificationMode === 'instant' ? 'instant' : 'digest',
          reminder_digest_hour: Math.min(23, Math.max(0, Number(reminderDigestHour) || 9)),
          suggestions_enabled: suggestionsEnabled,
          suggestions_auto_apply: suggestionsAutoApply,
          call_suggestions_auto_apply: callSuggestionsAutoApply,
          messaging_action_rules: messagingActionRules.filter(
            (r) => (r.status || '').trim() && (r.suggested_action || '').trim(),
          ),
          call_status_rules: callStatusRules.filter(
            (r) => (r.status || '').trim() && (r.suggested_call_action || '').trim(),
          ),
          call_outcome_rules: callOutcomeRules.filter((r) => (r.outcome || '').trim()),
          always_draft_before_sending: alwaysDraft,
          default_country_code: defaultCountryCode.trim() || '+92',
        })
        .eq('id', currentUser.id);

      if (updateErr) throw updateErr;

      setDialerPrefs(currentUser.id, {
        dialer: defaultDialer,
        ghlUrl: ghlDialerUrl,
        customUrl: customDialerUrl,
      });

      if (suggestionsEnabled && suggestionsAutoApply) {
        try {
          const { data: leadsData } = await supabase
            .from('leads')
            .select('id, status, action_to_take')
            .eq('user_id', currentUser.id);

          if (leadsData?.length > 0) {
            const updates = [];
            for (const lead of leadsData) {
              const suggestedAction = getSuggestionForStatus(
                lead.status,
                messagingActionRules,
                { messaging_action_rules: messagingActionRules },
              );
              if (suggestedAction && lead.action_to_take !== suggestedAction) {
                updates.push(
                  supabase.from('leads').update({ action_to_take: suggestedAction }).eq('id', lead.id),
                );
              }
            }
            if (updates.length > 0) {
              await Promise.all(updates);
            }
          }
        } catch (syncErr) {
          console.error('Error auto-syncing suggestion mismatches on save:', syncErr);
        }
      }

      setAutomationSuccess('Automations updated successfully!');
      if (onRefreshProfile) {
        await onRefreshProfile();
      }
    } catch (err) {
      console.error('Error updating automations:', err);
      setAutomationError(err.message || 'Failed to update automations.');
    } finally {
      setAutomationSaving(false);
    }
  };


  const handleLeaveWorkspace = async () => {
    const { data, error } = await supabase.functions.invoke('leave-team');
    if (error) throw error;
    if (data && data.success === false) {
      throw new Error(data.error || 'Failed to leave workspace');
    }
    if (onRefreshProfile) {
      await onRefreshProfile();
    }
    navigate('/settings?tab=profile', { replace: true });
  };

  const handleCancelSubscription = async () => {
    setBillingActionLoading(true);
    setCancelErrorMsg('');
    setCancelSuccessMsg('');
    setResumeSuccessMsg('');
    setResumeErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: { subscription_id: currentUser?.paddle_subscription_id },
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      const endsLabel = data?.plan_cancels_at
        ? new Date(data.plan_cancels_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        : 'the end of your billing period';

      setCancelSuccessMsg(`Cancellation scheduled. Access continues until ${endsLabel}.`);
      setCancelModalOpen(false);
      if (onRefreshProfile) {
        await onRefreshProfile();
      }
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      setCancelErrorMsg(err instanceof Error ? err.message : 'Failed to cancel subscription. Please try again.');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    setBillingActionLoading(true);
    setResumeErrorMsg('');
    setResumeSuccessMsg('');
    setCancelSuccessMsg('');
    setCancelErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('resume-subscription');

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || 'Failed to resume subscription');
      }

      setResumeSuccessMsg('Subscription resumed. Your plan will renew per your Paddle billing settings.');
      if (onRefreshProfile) {
        await onRefreshProfile();
      }
    } catch (err) {
      console.error('Error resuming subscription:', err);
      setResumeErrorMsg(err instanceof Error ? err.message : 'Failed to resume subscription. Please try again.');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const handleSyncSubscription = async () => {
    setBillingActionLoading(true);
    setResumeErrorMsg('');
    setResumeSuccessMsg('');
    setCancelSuccessMsg('');
    setCancelErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('sync-paddle-subscription', { body: {} });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || 'Could not find an active Paddle subscription for this account');
      }
      setResumeSuccessMsg(
        `Synced from Paddle — ${data?.plan || data?.profile?.plan || 'plan'} is now active.`,
      );
      if (onRefreshProfile) {
        await onRefreshProfile();
      }
    } catch (err) {
      console.error('Error syncing subscription:', err);
      setResumeErrorMsg(err instanceof Error ? err.message : 'Failed to sync from Paddle. Please try again.');
    } finally {
      setBillingActionLoading(false);
    }
  };

  if (!currentUser) {
    return <div className="loading-container">Loading profile...</div>;
  }

  const isProOwner = isProTeamOwner(currentUser);
  const canAddTeamMembers = canPurchaseExtraSeats(currentUser);
  const seatLimit = getTeamSeatLimit(currentUser);
  const seatsUsed = getSeatsUsed(teamMembers.length, teamInvitations.length);
  const seatsAtCap = seatsUsed >= seatLimit;

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <ProfilePanel
            profileName={profileName}
            setProfileName={setProfileName}
            profileAvatarUrl={profileAvatarUrl}
            profileAvatarPreview={profileAvatarPreview}
            profileAvatarFile={profileAvatarFile}
            profileDefaultCurrency={profileDefaultCurrency}
            setProfileDefaultCurrency={setProfileDefaultCurrency}
            monthlyRevenueTarget={monthlyRevenueTarget}
            setMonthlyRevenueTarget={setMonthlyRevenueTarget}
            profileTimezone={profileTimezone}
            setProfileTimezone={setProfileTimezone}
            browserTimezone={browserTimezone}
            timezoneOptions={timezoneOptions}
            profileError={profileError}
            profileSuccess={profileSuccess}
            profileSaving={profileSaving}
            onAvatarChange={handleProfileAvatarChange}
            onSubmit={handleSaveProfile}
            localBrand={localBrand}
            setLocalBrand={setLocalBrand}
            localCurrency={localCurrency}
            setLocalCurrency={setLocalCurrency}
            localWebhook={localWebhook}
            setLocalWebhook={setLocalWebhook}
            currentUser={currentUser}
          />
        );
      case 'automations':
        return (
          <AutomationsPanel
            remindersEnabled={remindersEnabled}
            setRemindersEnabled={setRemindersEnabled}
            reminderNotificationMode={reminderNotificationMode}
            setReminderNotificationMode={setReminderNotificationMode}
            reminderDigestHour={reminderDigestHour}
            setReminderDigestHour={setReminderDigestHour}
            suggestionsEnabled={suggestionsEnabled}
            setSuggestionsEnabled={setSuggestionsEnabled}
            suggestionsAutoApply={suggestionsAutoApply}
            setSuggestionsAutoApply={setSuggestionsAutoApply}
            callSuggestionsAutoApply={callSuggestionsAutoApply}
            setCallSuggestionsAutoApply={setCallSuggestionsAutoApply}
            messagingActionRules={messagingActionRules}
            setMessagingActionRules={setMessagingActionRules}
            alwaysDraft={alwaysDraft}
            setAlwaysDraft={setAlwaysDraft}
            defaultCountryCode={defaultCountryCode}
            setDefaultCountryCode={setDefaultCountryCode}
            callOutcomeRules={callOutcomeRules}
            setCallOutcomeRules={setCallOutcomeRules}
            callStatusRules={callStatusRules}
            setCallStatusRules={setCallStatusRules}
            defaultDialer={defaultDialer}
            setDefaultDialer={setDefaultDialer}
            ghlDialerUrl={ghlDialerUrl}
            setGhlDialerUrl={setGhlDialerUrl}
            customDialerUrl={customDialerUrl}
            setCustomDialerUrl={setCustomDialerUrl}
            automationError={automationError}
            automationSuccess={automationSuccess}
            automationSaving={automationSaving}
            onSubmit={handleSaveAutomations}
          />
        );
      case 'snippets':
        return (
          <SnippetsPanel
            userSnippets={userSnippets}
            newKey={newKey}
            setNewKey={setNewKey}
            newValue={newValue}
            setNewValue={setNewValue}
            snippetError={snippetError}
            snippetSuccess={snippetSuccess}
            editingSnippetId={editingSnippetId}
            editingKey={editingKey}
            setEditingKey={setEditingKey}
            editingValue={editingValue}
            setEditingValue={setEditingValue}
            editError={editError}
            onCreateSnippet={onCreateSnippet}
            onStartEdit={onStartEdit}
            onSaveEdit={onSaveEdit}
            onDeleteSnippetClick={onDeleteSnippetClick}
            setEditingSnippetId={setEditingSnippetId}
          />
        );
      case 'team':
        return (
          <TeamPanel
            isMember={isMember}
            ownerLabel={teamOwnerLabel}
            onOpenTeams={() => navigate('/teams')}
            onLeaveWorkspace={isMember ? handleLeaveWorkspace : undefined}
          />
        );
      case 'billing':
        return (
          <BillingPanel
            currentUser={currentUser}
            cancelSuccessMsg={cancelSuccessMsg}
            cancelErrorMsg={cancelErrorMsg}
            resumeSuccessMsg={resumeSuccessMsg}
            resumeErrorMsg={resumeErrorMsg}
            billingActionLoading={billingActionLoading}
            leadsCount={leadsCount}
            templatesCount={templatesCount}
            aiUsage={aiUsage}
            isProOwner={isProOwner}
            teamLoading={teamLoading}
            seatsUsed={seatsUsed}
            seatLimit={seatLimit}
            seatsAtCap={seatsAtCap}
            extraSeats={getExtraSeats(currentUser)}
            canAddTeamMembers={canAddTeamMembers}
            onAddTeamMembers={() => setExtraSeatsModalOpen(true)}
            onManagePlan={() => navigate('/upgrade')}
            onCancelSubscription={() => setCancelModalOpen(true)}
            onResumeSubscription={handleResumeSubscription}
            onSyncSubscription={handleSyncSubscription}
          />
        );
      case 'integrations':
        return (
          <IntegrationsPanel
            currentUser={currentUser}
            calIntegration={calIntegration}
            calLoading={calLoading}
            calDisconnecting={calDisconnecting}
            calSuccessMsg={calSuccessMsg}
            sheetsIntegration={sheetsIntegration}
            sheetsLoading={sheetsLoading}
            sheetsDisconnecting={sheetsDisconnecting}
            sheetsSuccessMsg={sheetsSuccessMsg}
            onConnectCalendar={handleConnectCalendar}
            onDisconnectCalendar={handleDisconnectCalendar}
            onConnectSheets={handleConnectSheets}
            onDisconnectSheets={handleDisconnectSheets}
            onUpgrade={() => navigate('/upgrade')}
          />
        );
      case 'data':
        return (
          <DataExportPanel
            exporting={exporting}
            onExportLeads={handleExportLeadsClick}
            onExportNotes={handleExportNotesClick}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="config-page flex-col gap-4">
      <div className="config-page-header">
        <h2>Configuration</h2>
        <p className="color-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
          Choose a section to update profile, automations, billing, and more.
        </p>
      </div>

      <div className="config-layout">
        <SettingsNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          canAccessTeam={canAccessTeam}
          isMember={isMember}
        />
        <div className="config-panel">
          {renderActivePanel()}
        </div>
      </div>

      <CancelSubscriptionModal
        open={cancelModalOpen}
        loading={billingActionLoading}
        onClose={() => setCancelModalOpen(false)}
        onConfirm={handleCancelSubscription}
      />

      <ExtraSeatsPurchaseModal
        open={extraSeatsModalOpen}
        onClose={() => setExtraSeatsModalOpen(false)}
        profile={currentUser}
        onSuccess={async () => {
          if (onRefreshProfile) await onRefreshProfile();
          setExtraSeatsModalOpen(false);
        }}
      />
    </div>
  );
}
