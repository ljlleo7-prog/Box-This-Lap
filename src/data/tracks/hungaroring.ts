import { Track } from '../../types';
import telemetry from './telemetry/hungaroring-gp.json';

export const HUNGARORING: Track = {
    id: 'hungaroring-gp',
    name: 'Hungaroring',
    totalDistance: 4381,
    totalLaps: 70,
    tireDegradationFactor: 1.08,
    overtakingDifficulty: 0.75,
    trackDifficulty: 0.72,
    baseTemperature: 31,
    location: { lat: 47.5789, long: 19.2486 },
    weatherParams: { volatility: 0.42, rainProbability: 0.26 },
    weatherChance: { rainChance: 0.26, rainIntensity: 'mixed' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [
        { detectionDistance: 3900, activationDistance: 4100, endDistance: 300 }
    ],
    pitLane: {
        entryDistance: 4240,
        exitDistance: 220,
        speedLimit: 22.2,
        stopTime: 35
    },
};
