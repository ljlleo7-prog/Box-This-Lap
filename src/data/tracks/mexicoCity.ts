import { Track } from '../../types';
import telemetry from './telemetry/mexico-city-gp.json';

export const MEXICO_CITY: Track = {
    id: 'mexico-city-gp',
    name: 'Autódromo Hermanos Rodríguez',
    totalDistance: 4304,
    totalLaps: 71,
    tireDegradationFactor: 1.0,
    overtakingDifficulty: 0.5,
    trackDifficulty: 0.5,
    baseTemperature: 25,
    location: { lat: 19.4042, long: -99.0907 },
    weatherParams: { volatility: 0.2, rainProbability: 0.1 },
    weatherChance: { rainChance: 0.1, rainIntensity: 'light' },
    sectors: telemetry.sectors as any,
    telemetryPoints: telemetry.telemetryPoints,
    drsZones: [],
    pitLane: {
        entryDistance: 4100,
        exitDistance: 200,
        speedLimit: 22.2,
        stopTime: 22
    }
};