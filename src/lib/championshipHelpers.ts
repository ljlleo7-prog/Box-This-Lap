import type { OfflineChampionship, OfflineTeamState, ChampionshipStandingEntry, Track, Driver, TeamSpecs, ResearchDepartmentState, PartDesign, ManufacturingOrder } from '../types';
import { TRACKS } from '../data/tracks';
import { DRIVERS } from '../data/initialData';
import { TEAM_TEMPLATES } from '../data/teams';
import { createEmptyResearchState } from './researchDevelopment';

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
    drivers: playerDrivers.map((d) => ({
      driverId: d.id,
      morale: 75,
      trust: 70,
      readiness: 80,
      confidence: 75,
      setupKnowledge: 50,
      fatigue: 0,
    })),
    crew: [
      { department: 'race_engineering', level: 1, workload: 50, efficiency: 75, morale: 75 },
      { department: 'strategy', level: 1, workload: 50, efficiency: 75, morale: 75 },
      { department: 'aero', level: 1, workload: 50, efficiency: 75, morale: 75 },
      { department: 'power_unit', level: 1, workload: 50, efficiency: 75, morale: 75 },
      { department: 'pit_crew', level: 1, workload: 50, efficiency: 75, morale: 75 },
      { department: 'operations', level: 1, workload: 50, efficiency: 75, morale: 75 },
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
    if (!team.researchDepartment) return team;

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
