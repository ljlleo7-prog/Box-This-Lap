import { Track, VehicleState, RaceState, Driver, TyreCompound } from '../types';
import { RaceLogicSystem } from '../engine/systems/RaceLogicSystem';
import { PhysicsSystem } from '../engine/systems/PhysicsSystem';
import { StrategySystem } from '../engine/systems/StrategySystem';
import { SeededRNG } from '../engine/rng';
import { SILVERSTONE as silverstone } from '../data/tracks/silverstone';

// MOCK SETUP
const mockTrack: Track = silverstone;
const rng = new SeededRNG(12345);

// Mock Strategy System (minimal)
const mockStrategySystem = new StrategySystem();

// Create Systems
const raceLogic = new RaceLogicSystem(rng);
const physicsSystem = new PhysicsSystem(rng);

// Mock Drivers
const drivers = new Map<string, Driver>();
drivers.set('test_driver', {
    id: 'test_driver',
    name: 'Lando Norris',
    team: 'mclaren',
    color: '#FF8000',
    basePace: 0,
    skill: { racecraft: 90, consistency: 90, tyreManagement: 90, wetWeather: 90 },
    performance: { corneringHigh: 90, corneringMedium: 90, corneringLow: 90, straight: 90, temperatureAdaptability: 90 },
    personality: { aggression: 90, stressResistance: 90, teamPlayer: 90 },
    morale: 100,
    trust: 100
});
drivers.set('test_driver_2', {
    id: 'test_driver_2',
    name: 'Max Verstappen',
    team: 'redbull',
    color: '#0000FF',
    basePace: 0,
    skill: { racecraft: 90, consistency: 90, tyreManagement: 90, wetWeather: 90 },
    performance: { corneringHigh: 90, corneringMedium: 90, corneringLow: 90, straight: 90, temperatureAdaptability: 90 },
    personality: { aggression: 90, stressResistance: 90, teamPlayer: 90 },
    morale: 100,
    trust: 100
});

// INITIAL STATE
// Pit Entry at 5700.
// Car 1 (Pit) at 5650 (Approaching entry).
// Car 2 (Track) at 5620 (0.5s behind approx).
const mockCarPit: VehicleState = {
    id: 'car_pit',
    driverId: 'test_driver',
    distanceOnLap: 5650,
    totalDistance: 5650 + 5891, // Lap 1 done
    speed: 80, // m/s
    acceleration: 0,
    lapCount: 1,
    currentSector: 3,
    isInPit: false,
    pitStopCount: 0,
    boxThisLap: true, // Requested pit
    
    tyreCompound: 'medium' as TyreCompound,
    tyreWear: 80,
    tyreAgeLaps: 10,
    fuelLoad: 10,
    ersLevel: 100,
    ersMode: 'balanced',
    paceMode: 'balanced',
    condition: 1.0,
    damage: 0,
    stress: 0,
    morale: 100,
    concentration: 100,
    drsOpen: false,
    inDirtyAir: false,
    isBattling: false,
    blueFlag: false,
    currentLapTime: 80,
    lastLapTime: 90,
    bestLapTime: 90,
    gapToLeader: 0,
    gapToAhead: 0,
    position: 1,
    lastPosition: 1,
    hasFinished: false,
    strategyPlan: { stints: [], currentStintIndex: 0 },
    telemetry: { currentLapSpeedTrace: [], lastLapSpeedTrace: [] }
};

const mockCarTrack: VehicleState = {
    ...mockCarPit,
    id: 'car_track',
    driverId: 'test_driver_2',
    distanceOnLap: 5620, // 30m behind
    totalDistance: 5620 + 5891,
    boxThisLap: false,
    position: 2,
    lastPosition: 2,
    telemetry: { currentLapSpeedTrace: [], lastLapSpeedTrace: [] }
};

const mockState: RaceState = {
    id: 'test_race',
    trackId: 'silverstone',
    currentLap: 2,
    totalLaps: 52,
    status: 'racing',
    weather: 'dry',
    weatherMode: 'simulation',
    weatherForecast: [],
    cloudCover: 0,
    rainIntensityLevel: 0,
    windSpeed: 0,
    windDirection: 0,
    trackTemp: 30,
    airTemp: 20,
    rubberLevel: 50,
    sectorConditions: [],
    sectorFlags: [],
    trackWaterDepth: 0,
    safetyCar: 'none',
    // redFlag: false, 
    checkeredFlag: false,
    winnerId: null,
    vehicles: [mockCarPit, mockCarTrack],
    elapsedTime: 0
};

// SIMULATION LOOP
const dt = 0.1;
const simDuration = 60.0; // Run for 60s
let time = 0;

console.log(`Starting Simulation. Track Length: ${mockTrack.totalDistance}`);
console.log(`Pit Car Start: ${mockCarPit.distanceOnLap}`);
console.log(`Track Car Start: ${mockCarTrack.distanceOnLap}`);

while (time < simDuration) {
    // Update Logic (Pit entry/exit, lap counting)
    raceLogic.updateRaceLogic(mockState, mockTrack, drivers, dt, mockStrategySystem);
    
    // Update Physics (Speed, Distance)
    // Note: We need a minimal physics update since we aren't running the full engine loop
    // Manually move cars if not handled by Logic (Logic only handles Pit movement mostly)
    
    mockState.vehicles.forEach(v => {
        if (!v.isInPit) {
            // Check Pit Entry Logic (Mimics PhysicsSystem)
            if (v.boxThisLap && mockTrack.pitLane) {
                const entryDist = mockTrack.pitLane.entryDistance;
                // Check if we are in the entry window
                if (v.distanceOnLap >= entryDist && v.distanceOnLap < (entryDist + 50)) {
                    v.isInPit = true;
                    console.log(`Car ${v.id} ENTERED PIT at ${v.distanceOnLap.toFixed(1)}m`);
                    return; // Skip physics, RaceLogic handles it next frame
                }
            }

            // Simple physics: Constant speed for test
            v.speed = 80; // Keep high speed
            const dist = v.speed * dt;
            v.distanceOnLap += dist;
            v.totalDistance += dist;
            
            // Wrap
            if (v.distanceOnLap >= mockTrack.totalDistance) {
                v.distanceOnLap -= mockTrack.totalDistance;
                v.lapCount++;
            }
        }
    });

    time += dt;

    // Stop if Pit Car has finished pit stop and traveled some distance
    if (mockCarPit.pitStopCount > 0 && !mockCarPit.isInPit && mockCarPit.distanceOnLap > 600) {
        // break;
    }
}

console.log("--- RESULT ---");
console.log(`Pit Car Dist: ${mockCarPit.totalDistance.toFixed(1)}`);
console.log(`Track Car Dist: ${mockCarTrack.totalDistance.toFixed(1)}`);
const gap = mockCarPit.totalDistance - mockCarTrack.totalDistance;
console.log(`Final Gap (Pit - Track): ${gap.toFixed(1)}m`);
console.log(`Gap Analysis: ${gap < -1000 ? "SUCCESS (Big Loss)" : "FAIL (Small Loss)"}`);

if (gap > -500) {
    console.error("FAILURE: Pit car did not lose enough time!");
    process.exit(1);
} else {
    console.log("SUCCESS: Pit car lost significant distance/time.");
}
