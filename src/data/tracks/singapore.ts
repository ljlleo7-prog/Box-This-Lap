import { Track } from '../../types';
import telemetry from './telemetry/singapore-gp.json';

export const SINGAPORE: Track = {
    id: 'singapore-gp',
    name: 'Marina Bay Street Circuit',
    totalDistance: 4940,
    totalLaps: 62,
    tireDegradationFactor: 1.1, // Rear limited, traction heavy
    overtakingDifficulty: 0.85, // Very difficult
    trackDifficulty: 0.9, // Physically demanding, bumpy, hot
    baseTemperature: 29, // Tropical night
    location: { lat: 1.2914, long: 103.864 },
    weatherParams: { volatility: 0.8, rainProbability: 0.3 },
    weatherChance: { rainChance: 0.3, rainIntensity: 'heavy' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 4000, activationDistance: 4100, endDistance: 4600 }, // Before T14 (now back straight)
        { detectionDistance: 4800, activationDistance: 50, endDistance: 300 } // Main straight
    ],
    pitLane: {
        entryDistance: 4850,
        exitDistance: 350,
        speedLimit: 16.6, // 60 km/h
        stopTime: 35 // Very long pit loss
    }
};
