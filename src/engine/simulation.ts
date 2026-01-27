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
  private weatherTrend: number = 0; // -1.0 to 1.0 (Momentum)
  
  // Pit Stop State (id -> { timeLeft, totalDuration, stopDuration, laneTime })
  private pitStates: Map<string, { timeLeft: number, totalDuration: number, stopDuration: number, laneTime: number }> = new Map();

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
      const params = this.track.weatherParams || { volatility: 0.5, rainProbability: 0.3 };
      
      // WEATHER GENERATION: MULTI-FREQUENCY NOISE
      // Replaces simple random walk with a superposition of sine waves to create 
      // "Natural" weather fronts and storm systems.
      
      // Time basis (convert to hours approx for frequency scaling)
      const t = timeOffset; 
      
      // 1. "The Front" (Low Frequency) - Period ~2 hours (7200s)
      // Controls the overall "Day" weather (Sunny morning, Rainy afternoon)
      const macroWave = Math.sin(t / 2500);
      
      // 2. "The Storm System" (Medium Frequency) - Period ~20 mins (1200s)
      // Represents individual rain clouds or clearings
      const mesoWave = Math.sin(t / 500 + this.rng.range(0, 10)); // Offset by random
      
      // 3. "The Gusts" (High Frequency) - Period ~3 mins (180s)
      // Adds volatility and unpredictability
      const microWave = Math.sin(t / 80);
      
      // Combine Waves
      // Volatility param affects how much the faster waves contribute
      const noise = (macroWave * 0.5) + (mesoWave * 0.3 * params.volatility) + (microWave * 0.2 * params.volatility);
      
      // Map to Cloud Cover (0-100)
      // Center around rainProbability (e.g. 0.3 -> 30% chance of rain -> 70% cloud?)
      // Actually: rainProb is chance of rain.
      // If rainProb = 0.3, we want the system to be above "Rain Threshold" (70 cloud) 30% of the time.
      // Normalize noise (-1 to 1) to (0 to 1)
      const normNoise = (noise + 1) / 2;
      
      // Bias shift
      // If we want 30% rain, we need value > 0.7 30% of time.
      // normNoise is roughly Uniform(0,1) distribution (actually Bell-ish).
      // Let's just linearly map base probability.
      
      let baseCloud = 30; // Default sunny-ish
      if (params.rainProbability > 0.5) baseCloud = 60; // Default overcast
      
      // Apply noise
      let newCloud = baseCloud + (noise * 50); // +/- 50 variation
      
      // Add "Trend Momentum" from previous node to smooth discontinuities if we just switched algo?
      // No, this is a generative function based on t. It is deterministic for a given t sequence 
      // IF we kept phase. But here we use 't' which is absolute time offset.
      // So it will be smooth naturally!
      
      newCloud = Math.max(0, Math.min(100, newCloud));
      
      // Rain intensity logic (lagged/thresholded)
      let newRain = 0;
      if (newCloud > 70) {
          // 70 -> 0%, 100 -> 100%
          newRain = ((newCloud - 70) / 30) * 100;
          // Non-linear rain: usually light or heavy, rarely perfectly linear
          newRain = Math.pow(newRain / 100, 2) * 100; // Quadratic curve (more light rain, spikes to heavy)
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
      
      // Random "Day Form" condition (0.99 to 1.01) - Reduced variance to keep field closer
      // > 1.0 means performing better (speed multiplier)
      // < 1.0 means performing worse
      const condition = this.rng.range(0.99, 1.01);

      // Determine starting tyre based on weather
      let tyreCompound: any = 'soft';
      
      if (initialRainIntensity > 60) {
          tyreCompound = 'wet';
      } else if (initialRainIntensity > 15) {
          tyreCompound = 'intermediate';
      } else {
          // Dry Strategy Randomness
          // Base: 40% Soft, 40% Medium, 20% Hard
          // Modified by Driver Aggression (0-100)
          const aggression = driver.personality.aggression;
          const roll = this.rng.range(0, 100);
          
          // Higher aggression -> more likely Soft
          const softThreshold = 40 + (aggression * 0.2); // 40-60%
          const mediumThreshold = softThreshold + 40 - (aggression * 0.1); // +30-40%
          
          if (roll < softThreshold) tyreCompound = 'soft';
          else if (roll < mediumThreshold) tyreCompound = 'medium';
          else tyreCompound = 'hard';
      }

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
        blueFlag: false,
        
        currentLapTime: 0,
        lastLapTime: 0,
        bestLapTime: 0,
        gapToLeader: 0,
        gapToAhead: 0,
        position: index + 1,
        hasFinished: false,

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
      trackWaterDepth: 0, // Global average
      safetyCar: 'none',
      vehicles,
      status: 'pre-race',
      checkeredFlag: false,
      winnerId: null,
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

    // Update spatial awareness (gaps, blue flags, dirty air)
    this.updateSpatialAwareness();
    
    // Check race finish conditions
    
    // 1. Check if leader has finished
    if (!this.state.checkeredFlag) {
        // Sort by position to ensure we find the actual leader
        const leader = this.state.vehicles.find(v => v.position === 1);
        if (leader && leader.lapCount >= this.state.totalLaps) {
             this.state.checkeredFlag = true;
             this.state.winnerId = leader.driverId;
             leader.hasFinished = true;
        }
    }

    // 2. Check if all active cars have finished
    const activeVehicles = this.state.vehicles.filter(v => v.damage < 100);
    const allFinished = activeVehicles.every(v => v.hasFinished);
    
    if (this.state.checkeredFlag && allFinished) {
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
          
          // 1. Cleanup Past Nodes (Keep 1 for interpolation context)
          // "Only forecast the future"
          while (this.state.weatherForecast.length > 1 && this.state.weatherForecast[1].timeOffset <= this.state.elapsedTime) {
             this.state.weatherForecast.shift();
          }

          // 2. Ensure we have enough forecast
          const lastNode = this.state.weatherForecast[this.state.weatherForecast.length - 1];
          // Maintain 30 min horizon (1800s)
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
      const rainIntensity = this.state.rainIntensityLevel;
      
      // Accumulation Rate: 1mm per hour per 10% intensity (approx)
      // 100% rain -> 10mm/hour (Heavy Storm)
      const accumulationRate = (rainIntensity / 100) * (10 / 3600); // mm per second
      
      // Drainage Rate: Track naturally drains water
      // e.g. 2mm/hour
      const drainageRate = 2.0 / 3600;
      
      // Evaporation Rate: Based on ambient conditions
      // Dry/Windy = faster. 
      // Simplified: Base rate + bonus if not raining
      let evaporationRate = 0.5 / 3600;
      if (rainIntensity < 5) evaporationRate *= 4; // Dries fast when rain stops
      
      // Net Change
      let delta = 0;
      if (rainIntensity > 0) {
          delta = accumulationRate;
          // While raining, drainage works against it, but evaporation is negligible
          delta -= drainageRate;
      } else {
          // Drying phase
          delta = -(drainageRate + evaporationRate);
      }
      
      const depthChange = delta * dt;

      // Apply to all sectors
      this.state.sectorConditions.forEach(sector => {
          sector.waterDepth += depthChange;
          sector.waterDepth = Math.max(0, sector.waterDepth);
          
          // Rubber: washed away by rain
          if (sector.waterDepth > 0.5) {
              sector.rubberLevel -= 0.001 * dt;
          }
      });

      // Update global average
      this.state.trackWaterDepth += depthChange;
      this.state.trackWaterDepth = Math.max(0, this.state.trackWaterDepth);
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

  private handlePitStop(vehicle: VehicleState, dt: number): void {
      // Initialize state if not present
      if (!this.pitStates.has(vehicle.id)) {
          // 1. Calculate Stop Duration (Mechanics)
          let stopDuration = this.rng.range(2.0, 2.8);
          // 1% chance of error (4-10s)
          if (this.rng.chance(0.01)) {
              stopDuration = this.rng.range(4.0, 10.0);
          }
          
          // 2. Lane Time (Fixed ~20s)
          const laneTime = 20;
          const totalDuration = laneTime + stopDuration;
          
          this.pitStates.set(vehicle.id, {
              timeLeft: totalDuration,
              totalDuration,
              stopDuration,
              laneTime
          });
      }
      
      const state = this.pitStates.get(vehicle.id)!;
      state.timeLeft -= dt;
      
      const timeElapsed = state.totalDuration - state.timeLeft;
      const stopStart = state.laneTime / 2;
      const stopEnd = stopStart + state.stopDuration;
      
      // Speed Logic: Slow in lane, 0 when stopped
    if (timeElapsed < stopStart || timeElapsed > stopEnd) {
        vehicle.speed = 22; // 80kph
    } else {
        vehicle.speed = 0;
    }

    // UPDATE POSITION (Fix Teleporting)
    // Even in pit, we must move the car distance-wise so it traverses the pit lane on the map
    const distDelta = vehicle.speed * dt;
    vehicle.distanceOnLap += distDelta;
    vehicle.totalDistance += distDelta;
    vehicle.currentLapTime += dt;

    // Lap Logic (Crossing Line in Pit)
    if (vehicle.distanceOnLap >= this.track.totalDistance) {
        vehicle.distanceOnLap -= this.track.totalDistance;
        vehicle.lapCount++;
        vehicle.lastLapTime = vehicle.currentLapTime;
        vehicle.currentLapTime = 0;
        vehicle.tyreAgeLaps++;
        
        // Update race current lap if leader
        if (vehicle.position === 1) {
             this.state.currentLap = vehicle.lapCount;
        }
    }
    
    if (state.timeLeft <= 0) {
          // Pit Complete
          this.pitStates.delete(vehicle.id);
          vehicle.isInPit = false;
          vehicle.pitStopCount++;
          
          // Service Car
          const rain = this.state.rainIntensityLevel;
          if (rain > 60) vehicle.tyreCompound = 'wet';
          else if (rain > 10) vehicle.tyreCompound = 'intermediate';
          else {
               // Dry Logic
               const lapsLeft = this.state.totalLaps - this.state.currentLap;
               if (lapsLeft < 15) vehicle.tyreCompound = 'soft';
               else {
                   const roll = this.rng.range(0, 100);
                   if (roll < 50) vehicle.tyreCompound = 'medium';
                   else vehicle.tyreCompound = 'hard';
               }
          }
          
          vehicle.tyreWear = 0;
          vehicle.tyreAgeLaps = 0;
      }
  }

  private updateStrategyAI(vehicle: VehicleState, driver: Driver): void {
      // Only check near end of lap (Pit Entry Zone)
      const distToFinish = this.track.totalDistance - vehicle.distanceOnLap;
      if (distToFinish > 100 || distToFinish < 0) return;
      
      // Don't pit if already decided
      if (vehicle.isInPit) return;
      
      let pitNeeded = false;
      const rain = this.state.rainIntensityLevel;
      const compound = vehicle.tyreCompound;
      
      // 1. Weather / Tyre Mismatch
      if (rain > 60) {
          if (compound !== 'wet') pitNeeded = true;
      } else if (rain > 10) {
          if (compound !== 'intermediate' && compound !== 'wet') pitNeeded = true;
          // If on Wet, stick with it unless it really dries up or we want optimal speed?
          // Simplification: If rain > 10, Inter is best, Wet is passable. Slicks are bad.
      } else {
          // Dry (< 10)
          if (compound === 'wet' || compound === 'intermediate') pitNeeded = true;
      }

      // FORECAST INTELLIGENCE (Prevent short-sighted pitting)
      if (pitNeeded) {
          // Look ahead 5 minutes (300s)
          const lookahead = 300;
          let futureRain = 0;
          let count = 0;
          
          this.state.weatherForecast.forEach(f => {
              if (f.timeOffset > this.state.elapsedTime && f.timeOffset < this.state.elapsedTime + lookahead) {
                  futureRain += f.rainIntensity;
                  count++;
              }
          });
          
          const avgFutureRain = count > 0 ? futureRain / count : rain;
          
          // Determine ideal compound for FUTURE
          let futureIdeal = 'slick';
          if (avgFutureRain > 60) futureIdeal = 'wet';
          else if (avgFutureRain > 10) futureIdeal = 'intermediate';
          
          const currentType = (compound === 'wet' || compound === 'intermediate') ? compound : 'slick';
          
          // If we are currently on the tyre that matches the FUTURE, stay out!
          if (currentType === futureIdeal) {
              // EXCEPTION: Safety critical
              // If we are on Slicks in Heavy Rain (>60), we MUST pit regardless of forecast
              // If we are on Slicks in Light Rain (>20), it's risky but maybe manageable if forecast says Dry soon
              if (currentType === 'slick' && rain > 40) {
                  // Too dangerous, must pit
                  pitNeeded = true;
              } else {
                  // Smart decision: Stay out
                  pitNeeded = false;
              }
          }
      }
      
      // 2. Tyre Wear
      if (vehicle.tyreWear > 70) {
          pitNeeded = true;
      }
      
      if (pitNeeded) {
          vehicle.isInPit = true;
      }
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

  private updateVehicle(vehicle: VehicleState, dt: number): void {
    const driver = this.drivers.find(d => d.id === vehicle.driverId);
    if (!driver) return;

    // Handle Pit Stop Logic
    if (vehicle.isInPit) {
        this.handlePitStop(vehicle, dt);
        return;
    }

    // Check Strategy (AI)
    this.updateStrategyAI(vehicle, driver);

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
    if (vehicle.distanceOnLap >= this.track.totalDistance) {
      vehicle.distanceOnLap -= this.track.totalDistance;
      vehicle.lapCount++;
      
      // Checkered Flag Logic: Any lap completion after flag means finish
      if (this.state.checkeredFlag && !vehicle.hasFinished) {
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
    // Removed local update, handled in updateSpatialAwareness

    // Update Battling Status
    // Removed local update, handled in updateSpatialAwareness

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
          // NOTE: gapToAhead here is still based on Race Position (Lap + Dist).
          // For DRS, we usually care about race position (lapping cars don't give DRS usually? Or do they?)
          // In F1, you get DRS from lapped cars too.
          // So we should check PHYSICAL gap.
          // But `gapToAhead` is currently strictly race-position based in `updatePositions`.
          // Let's rely on physical proximity calculated in `updateSpatialAwareness`.
          // We don't store "gap to physical ahead" on the vehicle state permanently, but we could use `inDirtyAir` or similar?
          // No, let's just stick to position-based DRS for now to avoid breaking it, as requested primarily for Dirty Air/Battling.
          if (vehicle.position > 1 && vehicle.gapToAhead < 1.0) {
              vehicle.drsOpen = true;
          }
      } else {
          vehicle.drsOpen = false;
      }
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
    if (vehicle.position > 1 && currentSector && this.state.currentLap > 1) {
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
        const ignoreProb = 1.0 - yieldChance;
        const isIgnoring = this.rng.chance(ignoreProb * 0.1); // 10% chance per tick to "decide" to ignore? No.
        
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
    // Standard race position logic
    this.state.vehicles.sort((a, b) => {
        if (a.lapCount !== b.lapCount) return b.lapCount - a.lapCount;
        return b.distanceOnLap - a.distanceOnLap;
    });
    
    this.state.vehicles.forEach((v, i) => {
        v.position = i + 1;
        // Calculate gap to leader
        if (i === 0) {
            v.gapToLeader = 0;
            v.gapToAhead = 0;
        } else {
            const leader = this.state.vehicles[0];
            // Approx time gap
            // This is "Leaderboard Gap", not physical gap
            const lapDiff = leader.lapCount - v.lapCount;
            const distDiff = (leader.distanceOnLap - v.distanceOnLap) + (lapDiff * this.track.totalDistance);
            const avgSpeed = (leader.speed + v.speed) / 2 || 60;
            v.gapToLeader = distDiff / avgSpeed;
            
            // Gap to ahead (Leaderboard sense)
            const ahead = this.state.vehicles[i - 1];
            const lapDiffAhead = ahead.lapCount - v.lapCount;
            const distDiffAhead = (ahead.distanceOnLap - v.distanceOnLap) + (lapDiffAhead * this.track.totalDistance);
            v.gapToAhead = distDiffAhead / avgSpeed;
        }
    });
  }

  private updateSpatialAwareness(): void {
      // 1. Sort by physical location on track (ignore laps)
      // distanceOnLap descending = order on track
      const sortedByLocation = [...this.state.vehicles].sort((a, b) => b.distanceOnLap - a.distanceOnLap);
      
      const trackLength = this.track.totalDistance;

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
              gapFromBehind = (trackLength - behindVehicle.distanceOnLap) + vehicle.distanceOnLap; // Wrap logic reversed?
              // No: Behind (big dist) -> Me (small dist).
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
