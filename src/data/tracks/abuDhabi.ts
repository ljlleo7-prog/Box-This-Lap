import { Track } from '../../types';

export const ABU_DHABI: Track = {
  id: 'abu-dhabi-gp',
  name: 'Yas Marina Circuit',
  totalDistance: 5281,
  totalLaps: 58,
  tireDegradationFactor: 1.2,
  overtakingDifficulty: 0.65, // Improved with layout changes
  trackDifficulty: 0.6, // Technical sector 3 requires precision
  baseTemperature: 24, // Twilight race
  location: {
    lat: 24.4672,
    long: 54.6031
  },
  weatherParams: { volatility: 0.2, rainProbability: 0.05 },
  weatherChance: {
    rainChance: 0.05,
    rainIntensity: 'light'
  },
  sectors: [
    // Main Straight
    { id: 'main_str', name: 'Main Straight', startDistance: 0, endDistance: 300, type: 'straight', difficulty: 0.1, maxSpeed: 83 }, // 300 kph
    // T1 - Fast left
    { id: 't1', name: 'Turn 1', startDistance: 300, endDistance: 500, type: 'corner_medium_speed', difficulty: 0.6, maxSpeed: 42 }, // 150 kph
    // T2/3/4 - Fast sweeping S-bends
    { id: 't2_t4', name: 'Turns 2-4', startDistance: 500, endDistance: 1000, type: 'corner_high_speed', difficulty: 0.8, maxSpeed: 75 }, // 270 kph
    // T5 - Hairpin (entry to back straight)
    { id: 't5_hairpin', name: 'North Hairpin', startDistance: 1000, endDistance: 1200, type: 'corner_low_speed', difficulty: 0.7, maxSpeed: 20 }, // 72 kph
    // Long Back Straight (DRS 1)
    { id: 'back_straight', name: 'Back Straight', startDistance: 1200, endDistance: 2300, type: 'straight', difficulty: 0.1, maxSpeed: 92 }, // 330 kph
    // T6/7 - Chicane (end of back straight)
    { id: 't6_chicane', name: 'Turn 6 Chicane', startDistance: 2300, endDistance: 2500, type: 'corner_low_speed', difficulty: 0.8, maxSpeed: 22 }, // 80 kph
    // Second Straight (Curved, DRS 2)
    { id: 'second_straight', name: 'Second Straight', startDistance: 2500, endDistance: 3200, type: 'straight', difficulty: 0.2, maxSpeed: 85 }, // 305 kph
    // T9 - Marsa Corner (Banked)
    { id: 't9_marsa', name: 'Marsa Corner', startDistance: 3200, endDistance: 3500, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 70 }, // 250 kph
    // Hotel Section Start
    { id: 't10_t11', name: 'Hotel Complex Entry', startDistance: 3500, endDistance: 3900, type: 'corner_medium_speed', difficulty: 0.8, maxSpeed: 35 }, // 126 kph
    // T12/13/14 - Under the hotel
    { id: 't12_hotel', name: 'Under Hotel', startDistance: 3900, endDistance: 4300, type: 'corner_low_speed', difficulty: 0.9, maxSpeed: 28 }, // 100 kph
    // T15 - Exit towards marina
    { id: 't15', name: 'Turn 15', startDistance: 4300, endDistance: 4600, type: 'corner_medium_speed', difficulty: 0.7, maxSpeed: 45 }, // 160 kph
    // T16 - Final Corner
    { id: 't16_final', name: 'Final Corner', startDistance: 4600, endDistance: 4900, type: 'corner_medium_speed', difficulty: 0.6, maxSpeed: 42 }, // 150 kph
    // Run to Line
    { id: 'finish_run', name: 'Finish Run', startDistance: 4900, endDistance: 5281, type: 'straight', difficulty: 0.1, maxSpeed: 80 } // 288 kph
  ],
  drsZones: [
    {
      detectionDistance: 1000, // Before T5 Hairpin
      activationDistance: 1250, // Start of Back Straight
      endDistance: 2300
    },
    {
      detectionDistance: 2400, // After T6 Chicane
      activationDistance: 2550, // Second Straight
      endDistance: 3200
    }
  ],
  pitLane: {
    entryDistance: 4800,
    exitDistance: 350, // Tunnel exit into T2
    speedLimit: 22.2, // 80 km/h
    stopTime: 21.0
  }
};
