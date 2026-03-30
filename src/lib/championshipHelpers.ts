import type { OfflineChampionship, OfflineTeamState, ChampionshipStandingEntry, Track, Driver, TeamSpecs, ResearchDepartmentState, PartDesign, ManufacturingOrder } from '../types';
import { TRACKS } from '../data/tracks';
import { DRIVERS } from '../data/initialData';
import { TEAM_TEMPLATES } from '../data/teams';
import { createEmptyResearchState } from './researchDevelopment';
import { getWearyState, getTotalXPForLevel, createEmptySchedule, processDriverSchedule } from './driverDevelopment';
import { getTotalXPForLevel as getCrewTotalXP, processPitCrewSchedule } from './crewDevelopment';

export const createLocalChampionship = (
  playerTeamName: string,
  playerDriverIds: [string, string],
  season: number = 2025
): OfflineChampionship => {
  const championshipId = `local-${Date.now()}`;

  // Select 10 tracks for the season
  const selectedTracks = [
    'bahrain', 'jeddah', 'melbourne', 'suzuka', 'china',
    'miami', 'imola', 'monaco', 'montreal', 'catalunya',
    'spielberg', 'silverstone', 'hungaroring', 'spa', 'zandvoort',
    'monza', 'baku', 'singapore', 'austin', 'mexico-city',
    'interlagos', 'las-vegas', 'qatar', 'abu-dhabi'
  ];

  const playerTeamTemplate = TEAM_TEMPLATES.find((t) => t.name === playerTeamName);
  if (!playerTeamTemplate) throw new Error(`Team ${playerTeamName} not found`);

  const playerDrivers = playerDriverIds.map((id) => {
    const driver = DRIVERS.find((d) => d.id === id);
    if (!driver) throw new Error(`Driver ${id} not found`);
    return driver;
  });

  // Create player team state
  const playerTeam: OfflineTeamState = {
    teamId: championshipId + '-player',
    teamName: playerTeamName,
    color: playerTeamTemplate.color,
    specs: { ...playerTeamTemplate.specs },
    drivers: playerDrivers.map((d) => {
      // Calculate initial strength based on driver skills (racecraft + consistency)
      const baseStrength = ((d.skill.racecraft + d.skill.consistency) / 2) * 0.9;

      return {
        driverId: d.id,
        morale: 75,
        trust: 70,
        readiness: 80,
        confidence: 75,
        setupKnowledge: 50,
        fatigue: 0,
        xp: 0,
        level: 1,
        strength: Math.round(baseStrength),
        wearyState: 'fresh' as const,
        trainingSchedule: createEmptySchedule([12, 13, 14]), // Race on days 12-14
      };
    }),
    crew: [
      { department: 'race_engineering', level: 1, workload: 50, efficiency: 75, morale: 75, xp: 0 },
      { department: 'strategy', level: 1, workload: 50, efficiency: 75, morale: 75, xp: 0 },
      { department: 'aero', level: 1, workload: 50, efficiency: 75, morale: 75, xp: 0 },
      { department: 'power_unit', level: 1, workload: 50, efficiency: 75, morale: 75, xp: 0 },
      {
        department: 'pit_crew',
        level: 1,
        workload: 50,
        efficiency: 75,
        morale: 75,
        xp: 0,
        // Calculate error rate based on team performance (higher performance = lower error rate)
        errorRate: Math.round(100 - (playerTeamTemplate.performance.industry * 0.8)),
        speedBonus: 0,
        trainingSchedule: createEmptySchedule([12, 13, 14])
      },
      { department: 'operations', level: 1, workload: 50, efficiency: 75, morale: 75, xp: 0 },
    ],
    facilities: {
      factory: 1,
      aero: 1,
      powertrain: 1,
      simulator: 1,
      pitCrew: 1,
      logistics: 1,
    },
    developmentQueue: [],
    activeProjects: [],
    completedProjects: [],
    researchDepartment: createEmptyResearchState(5),
  };

  // Initialize standings
  const driverStandings: ChampionshipStandingEntry[] = playerDrivers.map((d) => ({
    entityId: d.id,
    name: d.name,
    points: 0,
    wins: 0,
    podiums: 0,
  }));

  const constructorStandings: ChampionshipStandingEntry[] = [{
    entityId: playerTeam.teamId,
    name: playerTeamName,
    points: 0,
    wins: 0,
    podiums: 0,
  }];

  return {
    id: championshipId,
    name: `${season} Season - ${playerTeamName}`,
    season,
    currentRound: 1,
    trackOrder: selectedTracks,
    weekends: [],
    teams: [playerTeam],
    selectedTeamId: playerTeam.teamId,
    driverStandings,
    constructorStandings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

// Process R&D time progression when advancing rounds
export const advanceChampionshipRound = (championship: OfflineChampionship): OfflineChampionship => {
  const daysPerRound = 14; // 2 weeks between races

  const updatedTeams = championship.teams.map((team) => {
    // Process driver schedules
    const updatedDrivers = team.drivers.map((driver) => {
      // Process training schedule
      const scheduleResults = processDriverSchedule(driver, driver.trainingSchedule);

      // Update driver state
      const newFatigue = Math.max(0, Math.min(100, driver.fatigue + scheduleResults.fatigueChange));
      const newXP = driver.xp + scheduleResults.xpGain;
      const newStrength = scheduleResults.finalStrength;

      // Check for level up
      let newLevel = driver.level;
      while (newXP >= getTotalXPForLevel(newLevel + 1) && newLevel < 10) {
        newLevel++;
      }

      return {
        ...driver,
        xp: newXP,
        level: newLevel,
        strength: newStrength,
        fatigue: newFatigue,
        wearyState: getWearyState(newFatigue),
        trainingSchedule: createEmptySchedule([12, 13, 14]), // Reset for next round
      };
    });

    // Process crew schedules (only pit crew)
    const updatedCrew = team.crew.map((crew) => {
      if (crew.department === 'pit_crew' && crew.trainingSchedule) {
        const scheduleResults = processPitCrewSchedule(crew, crew.trainingSchedule);

        const newErrorRate = Math.max(0, Math.min(100, (crew.errorRate ?? 50) + scheduleResults.errorRateChange));
        const newSpeedBonus = (crew.speedBonus ?? 0) + scheduleResults.speedBonusChange;
        const newXP = crew.xp + scheduleResults.xpGain;

        // Check for level up
        let newLevel = crew.level;
        while (newXP >= getCrewTotalXP(newLevel + 1) && newLevel < 10) {
          newLevel++;
        }

        return {
          ...crew,
          xp: newXP,
          level: newLevel,
          errorRate: newErrorRate,
          speedBonus: newSpeedBonus,
          trainingSchedule: createEmptySchedule([12, 13, 14]), // Reset for next round
        };
      }

      // Other crew don't train, just check for level up
      let newLevel = crew.level;
      while (crew.xp >= getCrewTotalXP(newLevel + 1) && newLevel < 10) {
        newLevel++;
      }

      return {
        ...crew,
        level: newLevel,
      };
    });

    // Process R&D
    if (!team.researchDepartment) {
      return {
        ...team,
        drivers: updatedDrivers,
        crew: updatedCrew,
      };
    }

    const rd = team.researchDepartment;

    // Process active design projects
    const updatedActiveProjects: PartDesign[] = [];
    const newlyCompletedDesigns: PartDesign[] = [];

    rd.activeDesignProjects.forEach((design) => {
      const weeksElapsed = daysPerRound / 7;
      if (weeksElapsed >= design.projectedDurationWeeks) {
        // Project completed
        newlyCompletedDesigns.push({
          ...design,
          status: 'ready_for_manufacturing',
          completedAt: new Date().toISOString(),
          stock: 1, // Start with 1 prototype
        });
      } else {
        updatedActiveProjects.push(design);
      }
    });

    // Process manufacturing queue
    const updatedManufacturingQueue: ManufacturingOrder[] = [];
    const completedManufacturing: ManufacturingOrder[] = [];

    rd.manufacturingQueue.forEach((order) => {
      if (daysPerRound >= order.durationDays) {
        completedManufacturing.push(order);
      } else {
        updatedManufacturingQueue.push({
          ...order,
          durationDays: order.durationDays - daysPerRound,
        });
      }
    });

    // Add stock from completed manufacturing
    const updatedCompletedDesigns = [...rd.completedDesigns, ...newlyCompletedDesigns].map((design) => {
      const completedOrders = completedManufacturing.filter((o) => o.designId === design.id);
      const additionalStock = completedOrders.reduce((sum, o) => sum + o.quantity, 0);
      return {
        ...design,
        stock: design.stock + additionalStock,
      };
    });

    return {
      ...team,
      drivers: updatedDrivers,
      crew: updatedCrew,
      researchDepartment: {
        ...rd,
        activeDesignProjects: updatedActiveProjects,
        completedDesigns: updatedCompletedDesigns,
        manufacturingQueue: updatedManufacturingQueue,
      },
    };
  });

  return {
    ...championship,
    currentRound: championship.currentRound + 1,
    teams: updatedTeams,
    updatedAt: new Date().toISOString(),
  };
};
