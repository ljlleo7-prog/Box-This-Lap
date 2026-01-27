import { Track } from '../../types';

export const SPA: Track = {
    id: 'spa-gp',
    name: 'Circuit de Spa-Francorchamps',
    totalDistance: 7004,
    totalLaps: 44,
    tireDegradationFactor: 1.4, // High loads
    overtakingDifficulty: 0.4, // Medium - Kemmel is easy, S2 is hard
    trackDifficulty: 0.8, // High - Technical, long, varied
    baseTemperature: 18, // Cool Ardennes
    location: { lat: 50.4372, long: 5.9714 },
    weatherParams: { volatility: 0.9, rainProbability: 0.6 },
    weatherChance: { rainChance: 0.6, rainIntensity: 'mixed' }, // Ardennes weather
    sectors: [
        { id: 'la_source', name: 'La Source', startDistance: 0, endDistance: 200, type: 'corner_low_speed', difficulty: 0.8 },
        { id: 'eau_rouge', name: 'Eau Rouge', startDistance: 200, endDistance: 600, type: 'corner_high_speed', difficulty: 0.95 }, // Flat out but scary
        { id: 'kemmel', name: 'Kemmel Straight', startDistance: 600, endDistance: 1800, type: 'straight', difficulty: 0.1 },
        { id: 'les_combes', name: 'Les Combes', startDistance: 1800, endDistance: 2100, type: 'corner_medium_speed', difficulty: 0.7 },
        { id: 'malmedy', name: 'Malmedy', startDistance: 2100, endDistance: 2300, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 'rivage', name: 'Rivage', startDistance: 2300, endDistance: 2600, type: 'corner_low_speed', difficulty: 0.8 },
        { id: 'pouhon', name: 'Pouhon', startDistance: 2600, endDistance: 3200, type: 'corner_high_speed', difficulty: 0.9 }, // Double left
        { id: 'fagnes', name: 'Fagnes', startDistance: 3200, endDistance: 3500, type: 'corner_medium_speed', difficulty: 0.7 },
        { id: 'stavelot', name: 'Stavelot', startDistance: 3500, endDistance: 3800, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 'blanchimont', name: 'Blanchimont', startDistance: 3800, endDistance: 5500, type: 'corner_high_speed', difficulty: 0.4 }, // Flat out
        { id: 'chicane', name: 'Bus Stop Chicane', startDistance: 5500, endDistance: 5700, type: 'corner_low_speed', difficulty: 0.9 },
        { id: 'finish', name: 'Main Straight', startDistance: 5700, endDistance: 7004, type: 'straight', difficulty: 0.1 },
    ],
    drsZones: [
        { detectionDistance: 400, activationDistance: 650, endDistance: 1800 }, // Kemmel
        { detectionDistance: 5400, activationDistance: 5800, endDistance: 7004 }, // Main Straight
    ],
    pitLane: {
        entryDistance: 5500,
        exitDistance: 250, // After La Source
        speedLimit: 22.2,
        stopTime: 22,
    }
};
