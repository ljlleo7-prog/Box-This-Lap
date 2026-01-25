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
      // Grid positioning: Randomized start grid with slight variance
      // Base gap 16m (approx 0.2s at start), plus random noise to simulate imperfect grid line-up
      const baseGap = 16;
      const noise = this.rng.range(-1.0, 1.0); // +/- 1m variance
      const startDistance = track.totalDistance - ((index + 1) * baseGap) + noise; 
      
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
        drsOpen: false,
        inDirtyAir: false,
        isBattling: false,
        
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

    // Update DRS status
    this.updateDRS(vehicle);

    // Update Dirty Air Status
    this.updateDirtyAir(vehicle);

    // Update Battling Status
    this.updateBattling(vehicle);

    // Overtake Logic (Probability Check)
    this.attemptOvertake(vehicle);

    // 6. Resource Consumption
    this.updateResources(vehicle, dt);
  }

  private attemptOvertake(attacker: VehicleState): void {
      // Only attempt if battling and not already ahead
      // We need to find the defender (car directly ahead)
      if (!attacker.isBattling || attacker.position === 1) return;

      const defender = this.state.vehicles.find(v => v.position === attacker.position - 1);
      if (!defender) return;

      // Overtake probability check
      // 1. Skill difference (Racecraft)
      const attackerDriver = this.drivers.find(d => d.id === attacker.driverId);
      const defenderDriver = this.drivers.find(d => d.id === defender.driverId);
      if (!attackerDriver || !defenderDriver) return;

      const skillDelta = attackerDriver.skill.racecraft - defenderDriver.skill.racecraft; // e.g., 90 - 80 = 10
      
      // 2. Pace delta (Speed difference)
      const speedDelta = attacker.speed - defender.speed; // m/s
      
      // 3. DRS Advantage
      const drsBonus = attacker.drsOpen ? 30 : 0; // +30% chance if DRS open

      // 4. Tyre delta (Age difference)
      const tyreDelta = defender.tyreAgeLaps - attacker.tyreAgeLaps; // Positive if defender has older tyres

      // Base chance: 0% (hard to pass)
      // We check this every tick, so probability must be VERY low per tick.
      // Better: Check only when gap is closing and very small (< 0.2s)
      if (attacker.gapToAhead > 0.2) return;

      // Calculate "Overtake Score" (0-100)
      let score = 20; // Base difficulty
      score += skillDelta * 0.5; // +5% for 10 skill diff
      score += speedDelta * 2; // +2% per m/s speed advantage
      score += drsBonus;
      score += tyreDelta * 1.5;

      // Rookie Chance Floor (Randomness)
      // Even if score is low, always 30% random chance factor
      // We mix calculated score (70% weight) with pure luck (30% weight)
      // Actually, user asked for "rookie still stands a 30% chance".
      // This implies that even if skill diff is huge, there's a 30% variance.
      // Let's implement this as a clamped probability range.
      // Min chance 5%, Max chance 95%.
      // But we need to be careful not to make overtakes happen instantly every frame.
      // This function runs 60 times a second? No, tick rate.
      // Let's add a "cooldown" or only check continuously with low prob.
      
      // Simplified: Probability per second of overtaking when side-by-side
      // Base prob per second = 0.5 (50% chance to pass per second of battling)
      // Adjusted by score.
      
      let probPerSecond = 0.2; // 20% base
      probPerSecond += (score / 100) * 0.5; // Add up to 50% from score
      
      // Apply Rookie/Randomness factor
      // We roll a die. If it lands in the "random upset" range, we flip the outcome?
      // Or simply, we clamp the probability.
      // "Rookie stands 30% chance" -> Even with huge disadvantage, 30% chance to win the duel.
      // In this context (attacker passing defender), if attacker is rookie (low skill) vs pro (high skill):
      // Score will be negative from skillDelta.
      // But we want to ensure prob doesn't drop to 0.
      
      // Let's normalize score to 0-1 probability
      let successProb = Math.max(0.05, Math.min(0.95, probPerSecond));
      
      // Apply 30% "Anything can happen" noise
      // 30% of the time, we ignore the skill/stats and flip a coin (50/50)
      if (this.rng.chance(0.3)) {
          successProb = 0.5; 
      }

      // Check for pass
      // We need to scale prob by dt? No, `rng.chance` is one-shot.
      // We need to convert probPerSecond to probPerFrame.
      // P_frame = 1 - (1 - P_sec)^dt
      // Approximation for small P: P_frame = P_sec * dt
      const dt = 0.1; // roughly, or pass it in.
      // simulation.ts update calls this, but doesn't pass dt to private method easily unless we change sig.
      // Let's assume dt ~ 0.1s (100ms tick) or pass it.
      // Update signature has dt. Let's update `attemptOvertake` to take dt.
      
      // Actually, simpler: just swap positions if successful.
      // But physically we swap distance? 
      // In this engine, position is derived from distance. 
      // To "overtake", we just need to have more distance.
      // The physics update (speed * dt) naturally handles passing if speed is higher.
      // BUT, dirty air slows you down, making passing hard physically.
      // So we need a "boost" or "move" that artificially pushes attacker ahead 
      // OR we just let the speed delta do it, but we modulate the speed based on this probability.
      
      // If "Overtake Successful" (dice roll wins):
      // Give attacker a massive speed boost (e.g. "Late braking success") for this frame
      // effectively jumping them ahead or giving them the speed to complete the pass.
      
      // If "Defense Successful":
      // Attacker speed penalized (blocked).

      const frameProb = successProb * 0.1; // approx for 100ms
      
      if (this.rng.chance(frameProb)) {
          // SUCCESSFUL OVERTAKE MOVE
          // Boost speed to clear the gap
          attacker.speed += 5.0; // Surge ahead
          attacker.isBattling = false; // Resolved
      } else {
          // DEFENDED
          // If we didn't pass, we might get slowed down (checked up)
          // 10% chance to get checked up hard
          if (this.rng.chance(0.1)) {
              attacker.speed *= 0.95; // Checked up
          }
      }
  }

  private updateDRS(vehicle: VehicleState): void {
      if (this.state.currentLap < 3 || this.state.weather !== 'dry' || this.state.safetyCar !== 'none') {
          vehicle.drsOpen = false;
          return;
      }

      // Check if in DRS activation zone
      const inZone = this.track.drsZones.some(zone => 
          vehicle.distanceOnLap >= zone.activationDistance && vehicle.distanceOnLap <= zone.endDistance
      );

      if (inZone) {
          // Check if within 1 second of car ahead at detection point
          // Simplified: If gapToAhead < 1.0s and we are not the leader
          if (vehicle.position > 1 && vehicle.gapToAhead < 1.0) {
              vehicle.drsOpen = true;
          }
      } else {
          vehicle.drsOpen = false;
      }
  }

  private updateDirtyAir(vehicle: VehicleState): void {
      // If within 2 seconds of car ahead, dirty air applies
      // Closer = worse
      if (vehicle.position > 1 && vehicle.gapToAhead < 2.0) {
          vehicle.inDirtyAir = true;
      } else {
          vehicle.inDirtyAir = false;
      }
  }

  private updateBattling(vehicle: VehicleState): void {
      // If within 0.3s of car ahead or behind, battling
      // We need gap to behind too, but we can infer or compute it.
      // For now, check gapToAhead < 0.3
      const battlingAhead = vehicle.position > 1 && vehicle.gapToAhead < 0.3;
      // We don't have gapToBehind easily on vehicle state, but we have position.
      // Let's assume battling is mostly about attacking for now.
      vehicle.isBattling = battlingAhead;
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

    // DRS Boost
    if (vehicle.drsOpen) {
        speed *= 1.05; // 5% speed boost (approx 15-20 kph)
    }

    // Dirty Air Penalty
    if (vehicle.inDirtyAir) {
        // Map gap 0.0-2.0s to penalty
        // Closer = more penalty. Max 1.5% penalty at 0s gap
        const gap = Math.max(0.1, vehicle.gapToAhead); // Floor at 0.1 to avoid infinity/max
        const proximityFactor = Math.max(0, 1 - (gap / 2.0)); // 1.0 at 0s, 0.0 at 2s
        const dirtyAirPenalty = 0.015 * proximityFactor;
        speed *= (1 - dirtyAirPenalty);
    }

    // Battling Penalty (Side-by-side slows both down)
    if (vehicle.isBattling) {
        speed *= 0.98; // 2% penalty for compromised lines
    }

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
