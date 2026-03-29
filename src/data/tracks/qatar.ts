import { Track } from '../../types';
import telemetry from './telemetry/qatar-gp.json';

export const QATAR: Track = {
    id: 'qatar-gp',
    name: 'Lusail International Circuit',
    totalDistance: 5419,
    totalLaps: 57,
    tireDegradationFactor: 1.2,
    overtakingDifficulty: 0.52,
    trackDifficulty: 0.72,
    baseTemperature: 32,
    location: { lat: 25.49, long: 51.4542 },
    weatherParams: { volatility: 0.22, rainProbability: 0.02 },
    weatherChance: { rainChance: 0.02, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 4880, activationDistance: 5100, endDistance: 260 }
    ],
    pitLane: {
        entryDistance: 5290,
        exitDistance: 210,
        speedLimit: 22.2,
        stopTime: 34
    },
};
