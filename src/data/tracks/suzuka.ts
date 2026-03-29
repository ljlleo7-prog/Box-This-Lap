import { Track } from '../../types';
import telemetry from './telemetry/suzuka-gp.json';

export const SUZUKA: Track = {
    id: 'suzuka-gp',
    name: 'Suzuka Circuit',
    totalDistance: 5807,
    totalLaps: 53,
    tireDegradationFactor: 1.18,
    overtakingDifficulty: 0.55,
    trackDifficulty: 0.86,
    baseTemperature: 24,
    location: { lat: 34.8431, long: 136.5419 },
    weatherParams: { volatility: 0.55, rainProbability: 0.32 },
    weatherChance: { rainChance: 0.32, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 4920, activationDistance: 5180, endDistance: 360 }
    ],
    pitLane: {
        entryDistance: 5660,
        exitDistance: 250,
        speedLimit: 22.2,
        stopTime: 37
    },
};
