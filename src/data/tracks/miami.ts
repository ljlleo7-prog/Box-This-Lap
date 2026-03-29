import { Track } from '../../types';
import telemetry from './telemetry/miami-gp.json';

export const MIAMI: Track = {
    id: 'miami-gp',
    name: 'Miami International Autodrome',
    totalDistance: 5412,
    totalLaps: 57,
    tireDegradationFactor: 0.95,
    overtakingDifficulty: 0.42,
    trackDifficulty: 0.64,
    baseTemperature: 31,
    location: { lat: 25.9581, long: -80.2389 },
    weatherParams: { volatility: 0.45, rainProbability: 0.3 },
    weatherChance: { rainChance: 0.3, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 610, activationDistance: 860, endDistance: 1430 },
        { detectionDistance: 3340, activationDistance: 3560, endDistance: 4310 },
        { detectionDistance: 4740, activationDistance: 5030, endDistance: 250 }
    ],
    pitLane: {
        entryDistance: 5260,
        exitDistance: 280,
        speedLimit: 22.2,
        stopTime: 35
    },
};
