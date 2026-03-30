export interface Driver {
  id: string;
  name: string;
  team: string;
  color: string;
  basePace: number; // seconds per lap baseline (lower is better)
  learning: number;
  skill: {
    racecraft: number; // 0-100
    consistency: number; // 0-100
    tyreManagement: number; // 0-100
    wetWeather: number; // 0-100
  };
  performance: {
    corneringHigh: number; // 0-100
    corneringMedium: number; // 0-100
    corneringLow: number; // 0-100
    straight: number; // 0-100
    temperatureAdaptability: number; // 0-100: How well car handles temp deviations
  };
  personality: {
    aggression: number; // 0-100
    stressResistance: number; // 0-100
    teamPlayer: number; // 0-100
  };
  morale: number; // 0-100
  trust: number; // 0-100
  xp?: number;
  level?: number; // 1-10
  strength?: number; // 0-100, affects skill multipliers
  skillCaps?: {
    racecraft: number;
    consistency: number;
    tyreManagement: number;
    wetWeather: number;
  };
}

export interface TrackSector {
  id: string;
  name?: string; // e.g. "Copse", "Maggots"
  startDistance: number;
  endDistance: number;
  type: 'straight' | 'corner_low_speed' | 'corner_medium_speed' | 'corner_high_speed';
  difficulty?: number;
  maxSpeed?: number; // Optional override for corner speed limit (m/s)
  targetSpeed?: number;
  startSpeed?: number;
  endSpeed?: number;
}

export interface DRSZone {
    detectionDistance: number;
    activationDistance: number;
    endDistance: number;
}

export interface TrackTelemetryCoverage {
  coveredDistance: number;
  coveredRatio: number;
  hasFullDistance: boolean;
  sectorCount: number;
}

export type TrackProfilePhase = 'entry' | 'apex' | 'exit' | 'straight';

export interface TrackProfileSample {
  distance: number;
  speed: number;
  sectorIndex: number;
  sectorId: string;
  phase: TrackProfilePhase;
}

export interface TrackProfile {
  sampleSpacing: number;
  totalDistance: number;
  samples: TrackProfileSample[];
}

export interface TrackProfileLookahead {
  sample: TrackProfileSample;
  distanceAhead: number;
}

export interface VehicleExecutionOffset {
  sectorId: string;
  lap: number;
  brakeShiftMeters: number;
  apexSpeedFactor: number;
  exitSpeedFactor: number;
  straightSpeedFactor: number;
  tractionFactor: number;
  ersCommitmentFactor: number;
}

export interface VehicleExecutionState {
  lap: number;
  sectorOffsets: Record<string, VehicleExecutionOffset>;
  lastSectorId?: string;
  lastSafetyCarStatus?: SafetyCarStatus;
  wasInPit?: boolean;
  physicalAheadId?: string; // ID of the car physically in front on track
  physicalGap?: number; // Distance in meters to the car physically ahead
  overtakingImmunity?: number; // Seconds remaining where this car ignores 'battling' slowdowns to complete a pass
}

export interface ERSTacticalState {
  intent: 'neutral' | 'attack' | 'defend' | 'recharge' | 'push' | 'release';
  reasons: string[];
  deployBias: number;
  harvestBias: number;
}

export interface TrackTelemetryMetadata {
  source: 'openf1-calculated' | 'openf1-runtime-fallback' | 'default-track';
  generatedAt?: string;
  curveKey?: string;
  lapCount?: number;
  avgLapTime?: number | null;
  avgSpeedKph?: number | null;
  avgMaxSpeedKph?: number | null;
  sessionTypes?: string[];
  hotlapOnly?: boolean;
  coverage?: TrackTelemetryCoverage;
}

export interface Track {
  id: string;
  name: string;
  totalDistance: number;
  totalLaps: number; // Default race laps
  tireDegradationFactor: number; // 1.0 = standard, >1.0 = abrasive
  overtakingDifficulty: number; // 0-1 (0 = easy, 1 = impossible)
  trackDifficulty: number; // 0-1 (0 = easy, 1 = hard/punishing)
  baseTemperature: number; // Celsius (Average ambient)
  location?: {
      lat: number;
      long: number;
  };
  weatherParams?: {
      volatility: number; // 0-1: How fast weather changes (0 = constant, 1 = chaotic)
      rainProbability: number; // 0-1: Base probability of rain
  };
  weatherChance: { // Probability of rain (Legacy/Simple)
      rainChance: number; // 0-1
      rainIntensity: 'light' | 'heavy' | 'mixed';
  };
  telemetry?: TrackTelemetryMetadata;
  telemetryPoints?: Array<{ dist: number; speed: number }>;
  sectors: TrackSector[];
  drsZones: DRSZone[]; // Added DRS Zones
  pitLane: {
    entryDistance: number;
    exitDistance: number;
    speedLimit: number; // m/s
    stopTime: number; // seconds (base stop time)
  };
}

export type TyreCompound = 'soft' | 'medium' | 'hard' | 'intermediate' | 'wet';
export type DryTyreCompound = 'soft' | 'medium' | 'hard';
export type PaceMode = 'conservative' | 'balanced' | 'aggressive';
export type ERSMode = 'harvest' | 'balanced' | 'deploy';
export type RacingLineMode = 'defend' | 'balanced' | 'attack';
export type WeatherCondition = 'dry' | 'light-rain' | 'heavy-rain';
export type PowerUnitPhilosophy = 'top_speed' | 'balanced' | 'corner_focus';
export type BatteryAllocationMode = 'conservative' | 'balanced' | 'attack';
export type ActiveAeroMode = 'low_drag' | 'balanced' | 'high_downforce';

export interface WeatherForecastItem {
  timeOffset: number; // Seconds from now
  cloudCover: number;
  rainIntensity: number;
}

export type SafetyCarStatus = 'none' | 'vsc' | 'sc' | 'red-flag';
export type RaceStatus = 'pre-race' | 'racing' | 'finished';

export interface SectorCondition {
    sectorId: string;
    waterDepth: number; // mm
    rubberLevel: number; // 0-100%
}

export interface TelemetryDataPoint {
    distance: number;
    speed: number;
    sampleTime?: number;
    sectorId?: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  budget: number;
  reputation: number;
  token_cost: number;
  performance: {
    car: number;
    industry: number;
    drivers: number;
  };
  specs?: {
    acceleration: number;
    braking: number;
    drag_reduction: number;
    cornering_low: number;
    cornering_mid: number;
    cornering_high: number;
    ers_efficiency: number;
    cooling: number;
    lifespan: number;
    drs_efficiency: number;
    pitStopErrorRate?: number;
    pitStopSpeedBonus?: number;
  };
  drivers?: Driver[];
  championship_id: string;
  owner_id?: string;
}

export type TeamSpecs = NonNullable<Team['specs']>;

export interface VehicleTelemetry {
    lastLapSpeedTrace: TelemetryDataPoint[];
    currentLapSpeedTrace: TelemetryDataPoint[];
    sampleInterval: number;
    nextSampleDistance: number;
}

export interface StrategyStint {
    compound: TyreCompound;
    startLap: number;
    endLap: number; // Target end lap
    paceMode?: PaceMode;
}

export interface StrategyPlan {
    stints: StrategyStint[];
    currentStintIndex: number;
}

export interface PreRaceSetup {
  tyreCompound?: TyreCompound;
  fuelLoad?: number;
  pitWindowStart?: number;
  pitWindowEnd?: number;
  stints?: StrategyStint[];
  powerUnitPhilosophy?: PowerUnitPhilosophy;
  batteryAllocationMode?: BatteryAllocationMode;
  activeAeroMode?: ActiveAeroMode;
  frontWingAngle?: number;
  rearWingAngle?: number;
  rideHeight?: number;
  suspensionStiffness?: number;
  toeOut?: number;
  camber?: number;
  gearboxSetting?: number;
}

export interface VehicleState {
  id: string; // matches driverId
  driverId: string;
  distanceOnLap: number; // meters
  totalDistance: number; // meters
  speed: number; // m/s
  acceleration: number; // m/s^2
  lapCount: number;
  currentSector: number;
  isInPit: boolean;
  pitStopCount: number;
  boxThisLap: boolean; // Driver intends to pit this lap
  
  // Status
  tyreCompound: TyreCompound;
  tyreWear: number; // 0-100% (0 is new, 100 is dead)
  tyreAgeLaps: number;
  tyreTemp: number;
  fuelLoad: number; // kg
  ersLevel: number; // 0-100%
  ersRecoveredThisLap: number;
  ersMode: ERSMode;
  paceMode: PaceMode;
  lineMode: RacingLineMode;
  powerUnitPhilosophy: PowerUnitPhilosophy;
  batteryAllocationMode: BatteryAllocationMode;
  activeAeroMode: ActiveAeroMode;
  // Advanced Setup
  frontWingAngle: number;
  rearWingAngle: number;
  rideHeight: number;
  suspensionStiffness: number;
  toeOut: number;
  camber: number;
  gearboxSetting: number;

  usedDryCompounds: DryTyreCompound[];
  mandatoryDryCompoundsSatisfied: boolean;

  // Dynamic factors
  condition: number; // Day Form (0.98 - 1.02)
  executionState: VehicleExecutionState;
  damage: number; // 0-100%
  stress: number; // 0-100%
  morale: number; // 0-100 (Dynamic confidence)
  concentration: number; // 0-100 (Focus level)
  drsOpen: boolean; // DRS Active status
  inDirtyAir: boolean; // Dirty Air status
  isBattling: boolean; // Wheel-to-wheel battling
  blueFlag: boolean; // Being lapped warning
  ersTacticalState: ERSTacticalState;

  // Timing
  currentLapTime: number;
  lastLapTime: number;
  bestLapTime: number;
  gapToLeader: number;
  gapToAhead: number;
  position: number;
  lastPosition: number; // Added to track position changes
  hasFinished: boolean; // Flag to indicate if the driver has crossed the line after checkered flag

  // Strategy
  strategyPlan: StrategyPlan;
  pitWindowStart?: number;
  pitWindowEnd?: number;

  // Telemetry
  telemetry: VehicleTelemetry;
}

export interface RaceState {
  id: string;
  trackId: string;
  currentLap: number;
  totalLaps: number;
  weather: WeatherCondition;
  weatherMode: 'simulation' | 'real'; // Toggle
  weatherForecast: WeatherForecastItem[]; // New: Forecast queue
  cloudCover: number; // 0-100%
  rainIntensityLevel: number; // 0-100
  windSpeed: number; // km/h
  windDirection: number; // degrees
  trackTemp: number;
  airTemp: number;
  rubberLevel: number; // 0-100%
  sectorConditions: SectorCondition[];
  sectorFlags: number[]; // Indices of sectors under yellow flag
  trackWaterDepth: number; // Global average water depth (mm)
  safetyCar: SafetyCarStatus;
  vehicles: VehicleState[];
  status: RaceStatus;
  checkeredFlag: boolean; // Flag to indicate if the leader has finished
  winnerId: string | null; // ID of the winner
  elapsedTime: number; // Total race time in seconds
}

export interface StrategyDecision {
  driverId: string;
  lap: number;
  type: 'pit' | 'pace' | 'ers' | 'defend';
  value: string | number;
}

export * from './championship';
