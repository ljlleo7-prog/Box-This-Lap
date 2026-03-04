import { RaceState, Track, Driver, TeamSpecs, TyreCompound, StrategyStint } from '../types';
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
  private teamSpecsByTeam: Record<string, TeamSpecs>;

  // Sub-systems
  private weatherSystem: WeatherSystem;
  private physicsSystem: PhysicsSystem;
  private raceLogicSystem: RaceLogicSystem;
  private strategySystem: StrategySystem;

  constructor(track: Track, drivers: Driver[], seed: number, teamSpecsByTeam: Record<string, TeamSpecs> = {}) {
    this.track = track;
    this.drivers = drivers;
    this.driverMap = new Map(drivers.map(d => [d.id, d]));
    this.rng = new SeededRNG(seed);
    this.teamSpecsByTeam = teamSpecsByTeam;

    // Initialize Systems
    this.weatherSystem = new WeatherSystem(this.rng);
    this.physicsSystem = new PhysicsSystem(this.rng);
    this.raceLogicSystem = new RaceLogicSystem(this.rng);
    this.strategySystem = new StrategySystem();

    // Initialize State
    this.state = this.raceLogicSystem.initializeRace(track, drivers, this.strategySystem);
    
    // Ensure forecast is populated
    this.weatherSystem.initializeForecast(this.state, this.track);
  }

  public startRace(): void {
    this.state.status = 'racing';
  }

  public applyPreRaceSetup(setups: Record<string, { tyreCompound?: TyreCompound; fuelLoad?: number; pitWindowStart?: number; pitWindowEnd?: number; stints?: StrategyStint[] }>): void {
    this.state.vehicles.forEach(vehicle => {
      const setup = setups[vehicle.driverId];
      if (!setup) return;

      if (setup.tyreCompound) {
        vehicle.tyreCompound = setup.tyreCompound;
      }

      if (typeof setup.fuelLoad === 'number') {
        vehicle.fuelLoad = Math.max(0, setup.fuelLoad);
      }

      if (typeof setup.pitWindowStart === 'number' && typeof setup.pitWindowEnd === 'number') {
        vehicle.pitWindowStart = setup.pitWindowStart;
        vehicle.pitWindowEnd = setup.pitWindowEnd;
      } else {
        vehicle.pitWindowStart = undefined;
        vehicle.pitWindowEnd = undefined;
      }

      if (setup.stints && setup.stints.length > 0) {
        const stints = setup.stints.map(stint => ({ ...stint }));
        vehicle.strategyPlan = {
          stints,
          currentStintIndex: 0
        };
        vehicle.tyreCompound = stints[0].compound;
      } else if (setup.tyreCompound && vehicle.strategyPlan?.stints?.length) {
        vehicle.strategyPlan.stints[0].compound = setup.tyreCompound;
      }
    });
  }

  public update(deltaTime: number): RaceState {
    if (this.state.status !== 'racing') return this.state;

    this.state.elapsedTime += deltaTime;

    // 1. Weather Update
    this.weatherSystem.update(this.state, this.track, deltaTime);

    // 2. Race Logic Update (Safety Car, Incidents, Pit Logic, Positions, Spatial)
    // Note: RaceLogic updates Pit Stops which moves cars in pit lane.
    // It also handles Overtaking attempts (speed modification).
    this.raceLogicSystem.updateRaceLogic(this.state, this.track, this.driverMap, deltaTime, this.strategySystem, this.teamSpecsByTeam);

    // 3. Vehicle Physics & Strategy Update
    this.state.vehicles.forEach(vehicle => {
      const driver = this.driverMap.get(vehicle.driverId);
      if (!driver) return;

      // Strategy (AI decision to pit)
      this.strategySystem.updateStrategyAI(vehicle, this.state, this.track, driver);

      // Physics (Movement, Grip, Speed, Fuel, Tyres)
      // Only update physics if NOT in pit (Pit logic handles movement in pit lane)
      // Wait, RaceLogicSystem handles pit stop movement.
      if (!vehicle.isInPit) {
          const teamSpecs = this.teamSpecsByTeam[driver.team];
          this.physicsSystem.updateVehiclePhysics(vehicle, driver, this.state, this.track, deltaTime, teamSpecs);
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
      if (type === 'line') vehicle.lineMode = value;
      if (type === 'pit') vehicle.boxThisLap = Boolean(value);
  }

  public setWeatherMode(mode: 'simulation' | 'real'): void {
      this.state.weatherMode = mode;
  }
}
