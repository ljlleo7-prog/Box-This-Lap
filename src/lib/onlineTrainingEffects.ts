import { DRIVERS } from '../data/initialData';
import { TCC_API } from './tcc-api';
import { createEmptySchedule, getWearyState, processDriverSchedule } from './driverDevelopment';
import { processPitCrewSchedule } from './crewDevelopment';
import type { CrewState, DaySchedule, OfflineDriverState } from '../types/championship';

export const resolveStaticDriversForTeam = (teamName: string | null | undefined, onlineDrivers?: Array<{ name?: string | null }> | null) => {
  const staticTeamDrivers = DRIVERS.filter((driver) => driver.team === teamName).slice(0, 2);
  if (!onlineDrivers?.length) return staticTeamDrivers;

  const unmatchedDrivers = [...staticTeamDrivers];
  return onlineDrivers.slice(0, 2).reduce<typeof staticTeamDrivers>((acc, onlineDriver) => {
    const matchIndex = unmatchedDrivers.findIndex((driver) => driver.name === onlineDriver?.name);
    const matchedDriver = matchIndex >= 0 ? unmatchedDrivers.splice(matchIndex, 1)[0] : unmatchedDrivers.shift();
    if (matchedDriver) acc.push(matchedDriver);
    return acc;
  }, []);
};

export const resolveStaticDriverIdsForTeam = (teamName: string | null | undefined, onlineDrivers?: Array<{ name?: string | null }> | null) => (
  resolveStaticDriversForTeam(teamName, onlineDrivers).map((driver) => driver.id)
);

export type OnlineTrainingDriverEffects = {
  strength: number;
  fatigue: number;
  wearyState: OfflineDriverState['wearyState'];
  morale: number;
  concentration: number;
};

export type OnlineTrainingPitCrewEffects = {
  pitStopErrorRate: number;
  pitStopSpeedBonus: number;
};

const ONLINE_RACE_DAYS = [12, 13, 14];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getOnlineRound = (weekends: any[] | null | undefined): number => {
  if (!weekends || weekends.length === 0) return 1;
  const upcomingWeekend = weekends.find((weekend) => !['completed', 'race_complete', 'cancelled'].includes(weekend.status));
  if (upcomingWeekend?.round_number) return upcomingWeekend.round_number;
  return weekends[weekends.length - 1]?.round_number ? weekends[weekends.length - 1].round_number + 1 : 1;
};

const buildBaseDriverState = (driver: any): OfflineDriverState => ({
  driverId: driver.id,
  morale: Math.round(driver.morale ?? 75),
  trust: 70,
  readiness: 80,
  confidence: 75,
  setupKnowledge: 50,
  fatigue: 0,
  xp: 0,
  level: 1,
  strength: 75,
  wearyState: 'fresh',
  trainingSchedule: createEmptySchedule(ONLINE_RACE_DAYS),
});

const buildBasePitCrewState = (): CrewState => ({
  department: 'pit_crew',
  level: 1,
  workload: 50,
  efficiency: 75,
  morale: 75,
  xp: 0,
  errorRate: 50,
  speedBonus: 0,
  trainingSchedule: createEmptySchedule(ONLINE_RACE_DAYS),
});

const cloneSchedule = (schedule: DaySchedule[] | null | undefined) =>
  Array.isArray(schedule) && schedule.length > 0
    ? schedule.map((day) => ({ ...day }))
    : createEmptySchedule(ONLINE_RACE_DAYS);

const buildDriverRuntimeProfile = (driver: any, schedule: DaySchedule[]) => {
  const baseState = buildBaseDriverState(driver);
  const results = processDriverSchedule(baseState, schedule);
  const fatigue = clamp(baseState.fatigue + results.fatigueChange, 0, 100);
  const wearyState = getWearyState(fatigue);
  const morale = clamp((driver.morale ?? 80) - fatigue * 0.15, 35, 100);
  const concentration = clamp(100 - fatigue * 0.6, 40, 100);

  return {
    strength: clamp(results.finalStrength, 40, 100),
    fatigue,
    wearyState,
    morale,
    concentration,
  };
};

export type OnlineTrainingEffects = {
  roundNumber: number;
  driverOverrides: Record<string, OnlineTrainingDriverEffects>;
  pitCrew: OnlineTrainingPitCrewEffects | null;
};

export const getOnlineTrainingEffects = async (
  championshipId: string,
  teamId: string,
  teamName: string
): Promise<OnlineTrainingEffects> => {
  const [{ data: myTeam }, { data: weekends }] = await Promise.all([
    TCC_API.getMyTeam(championshipId),
    TCC_API.getChampionshipWeekends(championshipId),
  ]);

  const roundNumber = getOnlineRound(weekends);
  const { data: plans } = await TCC_API.getTeamTrainingPlans(championshipId, teamId, roundNumber);
  const activePlans = plans ?? [];
  const onlineDrivers = (myTeam?.tcc_drivers ?? []).slice(0, 2);
  const staticTeamDrivers = resolveStaticDriversForTeam(teamName, onlineDrivers);

  const driverOverrides = onlineDrivers.reduce((acc: Record<string, OnlineTrainingDriverEffects>, onlineDriver: any, index: number) => {
    const matchedStaticDriver = staticTeamDrivers[index];
    if (!matchedStaticDriver) return acc;

    const schedule = cloneSchedule(
      activePlans.find((plan: any) => plan.subject_type === 'driver' && plan.subject_id === onlineDriver.id)?.schedule
    );

    acc[matchedStaticDriver.id] = buildDriverRuntimeProfile(onlineDriver, schedule);
    return acc;
  }, {});

  const pitCrewSchedule = cloneSchedule(
    activePlans.find((plan: any) => plan.subject_type === 'pit_crew' && plan.subject_id === 'pit_crew')?.schedule
  );
  const pitCrewResults = processPitCrewSchedule(buildBasePitCrewState(), pitCrewSchedule);

  return {
    roundNumber,
    driverOverrides,
    pitCrew: {
      pitStopErrorRate: clamp(50 + pitCrewResults.errorRateChange, 5, 100),
      pitStopSpeedBonus: Math.max(0, pitCrewResults.speedBonusChange),
    },
  };
};
