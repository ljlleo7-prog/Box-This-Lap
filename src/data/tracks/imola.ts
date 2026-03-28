import { Track } from '../../types';
import telemetry from './telemetry/imola-gp.json';

export const IMOLA: Track = {
    id: 'imola-gp',
    name: 'Autodromo Enzo e Dino Ferrari',
    totalDistance: 4909,
    totalLaps: 63,
    tireDegradationFactor: 1.05,
    overtakingDifficulty: 0.62,
    trackDifficulty: 0.78,
    baseTemperature: 23,
    location: { lat: 44.3439, long: 11.7167 },
    weatherParams: { volatility: 0.5, rainProbability: 0.34 },
    weatherChance: { rainChance: 0.34, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 4300, activationDistance: 4500, endDistance: 300 }
    ],
    pitLane: {
        entryDistance: 4760,
        exitDistance: 240,
        speedLimit: 22.2,
        stopTime: 34
    },
};
