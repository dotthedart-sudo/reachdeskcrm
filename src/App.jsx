import React, { useState, useEffect, useRef, createContext, useContext, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { getTeamIds, PLAN_LIMITS, normalizePlan, getEffectivePlan } from './lib/utils';
import { registerLifetimeSession, validateLifetimeSession, clearLifetimeSession } from './lib/sessionManager';
import { getEffectiveOutreachAccess, getEffectiveCalendarAccess, getEffectiveReportsAccess } from './lib/callActivity';
import { isValidTrialEndDate } from './lib/billing';
import { isBillingLock, isModerationLock } from './lib/accountLock';
import {
  ensureProOwnerWorkspaceIfNeeded,
  processTeamInvites,
  isActiveTeamMember,
  enrichProfileWithEffectivePlan,
  getStoredInviteToken,
  refreshProfileAfterInvite,
  setPaidInviteDeferred,
} from './lib/teamWorkspace';
import { Lock } from 'lucide-react';
import { subscribeToPush } from './utils/pushNotifications';
import { isLocalDev, getAppUrl, getMarketingUrl, isMarketingRoute } from './utils/domain';
import { identifyUser, resetPostHog } from './utils/posthog';
import { forceAppRefresh, clearAppRefreshFlags, clearServiceWorkersAndCaches } from './utils/forceAppRefresh';
import { BRAND_NAME } from './config/brand';
import * as Sentry from '@sentry/react';
import { CALL_SCRIPT_SECTIONS, TEMPLATE_KINDS } from './lib/templateKinds';
import { countDueCheckpointLeads } from './lib/checkpointNotifications';
import PaidInviteJoinModal from './components/PaidInviteJoinModal';

// Helper for lazy loading components with automatic retry on dynamic import / chunk load failures (e.g. after new deployments)
const LAZY_IMPORT_RETRIES = 3;
const LAZY_IMPORT_RETRY_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importWithDevRetries(componentImport) {
  let lastError;
  for (let attempt = 0; attempt < LAZY_IMPORT_RETRIES; attempt += 1) {
    try {
      return await componentImport();
    } catch (error) {
      lastError = error;
      if (attempt < LAZY_IMPORT_RETRIES - 1) {
        console.warn(`[lazyWithRetry] Import attempt ${attempt + 1} failed, retrying…`, error);
        await sleep(LAZY_IMPORT_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const pageHasAlreadyBeenReloaded = JSON.parse(
      sessionStorage.getItem('retry_lazy_reload') || 'false'
    );
    try {
      const component = isLocalDev()
        ? await importWithDevRetries(componentImport)
        : await componentImport();
      sessionStorage.setItem('retry_lazy_reload', 'false');
      return component;
    } catch (error) {
      console.warn('[lazyWithRetry] Dynamic import failed, triggering hard refresh:', error);
      if (!pageHasAlreadyBeenReloaded && !isLocalDev()) {
        sessionStorage.setItem('retry_lazy_reload', 'true');
        forceAppRefresh({ clearFlags: false });
        return { default: () => null };
      }
      throw error;
    }
  });
}

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleRetry = this.handleRetry.bind(this);
    this.handleRefresh = this.handleRefresh.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleRetry() {
    clearAppRefreshFlags();
    this.setState({ hasError: false, error: null });
  }

  handleRefresh() {
    forceAppRefresh();
  }

  componentDidCatch(error, errorInfo) {
    console.error('[GlobalErrorBoundary] Caught error:', error, errorInfo);
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack: errorInfo?.componentStack },
      },
    });
    if (typeof window !== 'undefined') {
      window.__lastBoundaryError = error?.message || String(error);
    }
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Expected a JavaScript-or-Wasm module');

    if (isChunkError && !isLocalDev()) {
      const hasReloaded = JSON.parse(sessionStorage.getItem('chunk_error_reloaded') || 'false');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_error_reloaded', 'true');
        forceAppRefresh({ clearFlags: false });
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const dev = isLocalDev();
      const errorMessage = this.state.error?.message || window.__lastBoundaryError || 'Unknown error';

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#050505',
          color: '#FFFFFF',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif'
        }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>
            {dev ? 'Something went wrong loading the app' : 'Something went wrong'}
          </h2>
          <p style={{ color: '#A3A3A3', marginBottom: '1rem', fontSize: '0.9rem', maxWidth: 480 }}>
            {dev
              ? 'This often happens after hot reload during development. Try again, or restart the dev server if it persists.'
              : 'A page failed to render. Your session is still active — try again, or reload if the problem continues.'}
          </p>
          {dev && (
            <pre style={{
              color: '#fca5a5',
              fontSize: '0.75rem',
              marginBottom: '1.25rem',
              maxWidth: 'min(640px, 90vw)',
              overflow: 'auto',
              textAlign: 'left',
              padding: '0.75rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '6px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {errorMessage}
            </pre>
          )}
          {!dev && (
            <p style={{ color: '#737373', marginBottom: '1.25rem', fontSize: '0.8rem', maxWidth: 420 }}>
              If this keeps happening after a deploy, use a hard refresh (Ctrl+Shift+R).
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                padding: '8px 18px',
                backgroundColor: '#FFFFFF',
                color: '#050505',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 18px',
                backgroundColor: 'transparent',
                color: '#FFFFFF',
                border: '1px solid #525252',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              Reload page
            </button>
            {dev && (
              <button
                type="button"
                onClick={this.handleRefresh}
                style={{
                  padding: '8px 18px',
                  backgroundColor: 'transparent',
                  color: '#A3A3A3',
                  border: '1px solid #404040',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Hard refresh (clear caches)
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Components
// Lazy‑loaded route components with retry support for seamless deployment updates
const CRM = lazyWithRetry(() => import('./components/CRM'));
const Templates = lazyWithRetry(() => import('./components/Templates'));
const InvoiceGenerator = lazyWithRetry(() => import('./components/InvoiceGenerator'));
const RevenueTracker = lazyWithRetry(() => import('./components/RevenueTracker'));
const AdminPanel = lazyWithRetry(() => import('./components/AdminPanel'));
const Homepage = lazyWithRetry(() => import('./components/Homepage'));
const Auth = lazyWithRetry(() => import('./components/Auth'));
const Configuration = lazyWithRetry(() => import('./components/Configuration'));
const Teams = lazyWithRetry(() => import('./components/Teams'));
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));
const NotesList = lazyWithRetry(() => import('./components/NotesList'));
const NoteEditor = lazyWithRetry(() => import('./components/NoteEditor'));
const Reminders = lazyWithRetry(() => import('./components/Reminders'));
const AppLayout = lazyWithRetry(() => import('./components/AppLayout'));
const ProtectedRoute = lazyWithRetry(() => import('./components/ProtectedRoute'));
const UpgradeRoute = lazyWithRetry(() => import('./components/ProtectedRoute').then(m => ({ default: m.UpgradeRoute })));
const AdminRoute = lazyWithRetry(() => import('./components/AdminRoute'));
const LoadingSpinner = lazyWithRetry(() => import('./components/LoadingSpinner'));
const UpgradePage = lazyWithRetry(() => import('./components/Paywalls').then(m => ({ default: m.UpgradePage })));
const PublicInvoice = lazyWithRetry(() => import('./components/PublicInvoice'));
const ResetPassword = lazyWithRetry(() => import('./components/ResetPassword'));
const TermsOfService = lazyWithRetry(() => import('./components/LegalPages').then(m => ({ default: m.TermsOfService })));
const PrivacyPolicy = lazyWithRetry(() => import('./components/LegalPages').then(m => ({ default: m.PrivacyPolicy })));
const RefundPolicy = lazyWithRetry(() => import('./components/LegalPages').then(m => ({ default: m.RefundPolicy })));
const GetStarted = lazyWithRetry(() => import('./components/GetStarted'));
const GoogleCalendarCallback = lazyWithRetry(() => import('./components/GoogleCalendarCallback'));
const GoogleSheetsCallback = lazyWithRetry(() => import('./components/GoogleSheetsCallback'));
const CalendarPageView = lazyWithRetry(() => import('./components/Calendar'));
const ReportsPageView = lazyWithRetry(() => import('./components/Reports'));
import SetupModal from './components/SetupModal';
import { HelmetProvider } from 'react-helmet-async';
import GlobalHelmet from './components/GlobalHelmet';

const BlogIndex = lazyWithRetry(() => import('./components/BlogIndex'));
const BlogPost = lazyWithRetry(() => import('./components/BlogPost'));

// App Context
export const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

const STARTER_TEMPLATES = [
  // 1. INITIAL TEMPLATES
  {
    id: 'starter-new-1',
    title: 'Cold Opener — Straight Up',
    platform: 'INITIAL TEMPLATES',
    subject: '',
    body: "Hey [Name], came across your work and thought there might be a good fit here. I help [niche] with [result]. Worth a quick chat?",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-2',
    title: 'Cold Opener — Value First',
    platform: 'INITIAL TEMPLATES',
    subject: '',
    body: "Hey [Name], noticed [specific thing about them]. I recently helped someone in a similar space get [result]. Would love to share how — open to a 10-min call?",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-3',
    title: 'Cold Opener — Question Hook',
    platform: 'INITIAL TEMPLATES',
    subject: '',
    body: "Hey [Name], quick question — are you currently looking to [goal/pain point]? Working with a few [niche] clients on exactly this.",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-4',
    title: 'Cold Opener — Compliment + Ask',
    platform: 'INITIAL TEMPLATES',
    subject: '',
    body: "Hey [Name], loved [specific work/post]. I work with [niche] to help them [result]. Would it make sense to connect?",
    is_starter: true,
    user_id: null
  },
  // 2. FOLLOW UPS
  {
    id: 'starter-new-5',
    title: 'Follow Up #1 — Day 2',
    platform: 'FOLLOW UPS',
    subject: '',
    body: "Hey [Name], just checking if you saw my last message. Still think there's something here worth exploring — let me know!",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-6',
    title: 'Follow Up #2 — Day 4',
    platform: 'FOLLOW UPS',
    subject: '',
    body: "Hey [Name], I know you're busy. Just wanted to bump this up. Happy to keep it super short — even 10 mins works.",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-7',
    title: 'Follow Up #3 — Day 7',
    platform: 'FOLLOW UPS',
    subject: '',
    body: "Hey [Name], throwing this back up in case it got buried. Would love to show you what we've been doing for [niche] lately.",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-8',
    title: 'Follow Up #4 — Day 10',
    platform: 'FOLLOW UPS',
    subject: '',
    body: "Hey [Name], still here if the timing wasn't right before. Things move fast — happy to reconnect whenever works for you.",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-9',
    title: 'Follow Up #5 — Day 14',
    platform: 'FOLLOW UPS',
    subject: '',
    body: "Hey [Name], one more nudge — I genuinely think [result] is achievable for you. Worth 10 mins to find out?",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-10',
    title: 'Follow Up #6 — Day 21',
    platform: 'FOLLOW UPS',
    subject: '',
    body: "Hey [Name], been a while! Circling back in case things have changed on your end. Still happy to help with [pain point].",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-11',
    title: 'Follow Up #7 — Breakup',
    platform: 'FOLLOW UPS',
    subject: '',
    body: "Hey [Name], I'll stop reaching out after this — don't want to clutter your inbox. If you ever need help with [result], you know where to find me. Wishing you the best!",
    is_starter: true,
    user_id: null
  },
  // 3. BOOKING MESSAGES
  {
    id: 'starter-new-12',
    title: 'Calendar Link Send',
    platform: 'BOOKING MESSAGES',
    subject: '',
    body: "Hey [Name], great connecting! Here's my calendar link to book a time that works for you: [Calendar Link]. Looking forward to it!",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-13',
    title: 'Reschedule Request',
    platform: 'BOOKING MESSAGES',
    subject: '',
    body: "Hey [Name], something came up on my end — so sorry! Would you be open to rescheduling? Here's my link: [Calendar Link].",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-14',
    title: 'Reminder Before Call',
    platform: 'BOOKING MESSAGES',
    subject: '',
    body: "Hey [Name], just a quick reminder — we have a call scheduled for [Date/Time]. Looking forward to chatting!",
    is_starter: true,
    user_id: null
  },
  // 4. AFTER BOOKED
  {
    id: 'starter-new-15',
    title: 'Confirmation Message',
    platform: 'AFTER BOOKED',
    subject: '',
    body: "Hey [Name], confirmed for [Date/Time]! I'll send over a quick agenda beforehand. Feel free to reach out if anything changes.",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-16',
    title: 'Pre-Call Prep',
    platform: 'AFTER BOOKED',
    subject: '',
    body: "Hey [Name], our call is tomorrow! Just wanted to share what we'll cover: [agenda points]. See you then!",
    is_starter: true,
    user_id: null
  },
  // 5. AFTER CLIENT BOOKED
  {
    id: 'starter-new-17',
    title: 'Onboarding Welcome',
    platform: 'AFTER CLIENT BOOKED',
    subject: '',
    body: "Hey [Name], so excited to work together! Here's what happens next: [onboarding steps]. Feel free to reach out anytime.",
    is_starter: true,
    user_id: null
  },
  {
    id: 'starter-new-18',
    title: 'First Check-In',
    platform: 'AFTER CLIENT BOOKED',
    subject: '',
    body: "Hey [Name], checking in after our first week together! How's everything going? Any questions or feedback — I'm all ears.",
    is_starter: true,
    user_id: null
  }
];

const STARTER_CALL_SCRIPTS = CALL_SCRIPT_SECTIONS.map((platform) => ({
  id: `starter-call-${platform.toLowerCase()}`,
  title: `${platform.charAt(0) + platform.slice(1).toLowerCase()} (add your script)`,
  platform,
  kind: TEMPLATE_KINDS.CALLS,
  subject: '',
  body: '',
  is_starter: true,
  user_id: null,
}));

function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [subStatus, setSubStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [brandName, setBrandName] = useState(BRAND_NAME);
  const [currencySymbol, setCurrencySymbol] = useState('PKR');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [teamIds, setTeamIds] = useState([]);
  const [teamProfilesMap, setTeamProfilesMap] = useState({});
  const [leads, setLeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [userSnippets, setUserSnippets] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [revenueLogs, setRevenueLogs] = useState([]);
  const [adminNotifCount, setAdminNotifCount] = useState(0);
  const [remindersCount, setRemindersCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [outreachUnlocked, setOutreachUnlocked] = useState(false);
  const [calendarUnlocked, setCalendarUnlocked] = useState(false);
  const [reportsUnlocked, setReportsUnlocked] = useState(false);
  const [paidInviteConfirm, setPaidInviteConfirm] = useState(null); // { profile }
  const [paidInviteLoading, setPaidInviteLoading] = useState(false);

  // Tracks the user ID whose profile is currently loaded.
  // Using a ref (not state) so the onAuthStateChange closure always reads
  // the latest value — refs are never stale even inside [] effects.
  const loadedUserIdRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleDeclinePaidInvite = () => {
    setPaidInviteDeferred(true);
    setPaidInviteConfirm(null);
    showToast('Invite kept pending. You can join later from the invite link.', 'info');
  };

  const handleConfirmPaidInvite = async () => {
    const confirmProfile = paidInviteConfirm?.profile;
    if (!confirmProfile?.id) {
      setPaidInviteConfirm(null);
      return;
    }
    setPaidInviteLoading(true);
    try {
      const inviteResult = await processTeamInvites({
        retries: 3,
        profile: confirmProfile,
        confirmPaidJoin: true,
      });
      if (!inviteResult?.ok) {
        showToast(inviteResult?.error || 'Could not join the team. Try again from your invite link.', 'error');
        return;
      }
      const { data: refreshed } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', confirmProfile.id)
        .maybeSingle();
      if (refreshed) {
        const enriched = await enrichProfileWithEffectivePlan(refreshed);
        setProfile(enriched);
        setSubStatus(await checkSubscriptionStatus(enriched));
        const ids = await getTeamIds(confirmProfile.id);
        setTeamIds(ids);
      }
      setPaidInviteConfirm(null);
      showToast('Joined as a team member. Your personal subscription was not refunded or cancelled.', 'info');
    } catch (err) {
      console.warn('[Profile] Paid invite confirm failed:', err);
      showToast(err.message || 'Could not join the team.', 'error');
    } finally {
      setPaidInviteLoading(false);
    }
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Realtime subscription for admin upgrade requests
  useEffect(() => {
    const isAdmin = profile?.role === 'admin';
    if (!session || !isAdmin) return;

    const channel = supabase.channel('admin-notifications-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          if (payload.new && payload.new.type === 'upgrade_request' && payload.new.request_status === 'pending') {
            showToast(`New upgrade request from ${payload.new.from_email || 'user'}`, 'info');
            setAdminNotifCount(prev => prev + 1);
            setRemindersCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, profile]);

  // Subscribe to web push after profile is loaded
  useEffect(() => {
    if (profile?.id) {
      subscribeToPush(supabase, profile.id);
    }
  }, [profile?.id]);

  // Initial setup
  useEffect(() => {
    const localTheme = localStorage.getItem('reachdesk_theme') || 'dark';
    setTheme(localTheme);
    if (localTheme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');

    setBrandName(localStorage.getItem('reachdesk_brand_name') || BRAND_NAME);
    setCurrencySymbol(localStorage.getItem('reachdesk_currency_symbol') || 'PKR');
    setWebhookUrl(localStorage.getItem('reachdesk_webhook_url') || '');
  }, []);

  // Auth listener
  useEffect(() => {
    // Intercept recovery token early in the lifecycle before Supabase cleans it up
    const hash = window.location.hash || '';
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      sessionStorage.setItem('is_recovering_password', 'true');
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id, session);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('is_recovering_password', 'true');
      }

      if (session) {
        // Only run fetchProfile if we haven't already loaded this user's profile.
        // loadedUserIdRef is a ref — it always reads the live value, never stale.
        // This suppresses TOKEN_REFRESHED, SIGNED_IN, INITIAL_SESSION re-fires
        // that happen on every tab switch, which were wiping forms and showing
        // the full-page loading spinner unnecessarily.
        if (loadedUserIdRef.current !== session.user.id) {
          // Pass the live session explicitly — the React `session` state is still
          // stale inside fetchProfile's closure when called from this callback.
          fetchProfile(session.user.id, session);
        } else if (getStoredInviteToken()) {
          // Signup may finish auth before fetchProfile runs again — retry invite accept.
          refreshProfileAfterInvite(session.user.id).then(async ({ result, profile: refreshed, confirmProfile }) => {
            if (result?.needsPaidJoinConfirm && confirmProfile) {
              setPaidInviteConfirm({ profile: confirmProfile });
              return;
            }
            if (!result?.ok || !refreshed) return;
            setProfile(await enrichProfileWithEffectivePlan(refreshed));
            setSubStatus(await checkSubscriptionStatus(refreshed));
            const ids = await getTeamIds(session.user.id);
            setTeamIds(ids);
          }).catch((err) => console.warn('[Profile] Invite retry failed:', err));
        }
      } else {
        // Signed out — clear the ref so next login loads fresh
        loadedUserIdRef.current = null;
        setProfile(null);
        setSubStatus('active');
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkSubscriptionStatus = async (p) => {
    if (p.role === 'admin') return 'active';
    if (p.status === 'denied') return 'denied';
    if (p.plan === 'enterprise' || p.plan === 'lifetime') return 'active';
    if (await isActiveTeamMember(p)) return 'active';

    if (p.plan === 'trial') {
      if (isValidTrialEndDate(p.trial_ends_at) && new Date(p.trial_ends_at) < new Date()) {
        return 'trial_expired';
      }
    } else {
      if (p.plan_expires_at && new Date(p.plan_expires_at) < new Date()) {
        return 'subscription_expired';
      }
    }

    if (p.status === 'pending') return 'pending';
    return 'active';
  };

  const fetchProfile = async (userId, liveSession) => {
    if (!userId) {
      setLoading(false);
      return;
    }
    // Only show the loading spinner on first load (ref not yet set).
    // On any subsequent call for the same user, keep the UI intact.
    if (!loadedUserIdRef.current) {
      setLoading(true);
    }
    let attempts = 0;
    const maxAttempts = 4;
    while (attempts < maxAttempts) {
      try {
        let { data: p, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) throw error;

        // Use the explicitly-passed liveSession (fresh from Supabase callback) so we
        // never read the stale React `session` state — it may still be null when
        // onAuthStateChange calls fetchProfile for a new Google OAuth user.
        const activeSession = liveSession ?? session;
        // Only create a profile from scratch when the row doesn't exist at all.
        // Do NOT enter this block for existing users with an empty full_name —
        // that would upsert a fresh trial_ends_at and reset their trial.
        if (activeSession && activeSession.user.id === userId && !p) {
          const email = activeSession.user.email;
          const fullName = activeSession.user.user_metadata?.full_name || activeSession.user.user_metadata?.name || '';
          const avatarUrl = activeSession.user.user_metadata?.avatar_url || null;
          const requestedPlan = activeSession.user.user_metadata?.requested_plan || 'trial';
          const referralSource = activeSession.user.user_metadata?.referral_source || null;
          const marketingConsent = activeSession.user.user_metadata?.marketing_consent || false;
          const status = 'approved';
          const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          const profileData = {
            id: userId,
            email,
            status,
            plan: 'trial',
            requested_plan: requestedPlan,
            trial_ends_at: trialEnds,
            team_id: null,
            team_role: 'owner',
            full_name: fullName,
            referral_source: referralSource,
            marketing_consent: marketingConsent,
            has_completed_setup: false,
          };

          // Only include avatar_url if it's set in metadata, to avoid overwriting a non-null database value
          if (avatarUrl) {
            profileData.avatar_url = avatarUrl;
          }

          const { data: newProfile, error: profileErr } = await supabase.from('user_profiles').upsert(profileData).select().single();

          let joinedProfile = newProfile;
          if (profileErr) {
            console.error('Failed to auto-create/update user profile:', profileErr);
            const { data: existing } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
            if (existing) {
              p = existing;
              joinedProfile = null;
            } else {
              throw profileErr;
            }
          }

          if (joinedProfile) {
          try {
            const inviteResult = await processTeamInvites({ retries: 3, profile: joinedProfile });
            if (inviteResult?.needsPaidJoinConfirm) {
              setPaidInviteConfirm({ profile: joinedProfile });
            } else if (inviteResult?.ok) {
              const { data: refreshed } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
              if (refreshed) joinedProfile = refreshed;
            } else if (getStoredInviteToken()) {
              console.warn('[Profile] Team invite not accepted on signup:', inviteResult);
            }
          } catch (inviteErr) {
            console.warn('[Profile] Team invite accept failed:', inviteErr);
          }

          const isGoogle = activeSession.user.app_metadata?.provider === 'google';
          supabase.functions.invoke('notify-admin-signup', {
            body: { is_google: isGoogle },
          }).catch(err => console.warn('[Push] Admin new-signup notification failed:', err));

          p = joinedProfile;
          }
        }

        // Existing profile but missing full_name (e.g. OAuth signup without a display name).
        // Patch ONLY that field — never upsert the whole row — so trial_ends_at is never touched.
        if (p && !p.full_name && activeSession && activeSession.user.id === userId) {
          const patchedName = activeSession.user.user_metadata?.full_name
            || activeSession.user.user_metadata?.name
            || '';
          if (patchedName) {
            await supabase.from('user_profiles')
              .update({ full_name: patchedName })
              .eq('id', userId);
            p = { ...p, full_name: patchedName };
          }
        }

        if (p) {
          const now = new Date();
          let profileToSet = p;

          try {
            const inviteResult = await processTeamInvites({ retries: 2, profile: profileToSet });
            if (inviteResult?.needsPaidJoinConfirm) {
              setPaidInviteConfirm({ profile: profileToSet });
            } else if (inviteResult?.ok) {
              const { data: refreshed } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
              if (refreshed) profileToSet = refreshed;
            }
            profileToSet = await ensureProOwnerWorkspaceIfNeeded(profileToSet);
          } catch (teamErr) {
            console.warn('[Profile] Team workspace setup failed:', teamErr);
          }

          const isAdminUser = profileToSet.role === 'admin';
          const isLifetimeOrLegacy = profileToSet.plan === 'enterprise' || profileToSet.plan === 'lifetime';
          const onActiveTeam = await isActiveTeamMember(profileToSet);

          const trialEnds = isValidTrialEndDate(profileToSet.trial_ends_at)
            ? new Date(profileToSet.trial_ends_at)
            : null;
          let isTrialExpired = false;
          if (!onActiveTeam && profileToSet.plan === 'trial') {
            isTrialExpired = !!(trialEnds && now > trialEnds && profileToSet.status !== 'approved');
          }

          let isSubscriptionExpired = false;
          if (!onActiveTeam && profileToSet.plan !== 'trial' && !isLifetimeOrLegacy) {
            const planExpires = profileToSet.plan_expires_at ? new Date(profileToSet.plan_expires_at) : null;
            isSubscriptionExpired = planExpires && now > planExpires;
          }

          const shouldLock = !onActiveTeam && !isAdminUser && !isLifetimeOrLegacy && (isTrialExpired || isSubscriptionExpired);

          if (onActiveTeam && profileToSet.account_locked && !isModerationLock(profileToSet)) {
            const { data: unlockedProfile, error: unlockError } = await supabase
              .from('user_profiles')
              .update({ account_locked: false, locked_at: null })
              .eq('id', userId)
              .select()
              .single();
            if (!unlockError && unlockedProfile) {
              profileToSet = unlockedProfile;
            } else {
              profileToSet = { ...profileToSet, account_locked: false, locked_at: null };
            }
          } else if (shouldLock && !profileToSet.account_locked && !isModerationLock(profileToSet)) {
            const lockedAt = now.toISOString();
            const { data: updatedProfile, error: updateError } = await supabase
              .from('user_profiles')
              .update({ account_locked: true, locked_at: lockedAt })
              .eq('id', userId)
              .select()
              .single();
            if (!updateError && updatedProfile) {
              profileToSet = updatedProfile;
            } else {
              profileToSet = { ...profileToSet, account_locked: true, locked_at: lockedAt };
            }
          }

          // Stamp last_active_at on every successful login/session load.
          // Fire-and-forget — never awaited, so it never delays the UI.
          // Isolated update so it cannot accidentally overwrite unrelated columns.
          supabase.from('user_profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', userId)
            .then(({ error: laErr }) => {
              if (laErr) console.warn('[Profile] Failed to update last_active_at:', laErr);
            });

          const sessionCheck = await validateLifetimeSession(userId, normalizePlan(profileToSet.plan));
          if (!sessionCheck.valid) {
            await supabase.auth.signOut();
            clearLifetimeSession(userId);
            setProfile(null);
            setLoading(false);
            alert('Your Lifetime account is active on another device. You have been signed out here.');
            return;
          }
          await registerLifetimeSession(userId, normalizePlan(profileToSet.plan));

          profileToSet = await enrichProfileWithEffectivePlan(profileToSet);

          // Commit profile immediately — post-load steps must not block or undo this.
          setProfile(profileToSet);
          loadedUserIdRef.current = userId;
          setLoading(false);

          try {
            setOutreachUnlocked(await getEffectiveOutreachAccess(profileToSet));
            setCalendarUnlocked(await getEffectiveCalendarAccess(profileToSet));
            setReportsUnlocked(await getEffectiveReportsAccess(profileToSet));
            identifyUser(userId, {
              email: profileToSet.email,
              plan: profileToSet.plan,
              role: profileToSet.role,
              status: profileToSet.status,
            });
            const status = await checkSubscriptionStatus(profileToSet);
            setSubStatus(status);

            const ids = await getTeamIds(userId);
            setTeamIds(ids);

            if (ids.length > 0) {
              const { data: members } = await supabase.from('user_profiles')
                .select('id, email, full_name')
                .in('id', ids);
              const mapping = {};
              members?.forEach(m => { mapping[m.id] = { id: m.id, email: m.email, full_name: m.full_name }; });
              setTeamProfilesMap(mapping);
            }

            await fetchAllData(ids, userId, profileToSet.role === 'admin', profileToSet);
          } catch (postLoadErr) {
            console.error('[Profile] Post-load setup failed (profile kept):', postLoadErr);
            setSubStatus(await checkSubscriptionStatus(profileToSet).catch(() => 'active'));
          }
          return; // Success, exit function
        }
      } catch (err) {
        console.error(`Error loading profile (attempt ${attempts + 1}):`, err);
      }

      attempts++;
      if (attempts < maxAttempts) {
        // Wait 500ms before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    // Only clear profile if we never successfully loaded one this session
    if (loadedUserIdRef.current !== userId) {
      setProfile(null);
    }
    setLoading(false);
  };

  const fetchAllData = async (ids, userId, isAdmin, profileObj = null) => {
    try {
      const p = profileObj || profile;
      let revenueQuery = supabase.from('revenue_entries').select('*').eq('user_id', userId).order('paid_at', { ascending: false });

      // Members may view owner/team revenue when the owner enables the permission
      const role = (p?.team_role || 'owner').toLowerCase();
      if (role === 'member' && p?.team_id) {
        const { data: teamSettings } = await supabase
          .from('teams')
          .select('members_can_view_revenue')
          .eq('id', p.team_id)
          .maybeSingle();
        if (teamSettings?.members_can_view_revenue && ids?.length) {
          revenueQuery = supabase.from('revenue_entries').select('*').in('user_id', ids).order('paid_at', { ascending: false });
        }
      }

      const [inv, rev, l, t, snip, revProfilesRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        revenueQuery,
        supabase.from('leads').select('*').in('user_id', ids).order('created_at', { ascending: false }).order('id', { ascending: true }),
        supabase.from('templates').select('*').or(`user_id.in.(${ids.join(',')}),user_id.is.null`),
        supabase.from('user_snippets').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('user_profiles').select('id, email, full_name').in('id', ids),
      ]);

      let email = session?.user?.email || profile?.email || '';
      if (!email) {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        email = activeSession?.user?.email || '';
      }
      const mappedInvoices = (inv.data || []).map(item => ({
        id: item.id,
        user_id: item.user_id,
        invoiceNumber: item.invoice_number,
        clientName: item.client_name,
        clientEmail: item.client_email,
        issueDate: item.issue_date,
        dueDate: item.due_date,
        currency: item.currency,
        items: item.items || [],
        status: item.status,
        notes: item.notes,
        subtotal: item.subtotal || 0,
        tax: item.tax || 0,
        total: item.total || 0,
        paymentDetails: item.payment_instructions,
        userEmail: email
      }));
      setInvoices(mappedInvoices);
      const emailByUserId = {};
      (revProfilesRes.data || []).forEach((p) => {
        emailByUserId[p.id] = p.email;
      });
      // Map DB columns → frontend shape
      const mappedRevenue = (rev.data || []).map(r => ({
        id: r.id,
        user_id: r.user_id,
        amount: r.amount || 0,
        currency: r.currency || 'USD',
        source: r.client_name || '',     // DB: client_name → frontend: source
        date: r.paid_at ? r.paid_at.split('T')[0] : '',  // DB: paid_at → frontend: date
        description: r.notes || '',      // DB: notes → frontend: description
        service: r.service || '',        // DB: service → frontend: service
        dateAdded: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
        userEmail: emailByUserId[r.user_id] || email,
      }));
      setRevenueLogs(mappedRevenue);
      // Client-side priority migration for emojis
      const leadsData = l.data || [];
      const updatedLeadsList = [];
      for (let lead of leadsData) {
        if (lead.priority && /🔥|⚡|📦|🧊/.test(lead.priority)) {
          let cleanPriority = lead.priority.replace(/🔥|⚡|📦|🧊/g, '').trim();
          if (cleanPriority.toLowerCase() === 'hot') cleanPriority = 'Hot';
          else if (cleanPriority.toLowerCase() === 'warm') cleanPriority = 'Warm';
          else if (cleanPriority.toLowerCase() === 'cold') cleanPriority = 'Cold';
          
          lead = { ...lead, priority: cleanPriority };
          
          // Trigger background update in Supabase
          supabase
            .from('leads')
            .update({ priority: cleanPriority })
            .eq('id', lead.id)
            .then(({ error }) => {
              if (error) console.error(`Failed to migrate priority for lead ${lead.id}:`, error);
            });
        }
        updatedLeadsList.push(lead);
      }
      setLeads(updatedLeadsList);

      const customMapped = (t.data || []).map(tmpl => {
        try {
          if (tmpl.content && tmpl.content.startsWith('{') && tmpl.content.endsWith('}')) {
            const parsed = JSON.parse(tmpl.content);
            return {
              ...tmpl,
              subject: parsed.subject || '',
              body: parsed.body || ''
            };
          }
        } catch (e) {
          // fallback
        }
        return {
          ...tmpl,
          subject: '',
          body: tmpl.content || ''
        };
      });

      setTemplates([
        ...STARTER_TEMPLATES.map((t) => ({ ...t, kind: TEMPLATE_KINDS.MESSAGING })),
        ...STARTER_CALL_SCRIPTS,
        ...customMapped.map((t) => ({ ...t, kind: t.kind || TEMPLATE_KINDS.MESSAGING })),
      ]);
      setUserSnippets(snip.data || []);

      // Reminders count — due checkpoints on leads.next_checkpoint_at
      let totalReminders = 0;
      const activeProfile = profileObj || profile;
      const remindersEnabled = activeProfile?.reminders_enabled !== false;
      if (remindersEnabled) {
        totalReminders = await countDueCheckpointLeads({ userIds: ids });
      }
      
      if (isAdmin) {
        const { count: adminNotifsCount } = await supabase.from('admin_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('type', 'upgrade_request')
          .eq('request_status', 'pending');
        totalReminders += (adminNotifsCount || 0);
      }
      setRemindersCount(totalReminders);

      if (isAdmin) {
        const { count: notifCount } = await supabase.from('admin_notifications')
          .select('*', { count: 'exact', head: true }).eq('is_read', false);
        setAdminNotifCount(notifCount || 0);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const handleLogout = async () => {
    resetPostHog();
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setSubStatus('active');
    setOutreachUnlocked(false);
    setCalendarUnlocked(false);
    setReportsUnlocked(false);
  };

  const handleRegisterUser = async (email, password, plan, fullName, avatarFile, referralSource, marketingConsent) => {
    const displayName = fullName ? fullName.trim().split(' ')[0] : '';
    // Sign up user and store all form fields in metadata so that they are securely written
    // to the database by fetchProfile once the user is authenticated (post-OTP).
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          full_name: fullName,
          requested_plan: plan,
          referral_source: referralSource || null,
          marketing_consent: marketingConsent || false
        }
      }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Registration failed.');
  };

  const handleLoginUser = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('reachdesk_theme', newTheme);
    if (newTheme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
  };

  const handleSaveSettings = (newBrand, newCurrency, newWebhook) => {
    localStorage.setItem('reachdesk_brand_name', newBrand);
    localStorage.setItem('reachdesk_currency_symbol', newCurrency);
    localStorage.setItem('reachdesk_webhook_url', newWebhook);
    setBrandName(newBrand);
    setCurrencySymbol(newCurrency);
    setWebhookUrl(newWebhook);
    alert('Settings saved successfully!');
  };

  // Invoices & Revenue handlers
  const handleAddInvoice = async (invoice) => {
    const dbInvoice = {
      invoice_number: invoice.invoiceNumber,
      client_name: invoice.clientName,
      client_email: invoice.clientEmail,
      issue_date: invoice.issueDate,
      due_date: invoice.dueDate,
      currency: invoice.currency,
      items: invoice.items,
      status: invoice.status,
      notes: invoice.notes,
      subtotal: invoice.subtotal || 0,
      tax: invoice.tax || 0,
      total: invoice.total,
      payment_instructions: invoice.paymentDetails,
      user_id: session.user.id
    };
    const { data, error } = await supabase.from('invoices').insert(dbInvoice).select().single();
    if (!error && data) {
      const mapped = {
        id: data.id,
        user_id: data.user_id,
        invoiceNumber: data.invoice_number,
        clientName: data.client_name,
        clientEmail: data.client_email,
        issueDate: data.issue_date,
        dueDate: data.due_date,
        currency: data.currency,
        items: data.items || [],
        status: data.status,
        notes: data.notes,
        subtotal: data.subtotal || 0,
        tax: data.tax || 0,
        total: data.total || 0,
        paymentDetails: data.payment_instructions,
        userEmail: session?.user?.email || ''
      };
      setInvoices(prev => [mapped, ...prev]);
    }
  };
  const handleDeleteInvoice = async (id) => {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (!error) setInvoices(prev => prev.filter(i => i.id !== id));
  };
  const handleUpdateInvoiceStatus = async (id, status) => {
    const { data, error } = await supabase.from('invoices').update({ status }).eq('id', id).select().single();
    if (!error && data) {
      const mapped = {
        id: data.id,
        user_id: data.user_id,
        invoiceNumber: data.invoice_number,
        clientName: data.client_name,
        clientEmail: data.client_email,
        issueDate: data.issue_date,
        dueDate: data.due_date,
        currency: data.currency,
        items: data.items || [],
        status: data.status,
        notes: data.notes,
        subtotal: data.subtotal || 0,
        tax: data.tax || 0,
        total: data.total || 0,
        paymentDetails: data.payment_instructions,
        userEmail: session?.user?.email || profile?.email || ''
      };
      setInvoices(prev => prev.map(i => i.id === id ? mapped : i));
    }
  };
  const handleUpdateInvoice = async (id, updatedFields) => {
    const subtotal = (updatedFields.items || []).reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    const taxAmount = (subtotal * (parseFloat(updatedFields.taxPercent) || 0)) / 100;
    const total = subtotal + taxAmount;

    const dbFields = {
      invoice_number: updatedFields.invoiceNumber,
      client_name: updatedFields.clientName,
      client_email: updatedFields.clientEmail,
      issue_date: updatedFields.issueDate,
      due_date: updatedFields.dueDate || null,
      currency: updatedFields.currency,
      items: updatedFields.items,
      status: updatedFields.status,
      notes: updatedFields.notes,
      subtotal,
      tax: taxAmount,
      total,
      payment_instructions: updatedFields.paymentDetails
    };

    const { data, error } = await supabase.from('invoices').update(dbFields).eq('id', id).select().single();
    if (!error && data) {
      const mapped = {
        id: data.id,
        user_id: data.user_id,
        invoiceNumber: data.invoice_number,
        clientName: data.client_name,
        clientEmail: data.client_email,
        issueDate: data.issue_date,
        dueDate: data.due_date,
        currency: data.currency,
        items: data.items || [],
        status: data.status,
        notes: data.notes,
        subtotal: data.subtotal || 0,
        tax: data.tax || 0,
        total: data.total || 0,
        paymentDetails: data.payment_instructions,
        userEmail: session?.user?.email || profile?.email || ''
      };
      setInvoices(prev => prev.map(i => i.id === id ? mapped : i));
      return { data: mapped, error: null };
    }
    return { data: null, error };
  };
  const handleAddRevenueLog = async (log) => {
    // Map frontend fields → DB columns
    const dbRow = {
      user_id: session.user.id,
      client_name: log.source || 'Unknown',     // frontend: source → DB: client_name (NOT NULL)
      amount: log.amount,
      currency: log.currency,
      paid_at: log.date ? new Date(log.date).toISOString() : new Date().toISOString(),  // frontend: date → DB: paid_at
      notes: log.description || log.notes || null,  // frontend: description/notes → DB: notes
      service: log.service || log.type || null       // frontend: service/type → DB: service
    };
    const { data, error } = await supabase.from('revenue_entries').insert(dbRow).select().single();
    if (!error && data) {
      // Map response back to frontend shape
      const mapped = {
        id: data.id,
        user_id: data.user_id,
        amount: data.amount || 0,
        currency: data.currency || 'USD',
        source: data.client_name || '',          // DB: client_name → frontend: source
        date: data.paid_at ? data.paid_at.split('T')[0] : log.date || '',
        description: data.notes || '',           // DB: notes → frontend: description
        service: data.service || '',             // DB: service → frontend: service
        dateAdded: data.created_at ? new Date(data.created_at).toLocaleDateString() : log.dateAdded || '',
        userEmail: log.userEmail || session.user.email
      };
      setRevenueLogs(prev => [...prev, mapped]);
    } else if (error) {
      console.error('Error adding revenue log:', error);
    }
  };
  const handleDeleteRevenueLog = async (id) => {
    const { error } = await supabase.from('revenue_entries').delete().eq('id', id);
    if (!error) setRevenueLogs(prev => prev.filter(r => r.id !== id));
  };
  const handleAddTemplate = async (template) => {
    const serialized = {
      title: template.title,
      content: JSON.stringify({ subject: template.subject || '', body: template.body || '' }),
      platform: template.platform,
      kind: template.kind || TEMPLATE_KINDS.MESSAGING,
      is_starter: false,
      tags: template.tags || []
    };
    const { data, error } = await supabase.from('templates').insert({ ...serialized, user_id: session.user.id }).select().single();
    if (error) throw error;
    if (!error && data) {
      const parsedData = {
        ...data,
        subject: template.subject || '',
        body: template.body || ''
      };
      setTemplates(prev => [...prev, parsedData]);
      return parsedData;
    }
  };
  const handleDeleteTemplate = async (id) => {
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (!error) setTemplates(prev => prev.filter(t => t.id !== id));
  };
  const handleUpdateTemplate = async (id, fields) => {
    const serializedFields = {};
    if (fields.title !== undefined) serializedFields.title = fields.title;
    if (fields.platform !== undefined) serializedFields.platform = fields.platform;
    if (fields.kind !== undefined) serializedFields.kind = fields.kind;
    if (fields.is_starter !== undefined) serializedFields.is_starter = fields.is_starter;
    if (fields.tags !== undefined) serializedFields.tags = fields.tags;
    if (fields.subject !== undefined || fields.body !== undefined) {
      const existing = templates.find(t => t.id === id) || {};
      const subject = fields.subject !== undefined ? fields.subject : (existing.subject || '');
      const body = fields.body !== undefined ? fields.body : (existing.body || '');
      serializedFields.content = JSON.stringify({ subject, body });
    }
    const { data, error } = await supabase.from('templates').update(serializedFields).eq('id', id).select().single();
    if (!error && data) {
      const parsedData = {
        ...data,
        subject: fields.subject !== undefined ? fields.subject : (templates.find(t => t.id === id)?.subject || ''),
        body: fields.body !== undefined ? fields.body : (templates.find(t => t.id === id)?.body || '')
      };
      setTemplates(prev => prev.map(t => t.id === id ? parsedData : t));
    }
  };

  const handleAddSnippet = async (snippet) => {
    const { data, error } = await supabase
      .from('user_snippets')
      .insert({
        user_id: session.user.id,
        snippet_key: snippet.snippet_key,
        snippet_value: snippet.snippet_value
      })
      .select()
      .single();
    if (error) throw error;
    if (!error && data) {
      setUserSnippets(prev => [...prev, data]);
      return data;
    }
  };

  const handleDeleteSnippet = async (id) => {
    const { error } = await supabase
      .from('user_snippets')
      .delete()
      .eq('id', id);
    if (error) throw error;
    setUserSnippets(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateSnippet = async (id, fields) => {
    const { data, error } = await supabase
      .from('user_snippets')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (!error && data) {
      setUserSnippets(prev => prev.map(s => s.id === id ? data : s));
      return data;
    }
  };

  const value = {
    session, profile, subStatus, loading,
    outreachUnlocked, calendarUnlocked, reportsUnlocked,
    theme, toggleTheme, brandName, currencySymbol, webhookUrl,
    teamIds, teamProfilesMap, leads, templates, userSnippets, invoices, revenueLogs,
    adminNotifCount, remindersCount,
    toast, showToast,
    handleLogout, handleRegisterUser, handleLoginUser, handleSaveSettings,
    handleAddInvoice, handleDeleteInvoice, handleUpdateInvoiceStatus, handleUpdateInvoice,
    handleAddRevenueLog, handleDeleteRevenueLog,
    handleAddTemplate, handleDeleteTemplate, handleUpdateTemplate,
    handleAddSnippet, handleDeleteSnippet, handleUpdateSnippet,
    fetchProfile: () => fetchProfile(session?.user?.id, session),
    fetchAllData: () => fetchAllData(teamIds, session?.user?.id, profile?.role === 'admin'),
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      <PaidInviteJoinModal
        open={!!paidInviteConfirm}
        profile={paidInviteConfirm?.profile}
        loading={paidInviteLoading}
        onConfirm={handleConfirmPaidInvite}
        onDecline={handleDeclinePaidInvite}
      />
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          zIndex: 100000,
          background: toast.type === 'error' ? 'var(--danger-color, #ef4444)' : toast.type === 'info' ? 'var(--primary-purple, #8b5cf6)' : 'var(--success-color, #10b981)',
          color: '#fff',
          padding: '0.85rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontWeight: 600,
          animation: 'slideInUp 0.3s ease',
          fontSize: '0.9rem',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span>{toast.message}</span>
          <button 
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0 0 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ×
          </button>
        </div>
      )}
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </AppContext.Provider>
  );
}

// Layout wrapper that provides AppLayout with context
function AppLayoutWrapper({ children }) {
  const {
    profile, theme, toggleTheme, remindersCount, adminNotifCount,
    brandName, handleLogout, subStatus
  } = useAppContext();

  return (
    <AppLayout
      profile={profile}
      theme={theme}
      toggleTheme={toggleTheme}
      remindersCount={remindersCount}
      adminNotifCount={adminNotifCount}
      brandName={brandName}
      handleLogout={handleLogout}
      subStatus={subStatus}
    >
      {children}
    </AppLayout>
  );
}

// Protected Page wrapper
function ProtectedPage({ children }) {
  const { session, profile, subStatus, loading, handleLogout } = useAppContext();
  if (!loading && session && profile && !profile.has_completed_setup) {
    return <Navigate to="/setup" replace />;
  }
  return (
    <ProtectedRoute session={session} profile={profile} subStatus={subStatus} loading={loading} handleLogout={handleLogout}>
      <AppLayoutWrapper>{children}</AppLayoutWrapper>
    </ProtectedRoute>
  );
}

// Upgrade page route wrapper
function UpgradeRoutePage() {
  const { session, profile, subStatus, loading, handleLogout, fetchProfile, bankAccount, bankIban } = useAppContext();
  const isForcedPaywall = subStatus === 'trial_expired' || subStatus === 'subscription_expired' || isBillingLock(profile);

  const pageContent = (
    <UpgradePage
      profile={profile}
      handleLogout={handleLogout}
      onRefreshProfile={fetchProfile}
      bankAccount=""
      bankIban=""
      isEmbedded={!isForcedPaywall}
    />
  );

  return (
    <UpgradeRoute session={session} profile={profile} subStatus={subStatus} loading={loading} handleLogout={handleLogout}>
      {isForcedPaywall ? pageContent : <AppLayoutWrapper>{pageContent}</AppLayoutWrapper>}
    </UpgradeRoute>
  );
}

// Main page components wired to context
function DashboardPage() {
  const { profile, fetchProfile, showToast } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true') return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('sync-paddle-subscription', { body: {} });
        if (cancelled) return;
        if (error) {
          console.warn('[Upgrade] sync-paddle-subscription failed:', error);
          showToast?.('Payment received — syncing your plan. Refresh in a moment if it still shows trial.', 'info');
        } else if (data?.success) {
          showToast?.('Upgrade successful! Your plan is now active.', 'success');
        } else {
          showToast?.(data?.error || 'Payment received. If your plan still shows trial, refresh or contact support.', 'info');
        }
      } catch (err) {
        console.warn('[Upgrade] sync invoke error:', err);
        showToast?.('Payment received — refreshing your account…', 'info');
      } finally {
        if (!cancelled) {
          await fetchProfile?.();
          const next = new URLSearchParams(searchParams);
          next.delete('upgraded');
          setSearchParams(next, { replace: true });
        }
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <Dashboard currentUser={profile} />;
}

function CRMPage() {
  const { profile, teamProfilesMap, teamIds } = useAppContext();
  return <CRM currentUser={profile} teamProfilesMap={teamProfilesMap} teamIds={teamIds} isTeamView={teamIds.length > 1} />;
}

function TemplatesPage() {
  const { profile, templates, teamProfilesMap, teamIds, outreachUnlocked, handleAddTemplate, handleDeleteTemplate, handleUpdateTemplate } = useAppContext();
  return (
    <Templates
      currentUser={profile}
      templates={templates}
      onAddTemplate={handleAddTemplate}
      onDeleteTemplate={handleDeleteTemplate}
      onUpdateTemplate={handleUpdateTemplate}
      teamProfilesMap={teamProfilesMap}
      isTeamView={teamIds.length > 1}
      outreachUnlocked={outreachUnlocked}
    />
  );
}

function InvoicesPage() {
  const { profile, invoices, leads, currencySymbol, bankAccount, bankIban, handleAddInvoice, handleDeleteInvoice, handleUpdateInvoiceStatus, handleUpdateInvoice } = useAppContext();
  return (
    <InvoiceGenerator
      currentUser={profile}
      invoices={invoices}
      leads={leads}
      onAddInvoice={handleAddInvoice}
      onDeleteInvoice={handleDeleteInvoice}
      onUpdateInvoiceStatus={handleUpdateInvoiceStatus}
      onUpdateInvoice={handleUpdateInvoice}
      currencySymbol={currencySymbol}
      bankAccount=""
      bankIban=""
    />
  );
}

function RevenuePage() {
  const { profile, revenueLogs, currencySymbol, handleAddRevenueLog, handleDeleteRevenueLog } = useAppContext();
  return (
    <RevenueTracker
      currentUser={profile}
      revenueLogs={revenueLogs}
      onAddRevenueLog={handleAddRevenueLog}
      onDeleteRevenueLog={handleDeleteRevenueLog}
      currencySymbol={currencySymbol}
    />
  );
}

function NotesPage() {
  const { profile } = useAppContext();
  const limits = PLAN_LIMITS[getEffectivePlan(profile)] || PLAN_LIMITS.trial;
  if (!limits.notes) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem', color: 'var(--text-muted)' }}>
        <Lock size={36} style={{ color: 'var(--text-muted)' }} />
        <h3>Notes are a Pro feature</h3>
        <p>Upgrade to Pro, Teams, or Enterprise to access drawing boards and text notes.</p>
      </div>
    );
  }
  return <NotesList currentUser={profile} />;
}

function NoteEditorPage() {
  const { profile } = useAppContext();
  const limits = PLAN_LIMITS[getEffectivePlan(profile)] || PLAN_LIMITS.trial;
  if (!limits.notes) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem', color: 'var(--text-muted)' }}>
        <Lock size={36} style={{ color: 'var(--text-muted)' }} />
        <h3>Notes are a Pro feature</h3>
        <p>Upgrade to Pro, Teams, or Enterprise to access drawing boards and text notes.</p>
      </div>
    );
  }
  return <NoteEditor currentUser={profile} />;
}

function RemindersPage() {
  const { profile } = useAppContext();
  return <Reminders currentUser={profile} />;
}

function SettingsPage() {
  const { profile, brandName, currencySymbol, webhookUrl, leads, templates, handleSaveSettings, fetchAllData, fetchProfile } = useAppContext();
  const userTemplatesCount = (templates || []).filter(t => t.user_id === profile?.id && !t.is_starter).length;
  return (
    <Configuration
      brandName={brandName}
      currencySymbol={currencySymbol}
      webhookUrl={webhookUrl}
      onSaveSettings={handleSaveSettings}
      currentUser={profile}
      leadsCount={leads.length}
      templatesCount={userTemplatesCount}
      onRefreshStatuses={fetchAllData}
      onRefreshProfile={fetchProfile}
    />
  );
}

function TeamsPage() {
  const { profile, fetchProfile, fetchAllData } = useAppContext();
  return (
    <Teams
      currentUser={profile}
      onRefreshProfile={async () => {
        await fetchProfile();
        if (fetchAllData) await fetchAllData();
      }}
    />
  );
}

function CalendarPage() {
  const { profile } = useAppContext();
  return <CalendarPageView currentUser={profile} />;
}

/** Old /crm links → /leads (preserve query, e.g. ?lead=). */
function LegacyCrmRedirect() {
  const location = useLocation();
  return <Navigate to={`/leads${location.search}${location.hash}`} replace />;
}

function ReportsPage() {
  const { profile } = useAppContext();
  return <ReportsPageView currentUser={profile} />;
}

function AdminPanelPage() {
  const { profile } = useAppContext();
  return (
    <AdminRoute profile={profile}>
      <AdminPanel currentUser={profile} />
    </AdminRoute>
  );
}

function AuthPage({ mode }) {
  const { session, profile, loading } = useAppContext();
  if (!loading && session) {
    if (profile && !profile.has_completed_setup) return <Navigate to="/setup" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <Auth mode={mode} />;
}

function SetupPage() {
  const { session, profile, loading, fetchProfile, handleSaveSettings } = useAppContext();
  const navigate = useNavigate();

  if (loading) return <LoadingSpinner />;
  if (!session) return <Navigate to="/signup" replace />;
  if (profile?.has_completed_setup) return <Navigate to="/dashboard" replace />;
  if (!profile) return <LoadingSpinner />;

  return (
    <SetupModal
      profile={profile}
      onRefreshProfile={fetchProfile}
      onSaveSettings={handleSaveSettings}
      navigate={navigate}
    />
  );
}

function HomepagePage() {
  const { session, brandName } = useAppContext();
  return <Homepage currentUserEmail={session?.user?.email} brandName={brandName} />;
}

// Root app
export default function App() {
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Local dev: never register a service worker. A stale SW on localhost
    // fights Vite HMR and traps users in an endless "Refresh Now" loop.
    if (isLocalDev()) {
      clearAppRefreshFlags();
      clearServiceWorkersAndCaches()
        .catch((err) => console.warn('[SW] Dev unregister failed:', err));
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (reg.waiting) {
            setSwUpdateAvailable(true);
          }
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setSwUpdateAvailable(true);
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error('[SW] ServiceWorker registration failed:', err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
  }, []);

  const handleSwUpdateRefresh = () => {
    forceAppRefresh();
  };

  return (
    <HelmetProvider>
      <GlobalHelmet />
      <BrowserRouter>
        <AppProvider>
          {swUpdateAvailable && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              backgroundColor: '#FFFFFF',
              color: '#050505',
              padding: '0.75rem 1rem',
              textAlign: 'center',
              zIndex: 99999,
              fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}>
              <span>A new version of ReachDesk CRM is available.</span>
              <button 
                onClick={handleSwUpdateRefresh}
                style={{
                  backgroundColor: '#050505',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                Refresh Now
              </button>
            </div>
          )}
          <div style={{ paddingTop: swUpdateAvailable ? '40px' : '0px' }}>
            <GlobalErrorBoundary>
              <AppRoutes />
            </GlobalErrorBoundary>
          </div>
        </AppProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}

function AppRoutes() {
  const { loading, session, profile, fetchProfile, handleSaveSettings } = useAppContext();
  const location = useLocation();

  useEffect(() => {
    if (isLocalDev()) return;

    const mode = import.meta.env.VITE_APP_MODE;
    if (!mode) return;

    const path = location.pathname;

    if (mode === 'marketing') {
      if (!isMarketingRoute(path)) {
        window.location.href = `${getAppUrl(path)}${location.search}${location.hash}`;
      }
    } else if (mode === 'app') {
      if (isMarketingRoute(path, { includeRoot: false })) {
        window.location.href = `${getMarketingUrl(path)}${location.search}${location.hash}`;
      }
    }
  }, [location]);

  if (loading) return <LoadingSpinner />;

  const appMode = import.meta.env.VITE_APP_MODE;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Public routes */}
        <Route
          path="/"
          element={
            !isLocalDev() && appMode === 'app' ? (
              session ? <Navigate to="/dashboard" replace /> : <HomepagePage />
            ) : (
              <Navigate to="/homepage" replace />
            )
          }
        />
        <Route path="/homepage" element={<HomepagePage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/i/:token" element={<PublicInvoice />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/refund" element={<RefundPolicy />} />
        <Route path="/get-started" element={session ? <ProtectedPage><GetStarted /></ProtectedPage> : <GetStarted />} />
        <Route path="/auth/google/callback" element={<GoogleCalendarCallback />} />
        <Route path="/auth/google-sheets/callback" element={<GoogleSheetsCallback />} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPost />} />

        {/* Upgrade/Paywall route */}
        <Route path="/upgrade" element={<UpgradeRoutePage />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedPage><DashboardPage /></ProtectedPage>} />
        <Route path="/leads" element={<ProtectedPage><CRMPage /></ProtectedPage>} />
        <Route path="/crm" element={<LegacyCrmRedirect />} />
        <Route path="/templates" element={<ProtectedPage><TemplatesPage /></ProtectedPage>} />
        <Route path="/invoices" element={<ProtectedPage><InvoicesPage /></ProtectedPage>} />
        <Route path="/revenue" element={<ProtectedPage><RevenuePage /></ProtectedPage>} />
        <Route path="/reports" element={<ProtectedPage><ReportsPage /></ProtectedPage>} />
        <Route path="/notes" element={<ProtectedPage><NotesPage /></ProtectedPage>} />
        <Route path="/notes/:id" element={<ProtectedPage><NoteEditorPage /></ProtectedPage>} />
        <Route path="/reminders" element={<ProtectedPage><RemindersPage /></ProtectedPage>} />
        <Route path="/settings" element={<ProtectedPage><SettingsPage /></ProtectedPage>} />
        <Route path="/teams" element={<ProtectedPage><TeamsPage /></ProtectedPage>} />
        <Route path="/calendar" element={<ProtectedPage><CalendarPage /></ProtectedPage>} />
        <Route path="/admin" element={<ProtectedPage><AdminPanelPage /></ProtectedPage>} />

        {/* Catch-all */}
        <Route
          path="*"
          element={
            !isLocalDev() && appMode === 'app' ? (
              session ? <Navigate to="/dashboard" replace /> : <HomepagePage />
            ) : (
              <Navigate to="/homepage" replace />
            )
          }
        />
      </Routes>
    </Suspense>
  );
}
