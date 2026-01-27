import { VehicleState, Driver, RaceState, Track } from '../../types';
import { SeededRNG } from '../rng';

export class PhysicsSystem {
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  public updateVehiclePhysics(vehicle: VehicleState, driver: Driver, state: RaceState, track: Track, dt: number): void {
      // 0. Calculate Grip based on Sector Conditions
      // Find current sector water depth
      const sectorCond = state.sectorConditions.find(s => s.sectorId === track.sectors[vehicle.currentSector - 1]?.id);
      const waterDepth = sectorCond ? sectorCond.waterDepth : 0;
      const gripFactor = this.calculateGrip(vehicle.tyreCompound, waterDepth, vehicle.speed);

      // 1. Calculate Target Speed
      let targetSpeed = this.calculateTargetSpeed(vehicle, driver, state, track);
      
      // Apply Grip Penalty
      targetSpeed *= gripFactor;
      
      // START CHAOS: First Lap Uncertainty
      if (state.currentLap === 1 && vehicle.distanceOnLap < 2000) {
          // Higher variance/instability in first sector
          const chaos = this.rng.range(0.95, 1.05); // Reduced from 0.85-1.10 to 0.95-1.05
          
          // "Check up" logic: If very close to car ahead, chance to check up hard
          // Reduced probability (0.05 -> 0.01) and severity (0.7 -> 0.9) to prevent leader getaway
          if (vehicle.position > 1 && vehicle.gapToAhead < 0.4 && this.rng.chance(0.01)) {
               targetSpeed *= 0.9; // Mild check up
          } else {
               targetSpeed *= chaos;
          }
      }

      // 2. Apply Acceleration
      // Simple approach: move towards target speed
      // F1 0-200kph ~4.5s (12m/s^2 avg). 200-300 slower.
      // Braking 300-100 ~2s (27m/s^2 avg). Peak 5g (~50m/s^2).
      let accelRate = 20 * gripFactor; // Grip affects acceleration too
      let brakeRate = 50 * gripFactor; // Grip affects braking
      
      // SAFETY CLAMP: Prevent negative rates if grip calculation fails
      accelRate = Math.max(1.0, accelRate);
      brakeRate = Math.max(1.0, brakeRate);

      if (vehicle.speed < targetSpeed) {
        vehicle.speed += accelRate * dt;
        if (vehicle.speed > targetSpeed) vehicle.speed = targetSpeed;
      } else {
        vehicle.speed -= brakeRate * dt; // Braking
        if (vehicle.speed < targetSpeed) vehicle.speed = targetSpeed;
      }
      
      // ABSOLUTE SAFETY CLAMP (Prevent Infinity/NaN/Explosion)
      if (isNaN(vehicle.speed) || !isFinite(vehicle.speed)) vehicle.speed = 0;
      if (vehicle.speed > 150) vehicle.speed = 150; // Max 540 kph
      if (vehicle.speed < 0) vehicle.speed = 0;

      // 3. Update Distance
      const distDelta = vehicle.speed * dt;
      vehicle.distanceOnLap += distDelta;
      vehicle.totalDistance += distDelta;
      vehicle.currentLapTime += dt;
      
      // TELEMETRY RECORDING
      // Record if distance changed by > 10m OR time > 0.2s from last point
      const trace = vehicle.telemetry.currentLapSpeedTrace;
      const lastPoint = trace.length > 0 ? trace[trace.length - 1] : null;
      
      if (!lastPoint || (vehicle.distanceOnLap - lastPoint.distance > 10)) {
          trace.push({
              distance: vehicle.distanceOnLap,
              speed: vehicle.speed
          });
      }

      // 4. Lap Logic
      if (vehicle.distanceOnLap >= track.totalDistance) {
        vehicle.distanceOnLap -= track.totalDistance;
        vehicle.lapCount++;
        
        // Checkered Flag Logic: Any lap completion after flag means finish
        if (state.checkeredFlag && !vehicle.hasFinished) {
            vehicle.hasFinished = true;
        }

        vehicle.lastLapTime = vehicle.currentLapTime;
        vehicle.currentLapTime = 0;
        vehicle.tyreAgeLaps++;
        
        // Move Telemetry
        vehicle.telemetry.lastLapSpeedTrace = [...vehicle.telemetry.currentLapSpeedTrace];
        vehicle.telemetry.currentLapSpeedTrace = [];
        
        if (vehicle.lastLapTime < vehicle.bestLapTime || vehicle.bestLapTime === 0) {
          vehicle.bestLapTime = vehicle.lastLapTime;
        }
        
        // Update race current lap to leader's lap
        if (vehicle.position === 1) {
          state.currentLap = vehicle.lapCount;
        }
      }
      
      // 5. Update Sector
      const currentSectorIndex = track.sectors.findIndex(
        s => vehicle.distanceOnLap >= s.startDistance && vehicle.distanceOnLap < s.endDistance
      );
      if (currentSectorIndex !== -1) {
        vehicle.currentSector = currentSectorIndex + 1;
      }

      // 6. Resource Consumption
      this.updateResources(vehicle, dt);
  }

  private calculateTargetSpeed(vehicle: VehicleState, driver: Driver, state: RaceState, track: Track): number {
    // Red Flag: Stop immediately
    if (state.safetyCar === 'red-flag') return 0;

    // Determine Base Speed by Sector Type
    let speed = 60; // Fallback
    const currentSector = track.sectors[vehicle.currentSector - 1];

    if (currentSector) {
        switch (currentSector.type) {
            case 'straight': 
                speed = 88; // ~315 kph
                break;
            case 'corner_high_speed': 
                speed = 72; // ~260 kph
                break;
            case 'corner_medium_speed': 
                speed = 50; // ~180 kph
                break;
            case 'corner_low_speed': 
                speed = 25; // ~90 kph
                break;
        }
    } else {
        // Fallback to average pace if sector not found
        speed = track.totalDistance / driver.basePace;
    }

    // Apply Driver Sector Performance
    if (driver.performance && currentSector) {
        let perfScore = 90;
        switch (currentSector.type) {
            case 'straight': perfScore = driver.performance.straight; break;
            case 'corner_high_speed': perfScore = driver.performance.corneringHigh; break;
            case 'corner_medium_speed': perfScore = driver.performance.corneringMedium; break;
            case 'corner_low_speed': perfScore = driver.performance.corneringLow; break;
        }
        // Impact: 90 is neutral. Range 70-100.
        // 100 -> +1.0% speed. 70 -> -2% speed.
        // Formula: 1 + (score - 90) * 0.001
        speed *= (1 + (perfScore - 90) * 0.001);
    }
    
    // Apply Base Pace (Global Speed Factor)
    // 88.0 is standard. Lower is faster.
    // Dampened factor: 0.2% per point difference to compress field
    speed *= (1 + (88.0 - driver.basePace) * 0.002);

    // Apply Day Form Condition
    // e.g., 1.02 -> 2% faster base speed
    speed *= vehicle.condition;

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

    // Aerodynamic Wake Effects (Slipstream & Dirty Air)
    // Find current sector for physics context
    // const currentSector already defined above

    // Disable Dirty Air on Lap 1 to prevent leader runaway
    if (vehicle.position > 1 && currentSector && state.currentLap > 1) {
        const gap = Math.max(0.1, vehicle.gapToAhead);
        
        if (currentSector.type === 'straight') {
             // Slipstream (Tow): Effective up to ~1.5s gap, strongest < 0.5s
             if (gap < 1.5) {
                 // Boost: Max 5% at 0.1s, 0% at 1.5s
                 const slipstreamFactor = Math.max(0, 1 - (gap / 1.5));
                 const boost = 0.05 * slipstreamFactor;
                 speed *= (1 + boost);
             }
        } else {
             // Dirty Air in Corners: Effective up to ~2.0s gap
             if (gap < 2.0) {
                 const proximityFactor = Math.max(0, 1 - (gap / 2.0));
                 let penaltyBase = 0;
                 
                 switch(currentSector.type) {
                     case 'corner_high_speed': 
                        penaltyBase = 0.05; // 5% loss (significant downforce loss)
                        break; 
                     case 'corner_medium_speed': 
                        penaltyBase = 0.03; // 3% loss
                        break; 
                     case 'corner_low_speed': 
                        penaltyBase = 0.01; // 1% loss (mechanical grip dominant)
                        break;
                 }
                 
                 const penalty = penaltyBase * proximityFactor;
                 speed *= (1 - penalty);
             }
        }
    }

    // Battling Penalty (Side-by-side slows both down)
    if (vehicle.isBattling) {
        speed *= 0.98; // 2% penalty for compromised lines
    }

    // Blue Flag Penalty (Yielding logic)
    if (vehicle.blueFlag) {
        // Driver Personality Check: Do they yield?
        // High Team Player / Low Aggression -> Yields easily
        // Low Team Player / High Aggression -> Ignores
        const yieldChance = (driver.personality.teamPlayer + (100 - driver.personality.aggression)) / 200;
        
        // We use a deterministic check based on time or random?
        // Ideally, they either decide to yield or not.
        // Let's assume they yield 90% of the time if "Good", 10% if "Bad".
        // Since this runs every tick, we need a stable state or probability per frame?
        // No, we can just apply a speed penalty.
        // If they yield: -20% speed (Lift off)
        // If they don't: -0% speed (But causing dirty air/battling to the guy behind)
        
        // Simple Logic: 
        // Base Yield Probability: 0.8
        // Modified by personality.
        // If yieldChance > 0.5 -> They are likely to yield.
        
        // Let's make it consistent per "blue flag event".
        // But for now, let's just use the factor to scale the penalty.
        // Higher yield chance -> More likely to be slow.
        
        // Actually, the user said: "sometimes they don't want to and will waste both of their pace and increase combat risk."
        // If they ignore blue flag, `isBattling` should be true (which we set in spatial update based on proximity).
        // If they yield, they should slow down significantly to let the car pass quickly.
        
        // Let's determine "Ignoring" behavior:
        // const ignoreProb = 1.0 - yieldChance;
        // const isIgnoring = this.rng.chance(ignoreProb * 0.1); 
        
        // Better: Just apply a "Yield Penalty".
        // If they are "Good", they slow down a lot (speed * 0.8).
        // If they are "Bad", they slow down a little or not at all (speed * 0.99).
        
        const complianceLevel = yieldChance; // 0.0 to 1.0
        // Penalty = 1.0 - (0.2 * complianceLevel)
        // If compliance 1.0 -> speed * 0.8 (Yields)
        // If compliance 0.0 -> speed * 1.0 (Ignores)
        
        speed *= (1.0 - (0.2 * complianceLevel));
    }

    // Driver Consistency & Skill (Per-tick noise)
    const consistencyFactor = (driver.skill.consistency / 100);
    // Lower consistency = more random variance
    // Increased variance range for more "randomness" as requested
    // Old: 0.02 * (1 - consistency + 0.1) -> ~0.2%
    // New: 0.05 * (1 - consistency + 0.3) -> ~1.5% - 2.5% variance per tick
    let varianceRange = 0.05 * (1 - consistencyFactor + 0.3); 
    
    // Increased randomness in Low Speed Corners
    if (currentSector && currentSector.type === 'corner_low_speed') {
        varianceRange *= 3.0; // Huge variance (up to 6-8%)
    }

    const noise = this.rng.range(-varianceRange, varianceRange);
    speed *= (1 + noise);

    // Apply Safety Car Speed Limits
    if (state.safetyCar === 'vsc') {
        speed *= 0.6; // ~40% slower
    } else if (state.safetyCar === 'sc') {
        speed *= 0.5; // ~50% slower
    }

    return speed;
  }

  private calculateGrip(compound: string, waterDepth: number, speedKph: number = 200): number {
      // 1. Base Compound Grip vs Water (Advanced Physics)
      // Uses smooth exponential/gaussian decay curves instead of piecewise linear
      let baseGrip = 1.0;
      
      if (['soft', 'medium', 'hard'].includes(compound)) {
          // Exponential decay. 
          // 0mm -> 1.0
          // 0.5mm -> 0.36
          // 1.0mm -> 0.13 (Un-drivable)
          // Slicks are useless > 1mm
          baseGrip = Math.exp(-2.0 * waterDepth); 
      } else if (compound === 'intermediate') {
          // Bell curve centered at 1.5mm
          // Optimal window: 0.5mm to 2.5mm
          const optimal = 1.5;
          const width = 1.5;
          // Peak at 0.95 (Inter is never as sticky as Slick in dry)
          baseGrip = 0.95 * Math.exp(-Math.pow(waterDepth - optimal, 2) / (2 * width * width));
          
          // Penalize dry usage (shredding/overheating)
          // If water < 0.2mm, drop grip
          if (waterDepth < 0.2) baseGrip *= 0.85; 
      } else if (compound === 'wet') {
          // Sigmoid / High Plateau
          // Dry (0mm): 0.7 (Overheating, blocks moving)
          // Wet (2mm+): 0.9 (Good mechanical grip)
          // Deep (4mm+): 0.85 (Holds up)
          
          if (waterDepth < 1.0) {
               // Transition from bad to good
               baseGrip = 0.7 + (waterDepth * 0.2); // 0.7 -> 0.9
          } else {
               // Slow decay in deep water
               baseGrip = 0.9 - ((waterDepth - 1.0) * 0.03); 
          }
      }
      
      // 2. Aquaplaning (Dynamic Speed Penalty)
      // Only affects if water > 1mm (Standing water)
      if (waterDepth > 1.0) {
          // Hydroplane speed approx: 90 + (100 / waterDepth)
          // 2mm -> 140 kph
          // 5mm -> 110 kph
          const hydroSpeed = 90 + (100 / waterDepth);
          
          if (speedKph > hydroSpeed) {
               const excess = speedKph - hydroSpeed;
               // Exponential loss of contact patch
               // e.g. 20kph over limit -> grip * 0.36
               const hydroFactor = Math.exp(-excess * 0.05); 
               baseGrip *= hydroFactor;
          }
      }
      
      return Math.max(0.1, baseGrip); // Safety floor
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
}
