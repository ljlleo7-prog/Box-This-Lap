import { RaceState, Track } from '../../types';
import { SeededRNG } from '../rng';

export class WeatherSystem {
  private rng: SeededRNG;
  private forecastUpdateTimer: number = 0;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  public initializeForecast(state: RaceState, track: Track): void {
      // Ensure forecast is populated if not done in initialize
      if (state.weatherForecast.length === 0) {
          this.generateInitialForecast(state, track);
      }
  }

  public update(state: RaceState, track: Track, dt: number): void {
      // Handle Real Weather Updates externally, but we still run water depth logic
      if (state.weatherMode === 'real') {
         this.updateWaterDepth(state, dt);
         return;
      }

      // Forecast Management
      this.forecastUpdateTimer += dt;
      if (this.forecastUpdateTimer > 60) {
          this.forecastUpdateTimer = 0;
          
          // 1. Cleanup Past Nodes (Keep 1 for interpolation context)
          // "Only forecast the future"
          while (state.weatherForecast.length > 1 && state.weatherForecast[1].timeOffset <= state.elapsedTime) {
             state.weatherForecast.shift();
          }

          // 2. Ensure we have enough forecast
          const lastNode = state.weatherForecast[state.weatherForecast.length - 1];
          // Maintain 30 min horizon (1800s)
          if (lastNode.timeOffset < state.elapsedTime + 1800) {
             this.appendForecastNode(state, track, lastNode.timeOffset + 120);
          }
      }

      // Interpolate Current Weather
      const currentTime = state.elapsedTime;
      const sortedForecast = state.weatherForecast.sort((a, b) => a.timeOffset - b.timeOffset);
      
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
      state.cloudCover = prevNode.cloudCover + (nextNode.cloudCover - prevNode.cloudCover) * t;
      state.rainIntensityLevel = prevNode.rainIntensity + (nextNode.rainIntensity - prevNode.rainIntensity) * t;

      // Map to Enum
      if (state.rainIntensityLevel > 50) {
          state.weather = 'heavy-rain';
      } else if (state.rainIntensityLevel > 5) {
          state.weather = 'light-rain';
      } else {
          state.weather = 'dry';
      }

      // Update Temperatures (Air & Track)
      const baseTemp = track.baseTemperature || 25;
      
      // Air Temp: Cooled by rain and clouds
      // Rain cooling: up to 5C
      const rainCooling = (state.rainIntensityLevel / 100) * 5;
      // Cloud cooling: up to 3C
      const cloudCooling = (state.cloudCover / 100) * 3;
      
      // Smooth transition for air temp would be better, but direct calculation is okay for now
      state.airTemp = baseTemp - rainCooling - cloudCooling;

      // Track Temp: Affected by sun (cloud cover) and rain
      // Solar heating: Up to 15C above air temp when sunny (0 clouds)
      const solarHeating = (1 - (state.cloudCover / 100)) * 15;
      
      let targetTrackTemp = state.airTemp + solarHeating;
      
      // Rain drastically cools the track
      if (state.rainIntensityLevel > 5) {
          // If raining, track temp drops towards air temp rapidly
          targetTrackTemp = state.airTemp + 1; // Small offset
      }
      
      // Apply to state (with some lag/inertia could be nice, but instant is fine for this iteration)
      state.trackTemp = targetTrackTemp;
      
      // Update Water Depth & Rubber
      this.updateWaterDepth(state, dt);
      
      // Wind Evolution
      // Slowly rotate
      state.windDirection += this.rng.range(-1, 1) * dt;
      if (state.windDirection < 0) state.windDirection += 360;
      if (state.windDirection > 360) state.windDirection -= 360;
      
      // Wind speed drift
      state.windSpeed += this.rng.range(-0.5, 0.5) * dt;
      if (state.windSpeed < 0) state.windSpeed = 0;
  }

  public setRealWeatherData(state: RaceState, data: { cloudCover: number; windSpeed: number; windDirection: number; temp: number; precipitation: number }): void {
      if (state.weatherMode !== 'real') return;
      
      state.cloudCover = data.cloudCover;
      state.windSpeed = data.windSpeed;
      state.windDirection = data.windDirection;
      state.airTemp = data.temp;
      state.trackTemp = data.temp + (state.cloudCover < 50 ? 10 : 2); // Simple track temp model
      
      // Rain logic from precipitation (mm/h)
      if (data.precipitation > 0) {
          // 0.1mm/h -> light. 5mm/h -> heavy.
          const intensity = Math.min(100, (data.precipitation / 5.0) * 100);
          state.rainIntensityLevel = intensity;
      } else {
          state.rainIntensityLevel = 0;
      }
      
      // Enum update
      if (state.rainIntensityLevel > 50) {
          state.weather = 'heavy-rain';
      } else if (state.rainIntensityLevel > 5) {
          state.weather = 'light-rain';
      } else {
          state.weather = 'dry';
      }
  }

  private generateInitialForecast(state: RaceState, track: Track): void {
      const currentCloud = state.cloudCover;
      
      // Start with current
      state.weatherForecast = [{
          timeOffset: 0,
          cloudCover: currentCloud,
          rainIntensity: state.rainIntensityLevel
      }];

      // Generate next 30 mins (every 2 mins)
      for (let i = 1; i <= 15; i++) {
          this.appendForecastNode(state, track, i * 120);
      }
  }

  private appendForecastNode(state: RaceState, track: Track, timeOffset: number): void {
      const params = track.weatherParams || { volatility: 0.5, rainProbability: 0.3 };
      
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
      
      state.weatherForecast.push({
          timeOffset,
          cloudCover: newCloud,
          rainIntensity: newRain
      });
  }

  private updateWaterDepth(state: RaceState, dt: number): void {
      const rainIntensity = state.rainIntensityLevel;
      
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
      state.sectorConditions.forEach(sector => {
          sector.waterDepth += depthChange;
          sector.waterDepth = Math.max(0, sector.waterDepth);
          
          // Rubber: washed away by rain
          if (sector.waterDepth > 0.5) {
              sector.rubberLevel -= 0.001 * dt;
          }
      });

      // Update global average
      state.trackWaterDepth += depthChange;
      state.trackWaterDepth = Math.max(0, state.trackWaterDepth);
  }
}
