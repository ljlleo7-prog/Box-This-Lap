import { Track } from '../../types';
import telemetry from './telemetry/abu-dhabi-gp.json';

export const ABU_DHABI: Track = {
  id: 'abu-dhabi-gp',
  name: 'Yas Marina Circuit',
  totalDistance: 5281,
  totalLaps: 58,
  tireDegradationFactor: 1.2,
  overtakingDifficulty: 0.65, // Improved with layout changes
  trackDifficulty: 0.6, // Technical sector 3 requires precision
  baseTemperature: 24, // Twilight race
  location: {
    lat: 24.4672,
    long: 54.6031
  },
  weatherParams: { volatility: 0.2, rainProbability: 0.05 },
  weatherChance: {
    rainChance: 0.05,
    rainIntensity: 'light'
  },
  sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
  drsZones: [
    {
      detectionDistance: 1000, // Before T5 Hairpin
      activationDistance: 1250, // Start of Back Straight
      endDistance: 2300
    },
    {
      detectionDistance: 2400, // After T6 Chicane
      activationDistance: 2550, // Second Straight
      endDistance: 3200
    }
  ],
  pitLane: {
    entryDistance: 4800,
    exitDistance: 350, // Tunnel exit into T2
    speedLimit: 22.2, // 80 km/h
    stopTime: 30.0
  }
};
