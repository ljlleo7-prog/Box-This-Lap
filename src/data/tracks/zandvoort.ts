import { Track } from '../../types';
import telemetry from './telemetry/zandvoort-gp.json';

export const ZANDVOORT: Track = {
    id: 'zandvoort-gp',
    name: 'Circuit Zandvoort',
    totalDistance: 4259,
    totalLaps: 72,
    tireDegradationFactor: 1.14,
    overtakingDifficulty: 0.74,
    trackDifficulty: 0.77,
    baseTemperature: 21,
    location: { lat: 52.3888, long: 4.5409 },
    weatherParams: { volatility: 0.6, rainProbability: 0.38 },
    weatherChance: { rainChance: 0.38, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 3740, activationDistance: 3960, endDistance: 280 }
    ],
    pitLane: {
        entryDistance: 4120,
        exitDistance: 210,
        speedLimit: 22.2,
        stopTime: 34
    },
};
