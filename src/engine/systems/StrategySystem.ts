import { VehicleState, Driver, RaceState, Track, StrategyPlan, StrategyStint, TyreCompound } from '../../types';
import { SeededRNG } from '../rng';
import { TYRE_COMPOUNDS, TyreModel } from './TyreModel';

export class StrategySystem {
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

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
      const degFactor = track.tireDegradationFactor || 1.0;
      const mgmtSkill = driver.skill.tyreManagement;
      const variance = this.rng.range(0.9, 1.1);
      const wearMult = degFactor * (1 - (mgmtSkill - 50) / 200) * variance;

      const softLife = 15 / wearMult;
      const mediumLife = 25 / wearMult;
      const hardLife = 40 / wearMult;
      const strategies: StrategyStint[][] = [];

      const stopLapA = Math.floor(softLife * 0.9);
      if (stopLapA > 0 && stopLapA < totalLaps) {
          strategies.push([
              { compound: 'soft', startLap: 0, endLap: stopLapA },
              { compound: 'hard', startLap: stopLapA, endLap: totalLaps }
          ]);
      }

      const stopLapB = Math.floor(mediumLife * 0.9);
      if (stopLapB > 0 && stopLapB < totalLaps) {
          strategies.push([
              { compound: 'medium', startLap: 0, endLap: stopLapB },
              { compound: 'hard', startLap: stopLapB, endLap: totalLaps }
          ]);
      }

      const stopLapC1 = Math.floor(softLife * 0.8);
      const stopLapC2 = stopLapC1 + Math.floor(mediumLife * 0.8);
      if (stopLapC1 > 0 && stopLapC2 < totalLaps) {
           strategies.push([
              { compound: 'soft', startLap: 0, endLap: stopLapC1 },
              { compound: 'medium', startLap: stopLapC1, endLap: stopLapC2 },
              { compound: 'medium', startLap: stopLapC2, endLap: totalLaps }
          ]);
      }

      const stopLapD1 = Math.floor(softLife * 0.85);
      const stopLapD2 = stopLapD1 + Math.floor(mediumLife * 0.85);
      if (stopLapD1 > 0 && stopLapD2 < totalLaps) {
           strategies.push([
              { compound: 'soft', startLap: 0, endLap: stopLapD1 },
              { compound: 'medium', startLap: stopLapD1, endLap: stopLapD2 },
              { compound: 'soft', startLap: stopLapD2, endLap: totalLaps }
          ]);
      }

      const legalDryStrategies = strategies.filter(strategy => {
          const dryCompounds = new Set(strategy.filter(stint => ['soft', 'medium', 'hard'].includes(stint.compound)).map(stint => stint.compound));
          return dryCompounds.size >= 2;
      });
      const candidateStrategies = legalDryStrategies.length > 0 ? legalDryStrategies : strategies;

      const aggression = driver.personality.aggression;
      const randomSeed = this.rng.next();

      if (candidateStrategies.length === 0) {
           candidateStrategies.push([
               { compound: 'medium', startLap: 0, endLap: Math.floor(totalLaps / 2) },
               { compound: 'hard', startLap: Math.floor(totalLaps / 2), endLap: totalLaps }
           ]);
      }

      let choice = 0;
      if (candidateStrategies.length > 1) {
          if (aggression > 85) {
              if (randomSeed < 0.6) {
                  const aggIndices = candidateStrategies.map((s, i) => ({s, i})).filter(x => x.s.length > 2 || x.s[0].compound === 'soft').map(x => x.i);
                  if (aggIndices.length > 0) {
                      choice = aggIndices[this.rng.rangeInt(0, aggIndices.length - 1)];
                  }
              } else {
                  choice = this.rng.rangeInt(0, candidateStrategies.length - 1);
              }
          } else if (aggression < 60) {
               if (randomSeed < 0.6) {
                  const consIndices = candidateStrategies.map((s, i) => ({s, i})).filter(x => x.s.length === 2 && x.s[0].compound !== 'soft').map(x => x.i);
                  if (consIndices.length > 0) {
                      choice = consIndices[this.rng.rangeInt(0, consIndices.length - 1)];
                  } else {
                       const oneStopIndices = candidateStrategies.map((s, i) => ({s, i})).filter(x => x.s.length === 2).map(x => x.i);
                       if (oneStopIndices.length > 0) choice = oneStopIndices[this.rng.rangeInt(0, oneStopIndices.length - 1)];
                  }
              } else {
                  choice = this.rng.rangeInt(0, candidateStrategies.length - 1);
              }
         } else {
             choice = this.rng.rangeInt(0, candidateStrategies.length - 1);
         }
      }

      plan.stints = candidateStrategies[choice];

      for (let i = 0; i < plan.stints.length - 1; i++) {
          const noise = this.rng.rangeInt(-2, 2);
          plan.stints[i].endLap += noise;
          if (plan.stints[i].endLap < 1) plan.stints[i].endLap = 1;
          if (i > 0 && plan.stints[i].endLap <= plan.stints[i-1].endLap) plan.stints[i].endLap = plan.stints[i-1].endLap + 1;
          plan.stints[i+1].startLap = plan.stints[i].endLap;
      }

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
          if (!pitNeeded && currentStint && currentStint.endLap >= track.totalLaps - 2 && vehicle.usedDryCompounds.length < 2) {
              pitNeeded = true;
          }
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
      const hasPitWindow = typeof vehicle.pitWindowStart === 'number' && typeof vehicle.pitWindowEnd === 'number';
      if (!pitNeeded && hasPitWindow) {
          const windowOpen = Math.min(vehicle.pitWindowStart as number, vehicle.pitWindowEnd as number);
          const windowClose = Math.max(vehicle.pitWindowStart as number, vehicle.pitWindowEnd as number);
          
          if (state.currentLap > windowClose) {
              pitNeeded = true;
          } else if (state.currentLap >= windowOpen) {
              const windowSpan = Math.max(1, windowClose - windowOpen);
              const progress = (state.currentLap - windowOpen) / windowSpan;
              let pitProb = 0.3 + (progress * 0.5);
              if (vehicle.tyreWear > 60) {
                  pitProb += 0.2;
              }
              if (driver.personality.aggression > 60 && this.rng.chance(0.3)) {
                  pitProb += 0.2;
              }
              if (this.rng.chance(pitProb)) {
                  pitNeeded = true;
              }
          }
      }

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
                   if (driver.personality.aggression > 60 && this.rng.chance(0.3)) {
                       pitProb += 0.3; // Try to undercut
                   }

                   // 3. Tyre Feeling
                   // If wear is worse than expected, pit early
                   if (vehicle.tyreWear > 60) {
                       pitProb += 0.4;
                   }

                   if (this.rng.chance(pitProb)) {
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

      const dryRace = state.weatherForecast.every(item => item.rainIntensity <= 10) && rain <= 10;

      // 2. Follow Plan
      const plan = vehicle.strategyPlan;
      const nextStintIndex = plan.currentStintIndex + 1;

      if (nextStintIndex < plan.stints.length) {
          const plannedCompound = plan.stints[nextStintIndex].compound;
          if (dryRace && ['soft', 'medium', 'hard'].includes(plannedCompound)) {
              const used = new Set(vehicle.usedDryCompounds);
              if (nextStintIndex >= plan.stints.length - 1 && used.size < 2 && used.has(plannedCompound as 'soft' | 'medium' | 'hard')) {
                  const legalAlternative = (['soft', 'medium', 'hard'] as const).find(compound => compound !== plannedCompound && !used.has(compound));
                  if (legalAlternative) {
                      return legalAlternative;
                  }
              }
          }
          return plannedCompound;
      } else {
          const lapsLeft = totalLaps - state.currentLap;
          if (dryRace && vehicle.usedDryCompounds.length < 2) {
              const missingCompound = (['soft', 'medium', 'hard'] as const).find(compound => !vehicle.usedDryCompounds.includes(compound));
              if (missingCompound) {
                  return missingCompound;
              }
          }
          if (lapsLeft < 15) return 'soft';
          if (lapsLeft < 30) return 'medium';
          return 'hard';
      }
  }
}
