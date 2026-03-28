import { Track } from '../../types';
import telemetry from './telemetry/spielberg-gp.json';

export const SPIELBERG: Track = {
    id: 'spielberg-gp',
    name: 'Red Bull Ring Spielberg',
    totalDistance: 4318,
    totalLaps: 71,
    tireDegradationFactor: 0.9,
    overtakingDifficulty: 0.28,
    trackDifficulty: 0.57,
    baseTemperature: 27,
    location: { lat: 47.2197, long: 14.7647 },
    weatherParams: { volatility: 0.52, rainProbability: 0.34 },
    weatherChance: { rainChance: 0.34, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 3220, activationDistance: 3460, endDistance: 300 },
        { detectionDistance: 610, activationDistance: 830, endDistance: 1320 },
        { detectionDistance: 1750, activationDistance: 1980, endDistance: 2600 }
    ],
    pitLane: {
        entryDistance: 4180,
        exitDistance: 250,
        speedLimit: 22.2,
        stopTime: 33
    },
};
