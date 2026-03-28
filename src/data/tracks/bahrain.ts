import { Track } from '../../types';
import telemetry from './telemetry/bahrain-gp.json';

export const BAHRAIN: Track = {
    id: 'bahrain-gp',
    name: 'Bahrain International Circuit',
    totalDistance: 5412,
    totalLaps: 57,
    tireDegradationFactor: 1.5, // Very high, abrasive asphalt
    overtakingDifficulty: 0.7, // Easy, many straights and heavy braking
    trackDifficulty: 0.5, // Medium, stop-start nature
    baseTemperature: 26, // Desert night
    location: { lat: 26.0325, long: 50.5106 },
    weatherParams: { volatility: 0.1, rainProbability: 0.05 },
    weatherChance: { rainChance: 0.05, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 0, activationDistance: 150, endDistance: 900 }, // Main straight
        { detectionDistance: 1300, activationDistance: 1500, endDistance: 2100 }, // Run to T4
        { detectionDistance: 3900, activationDistance: 4100, endDistance: 4800 } // Back straight
    ],
    pitLane: {
        entryDistance: 5300,
        exitDistance: 350,
        speedLimit: 22.2, // 80 km/h
        stopTime: 28
    }
};
