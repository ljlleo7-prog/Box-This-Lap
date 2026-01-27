import { Track } from '../../types';

export const SILVERSTONE: Track = {
    id: 'silverstone-gp',
    name: 'Silverstone Grand Prix',
    totalDistance: 5891, // meters
    totalLaps: 52,
    tireDegradationFactor: 1.2, // High speed corners kill tires
    overtakingDifficulty: 0.5, // Medium
    trackDifficulty: 0.7, // High speed precision required
    baseTemperature: 20, // British Summer
    location: { lat: 52.0786, long: -1.0169 },
    weatherParams: { volatility: 0.7, rainProbability: 0.4 },
    weatherChance: { rainChance: 0.4, rainIntensity: 'mixed' }, // Typical UK weather
    sectors: [
      // Hamilton Straight (Start/Finish)
      { id: 'hamilton_str', name: 'Hamilton Straight', startDistance: 0, endDistance: 270, type: 'straight', difficulty: 0.1 },
      // T1 Abbey - High speed right
      { id: 't1_abbey', name: 'Abbey', startDistance: 270, endDistance: 400, type: 'corner_high_speed', difficulty: 0.7 },
      // T2 Farm - Flat out left
      { id: 't2_farm', name: 'Farm', startDistance: 400, endDistance: 600, type: 'straight', difficulty: 0.2 },
      // T3 Village - Slow right (braking zone)
      { id: 't3_village', name: 'Village', startDistance: 600, endDistance: 750, type: 'corner_low_speed', difficulty: 0.8 },
      // T4 The Loop - Very slow left hairpin
      { id: 't4_loop', name: 'The Loop', startDistance: 750, endDistance: 900, type: 'corner_low_speed', difficulty: 0.9 },
      // T5 Aintree - Flat out left onto straight
      { id: 't5_aintree', name: 'Aintree', startDistance: 900, endDistance: 1050, type: 'corner_medium_speed', difficulty: 0.5 },
      // Wellington Straight (DRS 1)
      { id: 'wellington_str', name: 'Wellington Straight', startDistance: 1050, endDistance: 1800, type: 'straight', difficulty: 0.1 },
      // T6 Brooklands - Medium left
      { id: 't6_brooklands', name: 'Brooklands', startDistance: 1800, endDistance: 2000, type: 'corner_medium_speed', difficulty: 0.7 },
      // T7 Luffield - Long medium right
      { id: 't7_luffield', name: 'Luffield', startDistance: 2000, endDistance: 2300, type: 'corner_medium_speed', difficulty: 0.8 },
      // T8 Woodcote - Flat out right
      { id: 't8_woodcote', name: 'Woodcote', startDistance: 2300, endDistance: 2600, type: 'straight', difficulty: 0.3 },
      // T9 Copse - Super high speed right
      { id: 't9_copse', name: 'Copse', startDistance: 2600, endDistance: 2850, type: 'corner_high_speed', difficulty: 0.9 },
      // Maggots/Becketts Complex - High speed S-bends
      { id: 't10_maggots', name: 'Maggots', startDistance: 2850, endDistance: 3100, type: 'corner_high_speed', difficulty: 0.95 },
      { id: 't11_becketts', name: 'Becketts', startDistance: 3100, endDistance: 3300, type: 'corner_high_speed', difficulty: 0.95 },
      { id: 't12_chapel', name: 'Chapel', startDistance: 3300, endDistance: 3500, type: 'corner_high_speed', difficulty: 0.9 },
      // Hangar Straight (DRS 2)
      { id: 'hangar_str', name: 'Hangar Straight', startDistance: 3500, endDistance: 4300, type: 'straight', difficulty: 0.1 },
      // T15 Stowe - High speed right
      { id: 't15_stowe', name: 'Stowe', startDistance: 4300, endDistance: 4600, type: 'corner_high_speed', difficulty: 0.8 },
      // T16 Vale - Heavy braking chicane/straight
      { id: 'vale_str', name: 'Vale Entry', startDistance: 4600, endDistance: 4800, type: 'straight', difficulty: 0.2 },
      { id: 't16_vale', name: 'Vale', startDistance: 4800, endDistance: 4950, type: 'corner_low_speed', difficulty: 0.8 },
      // T17/18 Club - Slow to accelerating right
      { id: 't17_club', name: 'Club', startDistance: 4950, endDistance: 5300, type: 'corner_medium_speed', difficulty: 0.7 },
      // Main Straight run to line
      { id: 'main_str', name: 'Main Straight', startDistance: 5300, endDistance: 5891, type: 'straight', difficulty: 0.1 },
    ],
    drsZones: [
        { detectionDistance: 600, activationDistance: 1050, endDistance: 1800 }, // Wellington Straight (after The Loop)
        { detectionDistance: 3300, activationDistance: 3550, endDistance: 4300 } // Hangar Straight (after Chapel)
    ],
    pitLane: {
      entryDistance: 4800, // Vale
      exitDistance: 400, // Farm
      speedLimit: 22.2, // 80 km/h
      stopTime: 25,
    },
};
