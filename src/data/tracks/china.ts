import { Track } from '../../types';
import telemetry from './telemetry/china-gp.json';

export const CHINA: Track = {
    id: 'china-gp',
    name: 'Shanghai International Circuit',
    totalDistance: 5451,
    totalLaps: 56,
    tireDegradationFactor: 1.3, // Front limited, abrasive
    overtakingDifficulty: 0.6, // Good overtaking on back straight
    trackDifficulty: 0.7, // Technical T1, technical middle sector
    baseTemperature: 19, // Spring in Shanghai
    location: { lat: 31.3389, long: 121.221 },
    weatherParams: { volatility: 0.5, rainProbability: 0.4 },
    weatherChance: { rainChance: 0.4, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 2900, activationDistance: 3300, endDistance: 4500 }, // Back straight
        { detectionDistance: 5300, activationDistance: 100, endDistance: 700 } // Main straight
    ],
    pitLane: {
        entryDistance: 4800,
        exitDistance: 300,
        speedLimit: 22.2, // 80 km/h
        stopTime: 36 // Long pit lane
    }
};
