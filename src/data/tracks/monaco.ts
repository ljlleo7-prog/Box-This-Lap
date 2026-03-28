import { Track } from '../../types';
import telemetry from './telemetry/monaco-gp.json';

export const MONACO: Track = {
  id: 'monaco-gp',
  name: 'Circuit de Monaco',
  totalDistance: 3337,
  totalLaps: 78,
  tireDegradationFactor: 0.8, // Smooth surface, low degradation
  overtakingDifficulty: 0.95, // Near impossible
  trackDifficulty: 0.95, // Unforgiving walls
  baseTemperature: 22,
  location: {
    lat: 43.7347,
    long: 7.4206
  },
  weatherParams: { volatility: 0.6, rainProbability: 0.2 },
  weatherChance: {
    rainChance: 0.2,
    rainIntensity: 'mixed'
  },
  telemetryPoints: telemetry.telemetryPoints,
  sectors: telemetry.sectors as any,
  drsZones: [
    {
      detectionDistance: 2800, // After Swimming Pool 2
      activationDistance: 50, // Start finish straight
      endDistance: 400
    }
  ],
  pitLane: {
    entryDistance: 3200, // Rascasse
    exitDistance: 200, // Sainte Devote
    speedLimit: 16.6, // 60 km/h
    stopTime: 25.0
  }
};
