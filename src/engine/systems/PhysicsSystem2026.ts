import { VehicleState, Driver, RaceState, Track, TyreCompound, TeamSpecs, TrackProfile, TrackProfileSample, ERSTacticalState, TelemetryDataPoint } from '../../types';

import { SeededRNG } from '../rng';
import { getTrackProfileLookahead, getTrackProfileMinimumSpeedAhead, lookupTrackProfileSample, lookupTrackProfileSpeed } from '../trackProfile';
import { TyreModel, TYRE_COMPOUNDS } from './TyreModel';
import { IPhysicsSystem } from './IPhysicsSystem';
import { buildSetupPhysicsEffects } from './SetupModel';

export class PhysicsSystem2026 implements IPhysicsSystem {
  private rng: SeededRNG;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  private getModifiedTeamSpecs(teamSpecs: TeamSpecs | undefined, vehicle: VehicleState, track: Track): TeamSpecs | undefined {
    if (!teamSpecs) return undefined;
    return buildSetupPhysicsEffects(track, vehicle, teamSpecs).specAdjustments as TeamSpecs;
  }

  public updateVehiclePhysics(vehicle: VehicleState, driver: Driver, state: RaceState, track: Track, trackProfile: TrackProfile, dt: number, teamSpecs?: TeamSpecs): void {
      // If in pit, PhysicsSystem yields control to RaceLogicSystem (which handles pit lane movement)
      if (vehicle.isInPit) return;

      const setupEffects = buildSetupPhysicsEffects(track, vehicle, teamSpecs);
      const modifiedSpecs = this.getModifiedTeamSpecs(teamSpecs, vehicle, track);

      const profileSample = lookupTrackProfileSample(trackProfile, vehicle.distanceOnLap);
      const profileDynamics = this.getProfileDynamics(vehicle, profileSample, trackProfile, track);
      vehicle.ersTacticalState = this.buildERSTacticalState();

      // 0. Calculate Grip based on Sector Conditions
      const sectorCond = state.sectorConditions.find(s => s.sectorId === track.sectors[vehicle.currentSector - 1]?.id);
      const waterDepth = sectorCond ? sectorCond.waterDepth : 0;
      const gripFactor = this.calculateGrip(vehicle.tyreCompound, waterDepth, vehicle.speed);

      // 1. Calculate Target Speed
      let targetSpeed = this.calculateTargetSpeed(vehicle, driver, state, track, trackProfile, profileSample, profileDynamics, modifiedSpecs, setupEffects);
      targetSpeed *= gripFactor;

      if (state.currentLap === 1 && vehicle.distanceOnLap < 2000 && vehicle.position > 1 && vehicle.gapToAhead < 0.4) {
          targetSpeed *= 0.95;
      }

      const effectiveGap = (vehicle.position === 1) ? 100 : vehicle.gapToAhead;
      const accelFactor = (modifiedSpecs ? 1 + (modifiedSpecs.acceleration - 80) * 0.001 : 1) * setupEffects.accelerationFactor;
      const brakeFactor = (modifiedSpecs ? 1 + (modifiedSpecs.braking - 80) * 0.001 : 1) * setupEffects.brakingFactor;
      const ersOverrideEligible = this.isERSOverrideEligible(vehicle, state);
      const sectorType = profileSample.phase === 'straight' ? 'straight' : track.sectors[profileSample.sectorIndex]?.type;
      const maxAccel = this.calculateMaxAcceleration(
        vehicle.speed,
        vehicle.drsOpen,
        effectiveGap,
        sectorType,
        vehicle.ersMode,
        vehicle.ersLevel,
        ersOverrideEligible,
        modifiedSpecs,
        vehicle.powerUnitPhilosophy,
        vehicle.batteryAllocationMode,
        vehicle.activeAeroMode,
        vehicle.ersTacticalState,
        profileDynamics
      ) * gripFactor * accelFactor;
      // calculateMaxBraking already factors in aero, so we don't need artificial 1.5 multipliers
      const maxBrake = this.calculateMaxBraking(vehicle.speed, sectorType, profileDynamics) * gripFactor * brakeFactor;

      const accelRate = maxAccel;
      // Cap max deceleration at 6G (approx 60 m/s^2) for safety
      const brakeRate = Math.min(60, Math.max(1.0, maxBrake));
      const brakingTargetSpeed = Math.min(targetSpeed, profileDynamics.lowSpeedTarget);
      
      const approachTargetSpeed = profileDynamics.needsBrakingNow ? brakingTargetSpeed : targetSpeed;
      
      let desiredAccel = accelRate; // Default to max acceleration
      
      if (profileDynamics.needsBrakingNow) {
          // Brake to reach brakingTargetSpeed exactly at the lowSpeedDistanceAhead
          const distToTarget = Math.max(1, profileDynamics.lowSpeedDistanceAhead);
          desiredAccel = (approachTargetSpeed * approachTargetSpeed - vehicle.speed * vehicle.speed) / (2 * distToTarget);
      } else {
          if (vehicle.speed > targetSpeed + 1) {
              // We are over speed for the current sector (e.g. just entered a slow sector)
              // Brake immediately to reach targetSpeed
              desiredAccel = -brakeRate;
          } else {
              // Accelerate to targetSpeed, but don't overshoot it
              if (vehicle.speed >= targetSpeed) {
                  desiredAccel = 0; // Hold speed or coast
              } else {
                  // Don't limit acceleration, just let it reach target speed
                  const speedDiff = targetSpeed - vehicle.speed;
                  if (speedDiff < 1) {
                      desiredAccel = Math.min(accelRate, speedDiff * 5);
                  } else {
                      desiredAccel = accelRate;
                  }
              }
          }
      }

      let clampedAccel = desiredAccel;
      if (clampedAccel > accelRate) clampedAccel = accelRate;
      if (clampedAccel < -brakeRate) clampedAccel = -brakeRate;
      if (vehicle.id === 'ver' && vehicle.distanceOnLap > 1400 && vehicle.distanceOnLap < 1450) {
          console.log(`[DEBUG 1400] Dist: ${vehicle.distanceOnLap.toFixed(1)}, VehSpeed: ${vehicle.speed.toFixed(1)}, PhaseSpeed: ${profileSample.speed.toFixed(1)}, TargetSpeed: ${targetSpeed.toFixed(1)}, accelRate: ${accelRate.toFixed(2)}, desiredAccel: ${desiredAccel.toFixed(2)}, clampedAccel: ${clampedAccel.toFixed(2)}`);
      }

      vehicle.speed += clampedAccel * dt;
      vehicle.acceleration = clampedAccel;

      if (isNaN(vehicle.speed) || !isFinite(vehicle.speed)) vehicle.speed = 0;
      if (vehicle.speed > 150) vehicle.speed = 150;
      if (vehicle.speed < 0) vehicle.speed = 0;

      const distDelta = vehicle.speed * dt;
      vehicle.distanceOnLap += distDelta;
      vehicle.totalDistance += distDelta;
      vehicle.currentLapTime += dt;

      const trace = vehicle.telemetry.currentLapSpeedTrace;
      this.recordTelemetrySample(vehicle, trace, profileSample, state.elapsedTime);

      if (vehicle.boxThisLap && track.pitLane) {
          const entryDist = track.pitLane.entryDistance;
          if (vehicle.distanceOnLap >= entryDist && vehicle.distanceOnLap < (entryDist + 50)) {
             vehicle.isInPit = true;
          }
      }

      if (vehicle.distanceOnLap >= track.totalDistance) {
        vehicle.distanceOnLap -= track.totalDistance;
        vehicle.lapCount++;

        if (state.checkeredFlag && !vehicle.hasFinished) {
            vehicle.hasFinished = true;
        }

        vehicle.lastLapTime = vehicle.currentLapTime;
        vehicle.currentLapTime = 0;
        vehicle.tyreAgeLaps++;
        vehicle.ersRecoveredThisLap = 0;

        vehicle.telemetry.lastLapSpeedTrace = [...vehicle.telemetry.currentLapSpeedTrace];
        vehicle.telemetry.currentLapSpeedTrace = [];
        vehicle.telemetry.nextSampleDistance = 0;

        if (vehicle.lastLapTime < vehicle.bestLapTime || vehicle.bestLapTime === 0) {
          vehicle.bestLapTime = vehicle.lastLapTime;
        }

        if (vehicle.position === 1) {
          state.currentLap = vehicle.lapCount;
        }
      }

      const currentSectorIndex = track.sectors.findIndex(
        s => vehicle.distanceOnLap >= s.startDistance && vehicle.distanceOnLap < s.endDistance
      );
      if (currentSectorIndex !== -1) {
        vehicle.currentSector = currentSectorIndex + 1;
      }

      this.updateResources(vehicle, driver, dt, track, state, modifiedSpecs, profileSample, profileDynamics, setupEffects);
  }

  private getProfileDynamics(vehicle: VehicleState, profileSample: TrackProfileSample, trackProfile: TrackProfile, track: Track): any {
    const executionOffset = vehicle.executionState.sectorOffsets[profileSample.sectorId];
    const futureLowSpeed = getTrackProfileMinimumSpeedAhead(trackProfile, vehicle.distanceOnLap, 180);
    const nextCorner = getTrackProfileLookahead(trackProfile, vehicle.distanceOnLap, 260, sample => sample.phase !== 'straight');
    const profileBaseSpeed = lookupTrackProfileSpeed(trackProfile, vehicle.distanceOnLap);
    const futureMinimumSpeed = futureLowSpeed?.sample.speed ?? profileBaseSpeed;
    const lowSpeedDistanceAhead = futureLowSpeed?.distanceAhead ?? Math.max(trackProfile.sampleSpacing, 30);
    const rawBrakeShift = executionOffset?.brakeShiftMeters ?? 0;
    const phaseBrakeBias = profileSample.phase === 'entry' ? 4 : profileSample.phase === 'apex' ? -10 : 0;
    const paceAggression = vehicle.paceMode === 'aggressive' ? -5 : vehicle.paceMode === 'conservative' ? 6 : 0;
    const lineBias = vehicle.lineMode === 'attack' ? -2 : vehicle.lineMode === 'defend' ? 4 : 0;
    const brakeShiftMeters = rawBrakeShift + phaseBrakeBias + paceAggression + lineBias;
    
    const currentSpeed = Math.max(vehicle.speed, profileBaseSpeed);
    
    // Estimate max deceleration to be around 4G (39.2 m/s^2) + aero, but use a slightly conservative 35 m/s^2 for projection
    const decelRate = 35;
    const projectedBrakeNeed = Math.max(0, (currentSpeed * currentSpeed - futureMinimumSpeed * futureMinimumSpeed) / (2 * decelRate));
    
    // actualBrakePoint is how far ahead we actually want to start braking
    const actualBrakePoint = projectedBrakeNeed + brakeShiftMeters;
    
    const needsBrakingNow = futureMinimumSpeed < profileBaseSpeed * 0.97 && lowSpeedDistanceAhead <= actualBrakePoint;
    const brakingDistance = Math.max(10, projectedBrakeNeed);
    const phaseTractionBias = profileSample.phase === 'exit' ? 1.04 : profileSample.phase === 'apex' ? 0.992 : 1;
    const phaseApexBias = profileSample.phase === 'apex' ? 1.0 : profileSample.phase === 'entry' ? 1.01 : 1.015;
    const phaseStraightBias = profileSample.phase === 'straight' ? 0.998 : profileSample.phase === 'exit' ? 1.0 : 0.995;
    const tractionFactor = phaseTractionBias * (executionOffset?.tractionFactor ?? 1);
    const apexFactor = phaseApexBias * (executionOffset?.apexSpeedFactor ?? 1);
    const exitFactor = (executionOffset?.exitSpeedFactor ?? 1) * (profileSample.phase === 'exit' ? 1.002 : 1);
    const straightFactor = (executionOffset?.straightSpeedFactor ?? 1) * phaseStraightBias;
    const lowFuelPush = vehicle.fuelLoad < 12 ? 1 + ((12 - vehicle.fuelLoad) / 12) * 0.012 : 1;
    const fuelMassPenalty = Math.max(0.965, 1 - vehicle.fuelLoad * 0.0002);

    const hasTelemetrySectors = track.sectors.some(s => typeof s.startSpeed === 'number');

    return {
      executionOffset,
      nextCorner,
      profileBaseSpeed,
      futureMinimumSpeed,
      lowSpeedTarget: futureMinimumSpeed * apexFactor,
      lowSpeedDistanceAhead,
      brakingDistance,
      needsBrakingNow,
      brakeShiftMeters,
      tractionFactor,
      apexFactor,
      exitFactor,
      straightFactor,
      lowFuelPush,
      fuelMassPenalty,
      hasTelemetrySectors
    };
  }

  private calculateTargetSpeed(vehicle: VehicleState, driver: Driver, state: RaceState, track: Track, trackProfile: TrackProfile, profileSample: TrackProfileSample, profileDynamics: any, teamSpecs?: TeamSpecs, setupEffects = buildSetupPhysicsEffects(track, vehicle, teamSpecs), includeTraffic: boolean = true): number {
    if (state.safetyCar === 'red-flag') return 0;

    const currentSector = track.sectors[profileSample.sectorIndex];
    const sectorType = currentSector.type;
    const isStraight = profileSample.phase === 'straight' || sectorType === 'straight';
    const tyreGrip = TyreModel.getGripFactor(vehicle.tyreCompound as TyreCompound, vehicle.tyreWear, 0);
    const compoundProps = TYRE_COMPOUNDS[vehicle.tyreCompound as TyreCompound];
    const tyreTemp = typeof vehicle.tyreTemp === 'number'
      ? vehicle.tyreTemp
      : (compoundProps.optimalTempWindow[0] + compoundProps.optimalTempWindow[1]) / 2;
    const tempFactor = TyreModel.getTemperatureGripFactor(vehicle.tyreCompound as TyreCompound, tyreTemp);
    // Average grip during a stint is around 0.7. We want performance to be 1.0 at grip=0.7.
    const tyrePerformance = 1.0 + ((tyreGrip * tempFactor) - 0.7) * 0.15;
    const fuelFactor = profileDynamics.fuelMassPenalty * profileDynamics.lowFuelPush;

    const hasTelemetrySectors = track.sectors.some(s => typeof s.startSpeed === 'number');
    const isQuali = vehicle.paceMode === 'aggressive';
    const scale = hasTelemetrySectors && isQuali ? 0.3 : 1.0; // Apply a smaller scale in telemetry+quali so we mostly stick to real telemetry, but keep modifiers active for normal race modes

    let phaseSpeed = profileDynamics.profileBaseSpeed;
    // Even with telemetry, we apply phase-specific modifiers
    if (isStraight) {
      phaseSpeed *= profileDynamics.straightFactor;
      if (vehicle.drsOpen) phaseSpeed *= 1.008;
    } else if (profileSample.phase === 'entry') {
      phaseSpeed *= 1.01;
    } else if (profileSample.phase === 'apex') {
      phaseSpeed *= profileDynamics.apexFactor;
    } else {
      phaseSpeed *= profileDynamics.exitFactor * profileDynamics.tractionFactor;
    }

    const perfScore = sectorType === 'straight'
      ? driver.performance.straight
      : sectorType === 'corner_high_speed'
        ? driver.performance.corneringHigh
        : sectorType === 'corner_medium_speed'
          ? driver.performance.corneringMedium
          : driver.performance.corneringLow;

    // In Hotlap/Qualifying, scale back the modifiers to stick closer to the base curve
    // Scale is already handled above for telemetry, here we handle non-telemetry hotlap scaling
    const finalScale = scale;

    const driverFactor = 1.0 + ((perfScore / 100) * 0.04 - 0.036) * finalScale;

    let teamFactor = 1.0;
    if (teamSpecs) {
      const aeroScore = sectorType === 'straight'
        ? teamSpecs.drag_reduction
        : sectorType === 'corner_high_speed'
          ? teamSpecs.cornering_high
          : sectorType === 'corner_medium_speed'
            ? teamSpecs.cornering_mid
            : teamSpecs.cornering_low;
      teamFactor = 1.0 + ((aeroScore / 100) * 0.04 - 0.036) * finalScale;
      if (isStraight && vehicle.drsOpen) {
        teamFactor *= 1.0 + ((teamSpecs.drs_efficiency / 100) * 0.02) * finalScale;
      }
    }
    
    // Scale the existing factors.
    const scaledTyrePerformance = 1.0 + (tyrePerformance - 1.0) * finalScale;
    const scaledFuelFactor = 1.0 + (fuelFactor - 1.0) * finalScale;

    const paceFactor = 1.0 + (vehicle.paceMode === 'aggressive' ? 0.02 : vehicle.paceMode === 'conservative' ? -0.02 : 0) * finalScale;
    const lineFactor = 1.0 + (vehicle.lineMode === 'attack'
      ? (isStraight ? 0.003 : 0.008)
      : vehicle.lineMode === 'defend'
        ? -0.005
        : 0) * finalScale;
    const moraleFactor = 1.0 + (((vehicle.morale ?? 80) - 80) * 0.00035) * finalScale;
    const formFactor = 1.0 + ((vehicle.condition - 1) * 0.6) * finalScale;
    const temperatureDelta = Math.abs((state.trackTemp || track.baseTemperature || 25) - 25);
    const temperatureFactor = 1.0 - (temperatureDelta * 0.0022 * (1 - (driver.performance.temperatureAdaptability || 85) / 100)) * finalScale;
    // Track difficulty doesn't affect raw speed in a hotlap, only consistency
    const difficultyFactor = 1.0 - ((track.trackDifficulty || 0.5) * (isStraight ? 0.005 : 0.015) * (1 - (driver.skill.consistency || 80) / 100)) * finalScale;

    let speed = phaseSpeed;
    const setupPhaseFactor = isStraight
      ? setupEffects.straightFactor
      : sectorType === 'corner_high_speed'
        ? setupEffects.highSpeedFactor
        : sectorType === 'corner_medium_speed'
          ? setupEffects.mediumSpeedFactor
          : setupEffects.lowSpeedFactor;
    const rotationPenalty = profileSample.phase === 'entry'
      ? Math.abs(setupEffects.entryRotationDelta) * (sectorType === 'corner_high_speed' ? 0.045 : 0.03)
      : profileSample.phase === 'apex'
        ? Math.abs(setupEffects.midRotationDelta) * (sectorType === 'corner_high_speed' ? 0.04 : 0.028)
        : Math.abs(setupEffects.exitRotationDelta) * 0.03;

    // On straights, do not cap speed tightly to the telemetry. Allow the car's power/drag to dictate top speed.
    // We set a very high target speed on straights, so the physics engine will just accelerate at max rate until braking point.
    if (isStraight && !profileDynamics.needsBrakingNow) {
       // Target terminal velocity rather than strict telemetry speed. 
       // Physics max acceleration calculation will naturally cap it.
       speed = Math.max(speed, 100); // 360 km/h baseline target on straights
    } else {
       // Apply the driver/car capability factors to cornering/braking speeds
       speed *= driverFactor * teamFactor * scaledTyrePerformance * scaledFuelFactor * paceFactor * lineFactor * moraleFactor * formFactor * temperatureFactor * difficultyFactor * setupPhaseFactor * (1 - rotationPenalty);
       
       // Telemetry data is usually from a hotlap. If we are just coasting, artificially reduce cornering speed
       if (hasTelemetrySectors && vehicle.paceMode === 'cooldown' as any) {
           speed *= 0.85;
       } else if (hasTelemetrySectors && vehicle.paceMode === 'conservative') {
           speed *= 0.95;
       }
    }

    if (includeTraffic && vehicle.position > 1 && state.currentLap > 1) {
      const gap = Math.max(0.1, vehicle.gapToAhead);
      if (isStraight && gap < 1.5) {
        speed *= 1 + 0.04 * Math.max(0, 1 - (gap / 1.5));
      } else if (!isStraight && gap < 2.0) {
        const penaltyBase = sectorType === 'corner_high_speed' ? 0.035 : sectorType === 'corner_medium_speed' ? 0.025 : 0.015;
        speed *= 1 - penaltyBase * Math.max(0, 1 - (gap / 2.0));
      }
    }

    if (includeTraffic && vehicle.isBattling && state.safetyCar === 'none') {
      const ahead = state.vehicles.find(v => v.position === vehicle.position - 1);
      if (ahead) {
        const z = (vehicle.speed - ahead.speed) + (driver.personality.aggression / 100) * 2.5 + (driver.skill.racecraft / 100) * 1.5 - 3.0;
        const attackIntensity = 1.0 / (1.0 + Math.exp(-z));
        const stuckSpeed = ahead.speed * (vehicle.speed > ahead.speed ? 0.985 : 1);
        const freeSpeed = speed * (!isStraight ? (1.0 - (0.03 * attackIntensity)) : 1);
        speed = freeSpeed > stuckSpeed
          ? (stuckSpeed * (1.0 - attackIntensity)) + (freeSpeed * attackIntensity)
          : freeSpeed;
      }
    }

    if (includeTraffic && vehicle.blueFlag) {
      speed *= 1.0 - (0.2 * ((driver.personality.teamPlayer + (100 - driver.personality.aggression)) / 200));
    }

    if (state.safetyCar === 'vsc') {
      speed = Math.min(speed * 0.7, 44);
      if (vehicle.position > 1 && vehicle.gapToAhead < 0.8) {
        const ahead = state.vehicles.find(v => v.position === vehicle.position - 1);
        if (ahead) speed = Math.min(speed, ahead.speed * 0.95);
      }
    } else if (state.safetyCar === 'sc') {
      let scTarget = 35;
      if (vehicle.position !== 1) {
        const currentGap = vehicle.gapToAhead;
        if (currentGap > 0.5) scTarget = 35 * (1.0 + (0.6 * Math.min(currentGap, 5.0) / 5.0));
        else if (currentGap < 0.3) scTarget = 35 * 0.8;
      }
      speed = Math.min(speed, scTarget);
      if (vehicle.position > 1 && vehicle.gapToAhead < 0.5) {
        const ahead = state.vehicles.find(v => v.position === vehicle.position - 1);
        if (ahead) speed = Math.min(speed, ahead.speed * 0.9);
      }
    }

    return speed;
  }

  private calculateMaxAcceleration(speed: number, drsOpen: boolean = false, gapToAhead: number = 100, sectorType: string = 'straight', ersMode: VehicleState['ersMode'] = 'balanced', ersLevel: number = 100, ersOverrideEligible: boolean = false, teamSpecs?: TeamSpecs, powerUnitPhilosophy: VehicleState['powerUnitPhilosophy'] = 'balanced', batteryAllocationMode: VehicleState['batteryAllocationMode'] = 'balanced', activeAeroMode: VehicleState['activeAeroMode'] = 'balanced', ersTacticalState?: ERSTacticalState, profileDynamics?: any): number {
      const mass = 798; // Modern F1 cars are heavier
      const airDensity = 1.225;
      const gravity = 9.81;
      const rollingResistanceCoeff = 0.014;
      const baseEnginePower = 400000; // 2026 rules ICE power
      const speedKph = speed * 3.6;
      const ersEfficiency = teamSpecs ? teamSpecs.ers_efficiency : 85;
      const philosophyPowerFactor = powerUnitPhilosophy === 'top_speed'
        ? 1.05 // Increased from 1.03
        : powerUnitPhilosophy === 'corner_focus'
          ? 0.985
          : 1;
      const batteryDeployFactor = batteryAllocationMode === 'attack'
        ? 1.12
        : batteryAllocationMode === 'conservative'
          ? 0.88
          : 1;
      const batteryHarvestPenalty = batteryAllocationMode === 'attack'
        ? 0.94
        : batteryAllocationMode === 'conservative'
          ? 1.06
          : 1;
      const aeroDragFactor = activeAeroMode === 'low_drag'
        ? 0.94
        : activeAeroMode === 'high_downforce'
          ? 1.06
          : 1;
      const efficiencyFactor = (0.98 + (ersEfficiency - 85) / 500) * batteryHarvestPenalty;
      // Implement battery limits
      const maxBattery = 4000000; // 4MJ max capacity
      const batteryEnergy = (ersLevel / 100) * maxBattery;
      
      // Calculate deployment and harvest limits based on rules
      // (This will need more state tracking later for per-lap 8.5MJ limits)
      const deploymentLimit = Math.min(
          this.getERSDeploymentLimit(speedKph, ersMode, efficiencyFactor, ersOverrideEligible) * batteryDeployFactor,
          batteryEnergy / 0.1 // Rough DT limit
      );
      
      const harvestPower = this.getERSHarvestPower(speedKph, ersMode, efficiencyFactor) * batteryHarvestPenalty;
      let availablePower = baseEnginePower * philosophyPowerFactor;
      if (ersLevel > 0 && ersMode !== 'harvest') {
          availablePower += deploymentLimit;
      }
      if (harvestPower > 0) {
          availablePower = Math.max(0, availablePower - harvestPower);
      }
      const effectiveSpeed = Math.max(20, speed); // Increased from 10 to limit low-speed torque spike
      let thrustForce = availablePower / effectiveSpeed;
      const tractionLimitForce = mass * gravity * (profileDynamics?.tractionFactor ? (1.14 + Math.max(0, profileDynamics.tractionFactor - 1) * 0.9) : 1.14);
      thrustForce = Math.min(thrustForce, tractionLimitForce);
      let dragArea = sectorType === 'straight' ? 0.85 : 1.15; // Increased drag area to limit top speed and acceleration curve
      dragArea *= aeroDragFactor;
      // In telemetry mode, cars have less drag to match real-world telemetry speeds better
      if (profileDynamics?.hasTelemetrySectors) {
          dragArea *= 0.90;
      }
      if (drsOpen && sectorType === 'straight') {
          dragArea *= 0.82;
      }
      if (sectorType === 'straight' && gapToAhead < 1.0) {
          const maxSlipstream = drsOpen ? 0.06 : 0.12;
          const slipstreamFactor = Math.max(0, 1 - gapToAhead);
          dragArea *= (1 - (maxSlipstream * slipstreamFactor));
      }
      const dragForce = 0.5 * airDensity * dragArea * speed * speed;
      const rollingRes = rollingResistanceCoeff * mass * gravity;
      const netForce = thrustForce - dragForce - rollingRes;
      return netForce / mass;
  }

  private calculateMaxBraking(speed: number, sectorType: string = 'straight', profileDynamics?: any): number {
      const mass = 798;
      const airDensity = 1.225;
      const gravity = 9.81;
      const rollingResistanceCoeff = 0.015;
      const baseBraking = (profileDynamics?.needsBrakingNow ? 4.0 : 3.5) * gravity;
      const dragArea = sectorType === 'straight' ? 0.8 : 1.1;
      const dragForce = 0.5 * airDensity * dragArea * speed * speed;
      const rollingRes = rollingResistanceCoeff * mass * gravity;
      const aeroAssist = (dragForce + rollingRes) / mass;
      return baseBraking + aeroAssist;
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

  private updateResources(vehicle: VehicleState, driver: Driver, dt: number, track: Track, state: RaceState, teamSpecs?: TeamSpecs, profileSample?: TrackProfileSample, profileDynamics?: any, setupEffects = buildSetupPhysicsEffects(track, vehicle, teamSpecs)): void {
    const compound = vehicle.tyreCompound as TyreCompound;
    const props = TYRE_COMPOUNDS[compound];
    const [optMin, optMax] = props.optimalTempWindow;
    const optMid = (optMin + optMax) / 2;
    const ambient = state.trackTemp || track.baseTemperature || 25;
    const speedKph = vehicle.speed * 3.6;
    const sectorType = track.sectors[vehicle.currentSector - 1]?.type;
    const compoundBias = compound === 'soft' ? 7 : compound === 'medium' ? 5 : compound === 'hard' ? 3 : compound === 'intermediate' ? 4 : 2;
    const paceHeat = vehicle.paceMode === 'aggressive' ? 6 : vehicle.paceMode === 'conservative' ? -2 : 2;
    const lineHeat = vehicle.lineMode === 'attack' ? 2 : vehicle.lineMode === 'defend' ? -1 : 0.5;
    const speedHeat = Math.pow(Math.min(330, Math.max(50, speedKph)) / 330, 1.6) * 12;
    const cornerHeat = sectorType === 'corner_low_speed' ? 4.5 : sectorType === 'corner_medium_speed' ? 3.5 : sectorType === 'corner_high_speed' ? 3.0 : 1.5;
    const trackHeat = (track.trackDifficulty || 0.5) * 4;
    const trafficHeat = (vehicle.isBattling ? 2.5 : 0) + (vehicle.inDirtyAir ? 1.5 : 0);
    const cloudCooling = (state.cloudCover || 0) * 0.02;
    const rainCooling = (state.rainIntensityLevel || 0) * 0.08;
    const windCooling = (state.windSpeed || 0) * 0.06;
    const coolingEffect = teamSpecs ? (teamSpecs.cooling - 85) * 0.2 : 0;
    const targetTemp = ambient + compoundBias + speedHeat + paceHeat + lineHeat + cornerHeat + trackHeat + trafficHeat - (cloudCooling + rainCooling + windCooling + coolingEffect) + setupEffects.tyreTempOffset + 65;
    const adaptability = driver.performance.temperatureAdaptability || 85;
    const management = driver.skill.tyreManagement || 85;
    if (typeof vehicle.tyreTemp !== 'number') {
        vehicle.tyreTemp = optMid;
    }
    const tempDelta = targetTemp - vehicle.tyreTemp;
    const responseBase = 0.22 + (adaptability - 80) * 0.002;
    const response = Math.min(0.9, Math.max(0.12, responseBase + Math.abs(tempDelta) / 160));
    const damping = Math.max(0.75, 1 - (management - 80) * 0.002);
    const step = (1 - Math.exp(-dt * 1.2)) * response * damping;
    vehicle.tyreTemp += tempDelta * step;
    const over = Math.max(0, vehicle.tyreTemp - optMax);
    const under = Math.max(0, optMin - vehicle.tyreTemp);
    if (over > 0) {
        vehicle.tyreTemp -= Math.pow(over / 6, 1.3) * dt * (1 + windCooling / 10);
    } else if (under > 0) {
        vehicle.tyreTemp += Math.pow(under / 7, 1.2) * dt * 0.8;
    }
    vehicle.tyreTemp = Math.max(20, Math.min(140, vehicle.tyreTemp));

    // Tyre wear
    // Use the sophisticated TyreModel
    const wearRate = TyreModel.getWearRate(
        compound,
        track,
        vehicle.paceMode,
        vehicle.tyreWear
    );
    const lineWearFactor = vehicle.lineMode === 'attack' ? 1.1 : vehicle.lineMode === 'defend' ? 0.9 : 1;
    const coolingFactor = teamSpecs ? 1 - (teamSpecs.cooling - 85) * 0.0015 : 1;
    const lifespanFactor = teamSpecs ? 1 - (teamSpecs.lifespan - 85) * 0.001 : 1;
    const tempWear = TyreModel.getTemperatureWearMultiplier(compound, vehicle.tyreTemp);
    const managementFactor = Math.max(0.85, Math.min(1.08, 1 - (management - 85) * 0.003));
    const adjustedWearRate = wearRate * lineWearFactor * coolingFactor * lifespanFactor * tempWear * managementFactor * setupEffects.tyreWearFactor;
    
    vehicle.tyreWear += adjustedWearRate * dt;
    if (vehicle.tyreWear > 100) vehicle.tyreWear = 100;

    const throttleLoad = Math.max(0.35, Math.min(1, speedKph / 320));
    const accelerationLoad = Math.max(0, Math.min(1, vehicle.acceleration / 12));
    const deploymentLoad = vehicle.ersMode === 'deploy' ? 0.18 : vehicle.ersMode === 'harvest' ? -0.08 : 0;
    let burnRate = 0.010 + (throttleLoad * 0.010) + (accelerationLoad * 0.004) + deploymentLoad * 0.004;
    if (vehicle.paceMode === 'aggressive') burnRate *= 1.15;
    if (vehicle.paceMode === 'conservative') burnRate *= 0.88;
    if (teamSpecs) {
        burnRate *= 1 - (teamSpecs.drag_reduction - 85) * 0.0012;
    }

    vehicle.fuelLoad -= burnRate * dt;
    if (vehicle.fuelLoad < 0) vehicle.fuelLoad = 0;
    
    const maxBatteryJ = 4000000;
    const maxRecoveryJ = 8500000;
    const mass = 768;
    const ersEfficiency = teamSpecs ? teamSpecs.ers_efficiency : 85;
    const efficiencyFactor = 0.98 + (ersEfficiency - 85) / 500;
    const ersOverrideEligible = this.isERSOverrideEligible(vehicle, state);
    const deploymentLimit = this.getERSDeploymentLimit(speedKph, vehicle.ersMode, efficiencyFactor, ersOverrideEligible);
    const harvestPower = this.getERSHarvestPower(speedKph, vehicle.ersMode, efficiencyFactor);
    let batteryJ = (vehicle.ersLevel / 100) * maxBatteryJ;
    let energyDelta = 0;
    if (vehicle.acceleration > 0.1 && vehicle.ersMode !== 'harvest' && batteryJ > 0) {
        energyDelta -= deploymentLimit * dt;
    }
    if (harvestPower > 0 && batteryJ < maxBatteryJ) {
        energyDelta += harvestPower * dt;
    }
    if (vehicle.acceleration < -0.1 && batteryJ < maxBatteryJ && vehicle.ersRecoveredThisLap < maxRecoveryJ) {
        const brakingPower = Math.abs(vehicle.acceleration) * mass * vehicle.speed;
        const regenCap = Math.min(350000 * efficiencyFactor, brakingPower);
        const allowedRecovery = Math.min(maxRecoveryJ - vehicle.ersRecoveredThisLap, regenCap * dt);
        energyDelta += allowedRecovery;
        vehicle.ersRecoveredThisLap += allowedRecovery;
    }
    batteryJ = Math.max(0, Math.min(maxBatteryJ, batteryJ + energyDelta));
    vehicle.ersLevel = (batteryJ / maxBatteryJ) * 100;
    if (vehicle.ersLevel <= 0) {
        vehicle.ersLevel = 0;
        vehicle.ersMode = 'balanced';
    }
    if (vehicle.ersLevel > 100) vehicle.ersLevel = 100;
  }

  private getERSDeploymentLimit(speedKph: number, ersMode: VehicleState['ersMode'], efficiencyFactor: number, ersOverrideEligible: boolean): number {
      // F1 2026 Rules: 350kW max ERS power, tapering off at high speeds
      let maxPower = 350000;

      // Implement tapering logic
      if (speedKph >= 345) {
          // Overtake mode taper
          if (ersOverrideEligible) {
              const taperRatio = Math.min(1, (speedKph - 345) / 10); // Taper completely by 355
              maxPower *= (1 - taperRatio);
          } else {
              maxPower = 0; // Standard boost taps out much earlier
          }
      } else if (speedKph >= 320 && !ersOverrideEligible) {
          // Normal boost tapers between 320 and 345
           const taperRatio = Math.min(1, (speedKph - 320) / 25);
           maxPower *= (1 - taperRatio);
      } else if (speedKph >= 290 && !ersOverrideEligible) {
          // Standard taper starts at 290
           maxPower = Math.max(150000, maxPower - ((speedKph - 290) * 5000));
      }

      switch (ersMode as string) {
          case 'attack':
          case 'deploy':
              return maxPower * efficiencyFactor;
          case 'defend': return maxPower * 0.9 * efficiencyFactor;
          case 'balanced': return maxPower * 0.6 * efficiencyFactor;
          case 'harvest': return 0;
          default: return maxPower * 0.6 * efficiencyFactor;
      }
  }

  private getERSHarvestPower(speedKph: number, ersMode: VehicleState['ersMode'], efficiencyFactor: number): number {
      const baseHarvest = 200000; // Increased harvest power for 2026 rules
      if (speedKph < 80) return 0;
      switch (ersMode as string) {
          case 'harvest': return baseHarvest * 1.5 * efficiencyFactor;
          case 'balanced': return baseHarvest * efficiencyFactor;
          case 'defend': return baseHarvest * 0.8 * efficiencyFactor;
          case 'attack':
          case 'deploy':
              return baseHarvest * 0.5 * efficiencyFactor;
          default: return baseHarvest * efficiencyFactor;
      }
  }

  private isERSOverrideEligible(vehicle: VehicleState, state: RaceState): boolean {
      return state.safetyCar === 'none' && vehicle.position > 1 && vehicle.gapToAhead < 1.0;
  }

  private buildERSTacticalState(): ERSTacticalState {
    return {
      intent: 'neutral',
      reasons: [],
      deployBias: 1,
      harvestBias: 1
    };
  }

  private recordTelemetrySample(
    vehicle: VehicleState,
    trace: TelemetryDataPoint[],
    profileSample: TrackProfileSample,
    elapsedTime: number
  ): void {
    if (vehicle.distanceOnLap >= vehicle.telemetry.nextSampleDistance) {
      trace.push({
        distance: vehicle.distanceOnLap,
        speed: vehicle.speed,
        sampleTime: elapsedTime,
        sectorId: profileSample.sectorId
      });
      vehicle.telemetry.nextSampleDistance = vehicle.distanceOnLap + vehicle.telemetry.sampleInterval;
    }
  }
}
