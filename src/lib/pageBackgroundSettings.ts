export type GamePageKey =
  | 'dashboard'
  | 'championships'
  | 'championshipDetails'
  | 'weekendDetails'
  | 'raceControl'
  | 'teamHub'
  | 'research'
  | 'facilities'
  | 'settings';

export type PageBackgroundSettings = {
  opacity: number;
  pages: Partial<Record<GamePageKey, string>>;
};

export const PAGE_BACKGROUND_OPTIONS: Array<{ key: GamePageKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'championships', label: 'Championships list' },
  { key: 'championshipDetails', label: 'Championship details' },
  { key: 'weekendDetails', label: 'Weekend details' },
  { key: 'raceControl', label: 'Race control' },
  { key: 'teamHub', label: 'Team hub' },
  { key: 'research', label: 'Research' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'settings', label: 'Settings' },
];

const STORAGE_KEY = 'page-background-settings';
const CHANGE_EVENT = 'page-background-settings-changed';

const defaultSettings: PageBackgroundSettings = {
  opacity: 0.16,
  pages: {},
};

const clampOpacity = (value: number) => {
  if (Number.isNaN(value)) return defaultSettings.opacity;
  return Math.min(0.4, Math.max(0.05, value));
};

export const getPageBackgroundSettings = (): PageBackgroundSettings => {
  if (typeof window === 'undefined') return defaultSettings;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultSettings;
  try {
    const parsed = JSON.parse(raw) as Partial<PageBackgroundSettings>;
    return {
      opacity: clampOpacity(Number(parsed.opacity)),
      pages: parsed.pages && typeof parsed.pages === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.pages).map(([key, value]) => [key, normalizeBackgroundImageUrl(typeof value === 'string' ? value : '')])
          )
        : {},
    };
  } catch {
    return defaultSettings;
  }
};

export const savePageBackgroundSettings = (settings: PageBackgroundSettings) => {
  if (typeof window === 'undefined') return;
  const cleaned: PageBackgroundSettings = {
    opacity: clampOpacity(settings.opacity),
    pages: Object.fromEntries(
      Object.entries(settings.pages).map(([key, value]) => [key, normalizeBackgroundImageUrl(value)])
    ),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const getPageBackgroundChangeEventName = () => CHANGE_EVENT;

export const normalizeBackgroundImageUrl = (value: string | null | undefined): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return '';
  }

  return '';
};

export const resolveGamePageKey = (pathname: string): GamePageKey => {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/championships/')) return 'championshipDetails';
  if (pathname === '/championships') return 'championships';
  if (pathname.startsWith('/weekends/')) return 'weekendDetails';
  if (pathname.startsWith('/race/')) return 'raceControl';
  if (pathname === '/team-hub') return 'teamHub';
  if (pathname === '/research') return 'research';
  if (pathname === '/facilities') return 'facilities';
  if (pathname === '/settings') return 'settings';
  return 'dashboard';
};
