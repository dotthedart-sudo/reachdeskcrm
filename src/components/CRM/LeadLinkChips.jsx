import React, { useState } from 'react';
import { Globe, Plus, X, ExternalLink } from 'lucide-react';
import { 
  SiInstagram, 
  SiX, 
  SiTiktok, 
  SiFacebook, 
  SiYoutube 
} from '@icons-pack/react-simple-icons';
import { detectPlatform, normalizeUrl, getPlatformLabel } from '../../lib/linkUtils';

const SiLinkedin = ({ size = 14, color = 'currentColor', ...props }) => (
  <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);

export const getPlatformIcon = (platform, size = 13) => {
  const p = (platform || '').toLowerCase();
  switch (p) {
    case 'linkedin':
      return <SiLinkedin size={size} color="#0A66C2" />;
    case 'instagram':
      return <SiInstagram size={size} color="#E4405F" />;
    case 'x':
    case 'twitter':
      return <SiX size={size} color="currentColor" />;
    case 'facebook':
      return <SiFacebook size={size} color="#1877F2" />;
    case 'tiktok':
      return <SiTiktok size={size} color="currentColor" />;
    case 'youtube':
      return <SiYoutube size={size} color="#FF0000" />;
    default:
      return <Globe size={size} style={{ color: 'var(--text-muted, #8E8D8A)' }} />;
  }
};

export const getDisplayUrl = (url) => {
  if (!url) return '';
  try {
    const clean = normalizeUrl(url);
    const parsed = new URL(clean);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/$/, '');
    if (!path || path === '') return host;
    return `${host}${path}`;
  } catch {
    return url;
  }
};

/**
 * LeadLinkChips
 * Renders an array of { url, platform } as interactive chips.
 * Supports add link input, removal, and opening URLs.
 */
export default function LeadLinkChips({
  links = [],
  onChange,
  readOnly = false,
  allowAdd = true,
  placeholder = 'Paste LinkedIn, Instagram or website',
}) {
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');

  const handleAddLink = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const clean = normalizeUrl(trimmed);
    const platform = detectPlatform(clean);
    const updated = [...links, { url: clean, platform }];
    onChange?.(updated);
    setNewUrl('');
    setAdding(false);
  };

  const handleRemove = (index) => {
    const updated = links.filter((_, i) => i !== index);
    onChange?.(updated);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
      {links.map((item, idx) => {
        const url = typeof item === 'string' ? item : item.url;
        const platform = typeof item === 'string' ? detectPlatform(item) : (item.platform || detectPlatform(item.url));
        const display = getDisplayUrl(url);

        return (
          <div
            key={`${url}-${idx}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: '24px',
              padding: '0 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.06))',
              border: '1px solid var(--border-color, #E8E8E6)',
              fontSize: '12px',
              color: 'var(--text-primary, #3F3F3F)',
              maxWidth: '220px',
            }}
            title={url}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              {getPlatformIcon(platform, 12)}
            </span>
            <a
              href={normalizeUrl(url)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'inherit',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '130px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {display}
            </a>
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(idx);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--text-muted, #8E8D8A)',
                  borderRadius: '2px',
                }}
                title="Remove link"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}

      {allowAdd && !readOnly && (
        adding ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="text"
              autoFocus
              placeholder={placeholder}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLink();
                } else if (e.key === 'Escape') {
                  setAdding(false);
                  setNewUrl('');
                }
              }}
              onBlur={handleAddLink}
              style={{
                height: '24px',
                fontSize: '12px',
                padding: '0 8px',
                borderRadius: '4px',
                border: '1px solid var(--primary-color, #4361EE)',
                background: 'var(--bg-primary, #ffffff)',
                color: 'var(--text-primary, #1A1A1A)',
                width: '180px',
                outline: 'none',
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              height: '24px',
              padding: '0 8px',
              borderRadius: '4px',
              border: '1px dashed var(--border-color, #E8E8E6)',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-muted, #8E8D8A)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={11} /> Add link
          </button>
        )
      )}
    </div>
  );
}
