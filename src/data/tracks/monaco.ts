import { Track } from '../../types';

export const MONACO: Track = {
  id: 'monaco-gp',
  name: 'Circuit de Monaco',
  totalDistance: 3337,
  totalLaps: 78,
  tireDegradationFactor: 0.8, // Smooth surface, low degradation
  overtakingDifficulty: 0.95, // Near impossible
  trackDifficulty: 0.95, // Unforgiving walls
  baseTemperature: 22,
  location: {
    lat: 43.7347,
    long: 7.4206
  },
  weatherParams: { volatility: 0.6, rainProbability: 0.2 },
  weatherChance: {
    rainChance: 0.2,
    rainIntensity: 'mixed'
  },
  sectors: [
    // Main Straight
    { id: 'main_str', name: 'Main Straight', startDistance: 0, endDistance: 200, type: 'straight', difficulty: 0.2, maxSpeed: 78 }, // 280 kph
    // T1 Sainte Devote - 90 degree right, often chaos
    { id: 't1_sainte_devote', name: 'Sainte Devote', startDistance: 200, endDistance: 350, type: 'corner_low_speed', difficulty: 0.9, maxSpeed: 30 }, // 108 kph
    // Beau Rivage - Uphill straight
    { id: 'beau_rivage', name: 'Beau Rivage', startDistance: 350, endDistance: 700, type: 'straight', difficulty: 0.3, maxSpeed: 75 }, // 270 kph
    // T3 Massenet - Long left, blind
    { id: 't3_massenet', name: 'Massenet', startDistance: 700, endDistance: 900, type: 'corner_medium_speed', difficulty: 0.9, maxSpeed: 42 }, // 150 kph
    // T4 Casino Square - Right hander, bumpy
    { id: 't4_casino', name: 'Casino Square', startDistance: 900, endDistance: 1100, type: 'corner_medium_speed', difficulty: 0.8, maxSpeed: 36 }, // 130 kph
    // Run to Mirabeau
    { id: 'mirabeau_app', name: 'Run to Mirabeau', startDistance: 1100, endDistance: 1300, type: 'straight', difficulty: 0.5, maxSpeed: 60 }, // 216 kph
    // T5 Mirabeau Haute - Tight right downhill
    { id: 't5_mirabeau', name: 'Mirabeau Haute', startDistance: 1300, endDistance: 1400, type: 'corner_low_speed', difficulty: 0.8, maxSpeed: 22 }, // 80 kph
    // T6 Grand Hotel Hairpin - Slowest corner in F1
    { id: 't6_hairpin', name: 'Grand Hotel Hairpin', startDistance: 1400, endDistance: 1500, type: 'corner_low_speed', difficulty: 0.7, maxSpeed: 12 }, // 45 kph
    // T7 Mirabeau Bas - Right hander before tunnel
    { id: 't7_mirabeau_bas', name: 'Mirabeau Bas', startDistance: 1500, endDistance: 1600, type: 'corner_low_speed', difficulty: 0.7, maxSpeed: 25 }, // 90 kph
    // T8 Portier - Key exit for tunnel
    { id: 't8_portier', name: 'Portier', startDistance: 1600, endDistance: 1700, type: 'corner_low_speed', difficulty: 0.9, maxSpeed: 28 }, // 100 kph
    // Tunnel - Loud, fast, curved
    { id: 'tunnel', name: 'Tunnel', startDistance: 1700, endDistance: 2100, type: 'straight', difficulty: 0.4, maxSpeed: 80 }, // 288 kph
    // T10/11 Nouvelle Chicane - Heavy braking
    { id: 't10_chicane', name: 'Nouvelle Chicane', startDistance: 2100, endDistance: 2250, type: 'corner_low_speed', difficulty: 0.9, maxSpeed: 20 }, // 72 kph
    // Run to Tabac
    { id: 'tabac_app', name: 'Run to Tabac', startDistance: 2250, endDistance: 2400, type: 'straight', difficulty: 0.3, maxSpeed: 65 }, // 234 kph
    // T12 Tabac - Fast left
    { id: 't12_tabac', name: 'Tabac', startDistance: 2400, endDistance: 2500, type: 'corner_high_speed', difficulty: 0.95, maxSpeed: 48 }, // 172 kph
    // T13/14 Swimming Pool (Louis Chiron) - Fast chicane
    { id: 't13_pool_1', name: 'Swimming Pool 1', startDistance: 2500, endDistance: 2700, type: 'corner_high_speed', difficulty: 0.95, maxSpeed: 60 }, // 216 kph
    // T15/16 Swimming Pool 2 - Slower chicane
    { id: 't15_pool_2', name: 'Swimming Pool 2', startDistance: 2700, endDistance: 2900, type: 'corner_medium_speed', difficulty: 0.9, maxSpeed: 42 }, // 150 kph
    // T17 La Rascasse - Tight right around restaurant
    { id: 't17_rascasse', name: 'Rascasse', startDistance: 2900, endDistance: 3100, type: 'corner_low_speed', difficulty: 0.9, maxSpeed: 18 }, // 65 kph
    // T18 Anthony Noghes - Final corner
    { id: 't18_noghes', name: 'Anthony Noghes', startDistance: 3100, endDistance: 3250, type: 'corner_medium_speed', difficulty: 0.8, maxSpeed: 30 }, // 108 kph
    // Run to line
    { id: 'finish_line', name: 'Finish Line', startDistance: 3250, endDistance: 3337, type: 'straight', difficulty: 0.1, maxSpeed: 75 } // 270 kph
  ],
  drsZones: [
    {
      detectionDistance: 2800, // After Swimming Pool 2
      activationDistance: 50, // Start finish straight
      endDistance: 400
    }
  ],
  pitLane: {
    entryDistance: 3200, // Rascasse
    exitDistance: 200, // Sainte Devote
    speedLimit: 16.6, // 60 km/h
    stopTime: 23.0
  }
};
