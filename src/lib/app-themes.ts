/**
 * The app's colour themes. The tokens live in globals.css: Midnight on:root, the others under
 * `[data-app-theme="<key in lower case>"]`. Institutes pick one for everyone (Settings → Appearance); each platform
 * admin picks one for their own panel. The public website has its own design.
 */
export const APP_THEME_KEYS = ["MIDNIGHT", "AMBER", "INDIGO", "EMERALD", "PLUM"] as const;
export type AppTheme = (typeof APP_THEME_KEYS)[number];
export const DEFAULT_APP_THEME: AppTheme = "MIDNIGHT";

export interface AppThemeInfo {
  key: AppTheme;
  name: string;
  description: string;
  /** Swatches for pickers: sidebar, page, primary, accent. */
  swatches: [string, string, string, string];
}

export const APP_THEMES: AppThemeInfo[] = [
  { key: "MIDNIGHT", name: "Midnight & Gold", description: "Deep navy menu, soft grey pages and gold highlights. Premium and calm.", swatches: ["#0f1631", "#f5f6fa", "#f5a700", "#6366f1"] },
  { key: "AMBER", name: "Classic Amber", description: "Espresso menu, cream paper and the classic amber. Warm and friendly.", swatches: ["#2a1f17", "#fafaf9", "#feac00", "#f97316"] },
  { key: "INDIGO", name: "Royal Indigo", description: "Deep ink menu with indigo and violet. Modern and sharp.", swatches: ["#1b1d3a", "#f7f7fb", "#4f46e5", "#7c3aed"] },
  { key: "EMERALD", name: "Emerald & Gold", description: "Deep green menu with teal and gold. Calm and academic.", swatches: ["#0b3b36", "#f4f8f7", "#0f766e", "#f5a700"] },
  { key: "PLUM", name: "Plum & Coral", description: "Rich plum menu with violet and coral. Bold and lively.", swatches: ["#2e1065", "#faf7fb", "#7c3aed", "#fb7185"] },
];

export const isAppTheme = (value: unknown): value is AppTheme => typeof value === "string" && (APP_THEME_KEYS as readonly string[]).includes(value);

/** The `data-app-theme` attribute value; undefined for the default, which lives on:root. */
export const themeAttribute = (theme: AppTheme | null | undefined): string | undefined =>
  theme && theme !== DEFAULT_APP_THEME ? theme.toLowerCase() : undefined;

/**
 * Whether the paper background shows: an explicit choice wins; otherwise ("automatic", null) it is on with
 * Classic Amber only.
 */
export const resolvePaper = (theme: AppTheme, paper: boolean | null | undefined): boolean => paper ?? theme === "AMBER";
