import { create } from 'zustand';
import { SimulationEngine } from '../engine/simulation';
import { RaceState } from '../types';
import { DRIVERS, TRACKS } from '../data/initialData';

interface RaceStore {
  engine: SimulationEngine | null;
  raceState: RaceState | null;
  isPlaying: boolean;
  gameSpeed: number; // 1x, 2x, 5x, 10x
  
  // Actions
  initRace: () => void;
  startRace: () => void;
  pauseRace: () => void;
  setGameSpeed: (speed: number) => void;
  tick: (dt: number) => void;
  
  // Player Actions
  updateStrategy: (driverId: string, type: 'pace' | 'ers' | 'pit', value: any) => void;
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  engine: null,
  raceState: null,
  isPlaying: false,
  gameSpeed: 1,
  
  initRace: () => {
    const track = TRACKS[0];
    const drivers = DRIVERS;
    const seed = Date.now();
    const engine = new SimulationEngine(track, drivers, seed);
    
    set({
      engine,
      raceState: engine.getState(),
      isPlaying: false,
      gameSpeed: 1
    });
  },
  
  startRace: () => {
    const { engine } = get();
    if (engine) {
        engine.startRace();
        set({ isPlaying: true });
    }
  },
  
  pauseRace: () => set({ isPlaying: false }),
  
  setGameSpeed: (speed) => set({ gameSpeed: speed }),
  
  tick: (dt) => {
    const { engine, isPlaying, gameSpeed } = get();
    if (!engine || !isPlaying) return;
    
    // Limit max dt per step to 0.1s for stability
    const stepSize = 0.1;
    let timeToSimulate = dt * gameSpeed;
    
    // Safety cap to prevent spiral of death if tab was inactive
    if (timeToSimulate > 2.0) timeToSimulate = 2.0;
    
    while (timeToSimulate > 0) {
        const step = Math.min(timeToSimulate, stepSize);
        engine.update(step);
        timeToSimulate -= step;
    }
    
    // Force new object reference for React reactivity
    set({ raceState: { ...engine.getState() } });
  },
  
  updateStrategy: (driverId, type, value) => {
      const { engine } = get();
      if (engine) {
          engine.updateStrategy(driverId, type, value);
          set({ raceState: { ...engine.getState() } });
      }
  }
}));
