import { RaceState, VehicleState, Track, Driver } from '../../types';
import { SeededRNG } from '../rng';
import { StrategySystem } from './StrategySystem';

export class RaceLogicSystem {
  private rng: SeededRNG;
  private safetyCarTimer: number = 0;
  // Pit Stop State (id -> { timeLeft, totalDuration, stopDuration, laneTime, entryDist, laneTrackDist })
  private pitStates: Map<string, { 
      timeLeft: number, 
      totalDuration: number, 
      stopDuration: number, 
      laneTime: number,
      entryDist: number,
      laneTrackDist: number
  }> = new Map();

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  public initializeRace(track: Track, drivers: Driver[], strategySystem: StrategySystem): RaceState {
    // Initialize Weather State FIRST to determine tires
    const baseRainProb = track.weatherParams?.rainProbability ?? 0.2;
    // Initial cloud cover bias
    let initialCloudCover = this.rng.range(0, 100);
    initialCloudCover = (initialCloudCover * 0.6) + (baseRainProb * 100 * 0.4); // Bias
    
    let initialRainIntensity = 0;
    if (initialCloudCover > 70) {
        initialRainIntensity = ((initialCloudCover - 70) / 30) * 100;
    }

    let initialWeather: any = 'dry'; // Type cast to avoid linter for now
    if (initialRainIntensity > 50) initialWeather = 'heavy-rain';
    else if (initialRainIntensity > 5) initialWeather = 'light-rain';

    // Qualifying Simulation for Grid Order
    // Simulate a qualifying lap for each driver
    const qualifyingResults = drivers.map(driver => {
        // Base pace + random variance + skill variance
        // Lower basePace is better.
        // Consistency affects how close to potential they get.
        const potential = driver.basePace;
        const consistencyPenalty = (100 - driver.skill.consistency) * 0.005; // Penalty for low consistency
        const randomVar = this.rng.range(-0.4, 0.4); // +/- 0.4s random variance
        const lapTime = potential + consistencyPenalty + randomVar;
        return { driver, lapTime };
    }).sort((a, b) => a.lapTime - b.lapTime);

    const vehicles: VehicleState[] = qualifyingResults.map((result, index) => {
      const driver = result.driver;
      // Grid positioning: Randomized start grid with slight variance
      // Base gap 16m (approx 0.2s at start), plus random noise to simulate imperfect grid line-up
      const baseGap = 16;
      const noise = this.rng.range(-1.0, 1.0); // +/- 1m variance
      const startDistance = track.totalDistance - ((index + 1) * baseGap) + noise; 
      
      // Random "Day Form" condition (0.99 to 1.01) - Reduced variance to keep field closer
      // > 1.0 means performing better (speed multiplier)
      // < 1.0 means performing worse
      const condition = this.rng.range(0.99, 1.01);

      // Generate Strategy
      const strategyPlan = strategySystem.initializeStrategy(driver, track, track.totalLaps, initialRainIntensity / 100);
      const tyreCompound = strategyPlan.stints[0].compound;

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
        boxThisLap: false,
        
        tyreCompound,
        tyreWear: 0,
        tyreAgeLaps: 0,
        fuelLoad: 100, // kg
        ersLevel: 100,
        ersMode: 'balanced',
        paceMode: 'balanced',
        
        condition, // Initialized condition
        damage: 0,
        stress: 0,
        morale: driver.morale || 80, // Initialize with driver's base morale
        concentration: 100, // Start fully focused
        drsOpen: false,
        inDirtyAir: false,
        isBattling: false,
        blueFlag: false,
        
        currentLapTime: 0,
        lastLapTime: 0,
        bestLapTime: 0,
        gapToLeader: 0,
        gapToAhead: 0,
        position: index + 1,
        lastPosition: index + 1, // Initial position
        hasFinished: false,

        strategyPlan,

        telemetry: {
            lastLapSpeedTrace: [],
            currentLapSpeedTrace: []
        }
      };
    });
    
    // Initial Sector Conditions
    const sectorConditions = track.sectors.map(s => ({
        sectorId: s.id,
        waterDepth: 0,
        rubberLevel: 50
    }));

    return {
      id: `race-${Date.now()}`,
      trackId: track.id,
      currentLap: 1,
      totalLaps: track.totalLaps, // Use track specific laps
      weather: initialWeather,
      weatherMode: 'simulation',
      weatherForecast: [], // Populated in constructor of WeatherSystem (or caller)
      cloudCover: initialCloudCover,
      rainIntensityLevel: initialRainIntensity,
      windSpeed: this.rng.range(5, 20),
      windDirection: this.rng.range(0, 360),
      trackTemp: 25,
      airTemp: 20,
      rubberLevel: 50,
      sectorConditions,
      trackWaterDepth: 0, // Global average
      safetyCar: 'none',
      vehicles,
      status: 'pre-race',
      checkeredFlag: false,
      winnerId: null,
      elapsedTime: 0,
    };
  }

  public updateRaceLogic(state: RaceState, track: Track, drivers: Map<string, Driver>, dt: number, strategySystem: StrategySystem): void {
      this.updateSafetyCar(state, track, dt);
      this.checkIncidents(state, track, drivers, dt);
      
      // Update each vehicle's race logic
      state.vehicles.forEach(vehicle => {
          this.handlePitStopLogic(vehicle, state, track, dt, strategySystem);
          this.updateDRS(vehicle, state, track);
          this.attemptOvertake(vehicle, state, track, drivers);
      });

      this.updatePositions(state, track);
      this.updateMoraleAndConcentration(state, dt); // Update driver morale and concentration
      this.updateSpatialAwareness(state, track);
      this.checkRaceFinish(state);
  }

  private updateMoraleAndConcentration(state: RaceState, dt: number): void {
      state.vehicles.forEach(vehicle => {
          // --- MORALE LOGIC ---
          // 1. Natural Decay/Recovery towards Baseline (80)
          const baselineMorale = 80;
          const diffMorale = baselineMorale - vehicle.morale;
          vehicle.morale += diffMorale * 0.01 * dt;

          // 2. Situational Effects on Morale
          if (vehicle.inDirtyAir) vehicle.morale -= 0.5 * dt;
          if (vehicle.gapToAhead < 0.5 && vehicle.position > 1) vehicle.morale += 0.2 * dt;

          // Clamp Morale
          vehicle.morale = Math.max(0, Math.min(100, vehicle.morale));
          
          
          // --- CONCENTRATION LOGIC ---
          // Base Recovery Rate (Drivers naturally regain focus)
          // Takes about 10-20s to recover full focus from a drop
          let recoveryRate = 5.0 * dt; 
          
          // Situational Drains
          
          // 1. Start Chaos (First Lap, Sector 1) - Massive Drain
          if (state.currentLap === 1 && vehicle.currentSector === 1) {
              // High traffic stress
              // Drain depends on traffic density (neighbors)
              // But simple approximation: constant drain + random noise
              recoveryRate = -10.0 * dt; // Net loss of 10/s
          }
          
          // 2. Battling (High focus demand, mental fatigue or simply "using" focus)
          // Actually, battling consumes concentration capacity.
          if (vehicle.isBattling) {
              recoveryRate -= 2.0 * dt;
          }
          
          // 3. Dirty Air (Frustration/Visibility)
          if (vehicle.inDirtyAir) {
              recoveryRate -= 1.0 * dt;
          }
          
          // Apply Change
          vehicle.concentration += recoveryRate;
          
          // Clamp Concentration
          vehicle.concentration = Math.max(0, Math.min(100, vehicle.concentration));
      });
  }

  private updateSafetyCar(state: RaceState, track: Track, dt: number): void {
    if (state.safetyCar === 'none') return;

    this.safetyCarTimer -= dt;
    if (this.safetyCarTimer <= 0) {
        if (state.safetyCar === 'red-flag') {
            this.performRedFlagRestart(state, track);
        }
        state.safetyCar = 'none';
        this.safetyCarTimer = 0;
    }
  }

  private performRedFlagRestart(state: RaceState, track: Track): void {
      // Sort active vehicles by position
      const activeVehicles = state.vehicles
          .filter(v => v.damage < 100 && !v.hasFinished)
          .sort((a, b) => a.position - b.position);

      // Reset positions to a standing start formation or rolling restart
      // We'll place them just before the start line
      const gridSpacing = 16; // meters
      let currentDist = track.totalDistance - 50; // Start 50m before line

      activeVehicles.forEach((vehicle, index) => {
          // Reset distance
          vehicle.distanceOnLap = currentDist - (index * gridSpacing);
          if (vehicle.distanceOnLap < 0) {
              vehicle.distanceOnLap += track.totalDistance;
          }
          
          // Unlap cars: Set lap count to leader's lap count
          // (Simplify: Everyone restarts on lead lap for excitement, or keep laps? 
          // Real F1 unlaps. Let's unlap.)
          if (index === 0) {
              // Leader
          } else {
              vehicle.lapCount = activeVehicles[0].lapCount;
          }
          
          // Reset speed
          vehicle.speed = 0;
          
          // Reset gaps
          vehicle.gapToLeader = 0; // Will be recalculated
          vehicle.gapToAhead = 0;
          
          // Reset internal states
          vehicle.isBattling = false;
          vehicle.inDirtyAir = false;
          vehicle.blueFlag = false;
      });
  }

  private checkIncidents(state: RaceState, track: Track, drivers: Map<string, Driver>, dt: number): void {
      if (state.safetyCar !== 'none' || state.status !== 'racing') return;
      if (state.currentLap < 2) return; // No incidents on lap 1 for now

      // Bottom-up Incident Logic: Check each driver's risk
      const activeVehicles = state.vehicles.filter(v => v.damage < 100 && !v.hasFinished);
      
      for (const vehicle of activeVehicles) {
          const driver = drivers.get(vehicle.driverId);
          if (!driver) continue;

          // 1. Base Probability (Time-based)
          // Target: ~1-2 incidents per race (90 mins) across 20 cars.
          // Base rate per car approx 1 incident per 15-20 hours of driving.
          // 1 / 60000 per second
          let risk = 0.00001 * dt; 

          // 2. Situational Multipliers
          
          // CONCENTRATION IMPACT (New)
          // Low concentration increases risk exponentially
          // 100 -> 1x
          // 50 -> 2x
          // 20 -> 5x
          // 0 -> 10x
          const concentrationFactor = 1.0 + (100 - vehicle.concentration) / 10.0;
          risk *= concentrationFactor;

          // Battling is dangerous
          if (vehicle.isBattling) {
              risk *= 4;
              
              // NEW: Add risk based on Attack Intensity
              // If driver is aggressive and faster than car ahead, risk increases
              // We need to estimate if they are "Attacking" or "Stuck"
              // (Simplification: If battling and Aggression > 50, add risk)
              if (driver.personality.aggression > 60) {
                  risk *= 1.5; 
              }
          }
          
          // Dirty Air
          if (vehicle.inDirtyAir) risk *= 1.5; // Reduced from 2

          // 3. Tyre State
          // High wear (>70%) increases risk exponentially
          if (vehicle.tyreWear > 70) {
              risk *= 1 + ((vehicle.tyreWear - 70) / 15); // Reduced slope
          }

          // 4. Weather
          if (state.weather !== 'dry') {
               // Rain risk
               if (vehicle.tyreCompound === 'soft' || vehicle.tyreCompound === 'medium' || vehicle.tyreCompound === 'hard') {
                   // Wrong tyres! High risk but not instant death
                   risk *= 10; // Reduced from 50
               } else {
                   // Wet/Inter
                   risk *= 2; // Reduced from 3
               }
          }

          // 5. Driver Skill & Traits
          // Consistency: Low consistency = Higher Risk
          const consistencyFactor = driver.skill.consistency / 100; // 0-1
          risk *= (1 + (1 - consistencyFactor) * 3); // Reduced max multiplier from 6 to 3

          // Stress: High stress / Low resistance
          const stressFactor = vehicle.stress / 100;
          const resistance = driver.personality.stressResistance / 100;
          if (stressFactor > 0.8) {
              risk *= (1 + (1 - resistance) * 2); // Reduced from 3
          }

          // 6. Track Difficulty
          const difficulty = track.trackDifficulty || 0.5;
          risk *= (1 + difficulty * 0.5); // Reduced impact

          // Final Check
          if (this.rng.chance(risk)) {
               // INCIDENT TRIGGERED!
               // Now decide severity based on context
               let severityScore = 0; // 0-100

               // Speed factor (High speed = worse crash)
               if (vehicle.speed > 60) severityScore += 40; // > 216kph
               if (vehicle.speed > 80) severityScore += 20; // > 288kph

               // Sector type
               const currentSector = track.sectors[vehicle.currentSector - 1];
               if (currentSector) {
                   if (currentSector.type === 'corner_high_speed') severityScore += 30;
                   if (currentSector.type === 'straight') severityScore += 10;
               }
               
               // Random chaos
               severityScore += this.rng.range(0, 30);

               // Determine Flag
               if (severityScore > 80) {
                   // Major Crash -> Red Flag
                   state.safetyCar = 'red-flag';
                   this.safetyCarTimer = this.rng.range(15, 45);
                   vehicle.damage = 100; // DNF
                   vehicle.speed = 0;
               } else if (severityScore > 50) {
                   // Crash -> Safety Car
                   state.safetyCar = 'sc';
                   this.safetyCarTimer = this.rng.range(180, 400); // 3-6 mins
                   
                   if (this.rng.chance(0.7)) {
                       vehicle.damage = 100; // DNF
                       vehicle.speed = 0;
                   } else {
                       vehicle.damage += this.rng.range(30, 60); // Major damage
                   }
               } else {
                   // Spin / Minor -> VSC
                   state.safetyCar = 'vsc';
                   this.safetyCarTimer = this.rng.range(45, 120);
                   vehicle.damage += this.rng.range(5, 20); // Wing damage
                   vehicle.speed *= 0.3; // Slow down from spin
               }
               
               // Only one incident per tick to avoid chaos
               return;
          }
      }
  }

  private handlePitStopLogic(vehicle: VehicleState, state: RaceState, track: Track, dt: number, strategySystem: StrategySystem): void {
      if (!vehicle.isInPit) return;

      const speedLimit = track.pitLane?.speedLimit ?? 22.2; // 80kph default

      // Initialize state if not present
      if (!this.pitStates.has(vehicle.id)) {
          // 1. Calculate Stop Duration (Mechanics)
          let stopDuration = this.rng.range(2.0, 2.8);
          // 1% chance of error (4-10s)
          if (this.rng.chance(0.01)) {
              stopDuration = this.rng.range(4.0, 10.0);
          }
          
          // Damage Repair (Wing change)
          if (vehicle.damage > 10) {
              stopDuration += 10.0; // Significant time loss for repairs
          }
          
          // 2. Lane Time Calculation
          // Calculate track distance to cover (Entry -> Exit)
          const entryDist = track.pitLane?.entryDistance ?? (track.totalDistance - 200);
          const exitDist = track.pitLane?.exitDistance ?? 200;
          
          let laneTrackDist = 0;
          if (exitDist < entryDist) {
              laneTrackDist = (track.totalDistance - entryDist) + exitDist;
          } else {
              laneTrackDist = exitDist - entryDist;
          }
          
          // Use provided stopTime as lane travel time, or calculate from speed limit
          // stopTime in track data usually represents the "loss" or "time in lane".
          // We treat it as the driving time component.
          let laneTime = track.pitLane?.stopTime ?? (laneTrackDist / speedLimit);
          
          // Minimum safe duration
          if (laneTime < 5) laneTime = 5;

          const totalDuration = laneTime + stopDuration;
          
          this.pitStates.set(vehicle.id, {
              timeLeft: totalDuration,
              totalDuration,
              stopDuration,
              laneTime,
              entryDist,
              laneTrackDist
          });
      }
      
      const pitState = this.pitStates.get(vehicle.id)!;
      pitState.timeLeft -= dt;
      
      const timeElapsed = pitState.totalDuration - pitState.timeLeft;
      const stopStart = pitState.laneTime / 2;
      const stopEnd = stopStart + pitState.stopDuration;
      
      // Calculate Absolute Progress Distance in Pit Lane
      let progressDist = 0;
      if (timeElapsed < stopStart) {
          // Driving to box
          progressDist = (timeElapsed / pitState.laneTime) * pitState.laneTrackDist;
          vehicle.speed = speedLimit;
      } else if (timeElapsed < stopEnd) {
          // Stopped
          progressDist = 0.5 * pitState.laneTrackDist; // Exactly halfway (or at stop point)
          vehicle.speed = 0;
      } else {
          // Driving from box
          const moveTime = timeElapsed - pitState.stopDuration;
          progressDist = (moveTime / pitState.laneTime) * pitState.laneTrackDist;
          vehicle.speed = speedLimit;
      }

      // Update Map Position
      // Pos = Entry + Progress
      let targetPos = pitState.entryDist + progressDist;
      
      // Handle Wrap
      if (targetPos >= track.totalDistance) {
          targetPos -= track.totalDistance;
      }

      // Detect Wrap for Lap Count
      const oldDist = vehicle.distanceOnLap;
      vehicle.distanceOnLap = targetPos;

      // Lap Logic (Crossing Line in Pit)
      // Detect wrap: oldDist > 90% && targetPos < 10%
      if (oldDist > (track.totalDistance * 0.9) && targetPos < (track.totalDistance * 0.1)) {
        vehicle.lapCount++;
        vehicle.lastLapTime = vehicle.currentLapTime;
        vehicle.currentLapTime = 0;
        vehicle.tyreAgeLaps++;
        
        // Update race current lap if leader
        if (vehicle.position === 1) {
             state.currentLap = vehicle.lapCount;
        }
      }
      
      // Update Odometer
      if (vehicle.speed > 0) {
        vehicle.totalDistance += (vehicle.speed * dt);
      }
      
      vehicle.currentLapTime += dt;
    
    if (pitState.timeLeft <= 0) {
          // Pit Complete
          this.pitStates.delete(vehicle.id);
          vehicle.isInPit = false;
          
          // Snap to exit distance to avoid visual drift
          if (track.pitLane) {
              vehicle.distanceOnLap = track.pitLane.exitDistance;
          }

          vehicle.boxThisLap = false;
          vehicle.pitStopCount++;
          
          // Service Car
          vehicle.tyreCompound = strategySystem.getPitCompound(vehicle, state, track.totalLaps);
          // Update Plan Progress
          if (vehicle.strategyPlan) {
              vehicle.strategyPlan.currentStintIndex++;
          }
          
          vehicle.tyreWear = 0;
          vehicle.tyreAgeLaps = 0;
          vehicle.damage = 0; // Repaired
      }
  }

  private updatePositions(state: RaceState, track: Track): void {
    // Standard race position logic
    state.vehicles.sort((a, b) => {
        if (a.lapCount !== b.lapCount) return b.lapCount - a.lapCount;
        return b.distanceOnLap - a.distanceOnLap;
    });
    
    state.vehicles.forEach((v, i) => {
        // Track position changes
        v.lastPosition = v.position;
        v.position = i + 1;

        // Instant Morale Impact from Overtaking
        if (v.position < v.lastPosition) {
            // Overtook someone! (Position number decreased)
            // Big Boost
            v.morale = Math.min(100, v.morale + 10);
            
            // Concentration Hit (Excitement/Adrenaline spike can lower focus temporarily)
            v.concentration = Math.max(0, v.concentration - 5);
            
        } else if (v.position > v.lastPosition) {
            // Got Overtaken!
            // Big Drop
            v.morale = Math.max(0, v.morale - 10);
            
            // Concentration Hit (Stress/Panic)
            v.concentration = Math.max(0, v.concentration - 10);
        }

        // Calculate gap to ahead (Leaderboard sense)
        if (i === 0) {
            v.gapToLeader = 0;
            v.gapToAhead = 0;
        } else {
            const ahead = state.vehicles[i - 1];
            
            // Gap to Ahead = (Ahead Total Dist - My Total Dist) / My Speed
            // Using Total Distance simplifies logic (handles laps automatically)
            // Note: v.totalDistance is odometer. We should use "Race Distance" (Laps * TrackLen + CurrentDist)
            // But v.totalDistance is physical distance driven. If they go off track, it might differ?
            // Safer to recalculate "Race Distance"
            const raceDist = (v.lapCount * track.totalDistance) + v.distanceOnLap;
            const raceDistAhead = (ahead.lapCount * track.totalDistance) + ahead.distanceOnLap;
            
            const distDiffAhead = raceDistAhead - raceDist;
            
            // Use chasing car's speed (Time to catch)
            // Fallback to 60m/s if stopped to avoid infinite gap
            const speed = Math.max(v.speed, 20); 
            v.gapToAhead = distDiffAhead / speed;
            
            // Gap to Leader = Sum of all gaps ahead? Or direct calc?
            // Direct calc is cleaner:
            const leader = state.vehicles[0];
            const raceDistLeader = (leader.lapCount * track.totalDistance) + leader.distanceOnLap;
            const distDiffLeader = raceDistLeader - raceDist;
            
            // Standard: Gap to leader is Time for ME to reach Leader's position
            v.gapToLeader = distDiffLeader / speed;
        }
    });
  }

  private updateSpatialAwareness(state: RaceState, track: Track): void {
      // 1. Sort by physical location on track (ignore laps)
      // distanceOnLap descending = order on track
      const sortedByLocation = [...state.vehicles].sort((a, b) => b.distanceOnLap - a.distanceOnLap);
      
      const trackLength = track.totalDistance;

      sortedByLocation.forEach((vehicle, index) => {
          // Find car physically ahead
          // If index 0 (furthest along track), ahead is the last car (closest to start) but wrapped around
          let aheadVehicle: VehicleState;
          let physicalDistGap = 0;

          if (index === 0) {
              aheadVehicle = sortedByLocation[sortedByLocation.length - 1];
              // Gap is (TrackEnd - MyDist) + AheadDist
              physicalDistGap = (trackLength - vehicle.distanceOnLap) + aheadVehicle.distanceOnLap;
          } else {
              aheadVehicle = sortedByLocation[index - 1];
              // Gap is AheadDist - MyDist
              physicalDistGap = aheadVehicle.distanceOnLap - vehicle.distanceOnLap;
          }

          // Convert distance gap to time gap (Physical Gap)
          // Use vehicle's own speed to estimate time to arrival
          const closingSpeed = Math.max(10, vehicle.speed); // Prevent div by zero
          const physicalTimeGap = physicalDistGap / closingSpeed;

          // 2. Dirty Air Logic (Physical Proximity)
          // If within 1.5s of ANY car ahead physically
          if (physicalTimeGap < 1.5) {
              vehicle.inDirtyAir = true;
          } else {
              vehicle.inDirtyAir = false;
          }

          // 3. Battling Logic (Physical Proximity)
          // If within 0.4s
          if (physicalTimeGap < 0.4) {
              vehicle.isBattling = true;
          } else {
              vehicle.isBattling = false;
          }

          // 4. Blue Flag Logic
          // If the car physically behind me is LAPPING me
          // I am 'vehicle'. 'aheadVehicle' is in front of me.
          // Who is behind me? The one at index + 1 (or 0 if I am last)
          
          // Let's look backwards to find if I'm being lapped
          let behindVehicle: VehicleState;
          let gapFromBehind = 0;
          
          if (index === sortedByLocation.length - 1) {
              behindVehicle = sortedByLocation[0];
              // Behind is at 4900. Me at 100.
              // Gap = (5000 - 4900) + 100 = 200m.
              gapFromBehind = (trackLength - behindVehicle.distanceOnLap) + vehicle.distanceOnLap;
          } else {
              behindVehicle = sortedByLocation[index + 1];
              gapFromBehind = vehicle.distanceOnLap - behindVehicle.distanceOnLap;
          }
          
          const gapTimeFromBehind = gapFromBehind / Math.max(10, behindVehicle.speed);

          // Check for Blue Flag condition
          // If car behind is close (< 1.2s) AND is on a higher lap (lapping me)
          if (gapTimeFromBehind < 1.2 && behindVehicle.lapCount > vehicle.lapCount) {
              vehicle.blueFlag = true;
          } else {
              vehicle.blueFlag = false;
          }
      });
  }

  private attemptOvertake(attacker: VehicleState, state: RaceState, track: Track, drivers: Map<string, Driver>): void {
      // Only attempt if battling and not already ahead
      // We need to find the defender (car directly ahead)
      if (!attacker.isBattling || attacker.position === 1) return;

      const defender = state.vehicles.find(v => v.position === attacker.position - 1);
      if (!defender) return;

      // Overtake probability check
      // 1. Skill difference (Racecraft)
      const attackerDriver = drivers.get(attacker.driverId);
      const defenderDriver = drivers.get(defender.driverId);
      if (!attackerDriver || !defenderDriver) return;

      const skillDelta = attackerDriver.skill.racecraft - defenderDriver.skill.racecraft; // e.g., 90 - 80 = 10
      
      // 2. Pace delta (Speed difference)
      const speedDelta = attacker.speed - defender.speed; // m/s
      
      // 3. DRS Advantage
      const drsBonus = attacker.drsOpen ? 30 : 0; // +30% chance if DRS open

      // 4. Tyre delta (Age difference)
      const tyreDelta = defender.tyreAgeLaps - attacker.tyreAgeLaps; // Positive if defender has older tyres

      // 5. Track Difficulty (Overtaking)
      // High difficulty reduces score
      const overtakingDiff = track.overtakingDifficulty || 0.5;
      const difficultyPenalty = overtakingDiff * 20; // 0-20 penalty

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
      score -= difficultyPenalty;

      // Rookie Chance Floor (Randomness)
      
      let probPerSecond = 0.2; // 20% base
      probPerSecond += (score / 100) * 0.5; // Add up to 50% from score
      
      // Let's normalize score to 0-1 probability
      let successProb = Math.max(0.05, Math.min(0.95, probPerSecond));
      
      // Apply 30% "Anything can happen" noise
      // 30% of the time, we ignore the skill/stats and flip a coin (50/50)
      if (this.rng.chance(0.3)) {
          successProb = 0.5; 
      }

      // Check for pass
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

  private updateDRS(vehicle: VehicleState, state: RaceState, track: Track): void {
      if (state.currentLap < 3 || state.weather !== 'dry' || state.safetyCar !== 'none') {
          vehicle.drsOpen = false;
          return;
      }

      // Check if in DRS activation zone
      const inZone = track.drsZones.some(zone => 
          vehicle.distanceOnLap >= zone.activationDistance && vehicle.distanceOnLap <= zone.endDistance
      );

      if (inZone) {
          // Check if within 1 second of car ahead at detection point
          // Simplified: If gapToAhead < 1.0s and we are not the leader
          // NOTE: gapToAhead here is still based on Race Position (Lap + Dist).
          if (vehicle.position > 1 && vehicle.gapToAhead < 1.0) {
              vehicle.drsOpen = true;
          }
      } else {
          vehicle.drsOpen = false;
      }
  }

  private checkRaceFinish(state: RaceState): void {
    // 1. Check if leader has finished
    if (!state.checkeredFlag) {
        // Sort by position to ensure we find the actual leader
        const leader = state.vehicles.find(v => v.position === 1);
        if (leader && leader.lapCount >= state.totalLaps) {
             state.checkeredFlag = true;
             state.winnerId = leader.driverId;
             leader.hasFinished = true;
        }
    }

    // 2. Check if all active cars have finished
    const activeVehicles = state.vehicles.filter(v => v.damage < 100);
    const allFinished = activeVehicles.every(v => v.hasFinished);
    
    if (state.checkeredFlag && allFinished) {
      state.status = 'finished';
    }
  }
}
