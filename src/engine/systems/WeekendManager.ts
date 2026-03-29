import { OfflineWeekend, WeekendPhase, SessionType, SessionSetupState } from '../../types';
import { TyreManager } from './TyreManager';

export class WeekendManager {
  private static readonly PHASE_ORDER: WeekendPhase[] = [
    'pre_weekend', 'fp1', 'fp2', 'fp3', 'q1', 'q2', 'q3', 'race', 'post_race'
  ];

  public static getNextPhase(currentPhase: WeekendPhase): WeekendPhase | null {
    const idx = this.PHASE_ORDER.indexOf(currentPhase);
    if (idx === -1 || idx === this.PHASE_ORDER.length - 1) return null;
    return this.PHASE_ORDER[idx + 1];
  }

  public static transitionToNextPhase(weekend: OfflineWeekend): OfflineWeekend {
    const nextPhase = this.getNextPhase(weekend.currentPhase);
    if (!nextPhase) return weekend;

    const updatedWeekend = { ...weekend, currentPhase: nextPhase };

    // Handle session-specific logic when transitioning FROM a session
    if (weekend.currentPhase !== 'pre_weekend' && weekend.currentPhase !== 'post_race') {
      const completedSession = weekend.currentPhase as SessionType;
      
      if (!updatedWeekend.completedSessions.includes(completedSession)) {
        updatedWeekend.completedSessions = [...updatedWeekend.completedSessions, completedSession];
      }

      // Apply Tyre Return Rules
      const newAllocations = { ...weekend.tyreAllocations };
      Object.keys(newAllocations).forEach(driverId => {
        newAllocations[driverId] = TyreManager.applySessionReturnRules(newAllocations[driverId], completedSession);
      });
      updatedWeekend.tyreAllocations = newAllocations;
    }

    // Handle Parc Ferme (Transitioning TO Q1)
    if (nextPhase === 'q1') {
      // Copy FP3 mechanical setups to Q1, Q2, Q3, and Race
      const drivers = Object.keys(weekend.fp3Setup || {});
      drivers.forEach(driverId => {
        const fp3 = weekend.fp3Setup[driverId];
        if (fp3) {
          const mechanical: Partial<SessionSetupState> = {
            frontWingAngle: fp3.frontWingAngle,
            rearWingAngle: fp3.rearWingAngle,
            rideHeight: fp3.rideHeight,
            suspensionStiffness: fp3.suspensionStiffness,
            toeOut: fp3.toeOut,
            camber: fp3.camber,
            gearboxSetting: fp3.gearboxSetting,
          };

          updatedWeekend.q1Setup = { ...updatedWeekend.q1Setup, [driverId]: { ...updatedWeekend.q1Setup?.[driverId], ...mechanical } };
          updatedWeekend.q2Setup = { ...updatedWeekend.q2Setup, [driverId]: { ...updatedWeekend.q2Setup?.[driverId], ...mechanical } };
          updatedWeekend.q3Setup = { ...updatedWeekend.q3Setup, [driverId]: { ...updatedWeekend.q3Setup?.[driverId], ...mechanical } };
          updatedWeekend.raceSetup = { ...updatedWeekend.raceSetup, [driverId]: { ...updatedWeekend.raceSetup?.[driverId], ...mechanical } };
        }
      });
    }

    return updatedWeekend;
  }
}
