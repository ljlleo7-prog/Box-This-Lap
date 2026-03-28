import { create } from 'zustand';
import type { OfflineWeekend, SessionSetupState, SessionSummary, SessionType, WeekendPhase } from '../types';

interface WeekendStore {
  currentWeekend: OfflineWeekend | null;
  currentPhase: WeekendPhase;
  sessionSummaries: Partial<Record<SessionType, SessionSummary>>;
  selectedSetupByDriver: Record<string, SessionSetupState>;

  setCurrentWeekend: (weekend: OfflineWeekend | null) => void;
  setCurrentPhase: (phase: WeekendPhase) => void;
  setDriverSetup: (driverId: string, setup: SessionSetupState) => void;
  setSessionSummary: (sessionType: SessionType, summary: SessionSummary) => void;
  resetWeekendState: () => void;
}

const DEFAULT_PHASE: WeekendPhase = 'pre_weekend';

export const useWeekendStore = create<WeekendStore>((set) => ({
  currentWeekend: null,
  currentPhase: DEFAULT_PHASE,
  sessionSummaries: {},
  selectedSetupByDriver: {},

  setCurrentWeekend: (weekend) =>
    set({
      currentWeekend: weekend,
      currentPhase: weekend?.currentPhase ?? DEFAULT_PHASE,
      sessionSummaries: weekend?.sessionSummaries ?? {},
      selectedSetupByDriver: (() => {
        if (!weekend) return {};
        switch (weekend.currentPhase) {
          case 'fp1': return weekend.fp1Setup;
          case 'fp2': return weekend.fp2Setup;
          case 'fp3': return weekend.fp3Setup;
          case 'q1': return weekend.q1Setup;
          case 'q2': return weekend.q2Setup;
          case 'q3': return weekend.q3Setup;
          case 'race': return weekend.raceSetup;
          default: return {};
        }
      })(),
    }),

  setCurrentPhase: (phase) => set({ currentPhase: phase }),

  setDriverSetup: (driverId, setup) =>
    set((state) => {
      // Parc Ferme enforcement
      const isParcFerme = ['q1', 'q2', 'q3', 'race'].includes(state.currentPhase);
      let allowedSetup = { ...setup };

      if (isParcFerme) {
        // Remove mechanical setup changes if Parc Ferme is active
        const {
          frontWingAngle,
          rearWingAngle,
          rideHeight,
          suspensionStiffness,
          toeOut,
          camber,
          gearboxSetting,
          ...rest
        } = allowedSetup;
        allowedSetup = rest;
      }

      return {
        selectedSetupByDriver: {
          ...state.selectedSetupByDriver,
          [driverId]: {
            ...state.selectedSetupByDriver[driverId],
            ...allowedSetup,
          },
        },
      };
    }),

  setSessionSummary: (sessionType, summary) =>
    set((state) => ({
      sessionSummaries: {
        ...state.sessionSummaries,
        [sessionType]: summary,
      },
    })),

  resetWeekendState: () =>
    set({
      currentWeekend: null,
      currentPhase: DEFAULT_PHASE,
      sessionSummaries: {},
      selectedSetupByDriver: {},
    }),
}));
