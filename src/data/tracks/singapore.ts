import { Track } from '../../types';

export const SINGAPORE: Track = {
    id: 'singapore-gp',
    name: 'Marina Bay Street Circuit',
    totalDistance: 4940,
    totalLaps: 62,
    tireDegradationFactor: 1.1, // Rear limited, traction heavy
    overtakingDifficulty: 0.85, // Very difficult
    trackDifficulty: 0.9, // Physically demanding, bumpy, hot
    baseTemperature: 29, // Tropical night
    location: { lat: 1.2914, long: 103.864 },
    weatherParams: { volatility: 0.8, rainProbability: 0.3 },
    weatherChance: { rainChance: 0.3, rainIntensity: 'heavy' },
    sectors: [
        // Main Straight
        { id: 'main_str', name: 'Main Straight', startDistance: 0, endDistance: 300, type: 'straight', difficulty: 0.1, maxSpeed: 82 }, // 295 kph
        // T1-T3: Opening Chicane
        { id: 't1_t3', name: 'Turns 1-3', startDistance: 300, endDistance: 600, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 35 }, // 126 kph
        // T4: Slow right
        { id: 't4', name: 'Turn 4', startDistance: 600, endDistance: 700, type: 'corner_low_speed', difficulty: 0.6, maxSpeed: 28 }, // 100 kph
        // T5: Fullerton Flat Out
        { id: 't5_fullerton', name: 'Turn 5', startDistance: 700, endDistance: 1100, type: 'straight', difficulty: 0.2, maxSpeed: 75 }, // 270 kph
        // T7: Memorial Corner (90 deg)
        { id: 't7', name: 'Turn 7', startDistance: 1100, endDistance: 1300, type: 'corner_low_speed', difficulty: 0.6, maxSpeed: 30 }, // 108 kph
        // Stamford Straight
        { id: 'stamford_str', name: 'Stamford Straight', startDistance: 1300, endDistance: 1700, type: 'straight', difficulty: 0.1, maxSpeed: 80 }, // 288 kph
        // T8/T9: 90 deg corners
        { id: 't8_t9', name: 'Turns 8-9', startDistance: 1700, endDistance: 1900, type: 'corner_low_speed', difficulty: 0.6, maxSpeed: 25 }, // 90 kph
        // T10: Singapore Sling (now just a left)
        { id: 't10', name: 'Turn 10', startDistance: 1900, endDistance: 2100, type: 'corner_medium_speed', difficulty: 0.5, maxSpeed: 40 }, // 144 kph
        // T11/T12: Bridge approach
        { id: 't11_t12', name: 'Turns 11-12', startDistance: 2100, endDistance: 2300, type: 'corner_low_speed', difficulty: 0.7, maxSpeed: 30 }, // 108 kph
        // T13: Hairpin
        { id: 't13_hairpin', name: 'Turn 13 Hairpin', startDistance: 2300, endDistance: 2450, type: 'corner_low_speed', difficulty: 0.8, maxSpeed: 16 }, // 55 kph
        // Esplanade Straight
        { id: 'esplanade_str', name: 'Esplanade', startDistance: 2450, endDistance: 3000, type: 'straight', difficulty: 0.1, maxSpeed: 80 }, // 288 kph
        // T14: Right hander
        { id: 't14', name: 'Turn 14', startDistance: 3000, endDistance: 3150, type: 'corner_low_speed', difficulty: 0.6, maxSpeed: 24 }, // 85 kph
        // T16/T17: Chicane
        { id: 't16_t17', name: 'Turns 16-17', startDistance: 3150, endDistance: 3400, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 35 }, // 126 kph
        // Bay Grandstand section
        { id: 't18_t19', name: 'Bay Grandstand', startDistance: 3400, endDistance: 3700, type: 'corner_low_speed', difficulty: 0.6, maxSpeed: 28 }, // 100 kph
        // T20/T21: Fast chicane under highway
        { id: 't20_t21', name: 'Turns 20-21', startDistance: 3700, endDistance: 4000, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 45 }, // 160 kph
        // Back straight towards final sector
        { id: 'penultimate_str', name: 'Run to End', startDistance: 4000, endDistance: 4600, type: 'straight', difficulty: 0.1, maxSpeed: 82 }, // 295 kph
        // Final Corners (Faster now)
        { id: 'final_sector', name: 'Final Sector', startDistance: 4600, endDistance: 4940, type: 'corner_medium_speed', difficulty: 0.5, maxSpeed: 50 } // 180 kph
    ],
    drsZones: [
        { detectionDistance: 4000, activationDistance: 4100, endDistance: 4600 }, // Before T14 (now back straight)
        { detectionDistance: 4800, activationDistance: 50, endDistance: 300 } // Main straight
    ],
    pitLane: {
        entryDistance: 4850,
        exitDistance: 350,
        speedLimit: 16.6, // 60 km/h
        stopTime: 35 // Very long pit loss
    }
};
