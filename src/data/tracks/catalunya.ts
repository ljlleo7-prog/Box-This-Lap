import { Track } from '../../types';
import telemetry from './telemetry/catalunya-gp.json';

export const CATALUNYA: Track = {
    id: 'catalunya-gp',
    name: 'Circuit de Barcelona-Catalunya',
    totalDistance: 4657,
    totalLaps: 66,
    tireDegradationFactor: 1.22,
    overtakingDifficulty: 0.58,
    trackDifficulty: 0.7,
    baseTemperature: 30,
    location: { lat: 41.57, long: 2.2611 },
    weatherParams: { volatility: 0.36, rainProbability: 0.2 },
    weatherChance: { rainChance: 0.2, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 4050, activationDistance: 4300, endDistance: 350 }
    ],
    pitLane: {
        entryDistance: 4520,
        exitDistance: 260,
        speedLimit: 22.2,
        stopTime: 35
    },
};
