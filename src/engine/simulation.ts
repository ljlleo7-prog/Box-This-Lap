import { RaceState, Track, Driver, TeamSpecs, PreRaceSetup, TrackProfile } from '../types';
import { SeededRNG } from './rng';
import { WeatherSystem } from './systems/WeatherSystem';
import { IPhysicsSystem } from './systems/IPhysicsSystem';
import { PhysicsSystem2025 } from './systems/PhysicsSystem2025';
import { PhysicsSystem2026 } from './systems/PhysicsSystem2026';
import { RaceLogicSystem } from './systems/RaceLogicSystem';
import { StrategySystem } from './systems/StrategySystem';
import { buildTrackProfile } from './trackProfile';

const cloneRaceState = (state: RaceState): RaceState => JSON.parse(JSON.stringify(state));

export class SimulationEngine {
  private state: RaceState;
  private track: Track;
  private trackProfile: TrackProfile;
  private drivers: Driver[];
  private driverMap: Map<string, Driver>;
  private rng: SeededRNG;
  private teamSpecsByTeam: Record<string, TeamSpecs>;

  // Sub-systems
  private weatherSystem: WeatherSystem;
  private physicsSystem: IPhysicsSystem;
  private raceLogicSystem: RaceLogicSystem;
  private strategySystem: StrategySystem;

  constructor(track: Track, drivers: Driver[], seed: number, teamSpecsByTeam: Record<string, TeamSpecs> = {}, ruleset: '2025' | '2026' = '2025') {
    this.track = track;
    this.trackProfile = buildTrackProfile(track);
    this.drivers = drivers;
    this.driverMap = new Map(drivers.map(d => [d.id, d]));
    this.rng = new SeededRNG(seed);
    this.teamSpecsByTeam = teamSpecsByTeam;

    // Initialize Systems
    this.weatherSystem = new WeatherSystem(this.rng);
    this.physicsSystem = ruleset === '2026' ? new PhysicsSystem2026(this.rng) : new PhysicsSystem2025(this.rng);
    this.raceLogicSystem = new RaceLogicSystem(this.rng);
    this.strategySystem = new StrategySystem(this.rng);

    // Initialize State
    this.state = this.raceLogicSystem.initializeRace(track, drivers, this.strategySystem);
    
    // Ensure forecast is populated
    this.weatherSystem.initializeForecast(this.state, this.track);
  }

  public startRace(): void {
    this.state.status = 'racing';
  }

  public applyPreRaceSetup(setups: Record<string, PreRaceSetup>): void {
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

      if (setup.powerUnitPhilosophy) {
        vehicle.powerUnitPhilosophy = setup.powerUnitPhilosophy;
      }

      if (setup.batteryAllocationMode) {
        vehicle.batteryAllocationMode = setup.batteryAllocationMode;
      }

      if (setup.activeAeroMode) {
        vehicle.activeAeroMode = setup.activeAeroMode;
      }

      if (setup.frontWingAngle !== undefined) vehicle.frontWingAngle = setup.frontWingAngle;
      if (setup.rearWingAngle !== undefined) vehicle.rearWingAngle = setup.rearWingAngle;
      if (setup.rideHeight !== undefined) vehicle.rideHeight = setup.rideHeight;
      if (setup.suspensionStiffness !== undefined) vehicle.suspensionStiffness = setup.suspensionStiffness;
      if (setup.toeOut !== undefined) vehicle.toeOut = setup.toeOut;
      if (setup.camber !== undefined) vehicle.camber = setup.camber;
      if (setup.gearboxSetting !== undefined) vehicle.gearboxSetting = setup.gearboxSetting;

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

      vehicle.usedDryCompounds = ['soft', 'medium', 'hard'].includes(vehicle.tyreCompound)
        ? [vehicle.tyreCompound as 'soft' | 'medium' | 'hard']
        : [];
      vehicle.mandatoryDryCompoundsSatisfied = vehicle.usedDryCompounds.length >= 2;
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
          this.physicsSystem.updateVehiclePhysics(vehicle, driver, this.state, this.track, this.trackProfile, deltaTime, teamSpecs);
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

  public replaceState(nextState: RaceState): void {
    this.state = cloneRaceState(nextState);
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
