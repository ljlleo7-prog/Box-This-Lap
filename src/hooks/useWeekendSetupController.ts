import { useEffect, useMemo, useState } from 'react';
import { TCC_API } from '../lib/tcc-api';
import { useRaceStore } from '../store/raceStore';
import { useChampionshipStore } from '../store/championshipStore';
import type { OnlineWeekendGaragePlan, OnlineWeekendParcFermeState, PreRaceSetup, SessionSetupState, SessionType, StrategyStint, TyreCompound } from '../types';

export type WeekendSetupRecord = Record<string, PreRaceSetup & { tyreCompound: TyreCompound; fuelLoad: number; stints: StrategyStint[] }>;

const MECHANICAL_SETUP_KEYS = ['frontWingAngle', 'rearWingAngle', 'rideHeight', 'suspensionStiffness', 'toeOut', 'camber', 'gearboxSetting'] as const;

const isParcFermeSession = (sessionType: SessionType) => sessionType.startsWith('q') || sessionType === 'race';

const applyMechanicalLock = (
  setup: SessionSetupState,
  lockedMechanicalSetup?: SessionSetupState,
): SessionSetupState => {
  if (!lockedMechanicalSetup) return setup;
  const nextSetup = { ...setup };
  MECHANICAL_SETUP_KEYS.forEach((key) => {
    if (lockedMechanicalSetup[key] !== undefined) {
      nextSetup[key] = lockedMechanicalSetup[key];
    }
  });
  return nextSetup;
};

const getLockedMechanicalSetups = (
  plan: OnlineWeekendGaragePlan | null,
  sessionType: SessionType,
): Record<string, SessionSetupState> => {
  const parcFerme = plan?.parcFerme;
  if (!parcFerme?.isActive || !isParcFermeSession(sessionType)) return {};
  if (sessionType === 'race') {
    return parcFerme.lockedRaceSetupByDriver ?? parcFerme.referenceMechanicalSetupByDriver ?? {};
  }
  return parcFerme.referenceMechanicalSetupByDriver ?? {};
};

const normalizeParcFermeState = (parcFerme?: OnlineWeekendParcFermeState): OnlineWeekendParcFermeState | null => {
  if (!parcFerme) return null;
  return {
    isActive: parcFerme.isActive,
    lockedFromPhase: parcFerme.lockedFromPhase ?? null,
    activatedAt: parcFerme.activatedAt ?? null,
    referenceMechanicalSetupByDriver: parcFerme.referenceMechanicalSetupByDriver ?? {},
    lockedRaceSetupByDriver: parcFerme.lockedRaceSetupByDriver ?? {},
  };
};

const normalizeSetup = (setup: SessionSetupState | undefined, totalLaps: number): (PreRaceSetup & { tyreCompound: TyreCompound; fuelLoad: number; stints: StrategyStint[] }) => ({
  tyreCompound: setup?.tyreCompound ?? 'soft',
  fuelLoad: setup?.fuelLoad ?? 35,
  pitWindowStart: setup?.pitWindowStart,
  pitWindowEnd: setup?.pitWindowEnd,
  powerUnitPhilosophy: setup?.powerUnitPhilosophy ?? 'balanced',
  batteryAllocationMode: setup?.batteryAllocationMode ?? 'balanced',
  activeAeroMode: setup?.activeAeroMode ?? 'balanced',
  frontWingAngle: setup?.frontWingAngle,
  rearWingAngle: setup?.rearWingAngle,
  rideHeight: setup?.rideHeight,
  suspensionStiffness: setup?.suspensionStiffness,
  toeOut: setup?.toeOut,
  camber: setup?.camber,
  gearboxSetting: setup?.gearboxSetting,
  stints: setup?.tyreCompound
    ? [{ compound: setup.tyreCompound, startLap: 0, endLap: totalLaps }]
    : [{ compound: 'soft', startLap: 0, endLap: totalLaps }],
});

const getSetupsForPhase = (plan: OnlineWeekendGaragePlan | null, sessionType: SessionType): Record<string, SessionSetupState> => {
  if (!plan?.setupByPhase) return {};
  return plan.setupByPhase[sessionType] ?? {};
};

export const useWeekendSetupController = (weekendId?: string, sessionType: SessionType = 'race') => {
  const teamId = useChampionshipStore((state) => state.teamId);
  const raceState = useRaceStore((state) => state.raceState);
  const applySessionSetup = useRaceStore((state) => state.applySessionSetup);
  const [hydratedSetup, setHydratedSetup] = useState<WeekendSetupRecord>({});
  const [isHydratingSetup, setIsHydratingSetup] = useState(false);
  const [parcFermeState, setParcFermeState] = useState<OnlineWeekendParcFermeState | null>(null);

  const totalLaps = raceState?.totalLaps ?? 0;
  const mechanicalLocked = Boolean(parcFermeState?.isActive && isParcFermeSession(sessionType));

  useEffect(() => {
    if (!weekendId || !teamId || !totalLaps) return;

    let isActive = true;
    const hydrate = async () => {
      setIsHydratingSetup(true);
      try {
        const plan = await TCC_API.getWeekendPlanForSession(weekendId, teamId, sessionType);
        if (!isActive) return;
        const byDriver = getSetupsForPhase(plan, sessionType);
        const lockedMechanicalSetups = getLockedMechanicalSetups(plan, sessionType);
        const nextHydratedSetup = Object.fromEntries(
          Object.entries(byDriver).map(([driverId, setup]) => [
            driverId,
            normalizeSetup(applyMechanicalLock(setup, lockedMechanicalSetups[driverId]), totalLaps),
          ]),
        ) as WeekendSetupRecord;

        setHydratedSetup(nextHydratedSetup);
        setParcFermeState(normalizeParcFermeState(plan?.parcFerme));

        const enginePayload: Record<string, PreRaceSetup> = Object.fromEntries(
          Object.entries(nextHydratedSetup).map(([driverId, setup]) => [driverId, setup]),
        );

        if (Object.keys(enginePayload).length > 0) {
          applySessionSetup(enginePayload);
        }
      } catch (error) {
        console.error('Failed to hydrate weekend setup', error);
      } finally {
        if (isActive) setIsHydratingSetup(false);
      }
    };

    hydrate();
    return () => {
      isActive = false;
    };
  }, [weekendId, teamId, sessionType, totalLaps, applySessionSetup]);

  const saveSetup = useMemo(() => async (setups: WeekendSetupRecord) => {
    if (!weekendId || !teamId) return;

    const setupByPhase: OnlineWeekendGaragePlan['setupByPhase'] = {
      [sessionType]: Object.fromEntries(
        Object.entries(setups).map(([driverId, setup]) => [driverId, {
          tyreCompound: setup.tyreCompound,
          fuelLoad: setup.fuelLoad,
          pitWindowStart: setup.pitWindowStart,
          pitWindowEnd: setup.pitWindowEnd,
          powerUnitPhilosophy: setup.powerUnitPhilosophy,
          batteryAllocationMode: setup.batteryAllocationMode,
          activeAeroMode: setup.activeAeroMode,
          frontWingAngle: setup.frontWingAngle,
          rearWingAngle: setup.rearWingAngle,
          rideHeight: setup.rideHeight,
          suspensionStiffness: setup.suspensionStiffness,
          toeOut: setup.toeOut,
          camber: setup.camber,
          gearboxSetting: setup.gearboxSetting,
        }]),
      ),
    };

    const nextParcFerme = normalizeParcFermeState(parcFermeState ?? undefined);
    if (mechanicalLocked && nextParcFerme?.referenceMechanicalSetupByDriver) {
      Object.entries(setupByPhase[sessionType] ?? {}).forEach(([driverId, setup]) => {
        setupByPhase[sessionType]![driverId] = applyMechanicalLock(setup, nextParcFerme.referenceMechanicalSetupByDriver?.[driverId]);
      });
    }

    const selectedTyreSetByPhase: OnlineWeekendGaragePlan['selectedTyreSetByPhase'] = {
      [sessionType]: Object.fromEntries(
        Object.entries(setups).map(([driverId, setup]) => [driverId, setup.tyreCompound]),
      ),
    };

    const lastCommittedSetupByPhase: OnlineWeekendGaragePlan['lastCommittedSetupByPhase'] = {
      [sessionType]: Object.fromEntries(
        Object.entries(setupByPhase[sessionType] ?? {}).map(([driverId, setup]) => [driverId, setup]),
      ),
    };

    const response = await TCC_API.saveWeekendPlanForSession(weekendId, teamId, sessionType, {
      setupByPhase,
      selectedTyreSetByPhase,
      lastCommittedSetupByPhase,
      parcFerme: nextParcFerme ?? undefined,
    });

    const authoritativePlan = response.preset;
    const lockedMechanicalSetups = getLockedMechanicalSetups(authoritativePlan, sessionType);
    const authoritativeSetup = Object.fromEntries(
      Object.entries(getSetupsForPhase(authoritativePlan, sessionType)).map(([driverId, setup]) => [
        driverId,
        normalizeSetup(applyMechanicalLock(setup, lockedMechanicalSetups[driverId]), totalLaps),
      ]),
    ) as WeekendSetupRecord;

    setParcFermeState(normalizeParcFermeState(authoritativePlan.parcFerme));
    setHydratedSetup(authoritativeSetup);
  }, [weekendId, teamId, sessionType, parcFermeState, mechanicalLocked, totalLaps]);

  return {
    hydratedSetup,
    isHydratingSetup,
    saveSetup,
    parcFermeState,
    mechanicalLocked,
  };
};
