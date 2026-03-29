import { Track } from '../../types';
import telemetry from './telemetry/interlagos-gp.json';

export const INTERLAGOS: Track = {
    id: 'interlagos-gp',
    name: 'Interlagos Circuit',
    totalDistance: 4309,
    totalLaps: 71,
    tireDegradationFactor: 1.12,
    overtakingDifficulty: 0.49,
    trackDifficulty: 0.71,
    baseTemperature: 26,
    location: { lat: -23.7036, long: -46.6997 },
    weatherParams: { volatility: 0.72, rainProbability: 0.48 },
    weatherChance: { rainChance: 0.48, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 3660, activationDistance: 3880, endDistance: 220 },
        { detectionDistance: 740, activationDistance: 980, endDistance: 1480 }
    ],
    pitLane: {
        entryDistance: 4180,
        exitDistance: 230,
        speedLimit: 22.2,
        stopTime: 34
    },
};
