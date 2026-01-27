import { VehicleState, Driver, RaceState, Track } from '../../types';

export class StrategySystem {
  
  public updateStrategyAI(vehicle: VehicleState, state: RaceState, track: Track): void {
      // Only check near end of lap (Pit Entry Zone)
      const distToFinish = track.totalDistance - vehicle.distanceOnLap;
      if (distToFinish > 100 || distToFinish < 0) return;
      
      // Don't pit if already decided
      if (vehicle.isInPit) return;
      
      let pitNeeded = false;
      const rain = state.rainIntensityLevel;
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
          
          state.weatherForecast.forEach(f => {
              if (f.timeOffset > state.elapsedTime && f.timeOffset < state.elapsedTime + lookahead) {
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
}
