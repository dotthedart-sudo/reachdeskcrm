export function extractLinks(value, options = {}) {
  const { isLinkField = false, isPhoneField = false } = options;
  if (value === null || value === undefined) return [];

  let strValues = [];
  try {
    if (typeof value === 'string') {
      strValues = [value];
    } else if (Array.isArray(value)) {
      strValues = value.map(v => typeof v === 'string' ? v : JSON.stringify(v));
    } else if (typeof value === 'object') {
      strValues = Object.values(value).map(v => typeof v === 'string' ? v : JSON.stringify(v));
    } else {
      strValues = [String(value)];
    }
  } catch (err) {
    return [];
  }

  const rawLinks = [];
  strValues.forEach(str => {
    if (typeof str !== 'string') return;
    
    // Split by comma or newline.
    const chunks = str.split(/[\n,]+/);
    
    chunks.forEach(chunk => {
      let trimmed = chunk.trim();
      if (!trimmed) return;
      
      // If it's a generic text field (not a link field and not a phone field),
      // we only accept if the ENTIRE chunk is a single valid URL (or email).
      const hasSpaces = trimmed.includes(' ');
      const isSingleToken = !hasSpaces;

      // Phone check
      if (isPhoneField) {
        // Must contain digits. Allow plus, parens, hyphens, spaces.
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15 && /^[\+\(\)\-\s0-9]+$/.test(trimmed)) {
          rawLinks.push({ type: 'phone', url: trimmed });
          return; // Done with this chunk
        }
      }

      // If it's a generic field and has spaces, it's not a single URL. Skip.
      if (!isLinkField && hasSpaces) {
        return; 
      }

      // If it's a link field and has spaces, we split on spaces ONLY IF they separate valid URLs.
      // A simple way is to just split by space and process each token. But if it's "+1 555 019 2834" it shouldn't be split if it was a phone. We already handled phone above.
      // Wait, what if a link field has "Check out my site: https://example.com"? That should probably extract example.com.
      // The prompt said: "Split cells on commas and newlines only, and on spaces only between URLs."
      // Let's split on space and filter tokens that look like URLs.
      const tokens = isLinkField ? trimmed.split(/\s+/) : [trimmed];

      tokens.forEach(t => {
        const token = t.trim();
        if (!token) return;
        
        // Skip bare @handles
        if (token.startsWith('@') && !token.includes('.')) return;
        
        // Email check
        if (token.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          rawLinks.push({ type: 'email', url: token });
          return;
        }

        // TLD check: must have a dot and a valid TLD
        if (!token.includes('.')) return;
        const urlWithoutProtocol = token.replace(/^https?:\/\//i, '');
        const hostPath = urlWithoutProtocol.split('/')[0].split('?')[0];
        const tldMatch = hostPath.match(/\.([a-z]{2,63})$/i);
        if (!tldMatch && !token.startsWith('http')) return;

        let fullUrl = token;
        if (!/^https?:\/\//i.test(fullUrl) && !fullUrl.startsWith('mailto:') && !fullUrl.startsWith('tel:')) {
          fullUrl = 'https://' + fullUrl;
        }

        try {
          const parsed = new URL(fullUrl);
          const host = parsed.hostname.toLowerCase();
          
          let platform = 'website';
          
          const isDomain = (d) => host === d || host.endsWith('.' + d);
          
          if (isDomain('linkedin.com')) platform = 'linkedin';
          else if (isDomain('instagram.com')) platform = 'instagram';
          else if (isDomain('twitter.com') || isDomain('x.com')) platform = 'twitter';
          else if (isDomain('facebook.com')) platform = 'facebook';
          else if (isDomain('tiktok.com')) platform = 'tiktok';
          else if (isDomain('youtube.com') || isDomain('youtu.be')) platform = 'youtube';

          rawLinks.push({ type: platform, url: fullUrl });
        } catch (e) {
          // not a valid URL
        }
      });
    });
  });

  const deduped = [];
  const seen = new Set();
  
  rawLinks.forEach(link => {
    let normalized = link.url.toLowerCase();
    if (link.type !== 'email' && link.type !== 'phone') {
      normalized = normalized
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '');
    } else if (link.type === 'phone') {
      normalized = normalized.replace(/\D/g, '');
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push({ platform: link.type, url: link.url });
    }
  });

  return deduped;
}
