import { Track } from '../../types';
import telemetry from './telemetry/austin-gp.json';

export const AUSTIN: Track = {
    id: 'austin-gp',
    name: 'Circuit of the Americas',
    totalDistance: 5513,
    totalLaps: 56,
    tireDegradationFactor: 1.08,
    overtakingDifficulty: 0.44,
    trackDifficulty: 0.73,
    baseTemperature: 29,
    location: { lat: 30.1328, long: -97.6411 },
    weatherParams: { volatility: 0.5, rainProbability: 0.25 },
    weatherChance: { rainChance: 0.25, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 5000, activationDistance: 5220, endDistance: 420 },
        { detectionDistance: 940, activationDistance: 1160, endDistance: 1700 }
    ],
    pitLane: {
        entryDistance: 5380,
        exitDistance: 300,
        speedLimit: 22.2,
        stopTime: 35
    },
};
