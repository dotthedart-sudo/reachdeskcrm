import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCircle, HelpCircle, Sun, Moon, Calendar, ExternalLink, Zap, Lock, Database, Search, MessageSquare, Play, Columns, PenTool, Check, Info } from 'lucide-react';
import { useAppContext } from '../App';
import { supabase } from '../lib/supabase';
import { PLAN_LIMITS } from '../lib/utils';
import { getMarketingUrl } from '../utils/domain';

const SIDEBAR_ITEMS = [
  { id: 'how-it-works', label: '01. How It Works' },
  { id: 'dashboard', label: '02. Dashboard' },
  { id: 'folders-pipelines', label: '03. Folders & Pipelines' },
  { id: 'templates', label: '04. Templates' },
  { id: 'reach-link', label: '05. Reach Launcher' },
  { id: 'snippets', label: '06. Snippet Keys' },
  { id: 'column-manager', label: '07. Column Manager' },
  { id: 'client-invoices', label: '08. Invoices' },
  { id: 'revenue-tracker', label: '09. Revenue' },
  { id: 'notes-drawing', label: '10. Notes & Canvas' },
  { id: 'integrations', label: '11. Integrations' },
  { id: 'faq', label: '12. FAQ' },
];

function StickyNav({ accentColor, activeSection, onScrollTo }) {
  return (
    <aside style={{
      position: 'sticky',
      top: '120px',
      alignSelf: 'flex-start',
      width: '210px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      borderRight: '1px solid var(--gs-border)',
      paddingRight: '1.25rem',
    }}>
      {SIDEBAR_ITEMS.map(item => {
        const isActive = activeSection === item.id;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(e) => onScrollTo(e, item.id)}
            style={{
              textDecoration: 'none',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? accentColor : 'var(--gs-muted)',
              padding: '6px 10px',
              borderRadius: '4px',
              backgroundColor: isActive ? 'var(--gs-active-bg)' : 'transparent',
              transition: 'all 0.15s ease',
              fontSize: '0.8125rem',
              textTransform: 'none',
              letterSpacing: 0,
              lineHeight: 1.4,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            {item.label}
          </a>
        );
      })}
    </aside>
  );
}

function InteractiveLoopDiagram({ accentColor }) {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: "Add Lead",
      desc: "Create prospects manually, import a CSV list, or pull directly from Google Sheets.",
      tip: "Include details like platform, niche, and client name to personalize future pitches."
    },
    {
      title: "Mark Contacted",
      desc: "When you send your pitch, set status to 'Contacted'. This acts as the trigger for the system.",
      tip: "Marking as contacted sets the initial last-contacted timestamp."
    },
    {
      title: "Auto Reminders",
      desc: "ReachDesk CRM schedules 7 automatic reminders at crucial intervals (Day 2, 4, 7, 10, 14, 21, 23).",
      tip: "You get notified when it is time to follow up so you never lose the conversation."
    },
    {
      title: "Lead Replies",
      desc: "The lead responds! Update their status to 'Positive Reply' or another outcome.",
      tip: "Any status update to a terminal reply state instantly cancels future reminders."
    },
    {
      title: "Auto-detected Booking",
      desc: "If connected, Google Calendar detects their booking and auto-updates the lead status to 'Booked'.",
      tip: "No manual status changes needed when they pick a time on your calendar link."
    },
    {
      title: "Draft Invoice",
      desc: "Upon booking, the system creates a draft client invoice ready for your review.",
      tip: "Includes client email, services, and default currency settings pre-filled."
    }
  ];

  return (
    <div style={{
      background: 'var(--bg-card, #161B22)',
      border: '1px solid var(--border, #30363D)',
      borderRadius: '8px',
      padding: '1.5rem',
      marginTop: '1rem'
    }}>
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        gap: '0.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--border, #30363D)',
        WebkitOverflowScrolling: 'touch'
      }}>
        {steps.map((step, index) => {
          const isActive = index === activeStep;
          return (
            <button
              key={index}
              onClick={() => setActiveStep(index)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: isActive ? accentColor : 'var(--border, #30363D)',
                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                color: isActive ? 'var(--text-primary, #FFFFFF)' : 'var(--text-secondary, #8B949E)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <span style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: isActive ? accentColor : 'var(--border-strong, #484F58)',
                color: '#fff',
                fontSize: '0.65rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {index + 1}
              </span>
              {step.title}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '1.25rem 0.25rem 0.25rem 0.25rem', textAlign: 'left' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', color: 'var(--text-primary, #FFFFFF)' }}>
          {steps[activeStep].title}
        </h4>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary, #8B949E)', lineHeight: 1.5 }}>
          {steps[activeStep].desc}
        </p>
        <div style={{
          backgroundColor: 'var(--bg-primary, #0D1117)',
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          borderLeft: `3px solid ${accentColor}`,
          fontSize: '0.8rem',
          color: 'var(--text-secondary, #8B949E)'
        }}>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}><Info size={13} style={{ color: accentColor, flexShrink: 0, marginTop: '1px' }} /><span><strong>Pro-tip:</strong> {steps[activeStep].tip}</span></span>
        </div>
      </div>
    </div>
  );
}

function TemplateLivePreview({ accentColor }) {
  const [name, setName] = useState('Sarah');
  const [niche, setNiche] = useState('E-commerce brands');
  const [result, setResult] = useState('40% higher email response rate');

  const templateBody = "Hey [Name],\n\nCame across your profile. I specialize in helping [niche] achieve [result] with automated workflows.\n\nWould it make sense to connect?";

  const getMergedOutput = () => {
    return templateBody
      .replace(/\[Name\]/g, name || '[Name]')
      .replace(/\[niche\]/g, niche || '[niche]')
      .replace(/\[result\]/g, result || '[result]');
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '1.5rem',
      background: 'var(--bg-card, #161B22)',
      border: '1px solid var(--border, #30363D)',
      borderRadius: '8px',
      padding: '1.5rem',
      marginTop: '1rem'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', textAlign: 'left' }}>
        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text-primary, #FFFFFF)' }}>1. Enter Lead Details</h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)' }}>Lead Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '6px 10px', background: 'var(--bg-primary, #0D1117)', border: '1px solid var(--border, #30363D)', borderRadius: '4px', color: '#fff', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)' }}>Niche</label>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            style={{ padding: '6px 10px', background: 'var(--bg-primary, #0D1117)', border: '1px solid var(--border, #30363D)', borderRadius: '4px', color: '#fff', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)' }}>Desired Result</label>
          <input
            type="text"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            style={{ padding: '6px 10px', background: 'var(--bg-primary, #0D1117)', border: '1px solid var(--border, #30363D)', borderRadius: '4px', color: '#fff', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--text-primary, #FFFFFF)' }}>2. Live Personalized Output</h4>
        <pre style={{
          flex: 1,
          margin: 0,
          background: 'var(--bg-primary, #0D1117)',
          border: '1px solid var(--border, #30363D)',
          borderRadius: '6px',
          padding: '1rem',
          color: 'var(--text-primary, #F0F6FC)',
          fontSize: '0.8rem',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.4'
        }}>
          {getMergedOutput()}
        </pre>
      </div>
    </div>
  );
}

function GetStartedContent({ isAppView, theme, navigate }) {
  const { profile } = useAppContext() || {};
  const [activeSection, setActiveSection] = useState('how-it-works');
  const [calConnected, setCalConnected] = useState(null);
  const [sheetsConnected, setSheetsConnected] = useState(null);

  useEffect(() => {
    const ids = SIDEBAR_ITEMS.map(i => i.id);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { root: null, rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => ids.forEach(id => { const el = document.getElementById(id); if (el) observer.unobserve(el); });
  }, []);

  useEffect(() => {
    async function checkConnections() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setCalConnected(false);
        setSheetsConnected(false);
        return;
      }
      const [calRes, sheetsRes] = await Promise.all([
        supabase.from('calendar_integrations').select('id').eq('user_id', session.user.id).eq('provider', 'google').eq('is_active', true).maybeSingle(),
        supabase.from('sheets_integrations').select('id').eq('user_id', session.user.id).maybeSingle()
      ]);
      setCalConnected(!!calRes.data);
      setSheetsConnected(!!sheetsRes.data);
    }
    checkConnections();
  }, []);

  const handleScrollTo = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const accent = isAppView ? 'var(--accent-blue)' : 'var(--hp-blue)';
  const text = isAppView ? 'var(--text-primary)' : 'var(--hp-text)';
  const muted = isAppView ? 'var(--text-secondary)' : 'var(--hp-muted)';
  const border = isAppView ? 'var(--border)' : 'var(--hp-border)';
  const card = isAppView ? 'var(--bg-card)' : 'var(--hp-card)';

  const sectionTitle = (label) => ({
    fontSize: isAppView ? '1.15rem' : '1.45rem',
    color: isAppView ? text : accent,
    marginTop: 0,
    marginBottom: isAppView ? 'var(--space-4)' : '1rem',
    fontFamily: isAppView ? 'var(--font-heading)' : 'Mattone, sans-serif',
    textTransform: isAppView ? 'none' : 'uppercase',
    letterSpacing: isAppView ? 0 : '0.05em',
    fontWeight: isAppView ? 600 : undefined,
  });

  return (
    <>
      <style>{`
        @media (max-width: 900px) { .gs-sidebar { display: none !important; } }
        :root {
          --gs-border: ${border};
          --gs-muted: ${muted};
          --gs-active-bg: ${isAppView ? 'rgba(59,130,246,0.1)' : 'rgba(91,143,185,0.1)'};
        }
      `}</style>

      {/* Reading Progress Indicator */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '4px',
        backgroundColor: 'var(--border-strong, #30363D)',
        zIndex: 10000
      }}>
        <div style={{
          height: '100%',
          backgroundColor: accent,
          width: `${(SIDEBAR_ITEMS.findIndex(s => s.id === activeSection) + 1) / SIDEBAR_ITEMS.length * 100}%`,
          transition: 'width 0.3s ease'
        }}></div>
      </div>

      <div style={{ display: 'flex', gap: '2.5rem', width: '100%', alignItems: 'flex-start' }}>
        {/* Sticky sidebar — desktop only */}
        <div className="gs-sidebar">
          <StickyNav accentColor={accent} activeSection={activeSection} onScrollTo={handleScrollTo} />
        </div>

        {/* Main sections */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3.5rem' }}>

          {/* 1 — How It Works */}
          <section id="how-it-works" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>How ReachDesk CRM Works</h2>
            <p style={{ color: muted, margin: '0 0 1.5rem 0' }}>
              ReachDesk CRM matches cold outreach with calendar tracking. Click on the steps below to see the sequence:
            </p>
            <InteractiveLoopDiagram accentColor={accent} />
          </section>

          {/* 2 — Dashboard */}
          <section id="dashboard" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Dashboard Overview</h2>
            <p style={{ color: muted, margin: '0 0 1rem 0' }}>
              Your dashboard aggregates pipeline metrics, pitching velocity, and tasks.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', color: text }}>
              <div style={{ padding: '1rem', backgroundColor: card, border: `1px solid ${border}`, borderRadius: '6px' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Primary Metrics</strong>
                <span style={{ fontSize: '0.8rem', color: muted }}>Track total leads, contacted status, total replies, and positive reply count in one glance.</span>
              </div>
              <div style={{ padding: '1rem', backgroundColor: card, border: `1px solid ${border}`, borderRadius: '6px' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Upcoming Next Feed</strong>
                <span style={{ fontSize: '0.8rem', color: muted }}>A list of due follow-up tasks, pending invoices, and warning indicators of rule mismatches.</span>
              </div>
              <div style={{ padding: '1rem', backgroundColor: card, border: `1px solid ${border}`, borderRadius: '6px' }}>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Outreach Velocity</strong>
                <span style={{ fontSize: '0.8rem', color: muted }}>Measures how active you've been (new leads created or contacted) in the last 7 days.</span>
              </div>
            </div>
          </section>

          {/* 3 — Folders & Pipelines */}
          <section id="folders-pipelines" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Folders & Pipelines</h2>
            <p style={{ color: muted, margin: '0 0 1rem 0' }}>
              Organize leads in flexible views using three folder modes:
            </p>
            <ul style={{ color: muted, paddingLeft: '1.25rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <li><strong>System Folders:</strong> Automatic folders based on Priority (Hot, Warm, Cold) and converting statuses.</li>
              <li><strong>Manual Folders:</strong> Drag-and-drop groups. Useful for individual campaign sorting or client tags.</li>
              <li><strong>Smart Folders:</strong> Rule-based lists. For example: <code>Status is "Positive Reply" AND Priority is "Hot"</code>. Leads automatically match the filter rules.</li>
            </ul>
          </section>

          {/* 4 — Templates */}
          <section id="templates" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Templates & Live Preview</h2>
            <p style={{ color: muted, margin: '0 0 1rem 0' }}>
              Create message templates using placeholders like <code>[Name]</code>, <code>[niche]</code>, and <code>[result]</code>. Test it in the preview tool below:
            </p>
            <TemplateLivePreview accentColor={accent} />
          </section>

          {/* 5 — Reach Link */}
          <section id="reach-link" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Reach Launcher</h2>
            <p style={{ color: muted, margin: 0 }}>
              The Reach icon in your CRM row opens the lead's social platform (LinkedIn, email, Twitter/X, Instagram) in a new tab. If a template is chosen, it copies to your clipboard. Once clicked, ReachDesk CRM updates the lead's Last Contacted date automatically.
            </p>
          </section>

          {/* 6 — Snippets */}
          <section id="snippets" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Snippet Keys</h2>
            <p style={{ color: muted, margin: 0 }}>
              Go to <Link to="/settings?tab=snippets">Configuration → Snippets</Link> to create custom replacement tags. E.g. save key <code>calendly</code> with your booking URL. In any template, type <code>{"{"}{"{"}calendly{"}"}{"}"}</code> and it will auto-populate during outreach.
            </p>
          </section>

          {/* 7 — Column Manager */}
          <section id="column-manager" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Column Manager</h2>
            <p style={{ color: muted, margin: 0 }}>
              Toggle visibility, sort order, and custom column definitions. Click the Gear icon in the CRM table header to select which columns to show or create custom ones for your workflow.
            </p>
          </section>

          {/* 8 — Client Invoices */}
          <section id="client-invoices" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Client Invoices</h2>
            <p style={{ color: muted, margin: 0 }}>
              Select a lead, convert them to Client status, and draft invoices with customizable lines, rates, tax calculations, and currency selection. You can download invoices or copy a public link.
            </p>
          </section>

          {/* 9 — Revenue Tracker */}
          <section id="revenue-tracker" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Revenue Tracker</h2>
            <p style={{ color: muted, margin: 0 }}>
              Log payments against client profiles. Compiles currency-adjusted revenue reports and measures progression against your Monthly Revenue Target.
            </p>
          </section>

          {/* 10 — Notes & Drawing Canvas */}
          <section id="notes-drawing" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Notes & Drawing Canvas</h2>
            <p style={{ color: muted, margin: 0 }}>
              Notes include rich formatting using slash commands (e.g. <code>/todo</code>, <code>/heading</code>, <code>/bullet</code>, <code>/toggle</code>). You also have access to a drawing canvas for mapping processes, timelines, or whiteboard designs.
            </p>
          </section>

          {/* 11 — Integrations */}
          <section id="integrations" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Integrations</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Google Calendar */}
              <div style={{ padding: '1.25rem', backgroundColor: card, border: `1px solid ${border}`, borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <Calendar size={20} style={{ color: accent }} />
                  <strong style={{ color: text }}>Google Calendar Connection</strong>
                  {calConnected && <span style={{ marginLeft: 'auto', color: '#10b981', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Check size={12} /> Connected</span>}
                </div>
                <p style={{ margin: '0 0 1rem 0', color: muted, fontSize: '0.85rem' }}>
                  Auto-detects booked leads based on email matches on calendar events and converts status to "Booked" automatically.
                </p>
              </div>

              {/* Google Sheets */}
              <div style={{ padding: '1.25rem', backgroundColor: card, border: `1px solid ${border}`, borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <Database size={20} style={{ color: accent }} />
                  <strong style={{ color: text }}>Google Sheets Connection</strong>
                  {sheetsConnected && <span style={{ marginLeft: 'auto', color: '#10b981', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Check size={12} /> Connected</span>}
                </div>
                <p style={{ margin: '0 0 1rem 0', color: muted, fontSize: '0.85rem' }}>
                  Export your leads or import them from any spreadsheet in your Google Drive seamlessly.
                </p>
              </div>

            </div>
          </section>

          {/* 12 — FAQ */}
          <section id="faq" style={{ scrollMarginTop: '120px' }}>
            <h2 style={sectionTitle()}>Frequently Asked Questions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {[{
                q: 'Can I export my leads?',
                a: 'Yes! Export all lead details to a standard CSV file from the Configuration page or CRM toolbar.',
              }, {
                q: 'What happens when my trial ends?',
                a: 'Your account locks. However, all lead records are securely preserved for 30 days. You can upgrade or export leads from the lock screen.',
              }, {
                q: 'How safe is my lead data?',
                a: 'Extremely. Data is stored on Supabase using row-level security policies (RLS). Nobody except you has access to your records.',
              }].map(({ q, a }) => (
                <div key={q}>
                  <h4 style={{ margin: '0 0 0.35rem 0', color: text, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <HelpCircle size={15} style={{ color: accent }} /> {q}
                  </h4>
                  <p style={{ margin: 0, color: muted, fontSize: '0.88rem' }}>{a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Bottom Help Section */}
          <section style={{ padding: '2.5rem 2rem', backgroundColor: card, border: `1px solid ${border}`, borderRadius: '3px', textAlign: 'center' }}>
            <h3 style={{ fontSize: isAppView ? '1.15rem' : '1.35rem', color: text, marginTop: 0, marginBottom: '0.5rem', fontFamily: isAppView ? 'var(--font-heading)' : 'Mattone, sans-serif', textTransform: isAppView ? 'none' : 'uppercase', letterSpacing: isAppView ? 0 : '0.05em', fontWeight: isAppView ? 600 : undefined }}>
              Still have questions?
            </h3>
            <p style={{ color: muted, marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Our support team is here to assist.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="mailto:support@reachdeskcrm.com"
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '40px',
                  padding: '0 1.5rem',
                  fontWeight: 600,
                  borderRadius: '3px',
                  backgroundColor: accent,
                  color: theme === 'dark' ? '#0D1117' : '#FFFFFF',
                  fontSize: '0.88rem',
                }}
              >
                Email Us
              </a>
            </div>
          </section>

        </div>
      </div>
    </>
  );
}

export default function GetStarted() {
  const navigate = useNavigate();
  const context = useAppContext();
  const theme = context?.theme || 'dark';
  const toggleTheme = context?.toggleTheme;
  const session = context?.session;

  if (session) {
    return (
      <div style={{
        maxWidth: '1100px',
        margin: '0 auto',
        width: '100%',
        textAlign: 'left',
        lineHeight: '1.8',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        padding: '1rem 1.5rem 4rem 1.5rem'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-heading)', textTransform: 'none', letterSpacing: 0 }}>
            Get started with ReachDesk CRM
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', margin: 0 }}>
            Your quick-start guide to mastering lead tracking, outreach templates, and automated follow-ups.
          </p>
        </div>

        <GetStartedContent isAppView={true} theme={theme} navigate={navigate} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--hp-bg)', color: 'var(--hp-text)', fontFamily: 'system-ui, -apple-system, sans-serif', transition: 'background-color 0.2s, color 0.2s' }}>
      {/* Navigation Bar */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.5rem 2.5rem',
        borderBottom: '1px solid var(--hp-border)',
        backgroundColor: 'var(--hp-bg)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        backdropFilter: 'blur(10px)'
      }}>
        <a href={getMarketingUrl('/homepage')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--hp-text)', fontFamily: 'Mattone, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ReachDesk CRM</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {toggleTheme && (
            <button
              onClick={toggleTheme}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hp-muted)', display: 'flex', alignItems: 'center', padding: '4px', transition: 'color 0.15s ease' }}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
          <a href={getMarketingUrl('/homepage')} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            backgroundColor: 'transparent',
            border: '1px solid var(--hp-border)',
            borderRadius: '3px',
            color: 'var(--hp-muted)',
            padding: '8px 16px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--hp-text)';
            e.currentTarget.style.borderColor = 'var(--hp-muted)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--hp-muted)';
            e.currentTarget.style.borderColor = 'var(--hp-border)';
          }}
          >
            <ArrowLeft size={14} /> Back to Home
          </a>
        </div>
      </nav>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '4rem 1.5rem', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '1100px', width: '100%', textAlign: 'left', lineHeight: '1.8' }}>
          
          {/* Header */}
          <div style={{ marginBottom: '3.5rem', borderBottom: '1px solid var(--hp-border)', paddingBottom: '2rem' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--hp-text)', marginBottom: '0.75rem', fontFamily: 'Mattone, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Get Started with ReachDesk CRM
            </h1>
            <p style={{ fontSize: '1.15rem', color: 'var(--hp-muted)', margin: 0 }}>
              Your quick-start guide to mastering lead tracking, outreach templates, and automated follow-ups.
            </p>
          </div>

          <GetStartedContent isAppView={false} theme={theme} navigate={navigate} />

          {/* Closing CTA */}
          <div style={{ padding: '3rem 2rem', backgroundColor: 'var(--hp-card)', border: '1px solid var(--hp-border)', borderRadius: '3px', textAlign: 'center', marginTop: '4rem' }}>
            <h2 style={{ fontSize: '1.75rem', color: 'var(--hp-text)', marginTop: 0, marginBottom: '0.75rem', fontFamily: 'Mattone, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ready to get started?
            </h2>
            <p style={{ color: 'var(--hp-muted)', marginBottom: '2rem', fontSize: '1.05rem' }}>
              Sign up today and start organizing your business pipeline.
            </p>
            <button
              onClick={() => navigate('/signup')}
              style={{
                fontFamily: 'Mattone, sans-serif',
                fontSize: '0.85rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                backgroundColor: 'var(--hp-blue)',
                color: theme === 'dark' ? '#0D1117' : '#FFFFFF',
                border: 'none',
                borderRadius: '3px',
                padding: '12px 28px',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'opacity 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Sign Up Free
            </button>
          </div>

        </div>
      </div>

      {/* Simple Footer */}
      <footer style={{
        borderTop: '1px solid var(--hp-border)',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        color: 'var(--hp-muted)',
        fontSize: '0.9rem',
        marginTop: 'auto',
        backgroundColor: 'var(--hp-bg)'
      }}>
        <p>© 2026 ReachDesk CRM. All rights reserved.</p>
      </footer>
    </div>
  );
}
