import { create } from 'zustand';
import type { ChampionshipStandingEntry, OfflineChampionship, OfflineTeamState } from '../types';

interface ChampionshipStore {
  activeChampionship: OfflineChampionship | null;
  currentRound: number;
  driverStandings: ChampionshipStandingEntry[];
  constructorStandings: ChampionshipStandingEntry[];
  teamStateById: Record<string, OfflineTeamState>;

  setActiveChampionship: (championship: OfflineChampionship | null) => void;
  setCurrentRound: (round: number) => void;
  setDriverStandings: (standings: ChampionshipStandingEntry[]) => void;
  setConstructorStandings: (standings: ChampionshipStandingEntry[]) => void;
  upsertTeamState: (team: OfflineTeamState) => void;
  resetChampionshipState: () => void;
}

export const useChampionshipStore = create<ChampionshipStore>((set) => ({
  activeChampionship: null,
  currentRound: 1,
  driverStandings: [],
  constructorStandings: [],
  teamStateById: {},

  setActiveChampionship: (championship) =>
    set({
      activeChampionship: championship,
      currentRound: championship?.currentRound ?? 1,
      driverStandings: championship?.driverStandings ?? [],
      constructorStandings: championship?.constructorStandings ?? [],
      teamStateById: Object.fromEntries((championship?.teams ?? []).map(team => [team.teamId, team])),
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

  resetChampionshipState: () =>
    set({
      activeChampionship: null,
      currentRound: 1,
      driverStandings: [],
      constructorStandings: [],
      teamStateById: {},
    }),
}));
