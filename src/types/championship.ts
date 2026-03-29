import type {
  Driver,
  TeamSpecs,
  Track,
  TyreCompound,
  PowerUnitPhilosophy,
  BatteryAllocationMode,
  ActiveAeroMode,
} from './index';

export type WeekendPhase = 'pre_weekend' | 'fp1' | 'fp2' | 'fp3' | 'q1' | 'q2' | 'q3' | 'race' | 'post_race';

export type SessionType = 'fp1' | 'fp2' | 'fp3' | 'q1' | 'q2' | 'q3' | 'race';

export type DevelopmentCategory =
  | 'aero'
  | 'power_unit'
  | 'battery'
  | 'chassis'
  | 'cooling'
  | 'pit_crew'
  | 'simulator';

export type PartCategory =
  | 'front-wing'
  | 'floor'
  | 'rear-wing'
  | 'suspension'
  | 'power-unit'
  | 'cooling'
  | 'energy-store';

export type DevelopmentStatus = 'queued' | 'active' | 'completed' | 'cancelled';
export type DesignStatus = 'in_design' | 'ready_for_manufacturing' | 'in_production' | 'available';
export type ManufacturingStatus = 'queued' | 'building' | 'completed' | 'cancelled';
export type ManufacturingMode = 'normal' | 'intense' | 'urgent';

export type CarId = 'car-1' | 'car-2';

export type CrewDepartment =
  | 'race_engineering'
  | 'strategy'
  | 'aero'
  | 'power_unit'
  | 'pit_crew'
  | 'operations';

export interface OfflineDriverState {
  driverId: string;
  morale: number;
  trust: number;
  readiness: number;
  confidence: number;
  setupKnowledge: number;
  fatigue: number;
  trainingFocus?: 'pace' | 'consistency' | 'tyre_management' | 'wet_weather' | 'racecraft';
}

export interface CrewState {
  department: CrewDepartment;
  level: number;
  workload: number;
  efficiency: number;
  morale: number;
  assignedDriverIds?: string[];
}

export interface FacilityState {
  factory: number;
  aero: number;
  powertrain: number;
  simulator: number;
  pitCrew: number;
  logistics: number;
}

export interface DevelopmentProject {
  id: string;
  name: string;
  category: DevelopmentCategory;
  description?: string;
  status: DevelopmentStatus;
  progress: number;
  startedRound?: number;
  completesRound?: number;
  effects: Partial<TeamSpecs>;
}

export interface DesignBiasAllocation {
  focusId: string;
  weight: number;
}

export interface AeroResourceAllocation {
  windTunnelHours: number;
  cfdHours: number;
}

export interface DevelopmentInvestment {
  money: number;
}

export interface AtrPeriodState {
  periodLabel: string;
  constructorStanding: number;
  windTunnelHoursCap: number;
  cfdHoursCap: number;
  windTunnelHoursUsed: number;
  cfdHoursUsed: number;
}

export interface PartDesign {
  id: string;
  partCategory: PartCategory;
  code: string;
  displayName: string;
  customName?: string;
  status: DesignStatus;
  biasAllocations: DesignBiasAllocation[];
  projectedEffects: Partial<TeamSpecs>;
  actualEffects: Partial<TeamSpecs>;
  investment: DevelopmentInvestment;
  aero: AeroResourceAllocation;
  startedRound?: number;
  completesRound?: number;
  startedAt: string;
  completedAt?: string;
  projectedDurationWeeks: number;
  stock: number;
}

export interface ManufacturingOrder {
  id: string;
  designId: string;
  quantity: number;
  mode: ManufacturingMode;
  targetCars: CarId[];
  status: ManufacturingStatus;
  cost: number;
  durationDays: number;
  startedAt: string;
  completesAt?: string;
}

export interface CarPartAssignment {
  carId: CarId;
  installedDesignByPart: Partial<Record<PartCategory, string>>;
}

export interface ResearchDepartmentState {
  atr: AtrPeriodState;
  activeDesignProjects: PartDesign[];
  completedDesigns: PartDesign[];
  manufacturingQueue: ManufacturingOrder[];
  carAssignments: CarPartAssignment[];
}

export interface OfflineTeamState {
  teamId: string;
  teamName: string;
  color: string;
  specs: TeamSpecs;
  drivers: OfflineDriverState[];
  crew: CrewState[];
  facilities: FacilityState;
  developmentQueue: DevelopmentProject[];
  activeProjects: DevelopmentProject[];
  completedProjects: DevelopmentProject[];
  researchDepartment?: ResearchDepartmentState;
}

export interface SessionSetupState {
  tyreCompound?: TyreCompound;
  selectedTyreSetId?: string;
  fuelLoad?: number;
  pitWindowStart?: number;
  pitWindowEnd?: number;
  powerUnitPhilosophy?: PowerUnitPhilosophy;
  batteryAllocationMode?: BatteryAllocationMode;
  activeAeroMode?: ActiveAeroMode;
  
  // Advanced Setup Parameters (0-100)
  frontWingAngle?: number;
  rearWingAngle?: number;
  rideHeight?: number;
  suspensionStiffness?: number;
  toeOut?: number;
  camber?: number;
  gearboxSetting?: number; // 0 = Top Speed, 100 = Acceleration
  
  notes?: string;
}

export type SetupTuningParameter =
  | 'frontWingAngle'
  | 'rearWingAngle'
  | 'rideHeight'
  | 'suspensionStiffness'
  | 'toeOut'
  | 'camber'
  | 'gearboxSetting';

export interface TyreSet {
  id: string;
  compound: TyreCompound;
  wear: number;
  returned: boolean;
}

export interface SetupFeedback {
  optimalRange: [number, number];
  currentValue: number;
  status: 'poor' | 'okay' | 'good' | 'optimal' | 'unknown';
}

export interface SessionSummary {
  sessionType: SessionType;
  completed: boolean;
  classification: Array<{
    driverId: string;
    position: number;
    timeOrGap?: number | string;
  }>;
  notes: string[];
  incidents?: string[];
  weather?: string;
}

export interface OfflineWeekend {
  id: string;
  round: number;
  trackId: Track['id'];
  currentPhase: WeekendPhase;
  completedSessions: SessionType[];
  selectedTeamId: string;
  
  // Phase Setups
  fp1Setup: Record<string, SessionSetupState>;
  fp2Setup: Record<string, SessionSetupState>;
  fp3Setup: Record<string, SessionSetupState>;
  q1Setup: Record<string, SessionSetupState>;
  q2Setup: Record<string, SessionSetupState>;
  q3Setup: Record<string, SessionSetupState>;
  raceSetup: Record<string, SessionSetupState>;
  
  // Advanced State
  tyreAllocations: Record<string, TyreSet[]>;
  setupKnowledge: Record<string, Partial<Record<SetupTuningParameter, SetupFeedback>>>;
  
  sessionSummaries: Partial<Record<SessionType, SessionSummary>>;
  grid?: string[];
  raceResultDriverIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChampionshipStandingEntry {
  entityId: string;
  name: string;
  points: number;
  wins: number;
  podiums: number;
}

export interface OfflineChampionship {
  id: string;
  name: string;
  season: number;
  currentRound: number;
  trackOrder: Track['id'][];
  weekends: OfflineWeekend[];
  teams: OfflineTeamState[];
  selectedTeamId: string;
  driverStandings: ChampionshipStandingEntry[];
  constructorStandings: ChampionshipStandingEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveGame {
  version: number;
  championship: OfflineChampionship | null;
  activeWeekendId: string | null;
  lastOpenedAt: string;
}

export interface OfflineGameSeedData {
  championshipName: string;
  season: number;
  tracks: Track[];
  drivers: Driver[];
  teams: Array<{
    id: string;
    name: string;
    color: string;
    specs: TeamSpecs;
    driverIds: string[];
  }>;
}
