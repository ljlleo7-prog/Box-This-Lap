import { RaceState, Track, Driver } from '../types';
import { SeededRNG } from './rng';
import { WeatherSystem } from './systems/WeatherSystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { RaceLogicSystem } from './systems/RaceLogicSystem';
import { StrategySystem } from './systems/StrategySystem';

export class SimulationEngine {
  private state: RaceState;
  private track: Track;
  private drivers: Driver[];
  private driverMap: Map<string, Driver>;
  private rng: SeededRNG;

  // Sub-systems
  private weatherSystem: WeatherSystem;
  private physicsSystem: PhysicsSystem;
  private raceLogicSystem: RaceLogicSystem;
  private strategySystem: StrategySystem;

  constructor(track: Track, drivers: Driver[], seed: number) {
    this.track = track;
    this.drivers = drivers;
    this.driverMap = new Map(drivers.map(d => [d.id, d]));
    this.rng = new SeededRNG(seed);

    // Initialize Systems
    this.weatherSystem = new WeatherSystem(this.rng);
    this.physicsSystem = new PhysicsSystem(this.rng);
    this.raceLogicSystem = new RaceLogicSystem(this.rng);
    this.strategySystem = new StrategySystem();

    // Initialize State
    this.state = this.raceLogicSystem.initializeRace(track, drivers);
    
    // Ensure forecast is populated
    this.weatherSystem.initializeForecast(this.state, this.track);
  }

  public startRace(): void {
    this.state.status = 'racing';
  }

  public update(deltaTime: number): RaceState {
    if (this.state.status !== 'racing') return this.state;

    this.state.elapsedTime += deltaTime;

    // 1. Weather Update
    this.weatherSystem.update(this.state, this.track, deltaTime);

    // 2. Race Logic Update (Safety Car, Incidents, Pit Logic, Positions, Spatial)
    // Note: RaceLogic updates Pit Stops which moves cars in pit lane.
    // It also handles Overtaking attempts (speed modification).
    this.raceLogicSystem.updateRaceLogic(this.state, this.track, this.driverMap, deltaTime);

    // 3. Vehicle Physics & Strategy Update
    this.state.vehicles.forEach(vehicle => {
      const driver = this.driverMap.get(vehicle.driverId);
      if (!driver) return;

      // Strategy (AI decision to pit)
      this.strategySystem.updateStrategyAI(vehicle, this.state, this.track);

      // Physics (Movement, Grip, Speed, Fuel, Tyres)
      // Only update physics if NOT in pit (Pit logic handles movement in pit lane)
      // Wait, RaceLogicSystem handles pit stop movement.
      if (!vehicle.isInPit) {
          this.physicsSystem.updateVehiclePhysics(vehicle, driver, this.state, this.track, deltaTime);
      }
    });

    return { ...this.state };
  }

  public setRealWeatherData(data: { cloudCover: number; windSpeed: number; windDirection: number; temp: number; precipitation: number }): void {
      this.weatherSystem.setRealWeatherData(this.state, data);
  }
  
  public getState(): RaceState {
    return this.state;
  }
  
  public updateStrategy(driverId: string, type: string, value: any): void {
      const vehicle = this.state.vehicles.find(v => v.driverId === driverId);
      if (!vehicle) return;
      
      if (type === 'pace') vehicle.paceMode = value;
      if (type === 'ers') vehicle.ersMode = value;
      // Pit logic is handled via UI triggering state changes or AI
  }

  public setWeatherMode(mode: 'simulation' | 'real'): void {
      this.state.weatherMode = mode;
  }
}
