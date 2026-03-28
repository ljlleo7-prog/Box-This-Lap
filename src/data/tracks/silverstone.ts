import { Track } from '../../types';
import telemetry from './telemetry/silverstone-gp.json';

export const SILVERSTONE: Track = {
    id: 'silverstone-gp',
    name: 'Silverstone Grand Prix',
    totalDistance: 5891, // meters
    totalLaps: 52,
    tireDegradationFactor: 1.2, // High speed corners kill tires
    overtakingDifficulty: 0.5, // Medium
    trackDifficulty: 0.7, // High speed precision required
    baseTemperature: 20, // British Summer
    location: { lat: 52.0786, long: -1.0169 },
    weatherParams: { volatility: 0.7, rainProbability: 0.4 },
    weatherChance: { rainChance: 0.4, rainIntensity: 'mixed' }, // Typical UK weather
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 600, activationDistance: 1050, endDistance: 1800 }, // Wellington Straight (after The Loop)
        { detectionDistance: 3300, activationDistance: 3550, endDistance: 4300 } // Hangar Straight (after Chapel)
    ],
    pitLane: {
    entryDistance: 5700, // Vale (Closer to actual pit entry)
    exitDistance: 400, // Farm
    speedLimit: 22.2, // 80 km/h
    stopTime: 37, // Adjusted for correct pit loss (~29s loss relative to track)
  },
};
