import { Track } from '../../types';

export const BAHRAIN: Track = {
    id: 'bahrain-gp',
    name: 'Bahrain International Circuit',
    totalDistance: 5412,
    totalLaps: 57,
    tireDegradationFactor: 1.5, // Very high, abrasive asphalt
    overtakingDifficulty: 0.7, // Easy, many straights and heavy braking
    trackDifficulty: 0.5, // Medium, stop-start nature
    baseTemperature: 26, // Desert night
    location: { lat: 26.0325, long: 50.5106 },
    weatherParams: { volatility: 0.2, rainProbability: 0.05 }, // Very unlikely to rain
    weatherChance: { rainChance: 0.05, rainIntensity: 'light' },
    sectors: [
        { id: 'main_str', name: 'Main Straight', startDistance: 0, endDistance: 600, type: 'straight', difficulty: 0.1 },
        { id: 't1_hairpin', name: 'T1 Michael Schumacher', startDistance: 600, endDistance: 800, type: 'corner_low_speed', difficulty: 0.8 }, // Heavy braking
        { id: 't2_t3', name: 'T2-T3', startDistance: 800, endDistance: 1200, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 'straight_2', name: 'Straight to T4', startDistance: 1200, endDistance: 1800, type: 'straight', difficulty: 0.1 },
        { id: 't4', name: 'T4', startDistance: 1800, endDistance: 2000, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 's2_technical', name: 'T5-T10', startDistance: 2000, endDistance: 3200, type: 'corner_medium_speed', difficulty: 0.8 }, // Downhill tricky section
        { id: 'back_str', name: 'Back Straight', startDistance: 3200, endDistance: 4000, type: 'straight', difficulty: 0.1 },
        { id: 't11', name: 'T11', startDistance: 4000, endDistance: 4200, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 't13', name: 'T13', startDistance: 4200, endDistance: 4400, type: 'corner_medium_speed', difficulty: 0.5 },
        { id: 'main_str_prep', name: 'T14-T15', startDistance: 4400, endDistance: 5412, type: 'corner_medium_speed', difficulty: 0.5 },
    ],
    drsZones: [
        { detectionDistance: 5300, activationDistance: 100, endDistance: 600 }, // Main Straight
        { detectionDistance: 1700, activationDistance: 1900, endDistance: 2500 }, // Run to T4? No wait, between T3 and T4.
        { detectionDistance: 3100, activationDistance: 3300, endDistance: 4000 }, // Back straight
    ],
    pitLane: {
        entryDistance: 5300,
        exitDistance: 200,
        speedLimit: 22.2,
        stopTime: 23,
    }
};
