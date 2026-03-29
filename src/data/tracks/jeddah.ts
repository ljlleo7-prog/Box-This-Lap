import { Track } from '../../types';
import telemetry from './telemetry/jeddah-gp.json';

export const JEDDAH: Track = {
    id: 'jeddah-gp',
    name: 'Jeddah Corniche Circuit',
    totalDistance: 6174,
    totalLaps: 50,
    tireDegradationFactor: 0.92,
    overtakingDifficulty: 0.38,
    trackDifficulty: 0.79,
    baseTemperature: 29,
    location: { lat: 21.6319, long: 39.1044 },
    weatherParams: { volatility: 0.25, rainProbability: 0.05 },
    weatherChance: { rainChance: 0.05, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 480, activationDistance: 700, endDistance: 1300 },
        { detectionDistance: 3700, activationDistance: 3900, endDistance: 4700 },
        { detectionDistance: 5180, activationDistance: 5460, endDistance: 300 }
    ],
    pitLane: {
        entryDistance: 6040,
        exitDistance: 210,
        speedLimit: 22.2,
        stopTime: 34
    },
};
