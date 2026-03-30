import type { ResearchDepartmentState, SaveGame, TeamSpecs } from '../types';
import { createEmptyResearchState, deriveInstalledTeamSpecs } from './researchDevelopment';

export const SAVE_VERSION = 1;
export const SAVE_GAME_STORAGE_KEY = 'offline-save-game';
export const TEAM_SPECS_STORAGE_KEY = 'rd-team-specs';
export const RESEARCH_STATE_STORAGE_KEY = 'rd-research-state';

type ScopedStorageContext = {
  championshipId: string;
  mode: 'online' | 'local';
  teamId: string;
};

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const buildScopedStorageSuffix = ({ championshipId, mode, teamId }: ScopedStorageContext) => `${mode}:${championshipId}:${teamId}`;

const buildScopedResearchStateKey = (context: ScopedStorageContext) => `${RESEARCH_STATE_STORAGE_KEY}:${buildScopedStorageSuffix(context)}`;

const buildScopedTeamSpecsKey = (context: ScopedStorageContext) => `${TEAM_SPECS_STORAGE_KEY}:${buildScopedStorageSuffix(context)}`;

export const createEmptySaveGame = (): SaveGame => ({
  version: SAVE_VERSION,
  championship: null,
  activeWeekendId: null,
  lastOpenedAt: new Date().toISOString(),
});

export const loadSaveGame = (): SaveGame => {
  if (!isBrowser()) return createEmptySaveGame();

  const parsed = safeParse<SaveGame | null>(window.localStorage.getItem(SAVE_GAME_STORAGE_KEY), null);
  if (!parsed || typeof parsed !== 'object') return createEmptySaveGame();

  return {
    version: typeof parsed.version === 'number' ? parsed.version : SAVE_VERSION,
    championship: parsed.championship ?? null,
    activeWeekendId: parsed.activeWeekendId ?? null,
    lastOpenedAt: parsed.lastOpenedAt ?? new Date().toISOString(),
  };
};

export const saveSaveGame = (save: SaveGame): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(SAVE_GAME_STORAGE_KEY, JSON.stringify(save));
};

export const clearSaveGame = (): void => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SAVE_GAME_STORAGE_KEY);
};

export const loadTeamSpecs = (): Record<string, TeamSpecs> => {
  if (!isBrowser()) return {};
  return safeParse<Record<string, TeamSpecs>>(window.localStorage.getItem(TEAM_SPECS_STORAGE_KEY), {});
};

export const saveTeamSpecs = (specs: Record<string, TeamSpecs>): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(TEAM_SPECS_STORAGE_KEY, JSON.stringify(specs));
};

export const loadResearchStates = (): Record<string, ResearchDepartmentState> => {
  if (!isBrowser()) return {};
  return safeParse<Record<string, ResearchDepartmentState>>(window.localStorage.getItem(RESEARCH_STATE_STORAGE_KEY), {});
};

export const loadResearchState = (teamKey: string, constructorStanding = 5): ResearchDepartmentState => {
  const states = loadResearchStates();
  return states[teamKey] ?? createEmptyResearchState(constructorStanding);
};

export const saveResearchState = (teamKey: string, state: ResearchDepartmentState): void => {
  if (!isBrowser()) return;
  const states = loadResearchStates();
  states[teamKey] = state;
  window.localStorage.setItem(RESEARCH_STATE_STORAGE_KEY, JSON.stringify(states));
};

export const saveDerivedTeamSpecs = (teamKey: string, specs: TeamSpecs): void => {
  if (!isBrowser()) return;
  const storedSpecs = loadTeamSpecs();
  storedSpecs[teamKey] = specs;
  saveTeamSpecs(storedSpecs);
};

export const deriveAndSaveResearchTeamSpecs = (
  teamKey: string,
  baseSpecs: TeamSpecs,
  researchState: ResearchDepartmentState
): TeamSpecs => {
  const derivedSpecs = deriveInstalledTeamSpecs(baseSpecs, researchState);
  saveDerivedTeamSpecs(teamKey, derivedSpecs);
  return derivedSpecs;
};

export const loadResearchStateScoped = (
  context: ScopedStorageContext,
  teamKey: string,
  constructorStanding = 5
): ResearchDepartmentState => {
  if (!isBrowser()) return createEmptyResearchState(constructorStanding);

  const scopedKey = buildScopedResearchStateKey(context);
  const scopedState = safeParse<ResearchDepartmentState | null>(window.localStorage.getItem(scopedKey), null);
  if (scopedState) return scopedState;

  const legacyState = loadResearchState(teamKey, constructorStanding);
  window.localStorage.setItem(scopedKey, JSON.stringify(legacyState));
  return legacyState;
};

export const saveResearchStateScoped = (
  context: ScopedStorageContext,
  state: ResearchDepartmentState
): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(buildScopedResearchStateKey(context), JSON.stringify(state));
};

export const loadTeamSpecsScoped = (
  context: ScopedStorageContext,
  teamKey: string
): TeamSpecs | null => {
  if (!isBrowser()) return null;

  const scopedKey = buildScopedTeamSpecsKey(context);
  const scopedSpecs = safeParse<TeamSpecs | null>(window.localStorage.getItem(scopedKey), null);
  if (scopedSpecs) return scopedSpecs;

  const legacySpecs = loadTeamSpecs()[teamKey] ?? null;
  if (legacySpecs) {
    window.localStorage.setItem(scopedKey, JSON.stringify(legacySpecs));
  }
  return legacySpecs;
};

export const saveTeamSpecsScoped = (
  context: ScopedStorageContext,
  specs: TeamSpecs
): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(buildScopedTeamSpecsKey(context), JSON.stringify(specs));
};

export const deriveAndSaveResearchTeamSpecsScoped = (
  context: ScopedStorageContext,
  baseSpecs: TeamSpecs,
  researchState: ResearchDepartmentState
): TeamSpecs => {
  const derivedSpecs = deriveInstalledTeamSpecs(baseSpecs, researchState);
  saveTeamSpecsScoped(context, derivedSpecs);
  return derivedSpecs;
};
