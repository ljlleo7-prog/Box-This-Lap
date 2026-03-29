# Physics System Refactoring Plan

## Overview
The recent telemetry consistency tests revealed that the simulation runs consistently slower than real-world hotlaps by 7 to 21 seconds, with significant speed errors (up to 91%). Analysis of the `PhysicsSystem.ts` shows that the core issue lies in the **braking kinematics**, specifically how and when the car decides to start braking for upcoming corners. Additionally, telemetry-derived target speeds are being artificially distorted, and the raw power/drag physics need slight calibration.

This plan outlines the steps to refactor the physics system to fix these issues and achieve realistic F1 lap times.

## Step 1: Fix Braking Logic (`getProfileDynamics`)
The current logic calculates `baseBrakingDistance` using the distance *to* the corner (`lowSpeedDistanceAhead`), causing the car to brake prematurely and coast for long distances (e.g., braking 180m ahead of a corner that only requires 50m of braking).
- **Action**: Refactor `projectedBrakeNeed` to strictly use kinematic equations: `(v^2 - u^2) / (2 * max_decel)`.
- **Action**: Change the `needsBrakingNow` trigger condition to evaluate if `lowSpeedDistanceAhead <= projectedBrakeNeed + brakeShiftMeters`.
- **Action**: Ensure `brakingDistance` strictly reflects the distance over which the car *should* brake, rather than the distance to the corner.

## Step 2: Fix Target Speed Telemetry Distortion (`calculateTargetSpeed`)
When the simulation runs with telemetry-derived sectors (`hasTelemetrySectors === true`), the base speeds are perfectly accurate ground-truths from real OpenF1 data. Currently, the physics engine still applies cornering phase multipliers (`straightFactor`, `apexFactor`, etc.) to these speeds, distorting them.
- **Action**: Detect when telemetry is active (using the existing `scale` multiplier check).
- **Action**: Bypass the application of phase multipliers (`straightFactor`, `entryFactor`, `apexFactor`, `exitFactor`, and `tractionFactor`) to `phaseSpeed` if telemetry sectors are used. Trust the `profileBaseSpeed` directly.

## Step 3: Calibrate Physics Parameters (`calculateMaxAcceleration` & `calculateMaxBraking`)
To hit 330-340 km/h top speeds and realistic acceleration curves, the base forces need minor tuning.
- **Action**: Adjust `baseEnginePower` and `ERSDeploymentLimit` to reflect more realistic F1 outputs (e.g., increase total combined power output to ~750-800 kW).
- **Action**: Verify that `calculateMaxBraking` incorporates aero drag properly so that high-speed braking reaches ~4-5G, tapering off at lower speeds.

## Step 4: Verification
- **Action**: Run the telemetry consistency tests (`test_telemetry_consistency.ts`) against Silverstone, Melbourne, and China.
- **Expected Outcome**: The average simulation lap time should align closely with the reference lap time (delta < 2 seconds), and max speed errors should drop significantly.