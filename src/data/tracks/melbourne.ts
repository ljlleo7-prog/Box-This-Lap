import { Track } from '../../types';
import telemetry from './telemetry/melbourne-gp.json';

export const MELBOURNE: Track = {
    id: 'melbourne-gp',
    name: 'Albert Park Circuit',
    totalDistance: 5278,
    totalLaps: 58,
    tireDegradationFactor: 1.1,
    overtakingDifficulty: 0.7,
    trackDifficulty: 0.6,
    baseTemperature: 22,
    location: { lat: -37.8497, long: 144.968 },
    weatherParams: { volatility: 0.4, rainProbability: 0.2 },
    weatherChance: { rainChance: 0.2, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [],
    pitLane: {
        entryDistance: 5100,
        exitDistance: 200,
        speedLimit: 22.2,
        stopTime: 20
    }
};