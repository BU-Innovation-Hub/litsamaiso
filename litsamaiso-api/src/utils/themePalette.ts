// Server-side guardrails for institution themes (60-30-10 rule).
// Mirrors the validation in litsamaiso-client/src/theme/palette.ts — keep in sync.

export type SurfaceMode = "light" | "soft";

export interface InstitutionTheme {
  preset: string;
  primary: string;
  accent: string;
  surface: SurfaceMode;
  logoUrl?: string;
}

export const THEME_PRESET_IDS = [
  "litsamaiso",
  "maluti-blue",
  "basotho-green",
  "mokorotlo-earth",
  "slate",
  "crimson",
  "ocean-teal",
  "royal-plum",
  "custom",
] as const;

export const DEFAULT_THEME: InstitutionTheme = {
  preset: "litsamaiso",
  primary: "#020618",
  accent: "#535BC0",
  surface: "light",
};

const HEX_RE = /^#[0-9a-f]{6}$/i;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_ACCENT_DISTANCE = 120;

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_RE.test(value);

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const { r, g, b } = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const bestTextContrast = (bg: string) =>
  Math.max(contrastRatio(bg, "#ffffff"), contrastRatio(bg, "#0f172a"));

const colorDistance = (a: string, b: string) => {
  const ca = toRgb(a);
  const cb = toRgb(b);
  const rMean = (ca.r + cb.r) / 2;
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
};

/** Returns human-readable problems; an empty array means the theme is valid. */
export const validateTheme = (theme: Partial<InstitutionTheme>): string[] => {
  const issues: string[] = [];
  if (!theme.preset || !(THEME_PRESET_IDS as readonly string[]).includes(theme.preset)) {
    issues.push("Unknown theme preset.");
  }
  if (!isHexColor(theme.primary)) issues.push("Primary must be a hex colour like #0B2545.");
  if (!isHexColor(theme.accent)) issues.push("Accent must be a hex colour like #2563EB.");
  if (theme.surface !== "light" && theme.surface !== "soft") issues.push("Surface must be light or soft.");
  if (theme.logoUrl !== undefined && !/^https:\/\/\S+$/i.test(theme.logoUrl)) {
    issues.push("Logo must be an https URL.");
  }
  if (issues.length) return issues;

  const primary = theme.primary as string;
  const accent = theme.accent as string;
  if (contrastRatio(primary, "#ffffff") < MIN_TEXT_CONTRAST) {
    issues.push("Primary colour is too light to use for headings and the sidebar.");
  }
  if (bestTextContrast(accent) < MIN_TEXT_CONTRAST) {
    issues.push("Button text on this accent would be hard to read.");
  }
  if (colorDistance(primary, accent) < MIN_ACCENT_DISTANCE) {
    issues.push("Accent is too close to the primary colour to stand out.");
  }
  return issues;
};

/** Normalises untrusted input into a theme object (validate afterwards). */
export const parseTheme = (input: unknown): Partial<InstitutionTheme> => {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const theme: Partial<InstitutionTheme> = {};
  if (typeof raw.preset === "string") theme.preset = raw.preset.trim();
  if (typeof raw.primary === "string") theme.primary = raw.primary.trim().toLowerCase();
  if (typeof raw.accent === "string") theme.accent = raw.accent.trim().toLowerCase();
  if (raw.surface === "light" || raw.surface === "soft") theme.surface = raw.surface;
  if (typeof raw.logoUrl === "string" && raw.logoUrl.trim()) theme.logoUrl = raw.logoUrl.trim();
  return theme;
};
