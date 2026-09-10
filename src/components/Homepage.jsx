import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Check, ArrowRight } from 'lucide-react';
import { useAppContext } from '../App';
import { BILLING } from './Paywalls';
import { formatPlanHeroAmount, formatPlanHeroPeriod, formatPlanHeroSub, formatPlanHeroBillingNote } from '../lib/regionalPricing';
import {
  MARKETING_PLANS,
  TRIAL_MARKETING,
  HOMEPAGE_FEATURES,
  HOMEPAGE_OUTCOMES,
  HOMEPAGE_FIT,
  HOW_IT_WORKS_STEPS,
} from '../lib/planMarketing';
import { useLocalCurrency } from '../utils/useLocalCurrency';
import { FeatureMedia, StepMedia } from './marketing/MarketingMedia';
import { Helmet } from 'react-helmet-async';
import { siteMeta, generateOGTags } from '../config/metadata';
import { getAppUrl, getMarketingUrl, isLocalDev } from '../utils/domain';
import { ShinyButton } from '@/registry/magicui/shiny-button';
import { MARKETING_MEDIA } from '../lib/marketingAssets';

const HERO_LIGHT = MARKETING_MEDIA.heroLight;
const HERO_DARK = MARKETING_MEDIA.heroDark;

export default function Homepage({ currentUserEmail }) {
  const navigate = useNavigate();
  const { theme: appTheme, toggleTheme: toggleAppTheme } = useAppContext() || {};
  const { formatLocalPrice, country } = useLocalCurrency();

  const [theme, setTheme] = useState(() => {
    const appSaved = localStorage.getItem('reachdesk_theme');
    if (appSaved === 'light' || appSaved === 'dark') return appSaved;
    const saved = localStorage.getItem('hp-theme');
    if (saved) return saved;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  });

  const [heroReady, setHeroReady] = useState(false);
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    const t = requestAnimationFrame(() => setHeroReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.hp-reveal');
    if (!els.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('hp-reveal-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const toggleHomepageTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('hp-theme', nextTheme);
    localStorage.setItem('reachdesk_theme', nextTheme);
    if (nextTheme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    document.documentElement.setAttribute('data-theme', nextTheme);
    document.documentElement.style.backgroundColor = nextTheme === 'light' ? '#FAFAFA' : '#050505';
    document.documentElement.style.colorScheme = nextTheme;
    if (typeof toggleAppTheme === 'function' && appTheme && appTheme !== nextTheme) {
      toggleAppTheme();
    }
  };

  useEffect(() => {
    if (theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const isLoggedIn = !!currentUserEmail;

  const handleSignUpClick = () => {
    if (isLocalDev()) {
      navigate(isLoggedIn ? '/dashboard' : '/signup');
    } else {
      window.location.href = getAppUrl(isLoggedIn ? '/dashboard' : '/signup');
    }
  };

  const handleLoginClick = () => {
    if (isLocalDev()) {
      navigate(isLoggedIn ? '/dashboard' : '/login');
    } else {
      window.location.href = getAppUrl(isLoggedIn ? '/dashboard' : '/login');
    }
  };

  const renderPlanPrice = (planId) => {
    const tier = BILLING[billing]?.[planId];
    return formatPlanHeroAmount(country, tier, billing);
  };

  const renderPlanPeriod = () => formatPlanHeroPeriod(billing);

  const renderPlanDetailsSub = (planId) => {
    const tier = BILLING[billing]?.[planId];
    return formatPlanHeroSub(country, tier, billing, formatLocalPrice);
  };

  const renderPlanBillingNote = (planId) => {
    const tier = BILLING[billing]?.[planId];
    return formatPlanHeroBillingNote(country, tier, billing);
  };

  return (
    <div className="hp-root" data-theme={theme}>
      <Helmet>
        <title>{siteMeta.pages.homepage.title}</title>
        <meta name="description" content={siteMeta.pages.homepage.description} />
        <meta name="keywords" content={siteMeta.pages.homepage.keywords} />
        {Object.entries(generateOGTags(siteMeta.pages.homepage.title, siteMeta.pages.homepage.description)).map(([key, value]) => (
          <meta key={key} property={key} content={value} />
        ))}
      </Helmet>

      <nav className="hp-nav">
        <div className="hp-nav-inner">
          <button
            type="button"
            className="hp-logo-btn"
            onClick={() => (isLocalDev() ? navigate('/homepage') : (window.location.href = getMarketingUrl('/homepage')))}
            aria-label="ReachDesk CRM home"
          >
            <span className="hp-logo">REACHDESK CRM</span>
          </button>

          <div className="hp-nav-center">
            <a href="#features" className="hp-nav-link">Product</a>
            <a href="#how" className="hp-nav-link">How it works</a>
            <a href="#pricing" className="hp-nav-link">Pricing</a>
            <a href={getMarketingUrl('/blog')} className="hp-nav-link">Blog</a>
          </div>

          <div className="hp-nav-right">
            <button
              type="button"
              onClick={toggleHomepageTheme}
              className="hp-theme-toggle"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button type="button" onClick={handleLoginClick} className="hp-nav-link">
              Log in
            </button>
            <button type="button" onClick={handleSignUpClick} className="hp-btn-primary hp-btn-nav">
              {isLoggedIn ? 'Dashboard' : 'Sign up'}
            </button>
          </div>
        </div>
      </nav>

      <section className={`hp-hero-section hp-hero-premium ${heroReady ? 'hp-hero-ready' : ''}`}>
        <div className="hp-hero-inner">
          <div className="hp-hero-copy">
            <h1 className="hp-hero-h1 hp-hero-enter">
              <span className="hp-hero-line">Your leads didn&apos;t</span>
              <span className="hp-hero-line">ghost you.</span>
              <span className="hp-hero-line">You ghosted them.</span>
            </h1>
            <p className="hp-hero-subhead hp-hero-enter hp-hero-enter-1">
              The follow-up CRM for freelancers and agencies. Know who to contact today — so nothing slips while you deliver client work.
            </p>
            <div className="hp-hero-ctas hp-hero-enter hp-hero-enter-2">
              <ShinyButton type="button" onClick={handleSignUpClick} className="hp-btn-lg">
                {isLoggedIn ? 'Open dashboard' : 'Start free trial'}
              </ShinyButton>
              <a href="#pricing" className="hp-btn-text">
                See pricing <ArrowRight size={14} aria-hidden />
              </a>
            </div>
          </div>

          <div className="hp-hero-media hp-hero-enter hp-hero-enter-3">
            <img
              key={theme === 'dark' ? 'hero-dark-orig' : 'hero-light-orig'}
              src={`${theme === 'dark' ? HERO_DARK : HERO_LIGHT}?v=orig2`}
              alt={theme === 'dark' ? 'ReachDesk CRM leads table in dark mode' : 'ReachDesk CRM leads table in light mode'}
              className="hero-image"
              width={1024}
              height={505}
              decoding="async"
              fetchpriority="high"
            />
          </div>
        </div>
      </section>

      <section className="hp-problem-section hp-reveal">
        <div className="hp-section-inner hp-section-narrow">
          <p className="hp-problem-text">
            Spreadsheets. Notes apps. Memory.
            <span className="hp-problem-em"> That&apos;s how freelancers lose booked calls.</span>
          </p>
        </div>
      </section>

      <section className="hp-outcomes-section hp-reveal">
        <div className="hp-section-inner">
          <span className="hp-section-label">What changes</span>
          <h2 className="hp-section-h2">
            A CRM that answers one question every morning:
            <span className="hp-section-h2-accent"> who needs a follow-up?</span>
          </h2>
          <div className="hp-outcomes-grid">
            {HOMEPAGE_OUTCOMES.map((item) => (
              <div key={item.id} className="hp-outcome-item">
                <h3 className="hp-outcome-title">{item.title}</h3>
                <p className="hp-outcome-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="hp-how-section hp-reveal">
        <div className="hp-section-inner">
          <span className="hp-section-label">How it works</span>
          <h2 className="hp-section-h2">
            Three steps.
            <span className="hp-section-h2-accent"> Then the reminders do the remembering.</span>
          </h2>
          <div className="hp-how-grid">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <div key={item.step} className="hp-how-step">
                <StepMedia step={Number(item.step)} title={item.title} theme={theme} />
                <span className="hp-how-step-num">Step {item.step}</span>
                <h3 className="hp-how-step-title">{item.title}</h3>
                <p className="hp-how-step-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="hp-features-section hp-reveal">
        <div className="hp-section-inner">
          <span className="hp-section-label">What you get</span>
          <h2 className="hp-section-h2">
            Built for freelancers who
            <span className="hp-section-h2-accent"> can&apos;t afford a forgotten follow-up.</span>
          </h2>

          <div className="hp-features-grid">
            {HOMEPAGE_FEATURES.map((feat) => (
              <article key={feat.id} className="hp-feature-card">
                <FeatureMedia featureId={feat.id} title={feat.title} theme={theme} />
                <h3 className="hp-feature-row-title">{feat.title}</h3>
                <p className="hp-feature-row-desc">{feat.desc}</p>
              </article>
            ))}
          </div>

          <p className="hp-integrations-note">
            Sheets import/export on Starter and Pro. Google Calendar sync on Pro.
          </p>
        </div>
      </section>

      <section className="hp-fit-section hp-reveal">
        <div className="hp-section-inner hp-fit-inner">
          <div className="hp-fit-copy">
            <span className="hp-section-label">Who it&apos;s for</span>
            <h2 className="hp-section-h2 hp-section-h2-tight">
              If outreach dies when client work gets busy,
              <span className="hp-section-h2-accent"> this is your system.</span>
            </h2>
          </div>
          <ul className="hp-fit-list">
            {HOMEPAGE_FIT.map((line) => (
              <li key={line} className="hp-fit-item">
                <Check size={16} className="hp-fit-icon" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="pricing" className="hp-pricing-section hp-reveal">
        <div className="hp-section-inner">
          <span className="hp-section-label">Pricing</span>
          <h2 className="hp-section-h2">
            Simple plans. Real limits.
            <span className="hp-section-h2-accent"> No bloated enterprise CRM.</span>
          </h2>

          <div className="hp-trial-banner">
            <div className="hp-trial-banner-copy">
              <strong>Start with a 7-day trial</strong>
              <span>{TRIAL_MARKETING.detail}</span>
            </div>
            <button type="button" onClick={handleSignUpClick} className="hp-btn-primary">
              {isLoggedIn ? 'Open dashboard' : TRIAL_MARKETING.headline}
            </button>
          </div>

          <div className="rd-billing-toggle-wrap">
            <div className="rd-billing-toggle" role="tablist" aria-label="Billing cycle">
              {Object.entries(BILLING).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  className={`rd-billing-btn ${billing === key ? 'active' : ''}`}
                  onClick={() => setBilling(key)}
                >
                  {info.label}
                  {info.badge && <span className="rd-billing-save">{info.badge}</span>}
                </button>
              ))}
            </div>
          </div>

          {billing === 'yearly' && (
            <p className="rd-pricing-yearly-callout">Yearly: Starter gets 2,000 leads · Pro gets 2× lead capacity.</p>
          )}

          <div className="rd-pricing-grid">
            {MARKETING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`rd-pricing-card ${plan.highlighted ? 'rd-pricing-popular' : ''} ${plan.comingSoon ? 'disabled' : ''}`}
              >
                {plan.highlighted && <span className="rd-pricing-popular-badge">Most Popular</span>}
                {plan.comingSoon && <span className="rd-pricing-tag">Coming Soon</span>}

                <div className="rd-pricing-card-header">
                  <div className="rd-pricing-plan-name">{plan.name}</div>
                  <p className="rd-pricing-tagline">
                    {typeof plan.tagline === 'function' ? plan.tagline(billing) : plan.tagline}
                  </p>
                  <div className="rd-pricing-price-main">
                    <span className="rd-pricing-price-amount">{renderPlanPrice(plan.id)}</span>
                    {renderPlanPeriod() && (
                      <span className="rd-pricing-price-period">{renderPlanPeriod()}</span>
                    )}
                  </div>
                  {renderPlanDetailsSub(plan.id) && (
                    <span className="rd-pricing-price-sub">{renderPlanDetailsSub(plan.id)}</span>
                  )}
                  {renderPlanBillingNote(plan.id) && (
                    <div className="rd-pricing-price-billing">
                      <span className="rd-pricing-price-sub">{renderPlanBillingNote(plan.id)}</span>
                    </div>
                  )}
                </div>

                <ul className="rd-pricing-features">
                  {(plan.getFeatures ? plan.getFeatures(billing) : []).map((feat, i) => {
                    const isObj = typeof feat === 'object';
                    const label = isObj ? feat.label : feat;
                    return (
                      <li key={`${plan.id}-${label}-${i}`} className="rd-pricing-feature">
                        <Check size={15} className="rd-pricing-feature-icon" aria-hidden />
                        <span className="rd-pricing-feature-text">{label}</span>
                        {isObj && feat.badge && (
                          <span className="rd-pricing-feature-badge">{feat.badge}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {plan.comingSoon ? (
                  <button type="button" className="rd-pricing-cta disabled" disabled>
                    Coming soon
                  </button>
                ) : (
                  <ShinyButton type="button" onClick={handleSignUpClick} className="rd-pricing-cta">
                    {plan.ctaLabel}
                  </ShinyButton>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="hp-final-cta hp-reveal">
        <div className="hp-section-inner hp-final-cta-inner">
          <h2 className="hp-final-cta-title">Stop losing deals to forgotten follow-ups.</h2>
          <p className="hp-final-cta-sub">
            {TRIAL_MARKETING.detail}. You send every message — ReachDesk CRM keeps you on track.
          </p>
          <button type="button" onClick={handleSignUpClick} className="hp-btn-primary hp-btn-lg hp-final-cta-btn">
            {isLoggedIn ? 'Open dashboard' : 'Start free trial'}
          </button>
          <p className="hp-final-cta-micro">{TRIAL_MARKETING.micro}</p>
        </div>
      </section>

      <footer className="hp-footer">
        <div className="hp-footer-inner">
          <span className="hp-footer-logo-text">REACHDESK CRM</span>
          <div className="hp-footer-links-row">
            <a href={getMarketingUrl('/terms')} className="hp-footer-link-item">Terms of Service</a>
            <a href={getMarketingUrl('/privacy')} className="hp-footer-link-item">Privacy Policy</a>
            <a href={getMarketingUrl('/refund')} className="hp-footer-link-item">Refund Policy</a>
            <a href="mailto:support@reachdeskcrm.com" className="hp-footer-link-item">support@reachdeskcrm.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
