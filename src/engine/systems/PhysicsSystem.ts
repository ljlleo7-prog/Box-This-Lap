import { VehicleState, Driver, RaceState, Track, TyreCompound } from '../../types';
import { SeededRNG } from '../rng';
import { TyreModel } from './TyreModel';

export class PhysicsSystem {
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  public updateVehiclePhysics(vehicle: VehicleState, driver: Driver, state: RaceState, track: Track, dt: number): void {
      // If in pit, PhysicsSystem yields control to RaceLogicSystem (which handles pit lane movement)
      if (vehicle.isInPit) return;

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
      // Concentration affects this heavily now.
      if (state.currentLap === 1 && vehicle.distanceOnLap < 2000) {
          // Higher variance/instability in first sector
          
          // Concentration Effect: Lower concentration = more chaos (instability)
          // 100 conc -> 0.98-1.02 (tight)
          // 50 conc -> 0.90-1.10 (loose)
          const instability = 0.02 + ((100 - vehicle.concentration) / 100) * 0.1;
          
          const chaos = this.rng.range(1.0 - instability, 1.0 + instability);
          
          // "Check up" logic: If very close to car ahead, chance to check up hard
          // Reduced probability (0.05 -> 0.01) and severity (0.7 -> 0.9) to prevent leader getaway
          // BUT: Low concentration increases check-up chance!
          let checkUpChance = 0.01;
          if (vehicle.concentration < 50) checkUpChance = 0.05; // Nervous driver
          
          if (vehicle.position > 1 && vehicle.gapToAhead < 0.4 && this.rng.chance(checkUpChance)) {
               targetSpeed *= 0.9; // Mild check up
          } else {
               targetSpeed *= chaos;
          }
      }

      // 2. Apply Acceleration
      // Realistic Physics Model (G-Force based)
      // Acceleration: Traction limited at low speed, Drag limited at high speed
      // Braking: Grip limited (Mechanical + Aero Downforce)
      
      // Fix: Leader (pos 1) has gapToAhead = 0, which physics interprets as "touching car ahead" (max slipstream).
      // We must force gap to be infinite for leader.
      const effectiveGap = (vehicle.position === 1) ? 100 : vehicle.gapToAhead;
      
      const maxAccel = this.calculateMaxAcceleration(vehicle.speed, vehicle.drsOpen, effectiveGap, track.sectors[vehicle.currentSector - 1]?.type) * gripFactor;
      const maxBrake = this.calculateMaxBraking(vehicle.speed) * gripFactor;
      
      // Safety Clamp
      // We allow negative maxAccel now (Drag limited speed), but we should ensure it doesn't exceed braking capability if negative
      const accelRate = maxAccel; 
      const brakeRate = Math.max(1.0, maxBrake);

      if (vehicle.speed < targetSpeed) {
        // Accelerating phase
        // If accelRate is negative (Drag > Power), speed will naturally decrease
        vehicle.speed += accelRate * dt;
        
        // If we are decelerating due to drag, we shouldn't overshoot downwards below targetSpeed unnecessarily, 
        // but targetSpeed is usually higher than current speed here.
        // Wait, if speed < targetSpeed, we WANT to accelerate.
        // If accelRate is negative, we decelerate.
        // This is correct: We are trying to reach targetSpeed, but Physics says NO, you must slow down.
        // Eventually speed settles at equilibrium where accelRate = 0.
        
        // Clamp: If we somehow overshoot targetSpeed (unlikely in this branch), clamp it.
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
      // Record if distance changed by > 50m (reduced from 10m for performance)
      const trace = vehicle.telemetry.currentLapSpeedTrace;
      const lastPoint = trace.length > 0 ? trace[trace.length - 1] : null;
      
      if (!lastPoint || (vehicle.distanceOnLap - lastPoint.distance > 50)) {
          trace.push({
              distance: vehicle.distanceOnLap,
              speed: vehicle.speed
          });
      }

      // 4. Pit Entry Logic (Before Lap Logic to handle wrap-around)
      if (vehicle.boxThisLap && track.pitLane) {
          const entryDist = track.pitLane.entryDistance;
          // Check if we have crossed the entry line WITHIN A REASONABLE WINDOW
          // We don't want to "teleport" back to the pit if we decided to box late (after passing entry).
          // If we missed the window, we must wait for the next lap.
          // Window: [Entry, Entry + 50m]
          if (vehicle.distanceOnLap >= entryDist && vehicle.distanceOnLap < (entryDist + 50)) {
             vehicle.isInPit = true;
          }
      }

      // 5. Lap Logic
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
      
      // 6. Update Sector
      const currentSectorIndex = track.sectors.findIndex(
        s => vehicle.distanceOnLap >= s.startDistance && vehicle.distanceOnLap < s.endDistance
      );
      if (currentSectorIndex !== -1) {
        vehicle.currentSector = currentSectorIndex + 1;
      }

      // 7. Resource Consumption
      this.updateResources(vehicle, dt, track);
  }

  private calculateTargetSpeed(vehicle: VehicleState, driver: Driver, state: RaceState, track: Track): number {
    // Red Flag: Stop immediately
    if (state.safetyCar === 'red-flag') return 0;

    // Determine Base Speed by Sector Type
    let speed = 60; // Fallback
    const currentSector = track.sectors[vehicle.currentSector - 1];

    if (currentSector) {
        if (currentSector.maxSpeed) {
            speed = currentSector.maxSpeed;
        } else {
            switch (currentSector.type) {
                case 'straight': 
                    speed = 105; // ~378 kph (Let physics limit the top speed)
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
        }
    } else {
        // Fallback to average pace if sector not found
        speed = track.totalDistance / driver.basePace;
    }

    // Apply Driver Sector Performance
    // NOTE: In VSC/SC, we skip performance penalties to maintain delta (speed limit dominant)
    if (driver.performance && currentSector && state.safetyCar === 'none') {
        let perfScore = 90;
        switch (currentSector.type) {
            case 'straight': perfScore = driver.performance.straight; break;
            case 'corner_high_speed': perfScore = driver.performance.corneringHigh; break;
            case 'corner_medium_speed': perfScore = driver.performance.corneringMedium; break;
            case 'corner_low_speed': perfScore = driver.performance.corneringLow; break;
        }
        // Impact: 90 is neutral. Range 70-100.
        // 100 -> +0.5% speed. 70 -> -1% speed.
        // Formula: 1 + (score - 90) * 0.0005 (Reduced from 0.001 to tighten field)
        speed *= (1 + (perfScore - 90) * 0.0005);
    }
    
    // Apply Base Pace (Global Speed Factor)
    // 88.0 is standard. Lower is faster.
    // Dampened factor: 0.08% per point difference to compress field (Reduced from 0.2%)
    speed *= (1 + (88.0 - driver.basePace) * 0.0008);

    // Apply Morale System (Dynamic Performance)
    // Morale: 0-100, Base 80.
    // High Morale (100) -> +1% speed
    // Low Morale (0) -> -4% speed
    const morale = vehicle.morale !== undefined ? vehicle.morale : 80;
    const moraleEffect = (morale - 80) * 0.0005;
    speed *= (1 + moraleEffect);

    // Apply Day Form Condition
    // e.g., 1.02 -> 2% faster base speed
    speed *= vehicle.condition;

    // TEMPERATURE & TRACK DIFFICULTY LOGIC
    // 1. Temperature Adaptation
    // Use simulated track temp if available, otherwise fallback to calculation
    const currentTemp = state.trackTemp || ((track.baseTemperature || 25) - (state.rainIntensityLevel * 0.15));
    const optimalTemp = 25; // Standard optimal operating window center
    const tempDelta = Math.abs(currentTemp - optimalTemp);
    
    // Adaptability: Higher is better. 100 = No penalty from temp.
    const adaptability = driver.performance.temperatureAdaptability || 85;
    // Penalty: 0.5% per degree off, scaled by lack of adaptability
    // e.g. 10 deg off, 80% adapt -> 10 * 0.005 * 0.2 = 0.01 (1%)
    const tempPenalty = tempDelta * 0.005 * (1 - (adaptability / 100));
    speed *= (1 - tempPenalty);

    // 2. Track Difficulty
    // Harder tracks are slower and punish mistakes more
    // User Update: Difficulty shall only penalize those without good enough racing skills
    // We use 'consistency' as the primary metric for handling track difficulty (error avoidance)
    
    const difficulty = track.trackDifficulty || 0.5;
    
    // Skill Mitigation: 0-1 (1 = 100 consistency, perfect mitigation)
    const consistency = driver.skill.consistency || 80;
    const skillMitigation = consistency / 100;
    
    // Penalty Calculation
    // Maximum penalty on the hardest track (difficulty=1.0) for a rookie (consistency=50)
    // could be significant (e.g., 5-8%).
    // For a pro (consistency=95+), it should be negligible.
    
    const maxDifficultyPenalty = 0.08; // 8% max speed loss
    
    // Effective Penalty = Difficulty * MaxPenalty * (1 - SkillMitigation)
    // Example 1: Monaco (0.95), Max Verstappen (98 cons): 0.95 * 0.08 * 0.02 = 0.0015 (0.15% loss)
    // Example 2: Monaco (0.95), Rookie (70 cons): 0.95 * 0.08 * 0.30 = 0.0228 (2.28% loss)
    
    const difficultyPenalty = difficulty * maxDifficultyPenalty * (1 - skillMitigation);
    speed *= (1 - difficultyPenalty);
    
    // Multipliers
    // Tyre Wear: 0-100.
    // Use the sophisticated TyreModel grip factor (dry grip only here, weather handled separately)
    const gripFactor = TyreModel.getGripFactor(vehicle.tyreCompound as TyreCompound, vehicle.tyreWear, 0);
    speed *= gripFactor;

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

    // Battling / Traffic Logic (Interaction with car ahead)
    if (vehicle.isBattling && state.safetyCar === 'none') {
        // Find car ahead
        const ahead = state.vehicles.find(v => v.position === vehicle.position - 1);
        if (ahead) {
            // Determine "Attack Intensity" using a Sigmoid Curve
            // This blends between "Stuck Mode" (0) and "Attack Mode" (1)
            
            const paceDelta = vehicle.speed - ahead.speed; // m/s
            const aggression = driver.personality.aggression / 100; // 0-1
            const racecraft = driver.skill.racecraft / 100; // 0-1
            
            // Score Calculation
            // Base offset: It's hard to pass (negative bias)
            // Aggression and Racecraft help overcome this.
            // Pace Delta is the main driver.
            
            // Z-score components:
            // Pace Delta: Direct contribution.
            // Aggression: Adds "virtual speed" (willingness to risk). Max +2.5
            // Racecraft: Adds "efficiency" (finding gaps). Max +1.5
            // Bias: -3.0 (Center point - needs significant advantage to attack)
            
            const z = paceDelta + (aggression * 2.5) + (racecraft * 1.5) - 3.0;
            
            // Sigmoid Function: 1 / (1 + e^-z)
            // If z = 0, Intensity = 0.5
            // If z = -2, Intensity ~ 0.12
            // If z = +2, Intensity ~ 0.88
            const attackIntensity = 1.0 / (1.0 + Math.exp(-z));
            
            // Calculate Speeds
            
            // 1. Stuck Speed: Limited by car ahead + check-up effect
            // If we are strictly stuck, we match speed or go slightly slower
            let stuckSpeed = ahead.speed;
            if (vehicle.speed > ahead.speed) {
                 stuckSpeed *= 0.98; // Check-up penalty
            }
            
            // 2. Free Speed: Our natural speed (calculated above)
            // But attacking offline in corners costs grip
            let freeSpeed = speed;
            if (currentSector && currentSector.type !== 'straight') {
                // Offline penalty scales with intensity
                freeSpeed *= (1.0 - (0.05 * attackIntensity));
            }
            
            // BLEND
            // If Intensity 1.0 -> Free Speed
            // If Intensity 0.0 -> Stuck Speed
            // We only blend if Free Speed > Stuck Speed. 
            // If we are naturally slower than Stuck Speed, we just go our slow speed (falling back).
            
            if (freeSpeed > stuckSpeed) {
                speed = (stuckSpeed * (1.0 - attackIntensity)) + (freeSpeed * attackIntensity);
            } else {
                speed = freeSpeed; // We are falling back anyway
            }
        }
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

    // REDUCED NOISE UNDER SAFETY CAR / VSC
    if (state.safetyCar !== 'none') {
        varianceRange *= 0.1; // 10% of normal variance -> very stable
    }

    const noise = this.rng.range(-varianceRange, varianceRange);
    speed *= (1 + noise);

    // Apply Safety Car Speed Limits
    if (state.safetyCar === 'vsc') {
        // VSC: Strict speed limit (Delta maintenance)
        // Cap speed at a low value (e.g. 40% of max, or fixed ~160kph/44m/s - INCREASED as requested)
        const vscLimit = 44; // ~160kph
        // We also apply a 60% factor to cornering speeds to ensure safety, but cap at vscLimit
        speed = Math.min(speed * 0.7, vscLimit);
    } else if (state.safetyCar === 'sc') {
        // SC: Bunch up logic
        const scPace = 35; // ~126 kph base pace for SC
        let scTarget = scPace;

        if (vehicle.position !== 1) {
            // Catch up logic
            const targetGap = 0.5; // seconds
            const currentGap = vehicle.gapToAhead;

            if (currentGap > targetGap) {
                // Allow higher speed to catch up, up to 1.6x SC pace (~200kph)
                // Proportional to gap: larger gap = faster catchup
                const catchupRatio = Math.min(currentGap, 5.0) / 5.0; // 0 to 1
                const speedBoost = 1.0 + (0.6 * catchupRatio); // 1.0 to 1.6
                scTarget = scPace * speedBoost;
            } else if (currentGap < 0.3) {
                // Too close, back off
                scTarget = scPace * 0.8;
            }
        }
        
        // Ensure we don't exceed the physical track limit (corner speed)
        speed = Math.min(speed, scTarget);
    }

    return speed;
  }

  private calculateMaxAcceleration(speed: number, drsOpen: boolean = false, gapToAhead: number = 100, sectorType: string = 'straight'): number {
      // F1 Acceleration Physics (Power - Drag)
      // Mass ~ 800kg
      const mass = 800;
      
      // POWER
      // Approx 1000hp ~ 750kW.
      // ERS deployment adds ~120kW.
      // We assume constant power band for simplicity, but efficiency drops at very high speed.
      // Power = Force * Velocity => ThrustForce = Power / Velocity
      const powerWatts = 750000; // 750 kW
      
      // Thrust Force
      // At low speed, thrust is huge, but limited by Traction (Grip)
      // At high speed, thrust = Power / Speed
      let thrustForce = 0;
      if (speed < 10) {
          thrustForce = powerWatts / 10; // Cap at 10m/s to avoid infinity
      } else {
          thrustForce = powerWatts / speed;
      }
      
      // Traction Limit (Mechanical Grip)
      // Approx 1.3G at low speed (Simulating race fuel/tires)
      const tractionLimitForce = mass * 9.81 * 1.3;
      
      // Effective Thrust is min(EngineThrust, TractionLimit)
      thrustForce = Math.min(thrustForce, tractionLimitForce);
      
      // DRAG
      // Force = 0.5 * rho * Cd * A * v^2
      // rho = 1.225 kg/m^3
      // Cd * A (CdA) ~ 1.6 m^2 (Increased from 1.5 for realistic top speeds)
      const rho = 1.225;
      let CdA = 1.6; 
      
      // DRS Effect: Reduces drag by ~25%
      if (drsOpen) {
          CdA *= 0.75;
      }
      
      // Slipstream Effect: Reduces drag if following closely
      // Only on straights
      if (sectorType === 'straight' && gapToAhead < 1.0) {
          // Max reduction 15% at 0.0s gap (Reduced from 30%)
          // If DRS is open, slipstream is less effective (dirty air less impactful on stalled wing)
          const maxSlipstream = drsOpen ? 0.08 : 0.15;
          const slipstreamFactor = Math.max(0, 1 - gapToAhead); 
          CdA *= (1 - (maxSlipstream * slipstreamFactor));
      }
      
      const dragForce = 0.5 * rho * CdA * speed * speed;
      
      // Net Force
      const netForce = thrustForce - dragForce;
      
      // Acceleration = Force / Mass
      let accel = netForce / mass;
      
      // Friction / Rolling Resistance (constant small deceleration)
      // Approx 0.1 m/s^2
      accel -= 0.1;
      
      return accel; // Return true acceleration (can be negative if Drag > Power)
  }

  private calculateMaxBraking(speed: number): number {
      // F1 Braking Curve
      // Low speed: Mechanical Grip limited (~1.5G)
      // High speed: Aero Downforce limited (~5G - 6G)
      
      const mechanicalGrip = 15; // ~1.5G (15 m/s^2)
      
      // Downforce increases with square of speed
      // Factor tuned so at 85 m/s (300kph), we add ~35 m/s^2 (~3.5G) -> Total ~5G
      const aeroFactor = 0.005; 
      const aeroBraking = aeroFactor * speed * speed;
      
      return mechanicalGrip + aeroBraking;
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

  private updateResources(vehicle: VehicleState, dt: number, track: Track): void {
    // Tyre wear
    // Use the sophisticated TyreModel
    const wearRate = TyreModel.getWearRate(
        vehicle.tyreCompound as TyreCompound,
        track,
        vehicle.paceMode,
        vehicle.tyreWear
    );
    
    vehicle.tyreWear += wearRate * dt;
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
