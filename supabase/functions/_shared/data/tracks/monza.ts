import { Track } from '../../types';

export const MONZA: Track = {
    id: 'monza-gp',
    name: 'Autodromo Nazionale Monza',
    totalDistance: 5793,
    totalLaps: 53,
    tireDegradationFactor: 0.8, // Low deg, mainly thermal from traction
    overtakingDifficulty: 0.2, // Low - High speed straights
    trackDifficulty: 0.4, // Medium-Low - Technical chicanes but simple layout
    baseTemperature: 25, // Warm Italian late summer
    location: { lat: 45.6197, long: 9.2811 },
    weatherParams: { volatility: 0.3, rainProbability: 0.2 },
    weatherChance: { rainChance: 0.2, rainIntensity: 'heavy' }, // Usually sunny, but storms happen
    sectors: [
        { id: 'main_str', name: 'Rettifilo Straight', startDistance: 0, endDistance: 600, type: 'straight', difficulty: 0.1 },
        { id: 't1_rettifilo', name: 'Var. Rettifilo', startDistance: 600, endDistance: 800, type: 'corner_low_speed', difficulty: 0.9 }, // Heavy braking
        { id: 'curva_grande', name: 'Curva Grande', startDistance: 800, endDistance: 1200, type: 'corner_high_speed', difficulty: 0.3 },
        { id: 'rogia_str', name: 'Rogia Straight', startDistance: 1200, endDistance: 1600, type: 'straight', difficulty: 0.1 },
        { id: 't4_rogia', name: 'Var. della Roggia', startDistance: 1600, endDistance: 1750, type: 'corner_medium_speed', difficulty: 0.8 },
        { id: 'lesmo_str', name: 'To Lesmo', startDistance: 1750, endDistance: 1900, type: 'straight', difficulty: 0.2 },
        { id: 't6_lesmo1', name: 'Lesmo 1', startDistance: 1900, endDistance: 2000, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 't7_lesmo2', name: 'Lesmo 2', startDistance: 2000, endDistance: 2150, type: 'corner_medium_speed', difficulty: 0.7 },
        { id: 'serraglio', name: 'Serraglio Straight', startDistance: 2150, endDistance: 3000, type: 'straight', difficulty: 0.1 }, // DRS 2
        { id: 't8_ascari', name: 'Var. Ascari', startDistance: 3000, endDistance: 3400, type: 'corner_high_speed', difficulty: 0.9 },
        { id: 'back_str', name: 'Back Straight', startDistance: 3400, endDistance: 4500, type: 'straight', difficulty: 0.1 },
        { id: 't11_parabolica', name: 'Parabolica', startDistance: 4500, endDistance: 5000, type: 'corner_high_speed', difficulty: 0.7 },
        { id: 'finish_str', name: 'Main Straight', startDistance: 5000, endDistance: 5793, type: 'straight', difficulty: 0.1 },
    ],
    drsZones: [
        { detectionDistance: 2000, activationDistance: 2300, endDistance: 3000 }, // After Lesmo 2
        { detectionDistance: 4800, activationDistance: 5200, endDistance: 5793 }, // Main Straight
    ],
    pitLane: {
        entryDistance: 4900,
        exitDistance: 500,
        speedLimit: 22.2,
        stopTime: 35,
    }
};
