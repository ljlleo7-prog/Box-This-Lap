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
  startDistance: number;
  endDistance: number;
  isPassZone: boolean;
  difficulty: number;
}

export interface Track {
  id: string;
  name: string;
  totalDistance: number;
  sectors: TrackSector[];
  pitLane: {
    entryDistance: number;
    exitDistance: number;
    speedLimit: number; // m/s
    stopTime: number; // seconds (base stop time)
  };
}

export type TyreCompound = 'soft' | 'medium' | 'hard' | 'wet';
export type PaceMode = 'conservative' | 'balanced' | 'aggressive';
export type ERSMode = 'harvest' | 'balanced' | 'deploy';
export type WeatherCondition = 'dry' | 'light-rain' | 'heavy-rain';
export type SafetyCarStatus = 'none' | 'vsc' | 'sc';
export type RaceStatus = 'pre-race' | 'racing' | 'finished';

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
  damage: number; // 0-100%
  stress: number; // 0-100%
  
  // Timing
  currentLapTime: number;
  lastLapTime: number;
  bestLapTime: number;
  gapToLeader: number;
  gapToAhead: number;
  position: number;
}

export interface RaceState {
  id: string;
  trackId: string;
  currentLap: number;
  totalLaps: number;
  weather: WeatherCondition;
  trackTemp: number;
  airTemp: number;
  rubberLevel: number; // 0-100%
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
