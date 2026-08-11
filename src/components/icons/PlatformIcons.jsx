import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  SiInstagram, 
  SiX, 
  SiWhatsapp,
  SiReddit,
  SiYelp,
  SiGooglemaps,
  SiTiktok,
  SiFacebook,
  SiYoutube,
  SiPinterest,
  SiSnapchat,
  SiTelegram,
  SiBehance,
  SiDribbble,
  SiGithub,
  SiFiverr,
  SiUpwork,
  SiTripadvisor
} from '@icons-pack/react-simple-icons';
import { Mail, Globe, Phone, MessageSquare } from 'lucide-react';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';

// ── Inline LinkedIn SVG (no extra dependency) ─────────────────────────────────
const SiLinkedin = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);

// ── Inline Google Reviews SVG ──────────────────────────────────────────────────
const SiGooglereviews = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
    <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.113-5.111 4.113-3.418 0-6.205-2.787-6.205-6.205 0-3.418 2.787-6.205 6.205-6.205 1.566 0 2.98.579 4.07 1.536l3.14-3.14c-1.996-1.854-4.6-2.99-7.21-2.99-6.627 0-12 5.373-12 12s5.373 12 12 12c6.248 0 11.516-4.506 11.96-10.413h-11.96z" />
  </svg>
);

// ── Platform map ──────────────────────────────────────────────────────────────
const PLATFORM_MAP = {
  linkedin:  { icon: SiLinkedin,  color: '#0A66C2' },
  instagram: { icon: SiInstagram, color: '#E4405F' },
  twitter:   { icon: SiX,         color: '#1a1a1a' },
  x:         { icon: SiX,         color: '#1a1a1a' },
  email:     { icon: Mail,        color: '#6B7280' },
  website:   { icon: Globe,       color: '#6B7280' },
  whatsapp:  { icon: SiWhatsapp,  color: '#25D366' },
  sms:       { icon: MessageSquare, color: '#3B82F6' },
  phone:     { icon: Phone,       color: '#10B981' }
};

// ── Domain detector for custom link fields ─────────────────────────────────────
export const detectDomainIcon = (url) => {
  if (!url) return { icon: Globe, color: '#6B7280' };
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(cleanUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes('reddit.com')) return { icon: SiReddit, color: '#FF4500' };
    if (host.includes('yelp.com')) return { icon: SiYelp, color: '#D32323' };
    if (host.includes('google.com') && (host.includes('maps') || path.includes('maps') || url.includes('/maps'))) return { icon: SiGooglemaps, color: '#4285F4' };
    if (host.includes('tiktok.com')) return { icon: SiTiktok, color: '#000000' };
    if (host.includes('facebook.com')) return { icon: SiFacebook, color: '#1877F2' };
    if (host.includes('youtube.com') || host.includes('youtu.be')) return { icon: SiYoutube, color: '#FF0000' };
    if (host.includes('pinterest.com')) return { icon: SiPinterest, color: '#E60023' };
    if (host.includes('snapchat.com')) return { icon: SiSnapchat, color: '#FFFC00' };
    if (host.includes('t.me') || host.includes('telegram.org')) return { icon: SiTelegram, color: '#26A5E4' };
    if (host.includes('behance.net') || host.includes('behance.com')) return { icon: SiBehance, color: '#1769FF' };
    if (host.includes('dribbble.com')) return { icon: SiDribbble, color: '#EA4C89' };
    if (host.includes('github.com')) return { icon: SiGithub, color: '#181717' };
    if (host.includes('fiverr.com')) return { icon: SiFiverr, color: '#1DBF73' };
    if (host.includes('upwork.com')) return { icon: SiUpwork, color: '#14A800' };
    if (host.includes('google.com') && (path.includes('reviews') || host.includes('review') || url.includes('review') || url.includes('g.page'))) return { icon: SiGooglereviews, color: '#4285F4' };
    if (host.includes('tripadvisor.com')) return { icon: SiTripadvisor, color: '#34E0A1' };
  } catch (e) {
    const lower = url.toLowerCase();
    if (lower.includes('reddit')) return { icon: SiReddit, color: '#FF4500' };
    if (lower.includes('yelp')) return { icon: SiYelp, color: '#D32323' };
    if (lower.includes('maps.google') || lower.includes('google.com/maps')) return { icon: SiGooglemaps, color: '#4285F4' };
    if (lower.includes('tiktok')) return { icon: SiTiktok, color: '#000000' };
    if (lower.includes('facebook')) return { icon: SiFacebook, color: '#1877F2' };
    if (lower.includes('youtube') || lower.includes('youtu.be')) return { icon: SiYoutube, color: '#FF0000' };
    if (lower.includes('pinterest')) return { icon: SiPinterest, color: '#E60023' };
    if (lower.includes('snapchat')) return { icon: SiSnapchat, color: '#FFFC00' };
    if (lower.includes('telegram') || lower.includes('t.me')) return { icon: SiTelegram, color: '#26A5E4' };
    if (lower.includes('behance')) return { icon: SiBehance, color: '#1769FF' };
    if (lower.includes('dribbble')) return { icon: SiDribbble, color: '#EA4C89' };
    if (lower.includes('github')) return { icon: SiGithub, color: '#181717' };
    if (lower.includes('fiverr')) return { icon: SiFiverr, color: '#1DBF73' };
    if (lower.includes('upwork')) return { icon: SiUpwork, color: '#14A800' };
    if (lower.includes('tripadvisor')) return { icon: SiTripadvisor, color: '#34E0A1' };
  }
  return { icon: Globe, color: '#6B7280' };
};

export const detectPlatformLabel = (url) => {
  if (!url) return 'Website';
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const host = new URL(cleanUrl).hostname.toLowerCase();
    if (host.includes('linkedin.com')) return 'LinkedIn';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'Twitter';
    if (host.includes('reddit.com')) return 'Reddit';
    if (host.includes('yelp.com')) return 'Yelp';
    if (host.includes('google.com') && (host.includes('maps') || url.includes('/maps'))) return 'Google Maps';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('facebook.com')) return 'Facebook';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('pinterest.com')) return 'Pinterest';
    if (host.includes('snapchat.com')) return 'Snapchat';
    if (host.includes('t.me') || host.includes('telegram.org')) return 'Telegram';
    if (host.includes('behance.net')) return 'Behance';
    if (host.includes('dribbble.com')) return 'Dribbble';
    if (host.includes('github.com')) return 'GitHub';
    if (host.includes('fiverr.com')) return 'Fiverr';
    if (host.includes('upwork.com')) return 'Upwork';
    if (host.includes('tripadvisor.com')) return 'TripAdvisor';
    if (host.includes('google.com') && (url.includes('review') || url.includes('g.page'))) return 'Google Reviews';
  } catch {}
  return 'Website';
};

// ── Phone popup — used standalone in table cells (portaled; cells overflow:hidden) ─
export const PhonePopup = ({ phone }) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const ref = useRef();
  const triggerRef = useRef();
  const panelRef = useRef();

  const updatePos = () => {
    if (!triggerRef.current) return;
    setMenuPos(computePortalMenuPosition(triggerRef.current, {
      menuWidth: 180,
      menuHeight: 100,
    }));
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const handler = (e) => {
      const inTrigger = ref.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  if (!phone) return <span style={{ color: '#6B7280' }}>—</span>;

  const clean = phone.replace(/\D/g, '');

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...portalMenuStyle(menuPos),
        background: 'var(--bg-secondary, #1a1a2e)',
        border: '1px solid var(--border-color, #2d2d3d)',
        borderRadius: '8px',
        padding: '4px 0',
        minWidth: '160px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <a
        href={`tel:${clean}`}
        onClick={() => setOpen(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', color: 'var(--text-primary, #fff)',
          textDecoration: 'none', fontSize: '13px',
        }}
      >
        <Phone size={14} /> Call via SIM
      </a>
      <a
        href={`https://wa.me/${clean}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOpen(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', color: 'var(--text-primary, #fff)',
          textDecoration: 'none', fontSize: '13px',
        }}
      >
        <SiWhatsapp size={14} color="#25D366" /> Open WhatsApp
      </a>
    </div>,
    document.body,
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ cursor: 'pointer', color: 'var(--text-primary)' }}
        title="Click to call or WhatsApp"
        data-ph-mask
      >
        {phone}
      </span>
      {menu}
    </div>
  );
};

// ── ReachIcons — shown in the "Reach" column of the CRM table ─────────────────
export const ReachIcons = ({ lead, columnDefs = [], onReachClick }) => {
  // 1. Gather all social links (standard fields first)
  const links = [];
  const addedUrls = new Set();

  const tryAdd = (platform, url, isCustom = false) => {
    if (url) {
      let cleanUrl = url;
      if (platform !== 'email' && platform !== 'whatsapp' && platform !== 'sms' && platform !== 'phone' && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
        cleanUrl = `https://${url}`;
      }
      if (!addedUrls.has(cleanUrl)) {
        links.push({ platform, url: cleanUrl, isCustom });
        addedUrls.add(cleanUrl);
      }
    }
  };

  // Standard fields from PLATFORM_MAP keys (linkedin, instagram, twitter, website, email)
  tryAdd('linkedin_url', lead.linkedin_url);
  tryAdd('instagram_url', lead.instagram_url);
  tryAdd('twitter_url', lead.twitter_url);
  tryAdd('website', lead.website);
  if (lead.email) {
    tryAdd('email', `email:${lead.email}`);
  }
  if (lead.phone) {
    tryAdd('whatsapp', `whatsapp:${lead.phone}`);
    tryAdd('sms', `sms:${lead.phone}`);
    tryAdd('phone', `tel:${lead.phone}`);
  }

  // 2. Add custom_fields of type 'link'
  if (lead.custom_fields && columnDefs && columnDefs.length > 0) {
    columnDefs.forEach(col => {
      if (col.column_type === 'link' && !col.is_default) {
        const val = lead.custom_fields[col.column_key];
        if (val) {
          tryAdd(col.column_label || col.column_key, val, true);
        }
      }
    });
  }

  // 3. Add links from custom_fields.links array
  if (lead.custom_fields && Array.isArray(lead.custom_fields.links)) {
    lead.custom_fields.links.forEach(item => {
      if (item && item.url) {
        tryAdd(item.label || 'Website', item.url, true);
      }
    });
  }

  if (links.length === 0) {
    return <span style={{ color: '#6B7280', fontSize: '0.85rem' }}>—</span>;
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {links.map(({ platform, url, isCustom }) => {
        let IconComp = null;
        let iconColor = '#6B7280';

        const mapKey = platform.toLowerCase();
        let displayPlatform = platform;
        
        if (mapKey.includes('linkedin')) {
          IconComp = PLATFORM_MAP.linkedin.icon;
          iconColor = PLATFORM_MAP.linkedin.color;
          displayPlatform = 'LinkedIn';
        } else if (mapKey.includes('instagram')) {
          IconComp = PLATFORM_MAP.instagram.icon;
          iconColor = PLATFORM_MAP.instagram.color;
          displayPlatform = 'Instagram';
        } else if (mapKey.includes('twitter') || mapKey === 'x') {
          IconComp = PLATFORM_MAP.twitter.icon;
          iconColor = PLATFORM_MAP.twitter.color;
          displayPlatform = 'Twitter/X';
        } else if (mapKey.includes('email')) {
          IconComp = PLATFORM_MAP.email.icon;
          iconColor = PLATFORM_MAP.email.color;
          displayPlatform = 'Email';
        } else if (mapKey.includes('whatsapp')) {
          IconComp = PLATFORM_MAP.whatsapp.icon;
          iconColor = PLATFORM_MAP.whatsapp.color;
          displayPlatform = 'WhatsApp';
        } else if (mapKey === 'sms') {
          IconComp = PLATFORM_MAP.sms.icon;
          iconColor = PLATFORM_MAP.sms.color;
          displayPlatform = 'SMS';
        } else if (mapKey === 'phone') {
          IconComp = PLATFORM_MAP.phone.icon;
          iconColor = PLATFORM_MAP.phone.color;
          displayPlatform = 'Phone (SIM)';
        } else if (mapKey === 'website') {
          IconComp = PLATFORM_MAP.website.icon;
          iconColor = PLATFORM_MAP.website.color;
          displayPlatform = 'Website';
        }

        if (!IconComp) {
          const config = detectDomainIcon(url);
          IconComp = config.icon;
          iconColor = config.color;
          displayPlatform = detectPlatformLabel(url);
        }

        const handleIconClick = (e) => {
          if (onReachClick) {
            onReachClick(e, platform, url, lead);
          }
        };

        return (
          <a
            key={url}
            href={url}
            onClick={handleIconClick}
            target="_blank"
            rel="noopener noreferrer"
            title={displayPlatform}
            style={{
              display: 'flex', alignItems: 'center', lineHeight: 1,
              opacity: 0.85, transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
          >
            <IconComp size={15} color={iconColor} />
          </a>
        );
      })}
    </div>
  );
};
