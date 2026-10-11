// Institution theme engine.
//
// Themes follow the 60-30-10 rule:
//   60% surface  – page background and cards, always a near-neutral
//   30% primary  – sidebar, headings, dark buttons
//   10% accent   – primary CTAs, active navigation, focus rings
//
// Clients never pick raw surface colours; the surface is derived from the
// primary so the dominant 60% can't become garish. Primary and accent are
// validated for text contrast (WCAG AA) and for being distinguishable.

export type SurfaceMode = 'light' | 'soft';

export interface InstitutionTheme {
  preset: string;
  primary: string;
  accent: string;
  surface: SurfaceMode;
  logoUrl?: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  primary: string;
  accent: string;
  surface: SurfaceMode;
}

export const DEFAULT_PRESET_ID = 'litsamaiso';
export const CUSTOM_PRESET_ID = 'custom';

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'litsamaiso', name: 'Litsamaiso Classic', description: 'The original clean, light look.', primary: '#020618', accent: '#535BC0', surface: 'light' },
  { id: 'maluti-blue', name: 'Maluti Blue', description: 'Calm navy with a bright blue highlight.', primary: '#0B2545', accent: '#2563EB', surface: 'soft' },
  { id: 'basotho-green', name: 'Basotho Green', description: 'Deep forest green with a warm gold accent.', primary: '#0F3D2E', accent: '#A16207', surface: 'soft' },
  { id: 'mokorotlo-earth', name: 'Mokorotlo Earth', description: 'Earthy brown with a terracotta accent.', primary: '#3B2A1E', accent: '#C2562B', surface: 'soft' },
  { id: 'slate', name: 'Slate', description: 'Neutral graphite with a teal highlight.', primary: '#1E293B', accent: '#0F766E', surface: 'light' },
  { id: 'crimson', name: 'Crimson', description: 'Classic academic maroon.', primary: '#4A0E1C', accent: '#D63A4F', surface: 'soft' },
  { id: 'ocean-teal', name: 'Ocean Teal', description: 'Deep teal with a burnt-orange accent.', primary: '#0B3B40', accent: '#C2410C', surface: 'soft' },
  { id: 'royal-plum', name: 'Royal Plum', description: 'Rich plum with an amber accent.', primary: '#2E1437', accent: '#B45309', surface: 'soft' },
];

// Restricted swatches for "Custom" mode. Primaries are dark enough to carry
// white text; accents are saturated mid-tones that also carry white text.
export const PRIMARY_SWATCHES = [
  '#020618', '#0B2545', '#1E293B', '#0F3D2E', '#0B3B40', '#1F2A5A',
  '#3B2A1E', '#4A0E1C', '#2E1437', '#3A1F5D', '#123524', '#2B2D42',
];

export const ACCENT_SWATCHES = [
  '#535BC0', '#2563EB', '#0F766E', '#15803D', '#A16207', '#B45309',
  '#C2562B', '#C2410C', '#D63A4F', '#BE185D', '#7C3AED', '#0E7490',
];

// ---------- colour maths ----------

type Rgb = { r: number; g: number; b: number };

const HEX_RE = /^#([0-9a-f]{6})$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_RE.test(value);

export const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

export const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

/** Linear blend of two colours; weight is the share of `b`. */
export const mix = (a: string, b: string, weight: number): string => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * weight,
    g: ca.g + (cb.g - ca.g) * weight,
    b: ca.b + (cb.b - ca.b) * weight,
  });
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE = '#ffffff';
const INK = '#0f172a';

/** Picks white or near-black text, whichever reads better on `bg`. */
export const readableForeground = (bg: string): string =>
  contrastRatio(bg, WHITE) >= contrastRatio(bg, INK) ? WHITE : INK;

// Rough perceptual distance (redmean approximation of ΔE), 0–~765.
export const colorDistance = (a: string, b: string): number => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const rMean = (ca.r + cb.r) / 2;
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
};

// ---------- validation ----------

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_ACCENT_DISTANCE = 120;

export interface ThemeIssue {
  field: 'primary' | 'accent' | 'surface';
  message: string;
}

export const validateTheme = (theme: Pick<InstitutionTheme, 'primary' | 'accent' | 'surface'>): ThemeIssue[] => {
  const issues: ThemeIssue[] = [];
  if (!isHexColor(theme.primary)) issues.push({ field: 'primary', message: 'Primary must be a hex colour like #0B2545.' });
  if (!isHexColor(theme.accent)) issues.push({ field: 'accent', message: 'Accent must be a hex colour like #2F80ED.' });
  if (theme.surface !== 'light' && theme.surface !== 'soft') issues.push({ field: 'surface', message: 'Surface must be light or soft.' });
  if (issues.length) return issues;

  if (contrastRatio(theme.primary, readableForeground(theme.primary)) < MIN_TEXT_CONTRAST) {
    issues.push({ field: 'primary', message: 'Text on this primary colour would be hard to read. Choose a darker or lighter shade.' });
  }
  if (contrastRatio(theme.primary, '#ffffff') < MIN_TEXT_CONTRAST) {
    issues.push({ field: 'primary', message: 'Primary is used for headings on light surfaces, so it needs to be darker.' });
  }
  if (contrastRatio(theme.accent, readableForeground(theme.accent)) < MIN_TEXT_CONTRAST) {
    issues.push({ field: 'accent', message: 'Button text on this accent would be hard to read.' });
  }
  if (colorDistance(theme.primary, theme.accent) < MIN_ACCENT_DISTANCE) {
    issues.push({ field: 'accent', message: 'Accent is too close to the primary colour to stand out. Pick a contrasting accent.' });
  }
  return issues;
};

// ---------- CSS variables ----------

export type ThemeVariables = Record<string, string>;

// Exactly the colours the app shipped with, so the default theme is a no-op.
export const DEFAULT_THEME_VARIABLES: ThemeVariables = {
  '--brand-primary': '#020618',
  '--brand-primary-strong': '#0F172B',
  '--brand-primary-foreground': '#ffffff',
  '--brand-accent': '#535BC0',
  '--brand-accent-foreground': '#ffffff',
  '--brand-active': '#020618',
  '--brand-active-foreground': '#ffffff',
  '--brand-stroke': '#919DC2',
  '--brand-surface': '#f8fafc',
  '--brand-surface-raised': '#ffffff',
  '--brand-sidebar': '#ffffff',
  '--brand-sidebar-foreground': '#475569',
  '--brand-sidebar-heading': '#020618',
  '--brand-sidebar-muted': '#64748b',
  '--brand-sidebar-hover': '#f1f5f9',
  '--brand-sidebar-border': '#e2e8f0',
};

export const getPreset = (id: string | undefined): ThemePreset | undefined =>
  THEME_PRESETS.find((preset) => preset.id === id);

export const defaultTheme = (): InstitutionTheme => {
  const preset = getPreset(DEFAULT_PRESET_ID)!;
  return { preset: preset.id, primary: preset.primary, accent: preset.accent, surface: preset.surface };
};

export const buildThemeVariables = (theme: InstitutionTheme | null | undefined): ThemeVariables => {
  if (!theme || theme.preset === DEFAULT_PRESET_ID || validateTheme(theme).length) {
    return DEFAULT_THEME_VARIABLES;
  }

  const { primary, accent, surface } = theme;
  const primaryFg = readableForeground(primary);
  const accentFg = readableForeground(accent);
  const onPrimaryMuted = mix(primary, primaryFg, 0.72);

  return {
    '--brand-primary': primary,
    '--brand-primary-strong': mix(primary, '#ffffff', 0.08),
    '--brand-primary-foreground': primaryFg,
    '--brand-accent': accent,
    '--brand-accent-foreground': accentFg,
    '--brand-active': accent,
    '--brand-active-foreground': accentFg,
    '--brand-stroke': mix(primary, '#ffffff', 0.55),
    // 60%: near-white, faintly tinted by the primary.
    '--brand-surface': surface === 'soft' ? mix('#ffffff', primary, 0.045) : '#f8fafc',
    '--brand-surface-raised': '#ffffff',
    // 30%: the sidebar carries the primary colour.
    '--brand-sidebar': primary,
    '--brand-sidebar-foreground': onPrimaryMuted,
    '--brand-sidebar-heading': primaryFg,
    '--brand-sidebar-muted': mix(primary, primaryFg, 0.55),
    '--brand-sidebar-hover': mix(primary, primaryFg, 0.1),
    '--brand-sidebar-border': mix(primary, primaryFg, 0.14),
  };
};

export const applyThemeVariables = (vars: ThemeVariables, target: HTMLElement = document.documentElement) => {
  Object.entries(vars).forEach(([name, value]) => target.style.setProperty(name, value));
};

export const clearThemeVariables = (target: HTMLElement = document.documentElement) => {
  Object.keys(DEFAULT_THEME_VARIABLES).forEach((name) => target.style.removeProperty(name));
};
