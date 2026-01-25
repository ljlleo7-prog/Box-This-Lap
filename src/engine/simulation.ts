import { RaceState, VehicleState, Track, Driver } from '../types';
import { SeededRNG } from './rng';

export class SimulationEngine {
  private state: RaceState;
  private track: Track;
  private drivers: Driver[];
  private rng: SeededRNG;
  
  constructor(track: Track, drivers: Driver[], seed: number) {
    this.track = track;
    this.drivers = drivers;
    this.rng = new SeededRNG(seed);
    this.state = this.initializeRace(track, drivers);
  }

  private initializeRace(track: Track, drivers: Driver[]): RaceState {
    const vehicles: VehicleState[] = drivers.map((driver, index) => {
      // Grid positioning: 8m gap between cars, starting before finish line
      // P1 is closest to finish line
      const startDistance = track.totalDistance - ((index + 1) * 10); 
      
      return {
        id: driver.id,
        driverId: driver.id,
        distanceOnLap: startDistance,
        totalDistance: startDistance - track.totalDistance, // Negative distance for start grid
        speed: 0,
        acceleration: 0,
        lapCount: 0,
        currentSector: 3, // Start in last sector
        isInPit: false,
        pitStopCount: 0,
        
        tyreCompound: 'medium',
        tyreWear: 0,
        tyreAgeLaps: 0,
        fuelLoad: 100, // kg
        ersLevel: 100,
        ersMode: 'balanced',
        paceMode: 'balanced',
        
        damage: 0,
        stress: 0,
        
        currentLapTime: 0,
        lastLapTime: 0,
        bestLapTime: 0,
        gapToLeader: 0,
        gapToAhead: 0,
        position: index + 1,
      };
    });

    return {
      id: `race-${Date.now()}`,
      trackId: track.id,
      currentLap: 1,
      totalLaps: 50, // Default 50 laps
      weather: 'dry',
      trackTemp: 25,
      airTemp: 20,
      rubberLevel: 50,
      safetyCar: 'none',
      vehicles,
      status: 'pre-race',
      elapsedTime: 0,
    };
  }

  public startRace(): void {
    this.state.status = 'racing';
  }

  public update(deltaTime: number): RaceState {
    if (this.state.status !== 'racing') return this.state;

    this.state.elapsedTime += deltaTime;

    // Update each vehicle
    this.state.vehicles.forEach(vehicle => {
      this.updateVehicle(vehicle, deltaTime);
    });

    // Sort positions
    this.updatePositions();
    
    // Check race finish
    if (this.state.vehicles.every(v => v.lapCount > this.state.totalLaps)) {
      this.state.status = 'finished';
    }

    return { ...this.state };
  }

  private updateVehicle(vehicle: VehicleState, dt: number): void {
    const driver = this.drivers.find(d => d.id === vehicle.driverId);
    if (!driver) return;

    // 1. Calculate Target Speed
    let targetSpeed = this.calculateTargetSpeed(vehicle, driver);
    
    // 2. Apply Acceleration
    // Simple approach: move towards target speed
    const accelRate = 15; // m/s^2 (F1 cars accelerate fast)
    const brakeRate = 30; // m/s^2
    
    if (vehicle.speed < targetSpeed) {
      vehicle.speed += accelRate * dt;
      if (vehicle.speed > targetSpeed) vehicle.speed = targetSpeed;
    } else {
      vehicle.speed -= brakeRate * dt; // Braking
      if (vehicle.speed < targetSpeed) vehicle.speed = targetSpeed;
    }

    // 3. Update Distance
    const distDelta = vehicle.speed * dt;
    vehicle.distanceOnLap += distDelta;
    vehicle.totalDistance += distDelta;
    vehicle.currentLapTime += dt;

    // 4. Lap Logic
    if (vehicle.distanceOnLap >= this.track.totalDistance) {
      vehicle.distanceOnLap -= this.track.totalDistance;
      vehicle.lapCount++;
      vehicle.lastLapTime = vehicle.currentLapTime;
      vehicle.currentLapTime = 0;
      vehicle.tyreAgeLaps++;
      
      if (vehicle.lastLapTime < vehicle.bestLapTime || vehicle.bestLapTime === 0) {
        vehicle.bestLapTime = vehicle.lastLapTime;
      }
      
      // Update race current lap to leader's lap
      if (vehicle.position === 1) {
        this.state.currentLap = vehicle.lapCount;
      }
    }
    
    // 5. Update Sector
    const currentSectorIndex = this.track.sectors.findIndex(
      s => vehicle.distanceOnLap >= s.startDistance && vehicle.distanceOnLap < s.endDistance
    );
    if (currentSectorIndex !== -1) {
      vehicle.currentSector = currentSectorIndex + 1;
    }

    // 6. Resource Consumption
    this.updateResources(vehicle, dt);
  }

  private calculateTargetSpeed(vehicle: VehicleState, driver: Driver): number {
    // Base speed from pace (seconds per lap -> m/s)
    // Avg speed = totalDistance / basePace
    const avgSpeed = this.track.totalDistance / driver.basePace;
    
    let speed = avgSpeed;

    // Multipliers
    // Tyre Wear: 0-100. 100% wear = significant slow down
    // Quadratic degradation: wear^2 impact
    // 100% wear = 5% slower (approx 4.5s lost per lap)
    const wearFactor = Math.pow(vehicle.tyreWear / 100, 2); 
    speed *= (1 - (wearFactor * 0.05));

    // Fuel: lighter is faster
    // 100kg -> 0kg. 0.3s per 10kg => 3s per 100kg.
    // 3s/90s = 3.3%
    const fuelPenalty = (vehicle.fuelLoad / 100) * 0.033;
    speed *= (1 - fuelPenalty);

    // Modes
    if (vehicle.paceMode === 'aggressive') speed *= 1.015; // 1.5% faster
    if (vehicle.paceMode === 'conservative') speed *= 0.985; // 1.5% slower
    
    if (vehicle.ersMode === 'deploy') speed *= 1.02; // 2% boost
    if (vehicle.ersMode === 'harvest') speed *= 0.98; // 2% drag

    // Driver Consistency & Skill
    const consistencyFactor = (driver.skill.consistency / 100);
    // Lower consistency = more random variance
    const varianceRange = 0.02 * (1 - consistencyFactor + 0.1); // 0.2% to 2.2% variance
    const noise = this.rng.range(-varianceRange, varianceRange);
    speed *= (1 + noise);

    return speed;
  }
  
  private updateResources(vehicle: VehicleState, dt: number): void {
    // Tyre wear
    // Base wear per second
    // Softs wear faster than hards.
    let baseWearRate = 0.05; // % per second
    
    switch(vehicle.tyreCompound) {
        case 'soft': baseWearRate = 0.08; break;
        case 'medium': baseWearRate = 0.05; break;
        case 'hard': baseWearRate = 0.03; break;
        case 'wet': baseWearRate = 0.04; break;
    }

    if (vehicle.paceMode === 'aggressive') baseWearRate *= 1.3;
    if (vehicle.paceMode === 'conservative') baseWearRate *= 0.7;
    
    vehicle.tyreWear += baseWearRate * dt;
    if (vehicle.tyreWear > 100) vehicle.tyreWear = 100;

    // Fuel burn
    // 1.5kg per lap -> 1.5/90 per sec = 0.016 kg/s
    let burnRate = 0.016;
    if (vehicle.paceMode === 'aggressive') burnRate *= 1.2;
    if (vehicle.paceMode === 'conservative') burnRate *= 0.8;

    vehicle.fuelLoad -= burnRate * dt;
    if (vehicle.fuelLoad < 0) vehicle.fuelLoad = 0;
    
    // ERS
    if (vehicle.ersMode === 'deploy') {
        vehicle.ersLevel -= 2.0 * dt; // Drain 2% per sec
    } else if (vehicle.ersMode === 'harvest') {
        vehicle.ersLevel += 1.5 * dt; // Charge 1.5% per sec
    } else {
        vehicle.ersLevel += 0.1 * dt; // Passive charge
    }
    // Clamp ERS
    if (vehicle.ersLevel < 0) {
        vehicle.ersLevel = 0;
        vehicle.ersMode = 'balanced'; // Force balanced if empty
    }
    if (vehicle.ersLevel > 100) vehicle.ersLevel = 100;
  }

  private updatePositions(): void {
    // Sort by totalDistance desc
    const sorted = [...this.state.vehicles].sort((a, b) => b.totalDistance - a.totalDistance);
    
    sorted.forEach((v, index) => {
      v.position = index + 1;
      
      // Calculate gaps
      if (index === 0) {
        v.gapToLeader = 0;
        v.gapToAhead = 0;
      } else {
        const leader = sorted[0];
        const ahead = sorted[index - 1];
        
        // Gap = distance diff / speed
        const speed = v.speed > 1 ? v.speed : 1; // Avoid divide by zero
        v.gapToLeader = (leader.totalDistance - v.totalDistance) / speed;
        v.gapToAhead = (ahead.totalDistance - v.totalDistance) / speed;
      }
    });
  }
  
  public getState(): RaceState {
    return this.state;
  }
  
  public updateStrategy(driverId: string, type: string, value: any): void {
      const vehicle = this.state.vehicles.find(v => v.driverId === driverId);
      if (!vehicle) return;
      
      if (type === 'pace') vehicle.paceMode = value;
      if (type === 'ers') vehicle.ersMode = value;
      // TODO: Pit logic
  }
}
