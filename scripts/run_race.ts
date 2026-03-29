import { SimulationEngine } from '../src/engine/simulation';
import { SILVERSTONE } from '../src/data/tracks/silverstone';
import { DRIVERS } from '../src/data/initialData';
import { PreRaceSetup, Track } from '../src/types';

const main = () => {
  // Setup the grid
  const drivers = DRIVERS.map((d, index) => ({
    ...d,
    startingPosition: index + 1
  }));

  // Create initial setups (everyone on softs for a quick test)
  const setups: Record<string, PreRaceSetup> = {};
  for (const d of drivers) {
    setups[d.id] = {
      tyreCompound: 'soft',
      fuelLoad: 100,
      paceMode: 'balanced',
      ersMode: 'balanced',
      brakeBias: 50,
      wingSetup: 50,
      powerUnitPhilosophy: 'balanced',
      batteryAllocationMode: 'balanced',
      activeAeroMode: 'balanced'
    };
  }

  console.log("Initializing Race at Silverstone...");
  // Pass ruleset '2025'
  const engine = new SimulationEngine(SILVERSTONE, drivers, 42, {}, '2025');
  
  // Apply setups
  engine.applyPreRaceSetup(setups);

  // Start the race
  console.log("Lights out and away we go!");
  engine.startRace();

  let state = engine.getState();
  const dt = 0.1; // 10Hz simulation
  let simulatedTime = 0;
  let lastPrintedLap = 0;

  // Run until finished or timeout (2 hours max)
  const maxSimTime = 7200; 

  while (state.status !== 'finished' && simulatedTime < maxSimTime) {
    engine.update(dt);
    state = engine.getState();
    simulatedTime += dt;

    if (state.currentLap > lastPrintedLap) {
      lastPrintedLap = state.currentLap;
      console.log(`\n--- Lap ${lastPrintedLap} / ${state.totalLaps} ---`);
      
      // Print top 5
      const sorted = [...state.vehicles].sort((a, b) => a.position - b.position);
      for (let i = 0; i < 5 && i < sorted.length; i++) {
        const v = sorted[i];
        const driver = drivers.find(d => d.id === v.driverId)?.name;
        console.log(`P${v.position}: ${driver} (Gap: ${v.gapToLeader.toFixed(2)}s) - Tyres: ${v.tyreWear.toFixed(1)}%`);
      }
    }
  }

  console.log("\n🏁 RACE FINISHED 🏁");
  const finalResults = [...state.vehicles].sort((a, b) => a.position - b.position);
  finalResults.forEach(v => {
    const driver = drivers.find(d => d.id === v.driverId)?.name;
    const statusStr = v.status === 'retired' ? 'RETIRED' : `+${v.gapToLeader.toFixed(2)}s`;
    console.log(`P${v.position} - ${driver} - ${statusStr}`);
  });
};

main();