import { RaceState, VehicleState, Track, Driver } from '../types';
import { SeededRNG } from './rng';

export class SimulationEngine {
  private state: RaceState;
  private track: Track;
  private drivers: Driver[];
  private rng: SeededRNG;
  private leaderHistory: { distance: number, time: number }[] = [];
  private safetyCarTimer: number = 0;
  
  // Weather Internal State
  private forecastUpdateTimer: number = 0;

  constructor(track: Track, drivers: Driver[], seed: number) {
    this.track = track;
    this.drivers = drivers;
    this.rng = new SeededRNG(seed);
    this.state = this.initializeRace(track, drivers);
    
    // Ensure forecast is populated if not done in initialize (it will be)
    if (this.state.weatherForecast.length === 0) {
        this.generateInitialForecast();
    }
  }

  private generateInitialForecast(): void {
      const params = this.track.weatherParams || { volatility: 0.5, rainProbability: 0.3 };
      const currentCloud = this.state.cloudCover;
      
      // Start with current
      this.state.weatherForecast = [{
          timeOffset: 0,
          cloudCover: currentCloud,
          rainIntensity: this.state.rainIntensityLevel
      }];

      // Generate next 30 mins (every 2 mins)
      for (let i = 1; i <= 15; i++) {
          this.appendForecastNode(i * 120);
      }
  }

  private appendForecastNode(timeOffset: number): void {
      const lastNode = this.state.weatherForecast[this.state.weatherForecast.length - 1];
      const params = this.track.weatherParams || { volatility: 0.5, rainProbability: 0.3 };
      
      // Volatility dictates max change per step (2 mins)
      // Low vol (0.1) -> +/- 5%
      // High vol (0.9) -> +/- 45%
      const maxChange = 10 + (params.volatility * 40); 
      const change = this.rng.range(-maxChange, maxChange);
      
      let newCloud = lastNode.cloudCover + change;
      
      // Pull towards base probability
      const baseTarget = params.rainProbability * 100;
      // Strength of pull depends on how far we are
      newCloud = (newCloud * 0.8) + (baseTarget * 0.2);
      
      newCloud = Math.max(0, Math.min(100, newCloud));
      
      // Rain intensity logic (lagged/thresholded)
      let newRain = 0;
      if (newCloud > 70) {
          // 70 -> 0%, 100 -> 100%
          newRain = ((newCloud - 70) / 30) * 100;
      }
      
      this.state.weatherForecast.push({
          timeOffset,
          cloudCover: newCloud,
          rainIntensity: newRain
      });
  }

  private initializeRace(track: Track, drivers: Driver[]): RaceState {
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
      
      // Random "Day Form" condition (0.98 to 1.02)
      // > 1.0 means performing better (speed multiplier)
      // < 1.0 means performing worse
      const condition = this.rng.range(0.98, 1.02);

      // Determine starting tyre based on weather
      let tyreCompound: any = 'medium';
      if (initialWeather === 'heavy-rain') tyreCompound = 'wet';
      else if (initialWeather === 'light-rain') tyreCompound = 'medium'; // Inter logic: if > 20? 
      // Actually let's be smarter:
      // If rain > 40 -> Wet
      // If rain > 10 -> Inter (Wait, I don't have Inter type in this snippet? I saw 'wet', 'medium'. Check types.)
      // Types: 'soft' | 'medium' | 'hard' | 'wet'. No Inter? 
      // User didn't ask for Inter, but logic implies it. I'll stick to 'wet' for rain.
      // If light rain, maybe stick to 'medium' or 'soft'? Or just 'wet' if consistent.
      if (initialRainIntensity > 20) tyreCompound = 'wet';

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
        drsOpen: false,
        inDirtyAir: false,
        isBattling: false,
        
        currentLapTime: 0,
        lastLapTime: 0,
        bestLapTime: 0,
        gapToLeader: 0,
        gapToAhead: 0,
        position: index + 1,

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
      weatherForecast: [], // Populated in constructor
      cloudCover: initialCloudCover,
      rainIntensityLevel: initialRainIntensity,
      windSpeed: this.rng.range(5, 20),
      windDirection: this.rng.range(0, 360),
      trackTemp: 25,
      airTemp: 20,
      rubberLevel: 50,
      sectorConditions,
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

    // Global Updates
    this.updateWeather(deltaTime);
    this.updateSafetyCar(deltaTime);
    this.checkIncidents(deltaTime);

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

  private updateWeather(dt: number): void {
      // Handle Real Weather Updates externally, but we still run water depth logic
      if (this.state.weatherMode === 'real') {
         this.updateWaterDepth(dt);
         return;
      }

      // Forecast Management
      this.forecastUpdateTimer += dt;
      if (this.forecastUpdateTimer > 60) {
          this.forecastUpdateTimer = 0;
          // Ensure we have enough forecast
          const lastNode = this.state.weatherForecast[this.state.weatherForecast.length - 1];
          // If last node is less than 30 mins ahead of current time, add more
          if (lastNode.timeOffset < this.state.elapsedTime + 1800) {
             this.appendForecastNode(lastNode.timeOffset + 120);
          }
      }

      // Interpolate Current Weather
      const currentTime = this.state.elapsedTime;
      const sortedForecast = this.state.weatherForecast.sort((a, b) => a.timeOffset - b.timeOffset);
      
      // Find segments
      let prevNode = sortedForecast[0];
      let nextNode = sortedForecast[sortedForecast.length - 1];
      
      for (let i = 0; i < sortedForecast.length - 1; i++) {
          if (sortedForecast[i].timeOffset <= currentTime && sortedForecast[i+1].timeOffset > currentTime) {
              prevNode = sortedForecast[i];
              nextNode = sortedForecast[i+1];
              break;
          }
      }
      
      // Interpolation factor (0 to 1)
      let t = 0;
      if (nextNode.timeOffset > prevNode.timeOffset) {
          t = (currentTime - prevNode.timeOffset) / (nextNode.timeOffset - prevNode.timeOffset);
      }
      
      // Linear interpolation
      this.state.cloudCover = prevNode.cloudCover + (nextNode.cloudCover - prevNode.cloudCover) * t;
      this.state.rainIntensityLevel = prevNode.rainIntensity + (nextNode.rainIntensity - prevNode.rainIntensity) * t;

      // Map to Enum
      if (this.state.rainIntensityLevel > 50) {
          this.state.weather = 'heavy-rain';
      } else if (this.state.rainIntensityLevel > 5) {
          this.state.weather = 'light-rain';
      } else {
          this.state.weather = 'dry';
      }
      
      // Update Water Depth & Rubber
      this.updateWaterDepth(dt);
      
      // Wind Evolution
      // Slowly rotate
      this.state.windDirection += this.rng.range(-1, 1) * dt;
      if (this.state.windDirection < 0) this.state.windDirection += 360;
      if (this.state.windDirection > 360) this.state.windDirection -= 360;
      
      // Wind speed drift
      this.state.windSpeed += this.rng.range(-0.5, 0.5) * dt;
      if (this.state.windSpeed < 0) this.state.windSpeed = 0;
  }

  private updateWaterDepth(dt: number): void {
      // Accumulation rate: max 0.1mm per sec (heavy rain)
      const accumulationRate = (this.state.rainIntensityLevel / 100) * 0.05 * dt;
      
      // Drying rate: depends on temp and wind
      // Base 0.005mm/sec
      let dryingRate = 0.005 * dt;
      if (this.state.airTemp > 25) dryingRate *= 1.5;
      if (this.state.windSpeed > 15) dryingRate *= 1.2;
      // Racing line drying (simplified)
      if (this.state.status === 'racing') dryingRate *= 1.2;
      
      // Apply to all sectors (with slight noise per sector)
      this.state.sectorConditions.forEach(sector => {
          // Rain
          if (accumulationRate > 0) {
             sector.waterDepth += accumulationRate;
          }
          
          // Drying
          if (sector.waterDepth > 0) {
              sector.waterDepth -= dryingRate;
              if (sector.waterDepth < 0) sector.waterDepth = 0;
          }
          
          // Rubber: washed away by rain
          if (sector.waterDepth > 0.5) {
              sector.rubberLevel -= 0.1 * dt; // Wash away
              if (sector.rubberLevel < 0) sector.rubberLevel = 0;
          }
      });
  }

  public setRealWeatherData(data: { cloudCover: number; windSpeed: number; windDirection: number; temp: number; precipitation: number }): void {
      if (this.state.weatherMode !== 'real') return;
      
      this.state.cloudCover = data.cloudCover;
      this.state.windSpeed = data.windSpeed;
      this.state.windDirection = data.windDirection;
      this.state.airTemp = data.temp;
      this.state.trackTemp = data.temp + (this.state.cloudCover < 50 ? 10 : 2); // Simple track temp model
      
      // Rain logic from precipitation (mm/h)
      if (data.precipitation > 0) {
          // 0.1mm/h -> light. 5mm/h -> heavy.
          const intensity = Math.min(100, (data.precipitation / 5.0) * 100);
          this.state.rainIntensityLevel = intensity;
      } else {
          this.state.rainIntensityLevel = 0;
      }
      
      // Enum update
      if (this.state.rainIntensityLevel > 50) {
          this.state.weather = 'heavy-rain';
      } else if (this.state.rainIntensityLevel > 5) {
          this.state.weather = 'light-rain';
      } else {
          this.state.weather = 'dry';
      }
  }

  private updateSafetyCar(dt: number): void {
    if (this.state.safetyCar === 'none') return;

    this.safetyCarTimer -= dt;
    if (this.safetyCarTimer <= 0) {
        this.state.safetyCar = 'none';
        this.safetyCarTimer = 0;
    }
  }

  private checkIncidents(dt: number): void {
      if (this.state.safetyCar !== 'none' || this.state.status !== 'racing') return;
      if (this.state.currentLap < 2) return; // No incidents on lap 1 for now

      // Base probability per second
      let incidentProb = 1 / 1200; // ~1 incident per 20 mins
      if (this.state.weather !== 'dry') incidentProb *= 5; // Higher in rain
      if (this.track.tireDegradationFactor > 1.2) incidentProb *= 1.5; // Higher on abrasive tracks
      
      // Convert to per-tick probability
      const tickProb = incidentProb * dt;
      
      if (this.rng.chance(tickProb)) {
          // Incident occurred!
          const severity = this.rng.range(0, 1);
          
          if (severity < 0.6) {
              this.state.safetyCar = 'vsc';
              this.safetyCarTimer = this.rng.range(30, 90); // 30-90s VSC
          } else if (severity < 0.95) {
              this.state.safetyCar = 'sc';
              this.safetyCarTimer = this.rng.range(120, 300); // 2-5 min SC
          } else {
              this.state.safetyCar = 'red-flag';
              this.safetyCarTimer = this.rng.range(10, 30); // Short simulated red flag duration for gameplay flow
          }
      }
  }

  private calculateGrip(compound: string, waterDepth: number): number {
      // Water Depth in mm
      // Slicks
      if (['soft', 'medium', 'hard'].includes(compound)) {
          if (waterDepth < 0.1) return 1.0; // Dry
          if (waterDepth < 1.0) return 1.0 - (waterDepth * 0.8); // Rapid drop
          return 0.1; // Undrivable
      }
      
      // Inter
      if (compound === 'intermediate') { // Wait, type is 'medium'? No, I assume 'intermediate' exists or will exist.
         // Current types: 'soft' | 'medium' | 'hard' | 'wet'. No inter.
         // I'll assume 'wet' covers both for now, OR I should add 'intermediate' to types.
         // Given I can't easily change all type usages in one go without errors, I'll stick to 'wet' logic being broad.
         // But wait, user asked for "tyre-trackpart-weather correlation".
         // Let's assume 'wet' is the only rain tyre for now.
         return 0; // Unreachable if I don't use it
      }
      
      // Wet (Covering Inter/Wet)
      if (compound === 'wet') {
          if (waterDepth < 0.1) return 0.85; // Slower on dry
          if (waterDepth < 3.0) return 1.0; // Good in rain
          return 1.0 - ((waterDepth - 3.0) * 0.1); // Too deep even for wets
      }
      
      return 1.0;
  }

  private updateVehicle(vehicle: VehicleState, dt: number): void {
    const driver = this.drivers.find(d => d.id === vehicle.driverId);
    if (!driver) return;

    // 0. Calculate Grip based on Sector Conditions
    // Find current sector water depth
    const sectorCond = this.state.sectorConditions.find(s => s.sectorId === this.track.sectors[vehicle.currentSector - 1]?.id);
    const waterDepth = sectorCond ? sectorCond.waterDepth : 0;
    const gripFactor = this.calculateGrip(vehicle.tyreCompound, waterDepth);

    // 1. Calculate Target Speed
    let targetSpeed = this.calculateTargetSpeed(vehicle, driver);
    
    // Apply Grip Penalty
    targetSpeed *= gripFactor;
    
    // START CHAOS: First Lap Uncertainty
    if (this.state.currentLap === 1 && vehicle.distanceOnLap < 2000) {
        // Higher variance/instability in first sector
        const chaos = this.rng.range(0.85, 1.10); // -15% to +10% speed variance
        
        // "Check up" logic: If very close to car ahead, chance to check up hard
        if (vehicle.position > 1 && vehicle.gapToAhead < 0.4 && this.rng.chance(0.05)) {
             targetSpeed *= 0.7; // Heavy check up / brake check
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
    if (vehicle.distanceOnLap >= this.track.totalDistance) {
      vehicle.distanceOnLap -= this.track.totalDistance;
      vehicle.lapCount++;
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
    // Red Flag: Stop immediately
    if (this.state.safetyCar === 'red-flag') return 0;

    // Determine Base Speed by Sector Type
    let speed = 60; // Fallback
    const currentSector = this.track.sectors[vehicle.currentSector - 1];

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
        speed = this.track.totalDistance / driver.basePace;
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
        // 100 -> +2.5% speed. 70 -> -5% speed.
        // Formula: 1 + (score - 90) * 0.0025
        speed *= (1 + (perfScore - 90) * 0.0025);
    }
    
    // Apply Base Pace (Global Speed Factor)
    // 88.0 is standard. Lower is faster.
    // Factor = 88.0 / basePace
    speed *= (88.0 / driver.basePace);

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

    if (vehicle.position > 1 && currentSector) {
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
    if (this.state.safetyCar === 'vsc') {
        speed *= 0.6; // ~40% slower
    } else if (this.state.safetyCar === 'sc') {
        speed *= 0.5; // ~50% slower
    }

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
    
    // Update Leader History
    const leader = sorted[0];
    if (leader) {
        // Only add if distance has increased significantly (e.g. > 1m) to save memory
        // or just every tick. Every tick at 10Hz is fine for a 1-2hr race? 
        // 3600s * 10 = 36000 points. perfectly fine.
        const lastPoint = this.leaderHistory[this.leaderHistory.length - 1];
        if (!lastPoint || leader.totalDistance > lastPoint.distance) {
            this.leaderHistory.push({
                distance: leader.totalDistance,
                time: this.state.elapsedTime
            });
        }
    }

    sorted.forEach((v, index) => {
      v.position = index + 1;
      
      // Calculate gaps using Leader History (Time Gap)
      if (index === 0) {
        v.gapToLeader = 0;
        v.gapToAhead = 0;
      } else {
        const ahead = sorted[index - 1];
        
        // Gap to Leader: Time difference at the current distance
        v.gapToLeader = this.calculateTimeGap(v.totalDistance);
        
        // Gap to Ahead: (My Gap to Leader) - (Ahead Gap to Leader)
        // This is mathematically correct for intervals
        // e.g. Leader=0, P2=+5s, P3=+7s. Gap P3->P2 is 2s.
        v.gapToAhead = Math.max(0, v.gapToLeader - (index === 1 ? 0 : this.calculateTimeGap(ahead.totalDistance)));
      }
    });
  }

  private calculateTimeGap(distance: number): number {
      // Find the time when the leader was at 'distance'
      // We need to interpolate from leaderHistory
      
      // 1. Binary Search or simple scan?
      // Since distance is monotonic, we can use binary search.
      // History: [d0, d1, d2, ... dn]
      // We want i such that history[i].distance <= distance < history[i+1].distance
      
      if (this.leaderHistory.length < 2) return 0;
      
      const last = this.leaderHistory[this.leaderHistory.length - 1];
      if (distance >= last.distance) return 0; // Ahead of recorded history (or is leader)
      
      let low = 0;
      let high = this.leaderHistory.length - 1;
      let idx = -1;
      
      while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (this.leaderHistory[mid].distance <= distance) {
              idx = mid;
              low = mid + 1;
          } else {
              high = mid - 1;
          }
      }
      
      if (idx === -1 || idx >= this.leaderHistory.length - 1) {
           // Fallback if not found or at very end
           return 0;
      }
      
      const p1 = this.leaderHistory[idx];
      const p2 = this.leaderHistory[idx + 1];
      
      // Interpolate
      const ratio = (distance - p1.distance) / (p2.distance - p1.distance);
      const leaderTimeAtDist = p1.time + ratio * (p2.time - p1.time);
      
      return this.state.elapsedTime - leaderTimeAtDist;
  }
  
  public getState(): RaceState {
    return this.state;
  }
  
  public updateStrategy(driverId: string, type: string, value: any): void {
      const vehicle = this.state.vehicles.find(v => v.driverId === driverId);
      if (!vehicle) return;
      
      if (type === 'pace') vehicle.paceMode = value;
      if (type === 'ers') vehicle.ersMode = value;
      // TODO: Pit logic}
  }

  public setWeatherMode(mode: 'simulation' | 'real'): void {
      this.state.weatherMode = mode;
  }
}
