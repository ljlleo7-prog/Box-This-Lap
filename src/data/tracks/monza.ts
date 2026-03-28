import { Track } from '../../types';
import telemetry from './telemetry/monza-gp.json';

export const MONZA: Track = {
    id: 'monza-gp',
    name: 'Autodromo Nazionale Monza',
    totalDistance: 5793,
    totalLaps: 53,
    tireDegradationFactor: 0.8, // Low deg, mainly thermal from traction
    overtakingDifficulty: 0.2, // Low - High speed straights
    trackDifficulty: 0.4, // Medium-Low - Technical chicanes but simple layout
    baseTemperature: 25, // Warm Italian late summer
    location: { lat: 45.6197, long: 9.2811 },
    weatherParams: { volatility: 0.3, rainProbability: 0.2 },
    weatherChance: { rainChance: 0.2, rainIntensity: 'heavy' }, // Usually sunny, but storms happen
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 2000, activationDistance: 2300, endDistance: 3000 }, // After Lesmo 2
        { detectionDistance: 4800, activationDistance: 5200, endDistance: 5793 }, // Main Straight
    ],
    pitLane: {
        entryDistance: 4900,
        exitDistance: 500,
        speedLimit: 22.2,
        stopTime: 35,
    }
};
