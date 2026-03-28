import { Track } from '../../types';
import telemetry from './telemetry/spa-gp.json';

export const SPA: Track = {
    id: 'spa-gp',
    name: 'Circuit de Spa-Francorchamps',
    totalDistance: 7004,
    totalLaps: 44,
    tireDegradationFactor: 1.4, // High loads
    overtakingDifficulty: 0.4, // Medium - Kemmel is easy, S2 is hard
    trackDifficulty: 0.8, // High - Technical, long, varied
    baseTemperature: 18, // Cool Ardennes
    location: { lat: 50.4372, long: 5.9714 },
    weatherParams: { volatility: 0.9, rainProbability: 0.6 },
    weatherChance: { rainChance: 0.6, rainIntensity: 'mixed' }, // Ardennes weather
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 400, activationDistance: 650, endDistance: 1800 }, // Kemmel
        { detectionDistance: 5400, activationDistance: 5800, endDistance: 7004 }, // Main Straight
    ],
    pitLane: {
        entryDistance: 5500,
        exitDistance: 250, // After La Source
        speedLimit: 22.2,
        stopTime: 47,
    }
};
