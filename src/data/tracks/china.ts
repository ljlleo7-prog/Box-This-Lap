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
        { id: 'start_str', name: 'Main Straight', startDistance: 0, endDistance: 400, type: 'straight', difficulty: 0.1 },
        { id: 't1_snail', name: 'The Snail (T1-T4)', startDistance: 400, endDistance: 1200, type: 'corner_low_speed', difficulty: 0.9 }, // Ever tightening
        { id: 't5_t6', name: 'T5-T6', startDistance: 1200, endDistance: 1600, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 't7_t8', name: 'T7-T8', startDistance: 1600, endDistance: 2200, type: 'corner_high_speed', difficulty: 0.8 }, // High G-force
        { id: 'back_section', name: 'T9-T10', startDistance: 2200, endDistance: 2800, type: 'corner_low_speed', difficulty: 0.5 },
        { id: 't11_t12', name: 'T11-T12', startDistance: 2800, endDistance: 3200, type: 'corner_medium_speed', difficulty: 0.6 },
        { id: 't13_banked', name: 'T13 (Banked)', startDistance: 3200, endDistance: 3600, type: 'corner_medium_speed', difficulty: 0.7 }, // Leads to back straight
        { id: 'back_straight', name: 'Back Straight', startDistance: 3600, endDistance: 4800, type: 'straight', difficulty: 0.1 }, // Huge straight
        { id: 'hairpin', name: 'T14 Hairpin', startDistance: 4800, endDistance: 5000, type: 'corner_low_speed', difficulty: 0.8 }, // Hard braking
        { id: 'final_corner', name: 'Final Corner', startDistance: 5000, endDistance: 5451, type: 'corner_medium_speed', difficulty: 0.4 },
    ],
    drsZones: [
        { detectionDistance: 3400, activationDistance: 3700, endDistance: 4800 }, // Back straight
        { detectionDistance: 5200, activationDistance: 100, endDistance: 400 }, // Main straight
    ],
    pitLane: {
        entryDistance: 5300,
        exitDistance: 300,
        speedLimit: 22.2,
        stopTime: 24,
    }
};
