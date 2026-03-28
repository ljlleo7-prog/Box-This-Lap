import { Track } from '../../types';
import telemetry from './telemetry/montreal-gp.json';

export const MONTREAL: Track = {
    id: 'montreal-gp',
    name: 'Circuit Gilles Villeneuve',
    totalDistance: 4361,
    totalLaps: 70,
    tireDegradationFactor: 0.98,
    overtakingDifficulty: 0.33,
    trackDifficulty: 0.62,
    baseTemperature: 22,
    location: { lat: 45.5006, long: -73.5228 },
    weatherParams: { volatility: 0.58, rainProbability: 0.36 },
    weatherChance: { rainChance: 0.36, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 3300, activationDistance: 3500, endDistance: 300 },
        { detectionDistance: 520, activationDistance: 760, endDistance: 1320 }
    ],
    pitLane: {
        entryDistance: 4220,
        exitDistance: 260,
        speedLimit: 22.2,
        stopTime: 33
    },
};
