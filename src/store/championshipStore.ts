import { create } from 'zustand';
import type { ChampionshipStandingEntry, OfflineChampionship, OfflineTeamState } from '../types';

type ChampionshipContextMode = 'online' | 'local' | null;

const buildContextKey = (
  mode: Exclude<ChampionshipContextMode, null>,
  championshipId: string,
  teamId: string
) => `${mode}:${championshipId}:${teamId}`;

interface ChampionshipStore {
  mode: ChampionshipContextMode;
  championshipId: string | null;
  teamId: string | null;
  teamName: string | null;
  contextKey: string | null;
  activeChampionship: OfflineChampionship | null;
  currentRound: number;
  driverStandings: ChampionshipStandingEntry[];
  constructorStandings: ChampionshipStandingEntry[];
  teamStateById: Record<string, OfflineTeamState>;

  setActiveChampionship: (championship: OfflineChampionship | null) => void;
  setActiveOnlineContext: (context: {
    championshipId: string;
    teamId?: string | null;
    teamName?: string | null;
  }) => void;
  setActiveLocalContext: (championship: OfflineChampionship | null) => void;
  setCurrentRound: (round: number) => void;
  setDriverStandings: (standings: ChampionshipStandingEntry[]) => void;
  setConstructorStandings: (standings: ChampionshipStandingEntry[]) => void;
  upsertTeamState: (team: OfflineTeamState) => void;
  clearActiveContext: () => void;
  resetChampionshipState: () => void;
}

export const useChampionshipStore = create<ChampionshipStore>((set) => ({
  mode: null,
  championshipId: null,
  teamId: null,
  teamName: null,
  contextKey: null,
  activeChampionship: null,
  currentRound: 1,
  driverStandings: [],
  constructorStandings: [],
  teamStateById: {},

  setActiveChampionship: (championship) =>
    set((state) => ({
      ...state,
      activeChampionship: championship,
      currentRound: championship?.currentRound ?? 1,
      driverStandings: championship?.driverStandings ?? [],
      constructorStandings: championship?.constructorStandings ?? [],
      teamStateById: Object.fromEntries((championship?.teams ?? []).map(team => [team.teamId, team])),
    })),

  setActiveOnlineContext: ({ championshipId, teamId = null, teamName = null }) =>
    set((state) => ({
      ...state,
      mode: 'online',
      championshipId,
      teamId,
      teamName,
      contextKey: teamId ? buildContextKey('online', championshipId, teamId) : null,
      activeChampionship: null,
      currentRound: 1,
      driverStandings: [],
      constructorStandings: [],
      teamStateById: {},
    })),

  setActiveLocalContext: (championship) =>
    set((state) => {
      const selectedTeam = championship?.teams.find((team) => team.teamId === championship.selectedTeamId) ?? null;

      return {
        ...state,
        mode: championship ? 'local' : null,
        championshipId: championship?.id ?? null,
        teamId: selectedTeam?.teamId ?? null,
        teamName: selectedTeam?.teamName ?? null,
        contextKey:
          championship && selectedTeam
            ? buildContextKey('local', championship.id, selectedTeam.teamId)
            : null,
        activeChampionship: championship,
        currentRound: championship?.currentRound ?? 1,
        driverStandings: championship?.driverStandings ?? [],
        constructorStandings: championship?.constructorStandings ?? [],
        teamStateById: Object.fromEntries((championship?.teams ?? []).map(team => [team.teamId, team])),
      };
    }),

  setCurrentRound: (round) => set({ currentRound: round }),

  setDriverStandings: (standings) => set({ driverStandings: standings }),

  setConstructorStandings: (standings) => set({ constructorStandings: standings }),

  upsertTeamState: (team) =>
    set((state) => ({
      teamStateById: {
        ...state.teamStateById,
        [team.teamId]: team,
      },
    })),

  clearActiveContext: () =>
    set({
      mode: null,
      championshipId: null,
      teamId: null,
      teamName: null,
      contextKey: null,
      activeChampionship: null,
      currentRound: 1,
      driverStandings: [],
      constructorStandings: [],
      teamStateById: {},
    }),

  resetChampionshipState: () =>
    set({
      mode: null,
      championshipId: null,
      teamId: null,
      teamName: null,
      contextKey: null,
      activeChampionship: null,
      currentRound: 1,
      driverStandings: [],
      constructorStandings: [],
      teamStateById: {},
    }),
}));
