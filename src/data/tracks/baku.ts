import { Track } from '../../types';
import telemetry from './telemetry/baku-gp.json';

export const BAKU: Track = {
    id: 'baku-gp',
    name: 'Baku City Circuit',
    totalDistance: 6003,
    totalLaps: 51,
    tireDegradationFactor: 0.94,
    overtakingDifficulty: 0.4,
    trackDifficulty: 0.69,
    baseTemperature: 27,
    location: { lat: 40.3725, long: 49.8533 },
    weatherParams: { volatility: 0.38, rainProbability: 0.12 },
    weatherChance: { rainChance: 0.12, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 5150, activationDistance: 5360, endDistance: 900 },
        { detectionDistance: 1770, activationDistance: 2000, endDistance: 2620 }
    ],
    pitLane: {
        entryDistance: 5850,
        exitDistance: 320,
        speedLimit: 22.2,
        stopTime: 34
    },
};
