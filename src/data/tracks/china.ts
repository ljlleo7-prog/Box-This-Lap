import { Track } from '../../types';

export const CHINA: Track = {
    id: 'china-gp',
    name: 'Shanghai International Circuit',
    totalDistance: 5451,
    totalLaps: 56,
    tireDegradationFactor: 1.3, // Front limited, abrasive
    overtakingDifficulty: 0.6, // Good overtaking on back straight
    trackDifficulty: 0.7, // Technical T1, technical middle sector
    baseTemperature: 19, // Spring in Shanghai
    location: { lat: 31.3389, long: 121.221 },
    weatherParams: { volatility: 0.5, rainProbability: 0.4 },
    weatherChance: { rainChance: 0.4, rainIntensity: 'mixed' },
    sectors: [
        // Main Straight
        { id: 'main_str', name: 'Main Straight', startDistance: 0, endDistance: 700, type: 'straight', difficulty: 0.1, maxSpeed: 88 }, // 315 kph
        // T1-T3: The Snail (Decelerating radius)
        { id: 't1_t3_snail', name: 'The Snail (T1-T3)', startDistance: 700, endDistance: 1200, type: 'corner_medium_speed', difficulty: 0.9, maxSpeed: 38 }, // Avg 135 kph
        // T4: Exit of snail (Acceleration)
        { id: 't4_exit', name: 'Turn 4', startDistance: 1200, endDistance: 1400, type: 'corner_medium_speed', difficulty: 0.6, maxSpeed: 55 }, // 200 kph
        // T5: Kink (Flat out)
        { id: 't5_kink', name: 'Turn 5', startDistance: 1400, endDistance: 1600, type: 'straight', difficulty: 0.2, maxSpeed: 75 }, // 270 kph
        // T6: Hairpin
        { id: 't6_hairpin', name: 'Turn 6 Hairpin', startDistance: 1600, endDistance: 1750, type: 'corner_low_speed', difficulty: 0.7, maxSpeed: 22 }, // 80 kph
        // T7/T8: High speed chicane/sweep
        { id: 't7_t8', name: 'Turns 7-8', startDistance: 1750, endDistance: 2200, type: 'corner_high_speed', difficulty: 0.8, maxSpeed: 72 }, // 260 kph
        // T9/T10: Double left
        { id: 't9_t10', name: 'Turns 9-10', startDistance: 2200, endDistance: 2600, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 42 }, // 150 kph
        // T11/T12: Tight chicane entry
        { id: 't11_t12', name: 'Turns 11-12', startDistance: 2600, endDistance: 2900, type: 'corner_low_speed', difficulty: 0.8, maxSpeed: 30 }, // 108 kph
        // T13: Banked right leading to straight
        { id: 't13_banked', name: 'Turn 13', startDistance: 2900, endDistance: 3300, type: 'corner_medium_speed', difficulty: 0.6, maxSpeed: 50 }, // 180 kph
        // Back Straight (Massive)
        { id: 'back_str', name: 'Back Straight', startDistance: 3300, endDistance: 4500, type: 'straight', difficulty: 0.1, maxSpeed: 92 }, // 330 kph
        // T14: Hairpin at end of straight
        { id: 't14_hairpin', name: 'Turn 14', startDistance: 4500, endDistance: 4700, type: 'corner_low_speed', difficulty: 0.8, maxSpeed: 19 }, // 68 kph
        // T15: Pit entry kink
        { id: 't15', name: 'Turn 15', startDistance: 4700, endDistance: 4900, type: 'straight', difficulty: 0.3, maxSpeed: 60 }, // 215 kph
        // T16: Final corner
        { id: 't16_final', name: 'Turn 16', startDistance: 4900, endDistance: 5451, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 50 } // 180 kph
    ],
    drsZones: [
        { detectionDistance: 2900, activationDistance: 3300, endDistance: 4500 }, // Back straight
        { detectionDistance: 5300, activationDistance: 100, endDistance: 700 } // Main straight
    ],
    pitLane: {
        entryDistance: 4800,
        exitDistance: 300,
        speedLimit: 22.2, // 80 km/h
        stopTime: 24 // Long pit lane
    }
};
