/**
 * Marketing media paths. Drop files into public/marketing/ — no rebuild needed.
 * Hero video: record follow-up flow → public/marketing/hero-demo.mp4 (+ optional hero-demo.webm)
 */
export const MARKETING_MEDIA = {
  heroVideo: '/marketing/hero-demo.mp4',
  heroVideoWebm: '/marketing/hero-demo.webm',
  heroLight: '/marketing/hero-light.png',
  heroDark: '/marketing/hero-dark.png',
  paywallBg: '/marketing/paywall-bg.webp',
};

export const FEATURE_MEDIA = {
  pipeline: { dark: '/marketing/feature-pipeline-dark.webp', light: '/marketing/feature-pipeline-light.webp' },
  reminders: { dark: '/marketing/feature-reminders-dark.webp', light: '/marketing/feature-reminders-light.webp' },
  templates: { dark: '/marketing/feature-templates-dark.webp', light: '/marketing/feature-templates-light.webp' },
  revenue: { dark: '/marketing/feature-revenue-dark.webp', light: '/marketing/feature-revenue-light.webp' },
};

export const HOW_IT_WORKS_MEDIA = {
  1: { dark: '/marketing/step-add-lead-dark.webp', light: '/marketing/step-add-lead-light.webp' },
  2: { dark: '/marketing/step-contacted-dark.webp', light: '/marketing/step-contacted-light.webp' },
  3: { dark: '/marketing/step-follow-up-dark.webp', light: '/marketing/step-follow-up-light.webp' },
};
