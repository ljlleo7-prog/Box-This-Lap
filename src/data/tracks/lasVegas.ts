import { Track } from '../../types';
import telemetry from './telemetry/las-vegas-gp.json';

export const LAS_VEGAS: Track = {
    id: 'las-vegas-gp',
    name: 'Las Vegas Strip Circuit',
    totalDistance: 6201,
    totalLaps: 50,
    tireDegradationFactor: 0.86,
    overtakingDifficulty: 0.3,
    trackDifficulty: 0.63,
    baseTemperature: 16,
    location: { lat: 36.1147, long: -115.1728 },
    weatherParams: { volatility: 0.18, rainProbability: 0.03 },
    weatherChance: { rainChance: 0.03, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 5510, activationDistance: 5750, endDistance: 860 },
        { detectionDistance: 1940, activationDistance: 2170, endDistance: 3040 }
    ],
    pitLane: {
        entryDistance: 6070,
        exitDistance: 230,
        speedLimit: 22.2,
        stopTime: 34
    },
};
