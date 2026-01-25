import { create } from 'zustand';
import { SimulationEngine } from '../engine/simulation';
import { RaceState } from '../types';
import { DRIVERS } from '../data/initialData';
import { TRACKS } from '../data/tracks';

interface RaceStore {
  engine: SimulationEngine | null;
  raceState: RaceState | null;
  isPlaying: boolean;
  gameSpeed: number; // 1x, 2x, 5x, 10x
  selectedTrackId: string;
  
  // Actions
  setTrack: (trackId: string) => void;
  initRace: () => void;
  startRace: () => void;
  pauseRace: () => void;
  setGameSpeed: (speed: number) => void;
  tick: (dt: number) => void;
  
  // Player Actions
  updateStrategy: (driverId: string, type: 'pace' | 'ers' | 'pit', value: any) => void;
  toggleWeatherMode: () => void;
  fetchRealWeather: () => Promise<void>;
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  engine: null,
  raceState: null,
  isPlaying: false,
  gameSpeed: 1,
  selectedTrackId: TRACKS[0].id,
  
  setTrack: (trackId) => set({ selectedTrackId: trackId }),

  initRace: () => {
    const { selectedTrackId } = get();
    const track = TRACKS.find(t => t.id === selectedTrackId) || TRACKS[0];
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
    const { engine, isPlaying, gameSpeed, fetchRealWeather, raceState } = get();
    if (!engine || !isPlaying) return;
    
    // Auto-fetch weather if in real mode (every 60s handled by simple timer check here?)
    // Actually, better to do it via a useEffect in component, or check elapsed time here.
    // Let's rely on component to call fetchRealWeather periodically for now, or add a timer.
    
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
  },

  toggleWeatherMode: () => {
      const { engine, raceState } = get();
      if (engine && raceState) {
          const newMode = raceState.weatherMode === 'simulation' ? 'real' : 'simulation';
          engine.setWeatherMode(newMode);
          set({ raceState: { ...engine.getState() } });
      }
  },

  fetchRealWeather: async () => {
      const { engine, selectedTrackId } = get();
      if (!engine) return;

      const track = TRACKS.find(t => t.id === selectedTrackId);
      if (!track || !track.location) return;

      try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${track.location.lat}&longitude=${track.location.long}&current=temperature_2m,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m`;
          const res = await fetch(url);
          const data = await res.json();
          
          if (data.current) {
              engine.setRealWeatherData({
                  cloudCover: data.current.cloud_cover,
                  windSpeed: data.current.wind_speed_10m,
                  windDirection: data.current.wind_direction_10m,
                  temp: data.current.temperature_2m,
                  precipitation: data.current.precipitation
              });
              // Force update
              set({ raceState: { ...engine.getState() } });
          }
      } catch (e) {
          console.error("Failed to fetch weather", e);
      }
  }
}));
