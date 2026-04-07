import { WeekendManager } from '../../engine/systems/WeekendManager';
import type {
  OfflineWeekend,
  SessionSetupState,
  SessionType,
  TyreSet,
  WeekendPhase,
  WeekendSessionType,
} from '../../types';

export const NEUTRAL_SESSION_SETUP: SessionSetupState = {
  frontWingAngle: 50,
  rearWingAngle: 50,
  rideHeight: 50,
  suspensionStiffness: 50,
  toeOut: 50,
  camber: 50,
  gearboxSetting: 50,
};

export const isPracticePhase = (phase: WeekendPhase): phase is 'fp1' | 'fp2' | 'fp3' =>
  phase === 'fp1' || phase === 'fp2' || phase === 'fp3';

export const isQualifyingPhase = (phase: WeekendPhase): phase is 'q1' | 'q2' | 'q3' =>
  phase === 'q1' || phase === 'q2' || phase === 'q3';

export const isTimedSessionPhase = (phase: WeekendPhase): phase is Exclude<SessionType, 'race'> =>
  isPracticePhase(phase) || isQualifyingPhase(phase);

export const getWeekendSessionTypeForPhase = (phase: SessionType): WeekendSessionType => {
  if (phase.startsWith('fp')) return 'practice';
  if (phase.startsWith('q')) return 'quali';
  return 'race';
};

export const getPhaseDriverKey = (driverId: string, phase: SessionType): string => `${driverId}:${phase}`;

export const chooseDefaultTyreSetId = (allocation: TyreSet[]): string | null => {
  const available = allocation.filter((set) => !set.returned);
  const preferred = available.find((set) => set.compound === 'soft')
    ?? available.find((set) => set.compound === 'medium')
    ?? available.find((set) => set.compound === 'hard')
    ?? available[0];
  return preferred?.id ?? null;
};

export const getSetupForPhase = (weekend: OfflineWeekend, phase: WeekendPhase, driverId: string): SessionSetupState => {
  switch (phase) {
    case 'fp1':
      return weekend.fp1Setup[driverId] ?? { ...NEUTRAL_SESSION_SETUP };
    case 'fp2':
      return weekend.fp2Setup[driverId] ?? { ...NEUTRAL_SESSION_SETUP };
    case 'fp3':
      return weekend.fp3Setup[driverId] ?? { ...NEUTRAL_SESSION_SETUP };
    case 'q1':
      return weekend.q1Setup[driverId] ?? { ...NEUTRAL_SESSION_SETUP };
    case 'q2':
      return weekend.q2Setup[driverId] ?? { ...NEUTRAL_SESSION_SETUP };
    case 'q3':
      return weekend.q3Setup[driverId] ?? { ...NEUTRAL_SESSION_SETUP };
    case 'race':
      return weekend.raceSetup[driverId] ?? { ...NEUTRAL_SESSION_SETUP };
    default:
      return { ...NEUTRAL_SESSION_SETUP };
  }
};

export const updateSetupForPhase = (
  weekend: OfflineWeekend,
  phase: WeekendPhase,
  driverId: string,
  setup: SessionSetupState,
): OfflineWeekend => {
  if (phase === 'fp1') return { ...weekend, fp1Setup: { ...weekend.fp1Setup, [driverId]: setup } };
  if (phase === 'fp2') return { ...weekend, fp2Setup: { ...weekend.fp2Setup, [driverId]: setup } };
  if (phase === 'fp3') return { ...weekend, fp3Setup: { ...weekend.fp3Setup, [driverId]: setup } };
  if (phase === 'q1') return { ...weekend, q1Setup: { ...weekend.q1Setup, [driverId]: setup } };
  if (phase === 'q2') return { ...weekend, q2Setup: { ...weekend.q2Setup, [driverId]: setup } };
  if (phase === 'q3') return { ...weekend, q3Setup: { ...weekend.q3Setup, [driverId]: setup } };
  if (phase === 'race') return { ...weekend, raceSetup: { ...weekend.raceSetup, [driverId]: setup } };
  return weekend;
};

export const carrySetupForward = (weekend: OfflineWeekend, driverIds: string[]): OfflineWeekend => {
  const nextPhase = WeekendManager.getNextPhase(weekend.currentPhase);
  if (!nextPhase) return weekend;

  if (weekend.currentPhase === 'fp1' && nextPhase === 'fp2') {
    return driverIds.reduce(
      (nextWeekend, driverId) => updateSetupForPhase(nextWeekend, 'fp2', driverId, { ...getSetupForPhase(nextWeekend, 'fp1', driverId) }),
      weekend,
    );
  }

  if (weekend.currentPhase === 'fp2' && nextPhase === 'fp3') {
    return driverIds.reduce(
      (nextWeekend, driverId) => updateSetupForPhase(nextWeekend, 'fp3', driverId, { ...getSetupForPhase(nextWeekend, 'fp2', driverId) }),
      weekend,
    );
  }

  return weekend;
};
