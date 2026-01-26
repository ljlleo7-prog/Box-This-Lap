export interface Driver {
  id: string;
  name: string;
  team: string;
  color: string;
  basePace: number; // seconds per lap baseline (lower is better)
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
  };
  personality: {
    aggression: number; // 0-100
    stressResistance: number; // 0-100
    teamPlayer: number; // 0-100
  };
  morale: number; // 0-100
  trust: number; // 0-100
}

export interface TrackSector {
  id: string;
  name?: string; // e.g. "Copse", "Maggots"
  startDistance: number;
  endDistance: number;
  type: 'straight' | 'corner_high_speed' | 'corner_medium_speed' | 'corner_low_speed';
  difficulty: number;
}

export interface DRSZone {
    detectionDistance: number;
    activationDistance: number;
    endDistance: number;
}

export interface Track {
  id: string;
  name: string;
  totalDistance: number;
  totalLaps: number; // Default race laps
  tireDegradationFactor: number; // 1.0 = standard, >1.0 = abrasive
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
export type PaceMode = 'conservative' | 'balanced' | 'aggressive';
export type ERSMode = 'harvest' | 'balanced' | 'deploy';
export type WeatherCondition = 'dry' | 'light-rain' | 'heavy-rain';

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
}

export interface VehicleTelemetry {
    lastLapSpeedTrace: TelemetryDataPoint[];
    currentLapSpeedTrace: TelemetryDataPoint[];
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
  
  // Status
  tyreCompound: TyreCompound;
  tyreWear: number; // 0-100% (0 is new, 100 is dead)
  tyreAgeLaps: number;
  fuelLoad: number; // kg
  ersLevel: number; // 0-100%
  ersMode: ERSMode;
  paceMode: PaceMode;
  
  // Dynamic factors
  condition: number; // Day Form (0.98 - 1.02)
  damage: number; // 0-100%
  stress: number; // 0-100%
  drsOpen: boolean; // DRS Active status
  inDirtyAir: boolean; // Dirty Air status
  isBattling: boolean; // Wheel-to-wheel battling
  
  // Timing
  currentLapTime: number;
  lastLapTime: number;
  bestLapTime: number;
  gapToLeader: number;
  gapToAhead: number;
  position: number;

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
  trackWaterDepth: number; // Global average water depth (mm)
  safetyCar: SafetyCarStatus;
  vehicles: VehicleState[];
  status: RaceStatus;
  elapsedTime: number; // Total race time in seconds
}

export interface StrategyDecision {
  driverId: string;
  lap: number;
  type: 'pit' | 'pace' | 'ers' | 'defend';
  value: string | number;
}
