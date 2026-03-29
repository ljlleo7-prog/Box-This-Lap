
import { RaceLogicSystem } from '../engine/systems/RaceLogicSystem';
import { StrategySystem } from '../engine/systems/StrategySystem';
import { SeededRNG } from '../engine/rng';
import { RaceState, Track, Driver } from '../types';

// Mock Track
const mockTrack: Track = {
    id: 'test-track',
    name: 'Test Track',
    totalDistance: 5000,
    totalLaps: 50,
    tireDegradationFactor: 1.0,
    sectors: [
        { id: 's1', startDistance: 0, endDistance: 1600, type: 'straight', difficulty: 0.1 },
        { id: 's2', startDistance: 1600, endDistance: 3300, type: 'corner_high_speed', difficulty: 0.3 },
        { id: 's3', startDistance: 3300, endDistance: 5000, type: 'corner_low_speed', difficulty: 0.4 }
    ],
    pitLane: {
        entryDistance: 4800,
        exitDistance: 200,
        speedLimit: 22.2,
        stopTime: 20
    },
    baseTemperature: 25,
    trackDifficulty: 0.5,
    overtakingDifficulty: 0.5,
    drsZones: [],
    weatherChance: { rainChance: 0, rainIntensity: 'light' }
};

// Mock Drivers
const drivers = new Map<string, Driver>();
const d1: Driver = { 
    id: 'd1', name: 'Driver 1', team: 't1', color: '#ff0000', basePace: 80, 
    skill: { racecraft: 80, consistency: 90, wetWeather: 80, tyreManagement: 80 }, 
    performance: { corneringHigh: 80, corneringMedium: 80, corneringLow: 80, straight: 80, temperatureAdaptability: 80 },
    personality: { aggression: 50, stressResistance: 50, teamPlayer: 50 }, 
    morale: 80, trust: 80, learning: 80
};
const d2: Driver = { 
    id: 'd2', name: 'Driver 2', team: 't2', color: '#0000ff', basePace: 81, 
    skill: { racecraft: 80, consistency: 80, wetWeather: 80, tyreManagement: 80 }, 
    performance: { corneringHigh: 80, corneringMedium: 80, corneringLow: 80, straight: 80, temperatureAdaptability: 80 },
    personality: { aggression: 50, stressResistance: 50, teamPlayer: 50 }, 
    morale: 80, trust: 80, learning: 80
};
drivers.set('d1', d1);
drivers.set('d2', d2);

// Setup System
const rng = new SeededRNG(12345);
const strategySystem = new StrategySystem(rng);
const raceLogic = new RaceLogicSystem(rng);

// Mock State
const state: RaceState = raceLogic.initializeRace(mockTrack, [d1, d2], strategySystem);

// Setup Scenario: Red Flag about to restart
state.status = 'racing';
state.safetyCar = 'red-flag';
// internal safetyCarTimer is 0, so next update will trigger restart

// Setup Vehicles
// Vehicle 1: The DNF causer (Crashed at 2000m)
state.vehicles[0].damage = 100;
state.vehicles[0].distanceOnLap = 2000;
state.vehicles[0].speed = 0;
state.vehicles[0].hasFinished = false;
state.vehicles[0].isInPit = false;

// Vehicle 2: Active driver (At 3000m)
state.vehicles[1].damage = 0;
state.vehicles[1].distanceOnLap = 3000;
state.vehicles[1].speed = 100;

console.log('--- PRE-RESTART ---');
console.log(`Vehicle 1 (DNF): Dist=${state.vehicles[0].distanceOnLap}, Damage=${state.vehicles[0].damage}, InPit=${state.vehicles[0].isInPit}`);
console.log(`Vehicle 2 (Active): Dist=${state.vehicles[1].distanceOnLap}`);

// Run Update (dt = 1.0s)
// This should trigger performRedFlagRestart
raceLogic.updateRaceLogic(state, mockTrack, drivers, 1.0, strategySystem);

console.log('\n--- POST-RESTART ---');
console.log(`Vehicle 1 (DNF): Dist=${state.vehicles[0].distanceOnLap}, Damage=${state.vehicles[0].damage}, InPit=${state.vehicles[0].isInPit}`);
console.log(`Vehicle 2 (Active): Dist=${state.vehicles[1].distanceOnLap}`);

// Verification
const vDNF = state.vehicles.find(v => v.id === 'd1');
const vActive = state.vehicles.find(v => v.id === 'd2');
const expectedPos = mockTrack.pitLane?.entryDistance;

if (vDNF && vDNF.distanceOnLap === expectedPos && vDNF.isInPit) {
    console.log(`\n✅ TEST PASSED: DNF vehicle (${vDNF.id}) moved to pit entry (${vDNF.distanceOnLap}).`);
} else {
    console.log(`\n❌ TEST FAILED: DNF vehicle (${vDNF?.id}) at ${vDNF?.distanceOnLap}, expected ${expectedPos}. InPit: ${vDNF?.isInPit}`);
}

if (vActive && vActive.distanceOnLap !== expectedPos && !vActive.isInPit) {
    console.log(`✅ TEST PASSED: Active vehicle (${vActive.id}) is on track (${vActive.distanceOnLap}).`);
} else {
    console.log(`❌ TEST FAILED: Active vehicle (${vActive?.id}) state incorrect.`);
}
