import { VehicleState, Driver, RaceState, Track, StrategyPlan, StrategyStint, TyreCompound } from '../../types';
import { TYRE_COMPOUNDS, TyreModel } from './TyreModel';

export class StrategySystem {
  
  /**
   * Generates an initial strategy plan for a driver before the race starts.
   */
  public initializeStrategy(driver: Driver, track: Track, totalLaps: number, rainProb: number): StrategyPlan {
      const plan: StrategyPlan = {
          stints: [],
          currentStintIndex: 0
      };

      // 1. Weather Based Strategy
      if (rainProb > 0.6) {
          // Likely Wet Start
          plan.stints.push({ compound: 'wet', startLap: 0, endLap: Math.floor(totalLaps * 0.4) });
          plan.stints.push({ compound: 'intermediate', startLap: Math.floor(totalLaps * 0.4), endLap: totalLaps });
          return plan;
      }

      // 2. Dry Strategy Selection
      // Factors: Track Degradation, Driver Tire Management
      const degFactor = track.tireDegradationFactor || 1.0;
      const mgmtSkill = driver.skill.tyreManagement; // 0-100
      
      // Effective Wear Multiplier (Lower is better)
      // Add random noise per driver to simulate estimation error/setup variance
      // +/- 10% variance in wear estimation
      const variance = 0.9 + (Math.random() * 0.2);
      const wearMult = degFactor * (1 - (mgmtSkill - 50) / 200) * variance; 

      // Calculate approximate life of compounds for this driver/track
      const softLife = 15 / wearMult;
      const mediumLife = 25 / wearMult;
      const hardLife = 40 / wearMult;

      // Decide 1-stop vs 2-stop
      const strategies: StrategyStint[][] = [];

      // Strategy A: Soft -> Hard (Standard 1-stop)
      // Target stop lap: Soft life - 10% safety margin
      const stopLapA = Math.floor(softLife * 0.9);
      if (stopLapA > 0 && stopLapA < totalLaps) {
          strategies.push([
              { compound: 'soft', startLap: 0, endLap: stopLapA },
              { compound: 'hard', startLap: stopLapA, endLap: totalLaps }
          ]);
      }

      // Strategy B: Medium -> Hard (Conservative 1-stop)
      // Target stop lap: Medium life - 10% safety margin
      const stopLapB = Math.floor(mediumLife * 0.9);
      if (stopLapB > 0 && stopLapB < totalLaps) {
          strategies.push([
              { compound: 'medium', startLap: 0, endLap: stopLapB },
              { compound: 'hard', startLap: stopLapB, endLap: totalLaps }
          ]);
      }

      // Strategy C: Soft -> Medium -> Medium (Aggressive 2-stop)
      // Target stop laps: Soft life * 0.8, then + Medium life * 0.8
      const stopLapC1 = Math.floor(softLife * 0.8);
      const stopLapC2 = stopLapC1 + Math.floor(mediumLife * 0.8);
      
      if (stopLapC1 > 0 && stopLapC2 < totalLaps) {
           strategies.push([
              { compound: 'soft', startLap: 0, endLap: stopLapC1 },
              { compound: 'medium', startLap: stopLapC1, endLap: stopLapC2 },
              { compound: 'medium', startLap: stopLapC2, endLap: totalLaps }
          ]);
      }
      
      // Strategy D: Soft -> Medium -> Soft (Aggressive Sprint)
      // Useful if total laps is short enough or degradation is high
      const stopLapD1 = Math.floor(softLife * 0.85);
      const stopLapD2 = stopLapD1 + Math.floor(mediumLife * 0.85);
      
      if (stopLapD1 > 0 && stopLapD2 < totalLaps) {
           strategies.push([
              { compound: 'soft', startLap: 0, endLap: stopLapD1 },
              { compound: 'medium', startLap: stopLapD1, endLap: stopLapD2 },
              { compound: 'soft', startLap: stopLapD2, endLap: totalLaps }
          ]);
      }

      // Pick one based on Aggression/Randomness
      // We want to force diversity, so we add random bias
      const aggression = driver.personality.aggression;
      const randomSeed = Math.random();
      
      // Filter valid strategies
      if (strategies.length === 0) {
           // Fallback
           strategies.push([
               { compound: 'medium', startLap: 0, endLap: Math.floor(totalLaps / 2) },
               { compound: 'hard', startLap: Math.floor(totalLaps / 2), endLap: totalLaps }
           ]);
      }

      let choice = 0;
      
      // Weighted selection based on aggression and randomness
       // High aggression -> Prefer 2-stop (C/D) or Short-Initial 1-stop (A)
       // Low aggression -> Prefer Conservative 1-stop (B)
       
       // If we have multiple options, pick probabilistically
       if (strategies.length > 1) {
           if (aggression > 85) {
               // 60% chance of Aggressive Strategy
               if (randomSeed < 0.6) {
                   // Find aggressive strategies (start with Soft, or 2-stop)
                   const aggIndices = strategies.map((s, i) => ({s, i})).filter(x => x.s.length > 2 || x.s[0].compound === 'soft').map(x => x.i);
                   if (aggIndices.length > 0) {
                       choice = aggIndices[Math.floor(Math.random() * aggIndices.length)];
                   }
               } else {
                   choice = Math.floor(Math.random() * strategies.length);
               }
           } else if (aggression < 60) {
                // 60% chance of Conservative Strategy
                if (randomSeed < 0.6) {
                   // Find conservative strategies (start with Medium/Hard, or 1-stop)
                   const consIndices = strategies.map((s, i) => ({s, i})).filter(x => x.s.length === 2 && x.s[0].compound !== 'soft').map(x => x.i);
                   if (consIndices.length > 0) {
                       choice = consIndices[Math.floor(Math.random() * consIndices.length)];
                   } else {
                        // Fallback to any 1-stop
                        const oneStopIndices = strategies.map((s, i) => ({s, i})).filter(x => x.s.length === 2).map(x => x.i);
                        if (oneStopIndices.length > 0) choice = oneStopIndices[Math.floor(Math.random() * oneStopIndices.length)];
                   }
               } else {
                   choice = Math.floor(Math.random() * strategies.length);
               }
          } else {
              // Complete Random
              choice = Math.floor(Math.random() * strategies.length);
          }
      }

      plan.stints = strategies[choice];

      // Add "Window" Noise to Planned Pit Laps
      // We don't want everyone on Strategy A to pit on Lap 18 exactly.
      // We shift the planned endLap by +/- 1-3 laps to create a "Window Center"
      // The actual pit logic will use a dynamic window around this.
      for (let i = 0; i < plan.stints.length - 1; i++) {
          const noise = Math.floor(Math.random() * 5) - 2; // -2 to +2
          plan.stints[i].endLap += noise;
          // Ensure logical consistency
          if (plan.stints[i].endLap < 1) plan.stints[i].endLap = 1;
          if (i > 0 && plan.stints[i].endLap <= plan.stints[i-1].endLap) plan.stints[i].endLap = plan.stints[i-1].endLap + 1;
          
          // Adjust next stint start
          plan.stints[i+1].startLap = plan.stints[i].endLap;
      }
      
      // Final stint always ends at totalLaps
      plan.stints[plan.stints.length - 1].endLap = totalLaps;

      return plan;
  }

  public updateStrategyAI(vehicle: VehicleState, state: RaceState, track: Track, driver: Driver): void {
      // Determine Pit Entry Point
      const entryDist = track.pitLane?.entryDistance ?? (track.totalDistance - 200);
      
      // Calculate Distance to Pit Entry
       let distToEntry = entryDist - vehicle.distanceOnLap;
       
       // Handle Wrap-around (if we are near end of lap and entry is at start of next lap)
       if (distToEntry < -track.totalDistance / 2) {
           distToEntry += track.totalDistance;
       }
       
       // We want to check strategy in a window BEFORE the pit entry.
      // E.g. 1000m to 100m before entry.
      // This gives time to make the decision before the Physics system checks for entry.
      
      // If we are outside the window, return.
      // Window: [Entry - 1000, Entry - 50]
      if (distToEntry > 1000 || distToEntry < 50) return;
      
      // Don't pit if already decided or in pit
      if (vehicle.isInPit || vehicle.boxThisLap) return;
      
      let pitNeeded = false;
      const rain = state.rainIntensityLevel;
      const compound = vehicle.tyreCompound;
      const plan = vehicle.strategyPlan;
      const currentStint = plan?.stints[plan.currentStintIndex];

      // --- 1. EMERGENCY / WEATHER CHECKS (Overrides Plan) ---
      
      // Rain Logic
      if (rain > 60) {
          if (compound !== 'wet') pitNeeded = true;
      } else if (rain > 10) {
          if (compound !== 'intermediate' && compound !== 'wet') pitNeeded = true;
      } else {
          // Dry
          if (compound === 'wet' || compound === 'intermediate') pitNeeded = true;
      }

      // Forecast Intelligence (Keep existing logic roughly)
      if (pitNeeded) {
           const forecastAction = this.checkForecast(state, compound, rain);
           if (forecastAction === 'stay_out') pitNeeded = false;
      }

      // Damage
      if (vehicle.damage > 15) pitNeeded = true; // Increased threshold slightly

      // Tyre Wear Critical
      if (vehicle.tyreWear > 85) pitNeeded = true; // Critical failure imminent

      // --- 2. PLAN EXECUTION (Dynamic Window) ---
      
      if (!pitNeeded && currentStint) {
          const targetLap = currentStint.endLap;
          const isLastStint = plan.currentStintIndex >= plan.stints.length - 1;
          
          if (!isLastStint) {
               // Pit Window Logic
               // We can pit between [targetLap - 2] and [targetLap + 2]
               // Factors: Traffic, Tyre Feeling, Randomness
               
               const windowOpen = targetLap - 2;
               const windowClose = targetLap + 2;
               
               if (state.currentLap > windowClose) {
                   // Must box, missed window (or extended too long)
                   pitNeeded = true;
               } else if (state.currentLap >= windowOpen) {
                   // Inside Window
                   // 1. Base probability increases as we get closer to target
                   let pitProb = 0.0;
                   if (state.currentLap === targetLap) pitProb = 0.5;
                   else if (state.currentLap > targetLap) pitProb = 0.8;
                   else pitProb = 0.2; // Early stop (Undercut attempt)
                   
                   // 2. Traffic Check (Simple placeholder)
                   // If we are stuck behind someone (gap < 1s), increase prob to undercut
                   // Accessing vehicle state relative to others is expensive here without direct list
                   // We'll use a random "undercut" aggression factor
                   if (driver.personality.aggression > 60 && Math.random() < 0.3) {
                       pitProb += 0.3; // Try to undercut
                   }
                   
                   // 3. Tyre Feeling
                   // If wear is worse than expected, pit early
                   if (vehicle.tyreWear > 60) {
                       pitProb += 0.4;
                   }
                   
                   if (Math.random() < pitProb) {
                       pitNeeded = true;
                   }
               }
          }
          
          // Failsafe: High Wear
          if (vehicle.tyreWear > 80) {
              pitNeeded = true;
          }
      }

      if (pitNeeded) {
          vehicle.boxThisLap = true;
      }
  }

  private checkForecast(state: RaceState, currentCompound: TyreCompound, currentRain: number): 'pit' | 'stay_out' | 'neutral' {
      const lookahead = 300;
      let futureRain = 0;
      let count = 0;
      
      state.weatherForecast.forEach(f => {
          if (f.timeOffset > state.elapsedTime && f.timeOffset < state.elapsedTime + lookahead) {
              futureRain += f.rainIntensity;
              count++;
          }
      });
      
      const avgFutureRain = count > 0 ? futureRain / count : currentRain;
      
      let futureIdeal = 'slick';
      if (avgFutureRain > 60) futureIdeal = 'wet';
      else if (avgFutureRain > 10) futureIdeal = 'intermediate';
      
      const currentType = (currentCompound === 'wet' || currentCompound === 'intermediate') ? currentCompound : 'slick';
      
      if (currentType === futureIdeal) {
          if (currentType === 'slick' && currentRain > 40) return 'pit'; // Too dangerous
          return 'stay_out';
      }
      return 'neutral';
  }

  public getPitCompound(vehicle: VehicleState, state: RaceState, totalLaps: number): TyreCompound {
      const rain = state.rainIntensityLevel;

      // 1. Weather Override
      if (rain > 60) return 'wet';
      if (rain > 10) return 'intermediate';

      // 2. Follow Plan
      const plan = vehicle.strategyPlan;
      
      // Advance stint index since we are pitting
      // Ideally this should happen when pit is done, but we need to know what to put on NOW.
      // We will assume this method is called ONCE when service starts.
      
      const nextStintIndex = plan.currentStintIndex + 1;
      
      if (nextStintIndex < plan.stints.length) {
          // We have a planned next stint
          return plan.stints[nextStintIndex].compound;
      } else {
          // We ran out of planned stints! (Maybe early wear caused extra stop)
          // Emergency Strategy:
          const lapsLeft = totalLaps - state.currentLap;
          
          if (lapsLeft < 15) return 'soft';
          if (lapsLeft < 30) return 'medium';
          return 'hard';
      }
  }
}
