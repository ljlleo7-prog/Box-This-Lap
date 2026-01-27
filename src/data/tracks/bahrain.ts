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
    weatherParams: { volatility: 0.1, rainProbability: 0.05 },
    weatherChance: { rainChance: 0.05, rainIntensity: 'light' },
    sectors: [
        // Main Straight
        { id: 'main_str', name: 'Main Straight', startDistance: 0, endDistance: 900, type: 'straight', difficulty: 0.1, maxSpeed: 89 }, // 320 kph
        // T1: Michael Schumacher Corner (Tight hairpin)
        { id: 't1', name: 'Turn 1', startDistance: 900, endDistance: 1050, type: 'corner_low_speed', difficulty: 0.8, maxSpeed: 18 }, // 65 kph
        // T2/T3: Acceleration
        { id: 't2_t3', name: 'Turns 2-3', startDistance: 1050, endDistance: 1400, type: 'corner_medium_speed', difficulty: 0.5, maxSpeed: 55 }, // 200 kph
        // T4: Overtaking spot
        { id: 't4', name: 'Turn 4', startDistance: 1400, endDistance: 1550, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 38 }, // 135 kph
        // T5-T7: High speed S-bends
        { id: 't5_t7', name: 'Turns 5-7', startDistance: 1550, endDistance: 2000, type: 'corner_high_speed', difficulty: 0.8, maxSpeed: 70 }, // 250 kph
        // T8: Hairpin
        { id: 't8', name: 'Turn 8', startDistance: 2000, endDistance: 2150, type: 'corner_low_speed', difficulty: 0.7, maxSpeed: 22 }, // 80 kph
        // T9/T10: Difficult braking (lock-up central)
        { id: 't9_t10', name: 'Turns 9-10', startDistance: 2150, endDistance: 2500, type: 'corner_low_speed', difficulty: 0.9, maxSpeed: 20 }, // 72 kph
        // Back Straight (Curved)
        { id: 'back_str', name: 'Back Straight', startDistance: 2500, endDistance: 3200, type: 'straight', difficulty: 0.2, maxSpeed: 82 }, // 295 kph
        // T11: Fast uphill sweep
        { id: 't11', name: 'Turn 11', startDistance: 3200, endDistance: 3500, type: 'corner_high_speed', difficulty: 0.6, maxSpeed: 75 }, // 270 kph
        // T12: Flat out
        { id: 't12', name: 'Turn 12', startDistance: 3500, endDistance: 3800, type: 'straight', difficulty: 0.2, maxSpeed: 78 }, // 280 kph
        // T13: Medium speed right
        { id: 't13', name: 'Turn 13', startDistance: 3800, endDistance: 4000, type: 'corner_medium_speed', difficulty: 0.6, maxSpeed: 42 }, // 150 kph
        // Main Straight 2 (Run to T14)
        { id: 'str_2', name: 'Run to T14', startDistance: 4000, endDistance: 4800, type: 'straight', difficulty: 0.1, maxSpeed: 85 }, // 305 kph
        // T14/T15: Final corners
        { id: 't14_t15', name: 'Final Corners', startDistance: 4800, endDistance: 5412, type: 'corner_medium_speed', difficulty: 0.5, maxSpeed: 45 } // 160 kph
    ],
    drsZones: [
        { detectionDistance: 0, activationDistance: 150, endDistance: 900 }, // Main straight
        { detectionDistance: 1300, activationDistance: 1500, endDistance: 2100 }, // Run to T4
        { detectionDistance: 3900, activationDistance: 4100, endDistance: 4800 } // Back straight
    ],
    pitLane: {
        entryDistance: 5300,
        exitDistance: 350,
        speedLimit: 22.2, // 80 km/h
        stopTime: 22
    }
};
