import { Track } from '../../types';

export const SINGAPORE: Track = {
    id: 'singapore-gp',
    name: 'Marina Bay Street Circuit',
    totalDistance: 4940,
    totalLaps: 62,
    tireDegradationFactor: 1.1, // Traction limited, overheating rear
    overtakingDifficulty: 0.3, // Difficult, street circuit
    trackDifficulty: 0.9, // Walls, heat, humidity, relentless
    baseTemperature: 29, // Tropical night
    location: { lat: 1.2914, long: 103.864 },
    weatherParams: { volatility: 0.8, rainProbability: 0.3 }, // Tropical storms
    weatherChance: { rainChance: 0.3, rainIntensity: 'heavy' },
    sectors: [
        { id: 'start_str', name: 'Main Straight', startDistance: 0, endDistance: 300, type: 'straight', difficulty: 0.1 },
        { id: 's1_complex', name: 'Sheares / T1-T3', startDistance: 300, endDistance: 900, type: 'corner_medium_speed', difficulty: 0.7 },
        { id: 's1_straight', name: 'Republic Blvd', startDistance: 900, endDistance: 1500, type: 'straight', difficulty: 0.1 },
        { id: 't7_memorial', name: 'Memorial Corner', startDistance: 1500, endDistance: 1700, type: 'corner_low_speed', difficulty: 0.6 },
        { id: 's2_complex', name: 'Stamford / Padang', startDistance: 1700, endDistance: 2500, type: 'corner_medium_speed', difficulty: 0.8 }, // Many 90 deg turns
        { id: 'anderson_bridge', name: 'Anderson Bridge', startDistance: 2500, endDistance: 2800, type: 'straight', difficulty: 0.2 },
        { id: 't13_hairpin', name: 'Fullerton Hairpin', startDistance: 2800, endDistance: 3000, type: 'corner_low_speed', difficulty: 0.9 },
        { id: 'esplanade', name: 'Esplanade Drive', startDistance: 3000, endDistance: 3500, type: 'straight', difficulty: 0.1 },
        { id: 'bay_grandstand', name: 'Bay Section', startDistance: 3500, endDistance: 4200, type: 'corner_low_speed', difficulty: 0.8 }, // 90 deg turns under grandstand
        { id: 'final_sector', name: 'Final Sector', startDistance: 4200, endDistance: 4940, type: 'corner_medium_speed', difficulty: 0.6 },
    ],
    drsZones: [
        { detectionDistance: 200, activationDistance: 400, endDistance: 800 }, // Main Straight
        { detectionDistance: 2900, activationDistance: 3100, endDistance: 3500 }, // Esplanade
        { detectionDistance: 800, activationDistance: 1000, endDistance: 1500 }, // Republic Blvd (Added recently)
    ],
    pitLane: {
        entryDistance: 4800,
        exitDistance: 200,
        speedLimit: 16.6, // 60 kph
        stopTime: 28, // Long pit loss
    }
};
