import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock3, Flag, Lock, MapPin, Pause, Play, RadioTower, SlidersHorizontal, Wrench } from 'lucide-react';
import { clsx } from 'clsx';
import { DRIVERS } from '../data/initialData';
import { TRACKS } from '../data/tracks';
import { SetupFeedbackSystem } from '../engine/systems/SetupFeedbackSystem';
import { buildSetupPhysicsEffects } from '../engine/systems/SetupModel';
import { TyreManager } from '../engine/systems/TyreManager';
import { TYRE_COMPOUNDS } from '../engine/systems/TyreModel';
import { WeekendManager } from '../engine/systems/WeekendManager';
import { GlassButton } from '../components/ui/GlassButton';
import { GlassCard } from '../components/ui/GlassCard';
import { CircularTrackMap, type TrackMapVehicle } from '../components/CircularTrackMap';
import type { OfflineWeekend, SessionSetupState, SetupTuningParameter, Track, TyreCompound, TyreSet, WeekendPhase } from '../types';
import type { DrivingBiasFeedback, DrivingBiasFeedbackResult, DrivingBiasMetricKey, PracticeFocusAllocation } from '../engine/systems/SetupFeedbackSystem';

const TRACK_OPTIONS: Track[] = TRACKS;
const DEFAULT_TRACK = TRACK_OPTIONS[0]!;
const DRIVER_ID = 'nor';
const DEFAULT_STINT_LAPS = 15;
const MIN_RUN_LAPS = 2;
const MAX_RUN_LAPS = 40;
const EMPTY_TYRE_SETS: TyreSet[] = [];
const SESSION_DURATION_SECONDS: Record<TimedSessionPhase, number> = {
  fp1: 60 * 60,
  fp2: 60 * 60,
  fp3: 60 * 60,
  q1: 18 * 60,
  q2: 15 * 60,
  q3: 12 * 60,
};
const SETUP_CHANGE_BASE_SECONDS = 24;
const SETUP_CHANGE_SECONDS_PER_POINT = 0.7;
const PIT_SPEED_FACTOR = 0.38;
const OUT_LAP_VSC_PORTION = 0.82;
const PIT_LANE_DISTANCE_RATIO = 0.04;
const AI_WAIT_SIM_SECONDS = 75;
const PHASE_FLOW: WeekendPhase[] = ['pre_weekend', 'fp1', 'fp2', 'fp3', 'q1', 'q2', 'q3', 'race', 'post_race'];
type PracticePhase = 'fp1' | 'fp2' | 'fp3';
type QualifyingPhase = 'q1' | 'q2' | 'q3';
type TimedSessionPhase = PracticePhase | QualifyingPhase;
type PracticeFocusMode = 'setup_feedback' | 'balanced' | 'track_preparation';
type SetupDirection = 'too_low' | 'too_high' | 'in_window' | 'awaiting_data';
const TUNING_FIELDS: Array<{ key: SetupTuningParameter; label: string }> = [
  { key: 'frontWingAngle', label: 'Front wing' },
  { key: 'rearWingAngle', label: 'Rear wing' },
  { key: 'rideHeight', label: 'Ride height' },
  { key: 'suspensionStiffness', label: 'Suspension' },
  { key: 'toeOut', label: 'Toe' },
  { key: 'camber', label: 'Camber' },
  { key: 'gearboxSetting', label: 'Gearbox' },
];
const DRIVING_BIAS_FIELDS: Array<{
  key: DrivingBiasMetricKey;
  label: string;
  format: (value: number) => string;
  domain: [number, number];
  leftLabel: string;
  rightLabel: string;
}> = [
  { key: 'cornerEntryBalance', label: 'Entry balance', format: (value) => value.toFixed(3), domain: [-0.35, 0.35], leftLabel: 'Entry understeer', rightLabel: 'Entry oversteer' },
  { key: 'midCornerBalance', label: 'Mid-corner balance', format: (value) => value.toFixed(3), domain: [-0.3, 0.3], leftLabel: 'Mid understeer', rightLabel: 'Mid oversteer' },
  { key: 'cornerExitBalance', label: 'Exit balance', format: (value) => value.toFixed(3), domain: [-0.3, 0.3], leftLabel: 'Exit understeer', rightLabel: 'Exit oversteer' },
  { key: 'straightLineEfficiency', label: 'Straight-line efficiency', format: (value) => value.toFixed(3), domain: [0.92, 1.08], leftLabel: 'Draggy', rightLabel: 'Trimmed out' },
  { key: 'lowSpeedCornering', label: 'Low-speed cornering', format: (value) => value.toFixed(3), domain: [0.92, 1.08], leftLabel: 'Weak rotation', rightLabel: 'Aggressive front' },
  { key: 'highSpeedStability', label: 'High-speed stability', format: (value) => value.toFixed(3), domain: [0.92, 1.08], leftLabel: 'Nervous', rightLabel: 'Planted' },
  { key: 'traction', label: 'Traction support', format: (value) => value.toFixed(3), domain: [0.92, 1.08], leftLabel: 'Poor traction', rightLabel: 'Strong traction' },
  { key: 'runPlanBalance', label: 'Quali vs long-run bias', format: (value) => `${(value * 100).toFixed(0)}%`, domain: [-1, 1], leftLabel: 'Long-run', rightLabel: 'Quali' },
];
const NEUTRAL_SETUP: SessionSetupState = {
  frontWingAngle: 50,
  rearWingAngle: 50,
  rideHeight: 50,
  suspensionStiffness: 50,
  toeOut: 50,
  camber: 50,
  gearboxSetting: 50,
};

interface PracticeRunSummary {
  plannedLaps: number;
  laps: number;
  focusMode: PracticeFocusMode;
  feedbackQualityGain: number;
  trackPreparationGain: number;
  setupChangeSeconds: number;
  trafficPenaltySeconds: number;
  trafficStatus: 'clear' | 'moderate' | 'traffic';
  cutoffByChequered: boolean;
}

interface PracticePhaseState {
  focusMode: PracticeFocusMode;
  plannedLaps: number;
  lapsCompleted: number;
  lastFeedback: DrivingBiasFeedbackResult | null;
  lastRunSummary: PracticeRunSummary | null;
  needsFreshFeedback: boolean;
}

interface PracticeDevelopmentState {
  feedbackQuality: number;
  trackPreparation: number;
  qualifyingPrep: number;
  raceConservePrep: number;
  biasKnowledge: Partial<Record<DrivingBiasMetricKey, DrivingBiasFeedback>>;
  totalPracticeLaps: number;
  phases: Record<PracticePhase, PracticePhaseState>;
  qualifying: Record<QualifyingPhase, QualifyingPhaseState>;
  sessionElapsedSeconds: Record<TimedSessionPhase, number>;
  trackTractionByPhase: Record<TimedSessionPhase, number>;
  lastCommittedSetupByPhase: Partial<Record<TimedSessionPhase, SessionSetupState>>;
  selectedTyreSetByPhase: Partial<Record<TimedSessionPhase, string>>;
}

interface QualifyingRunSummary {
  plannedLaps: number;
  laps: number;
  setupChangeSeconds: number;
  trafficPenaltySeconds: number;
  trafficStatus: 'clear' | 'moderate' | 'traffic';
  cutoffByChequered: boolean;
  bestLapSeconds: number | null;
}

interface QualifyingPhaseState {
  plannedLaps: number;
  lapsCompleted: number;
  bestLapSeconds: number | null;
  lastRunSummary: QualifyingRunSummary | null;
}

interface AICompetitorState {
  driverId: string;
  driverName: string;
  team: string;
  setupByPhase: Partial<Record<TimedSessionPhase, SessionSetupState>>;
  bestLapByPhase: Partial<Record<QualifyingPhase, number>>;
  lapsByPhase: Partial<Record<TimedSessionPhase, number>>;
  tyreByPhase: Partial<Record<TimedSessionPhase, TyreCompound>>;
}

interface SessionPlaybackPlan {
  phase: TimedSessionPhase;
  player: {
    plannedLaps: number;
    completedLaps: number;
    setupChangeSeconds: number;
    lapTimeSeconds: number;
    outLapSeconds: number;
    inLapSeconds: number;
  };
  aiRuns: Array<{
    driverId: string;
    completedLaps: number;
    setupChangeSeconds: number;
    lapTimeSeconds: number;
    outLapSeconds: number;
    inLapSeconds: number;
    isReleased: boolean;
  }>;
  elapsedSeconds: number;
}

interface ActivePlaybackState {
  plan: SessionPlaybackPlan;
  progressRatio: number;
  durationSeconds: number;
}

interface PendingRunContext {
  phase: TimedSessionPhase;
  plannedLaps: number;
  setupChangeSeconds: number;
  lapTimeSeconds: number;
  selectedTyreSetId: string;
  releaseElapsedSeconds: number;
  trafficPenaltySeconds: number;
  trafficStatus: 'clear' | 'moderate' | 'traffic';
}

function createPracticePhaseState(): PracticePhaseState {
  return {
    focusMode: 'balanced',
    plannedLaps: DEFAULT_STINT_LAPS,
    lapsCompleted: 0,
    lastFeedback: null,
    lastRunSummary: null,
    needsFreshFeedback: true,
  };
}

function createPracticeDevelopmentState(): PracticeDevelopmentState {
  return {
    feedbackQuality: 0,
    trackPreparation: 0,
    qualifyingPrep: 0,
    raceConservePrep: 0,
    biasKnowledge: {},
    totalPracticeLaps: 0,
    phases: {
      fp1: createPracticePhaseState(),
      fp2: createPracticePhaseState(),
      fp3: createPracticePhaseState(),
    },
    qualifying: {
      q1: { plannedLaps: 3, lapsCompleted: 0, bestLapSeconds: null, lastRunSummary: null },
      q2: { plannedLaps: 3, lapsCompleted: 0, bestLapSeconds: null, lastRunSummary: null },
      q3: { plannedLaps: 3, lapsCompleted: 0, bestLapSeconds: null, lastRunSummary: null },
    },
    sessionElapsedSeconds: {
      fp1: 0,
      fp2: 0,
      fp3: 0,
      q1: 0,
      q2: 0,
      q3: 0,
    },
    trackTractionByPhase: {
      fp1: 0,
      fp2: 0,
      fp3: 0,
      q1: 0,
      q2: 0,
      q3: 0,
    },
    lastCommittedSetupByPhase: {},
    selectedTyreSetByPhase: {},
  };
}

function createWeekend(track: Track): OfflineWeekend {
  return {
    id: `practice-quali-${track.id}`,
    round: 1,
    trackId: track.id,
    currentPhase: 'pre_weekend',
    completedSessions: [],
    selectedTeamId: 'mclaren',
    fp1Setup: { [DRIVER_ID]: { ...NEUTRAL_SETUP } },
    fp2Setup: { [DRIVER_ID]: { ...NEUTRAL_SETUP } },
    fp3Setup: { [DRIVER_ID]: { ...NEUTRAL_SETUP } },
    q1Setup: {},
    q2Setup: {},
    q3Setup: {},
    raceSetup: {},
    tyreAllocations: { [DRIVER_ID]: TyreManager.initializeAllocation(DRIVER_ID) },
    setupKnowledge: {},
    sessionSummaries: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isPracticePhase(phase: WeekendPhase): phase is 'fp1' | 'fp2' | 'fp3' {
  return ['fp1', 'fp2', 'fp3'].includes(phase);
}

function isQualifyingPhase(phase: WeekendPhase): phase is QualifyingPhase {
  return ['q1', 'q2', 'q3'].includes(phase);
}

function isTimedSessionPhase(phase: WeekendPhase): phase is TimedSessionPhase {
  return isPracticePhase(phase) || isQualifyingPhase(phase);
}

function getFocusAllocation(focusMode: PracticeFocusMode): PracticeFocusAllocation {
  if (focusMode === 'setup_feedback') {
    return { setupFeedbackShare: 1, trackPreparationShare: 0 };
  }

  if (focusMode === 'track_preparation') {
    return { setupFeedbackShare: 0, trackPreparationShare: 1 };
  }

  return { setupFeedbackShare: 0.5, trackPreparationShare: 0.5 };
}

function getFocusLabel(focusMode: PracticeFocusMode): string {
  if (focusMode === 'setup_feedback') return 'Setup Feedback';
  if (focusMode === 'track_preparation') return 'Preparation';
  return 'Balanced';
}

function getDirection(currentValue: number, optimalRange: [number, number] | undefined): SetupDirection {
  if (!optimalRange) return 'awaiting_data';
  if (currentValue < optimalRange[0]) return 'too_low';
  if (currentValue > optimalRange[1]) return 'too_high';
  return 'in_window';
}

function getDirectionTone(direction: SetupDirection): string {
  if (direction === 'awaiting_data') return 'bg-white/5 border-white/10 text-gray-300';
  if (direction === 'too_low') return 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300';
  if (direction === 'too_high') return 'bg-red-500/15 border-red-500/30 text-red-300';
  return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
}

function getDirectionLabel(direction: SetupDirection): string {
  if (direction === 'awaiting_data') return 'awaiting data';
  if (direction === 'too_low') return 'too low';
  if (direction === 'too_high') return 'too high';
  return 'in range';
}

function getDrivingBiasValue(effects: ReturnType<typeof buildSetupPhysicsEffects>, key: DrivingBiasMetricKey): number {
  if (key === 'cornerEntryBalance') return effects.entryRotationDelta;
  if (key === 'midCornerBalance') return effects.midRotationDelta;
  if (key === 'cornerExitBalance') return effects.exitRotationDelta;
  if (key === 'straightLineEfficiency') return effects.straightFactor;
  if (key === 'lowSpeedCornering') return effects.lowSpeedFactor;
  if (key === 'highSpeedStability') return effects.highSpeedFactor;
  if (key === 'traction') return effects.accelerationFactor;
  return effects.runPlanBias;
}

function getRunPlanLabel(value: number): string {
  if (value > 0.08) return 'Quali-biased';
  if (value < -0.08) return 'Long-run biased';
  return 'Balanced';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSessionClock(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function calculateSetupChangeSeconds(previousSetup: SessionSetupState, nextSetup: SessionSetupState): number {
  const delta = TUNING_FIELDS.reduce((total, field) => total + Math.abs((nextSetup[field.key] ?? 50) - (previousSetup[field.key] ?? 50)), 0);
  return Math.round((SETUP_CHANGE_BASE_SECONDS + delta * SETUP_CHANGE_SECONDS_PER_POINT) * 10) / 10;
}

function getBiasPositionPercent(value: number, domain: [number, number]): number {
  const [min, max] = domain;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function estimateLapTimeSeconds(
  track: Track,
  effects: ReturnType<typeof buildSetupPhysicsEffects>,
  driver: (typeof DRIVERS)[number],
  trackPreparation: number,
  phase: TimedSessionPhase,
  trackTraction: number = 0,
  trafficPenaltySeconds: number = 0
): number {
  const sectorPerformance = track.sectors.reduce((sum, sector) => {
    if (sector.type === 'straight') return sum + effects.straightFactor;
    if (sector.type === 'corner_low_speed') return sum + effects.lowSpeedFactor;
    if (sector.type === 'corner_medium_speed') return sum + effects.mediumSpeedFactor;
    return sum + effects.highSpeedFactor;
  }, 0);
  const normalizedPerformance = sectorPerformance / Math.max(track.sectors.length, 1);
  const driverComposite = (
    driver.performance.straight * 0.25
    + driver.performance.corneringLow * 0.2
    + driver.performance.corneringMedium * 0.2
    + driver.performance.corneringHigh * 0.2
    + driver.skill.consistency * 0.15
  ) / 100;
  const balancePenalty = (
    Math.abs(effects.entryRotationDelta)
    + Math.abs(effects.midRotationDelta)
    + Math.abs(effects.exitRotationDelta)
  ) * 2.3;
  const tyrePenalty = Math.max(0, effects.tyreWearFactor - 1) * 7.5 + Math.abs(effects.tyreTempOffset) * 0.08;
  const prepGain = (trackPreparation / 100) * (phase.startsWith('q') ? 1.15 : 0.7);
  const tractionGain = (trackTraction / 100) * (phase.startsWith('q') ? 1.3 : 0.9);
  const phasePush = phase.startsWith('q') ? 0.55 : 0;
  return clamp(
    driver.basePace / Math.max(0.84, normalizedPerformance * driverComposite)
      + balancePenalty
      + tyrePenalty
      + trafficPenaltySeconds
      - prepGain
      - tractionGain
      - phasePush,
    62,
    150
  );
}

function getTyreLapTimeAdjustment(compound: TyreCompound, wear: number): number {
  const paceDelta = TYRE_COMPOUNDS[compound].basePaceDelta;
  const wearPenalty = clamp(wear / 42, 0, 2.4);
  return paceDelta + wearPenalty;
}

function getTyreShortLabel(compound: TyreCompound): string {
  if (compound === 'soft') return 'S';
  if (compound === 'medium') return 'M';
  if (compound === 'hard') return 'H';
  if (compound === 'intermediate') return 'I';
  return 'W';
}

function getTyreColor(compound: TyreCompound): string {
  if (compound === 'soft') return '#ef4444';
  if (compound === 'medium') return '#f59e0b';
  if (compound === 'hard') return '#e5e7eb';
  if (compound === 'intermediate') return '#22c55e';
  return '#3b82f6';
}

function normalizePlannedLaps(value: number): number {
  if (!Number.isFinite(value)) return MIN_RUN_LAPS;
  return clamp(Math.round(value), MIN_RUN_LAPS, MAX_RUN_LAPS);
}

function calculateDriverPrepDelta(compound: TyreCompound, completedLaps: number, phase: TimedSessionPhase): { qualifying: number; raceConserve: number } {
  const shortRunFactor = clamp((6 - completedLaps) / 6, 0, 1);
  const longRunFactor = clamp((completedLaps - 8) / 12, 0, 1);
  const softBias = compound === 'soft' ? 1 : compound === 'medium' ? 0.5 : 0.2;
  const hardBias = compound === 'hard' ? 1 : compound === 'medium' ? 0.55 : 0.2;
  const phaseQualiBias = phase.startsWith('q') ? 1.2 : 1;
  const phaseRaceBias = phase.startsWith('q') ? 0.7 : 1;
  return {
    qualifying: completedLaps * (0.45 + shortRunFactor) * softBias * phaseQualiBias,
    raceConserve: completedLaps * (0.35 + longRunFactor) * hardBias * phaseRaceBias,
  };
}

function calculateTractionGain(timeUsedSeconds: number, totalLaps: number, phase: TimedSessionPhase): number {
  const phaseWindow = SESSION_DURATION_SECONDS[phase];
  const timeGain = (timeUsedSeconds / Math.max(phaseWindow, 1)) * 35;
  const rubberGain = totalLaps * (phase.startsWith('q') ? 0.42 : 0.32);
  return timeGain + rubberGain;
}

function estimateTrafficImpact(
  phase: TimedSessionPhase,
  phaseElapsedSeconds: number,
  effects: ReturnType<typeof buildSetupPhysicsEffects>,
  track: Track,
  aiCompetitors: AICompetitorState[]
): { trafficPenaltySeconds: number; trafficStatus: 'clear' | 'moderate' | 'traffic' } {
  const activeCars = aiCompetitors.reduce((count, entry, index) => {
    const laps = entry.lapsByPhase[phase] ?? 0;
    const signal = deterministicNoise((index + 1) * 29 + phaseElapsedSeconds * 0.031 + laps * 0.77);
    const threshold = phase.startsWith('q') ? 0.52 : 0.62;
    return signal > threshold ? count + 1 : count;
  }, 0);
  const density = activeCars / Math.max(aiCompetitors.length, 1);
  const cornerSensitivity = clamp(track.trackDifficulty * 0.45 + (2 - (effects.lowSpeedFactor + effects.mediumSpeedFactor)) * 0.28, 0.12, 0.95);
  const trafficPenaltySeconds = clamp((density - 0.22) * 1.2 * cornerSensitivity, 0, 1.35);
  if (trafficPenaltySeconds > 0.55) return { trafficPenaltySeconds, trafficStatus: 'traffic' };
  if (trafficPenaltySeconds > 0.2) return { trafficPenaltySeconds, trafficStatus: 'moderate' };
  return { trafficPenaltySeconds: 0, trafficStatus: 'clear' };
}

function chooseDefaultTyreSetId(allocation: TyreSet[]): string | null {
  const available = allocation.filter((set) => !set.returned);
  const preferred = available.find((set) => set.compound === 'soft')
    ?? available.find((set) => set.compound === 'medium')
    ?? available.find((set) => set.compound === 'hard')
    ?? available[0];
  return preferred?.id ?? null;
}

function deterministicNoise(seed: number): number {
  const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function buildTunedSetup(
  baseSetup: SessionSetupState,
  idealSetup: Partial<Record<SetupTuningParameter, number>>,
  learning: number,
  seed: number
): SessionSetupState {
  const result: SessionSetupState = { ...baseSetup };
  const learningFactor = 0.08 + learning / 500;
  TUNING_FIELDS.forEach(({ key }, index) => {
    const base = baseSetup[key] ?? 50;
    const target = idealSetup[key] ?? 50;
    const noise = (deterministicNoise(seed + index * 17) - 0.5) * 3.4;
    const stepped = base + (target - base) * learningFactor + noise;
    result[key] = clamp(Math.round(stepped), 0, 100);
  });
  return result;
}

function simulateSessionLaps(
  plannedLaps: number,
  lapTimeSeconds: number,
  remainingSeconds: number,
  setupChangeSeconds: number
): {
  completedLaps: number;
  timeUsedSeconds: number;
  cutoffByChequered: boolean;
  outLapSeconds: number;
  inLapSeconds: number;
} {
  if (remainingSeconds <= 0) {
    return {
      completedLaps: 0,
      timeUsedSeconds: 0,
      cutoffByChequered: true,
      outLapSeconds: 0,
      inLapSeconds: 0,
    };
  }
  const outLapSeconds = lapTimeSeconds * (OUT_LAP_VSC_PORTION / PIT_SPEED_FACTOR + (1 - OUT_LAP_VSC_PORTION));
  const inLapSeconds = lapTimeSeconds / PIT_SPEED_FACTOR;
  const fixedRunSeconds = setupChangeSeconds + outLapSeconds + inLapSeconds;
  if (setupChangeSeconds >= remainingSeconds) {
    return {
      completedLaps: 0,
      timeUsedSeconds: remainingSeconds,
      cutoffByChequered: true,
      outLapSeconds: 0,
      inLapSeconds: 0,
    };
  }
  const trackWindow = Math.max(0, remainingSeconds - fixedRunSeconds);
  const possibleLaps = Math.floor(trackWindow / lapTimeSeconds);
  const completedLaps = Math.max(0, Math.min(plannedLaps, possibleLaps));
  const fullPlanTime = fixedRunSeconds + plannedLaps * lapTimeSeconds;
  if (fullPlanTime > remainingSeconds) {
    return {
      completedLaps,
      timeUsedSeconds: remainingSeconds,
      cutoffByChequered: true,
      outLapSeconds,
      inLapSeconds,
    };
  }
  return {
    completedLaps,
    timeUsedSeconds: fixedRunSeconds + completedLaps * lapTimeSeconds,
    cutoffByChequered: false,
    outLapSeconds,
    inLapSeconds,
  };
}

function getPlaybackTrackState(
  trackDistance: number,
  lapTimeSeconds: number,
  setupChangeSeconds: number,
  outLapSeconds: number,
  completedLaps: number,
  inLapSeconds: number,
  progressSeconds: number
): { distanceOnLap: number; isInPit: boolean } {
  const pitDistance = trackDistance * PIT_LANE_DISTANCE_RATIO;
  if (progressSeconds <= setupChangeSeconds) {
    return { distanceOnLap: pitDistance, isInPit: true };
  }
  let remaining = progressSeconds - setupChangeSeconds;
  if (remaining <= outLapSeconds) {
    const outProgress = remaining / Math.max(outLapSeconds, 0.1);
    return {
      distanceOnLap: ((outProgress * trackDistance) % trackDistance + trackDistance) % trackDistance,
      isInPit: false,
    };
  }
  remaining -= outLapSeconds;
  const hotLapTotal = completedLaps * lapTimeSeconds;
  if (remaining <= hotLapTotal) {
    const lapProgress = remaining / Math.max(lapTimeSeconds, 0.1);
    return {
      distanceOnLap: ((lapProgress % 1) * trackDistance + trackDistance) % trackDistance,
      isInPit: false,
    };
  }
  remaining -= hotLapTotal;
  if (remaining <= inLapSeconds) {
    const inProgress = remaining / Math.max(inLapSeconds, 0.1);
    return {
      distanceOnLap: ((inProgress * trackDistance) % trackDistance + trackDistance) % trackDistance,
      isInPit: false,
    };
  }
  return { distanceOnLap: pitDistance, isInPit: true };
}

function getPitLaneSpawnDistance(track: Track, slotIndex: number, totalSlots: number): number {
  const { entryDistance, exitDistance } = track.pitLane;
  const laneLength = entryDistance <= exitDistance
    ? exitDistance - entryDistance
    : exitDistance + track.totalDistance - entryDistance;
  const safeSlots = Math.max(1, totalSlots);
  const laneProgress = (slotIndex + 1) / (safeSlots + 1);
  const laneDistance = laneLength * laneProgress;
  return (entryDistance + laneDistance) % track.totalDistance;
}

function getSetupForPhase(weekend: OfflineWeekend, phase: WeekendPhase): SessionSetupState {
  switch (phase) {
    case 'fp1':
      return weekend.fp1Setup[DRIVER_ID] ?? { ...NEUTRAL_SETUP };
    case 'fp2':
      return weekend.fp2Setup[DRIVER_ID] ?? { ...NEUTRAL_SETUP };
    case 'fp3':
      return weekend.fp3Setup[DRIVER_ID] ?? { ...NEUTRAL_SETUP };
    case 'q1':
      return weekend.q1Setup[DRIVER_ID] ?? { ...NEUTRAL_SETUP };
    case 'q2':
      return weekend.q2Setup[DRIVER_ID] ?? { ...NEUTRAL_SETUP };
    case 'q3':
      return weekend.q3Setup[DRIVER_ID] ?? { ...NEUTRAL_SETUP };
    case 'race':
      return weekend.raceSetup[DRIVER_ID] ?? { ...NEUTRAL_SETUP };
    default:
      return { ...NEUTRAL_SETUP };
  }
}

function updateSetupForPhase(weekend: OfflineWeekend, phase: WeekendPhase, setup: SessionSetupState): OfflineWeekend {
  if (phase === 'fp1') return { ...weekend, fp1Setup: { ...weekend.fp1Setup, [DRIVER_ID]: setup } };
  if (phase === 'fp2') return { ...weekend, fp2Setup: { ...weekend.fp2Setup, [DRIVER_ID]: setup } };
  if (phase === 'fp3') return { ...weekend, fp3Setup: { ...weekend.fp3Setup, [DRIVER_ID]: setup } };
  if (phase === 'q1') return { ...weekend, q1Setup: { ...weekend.q1Setup, [DRIVER_ID]: setup } };
  if (phase === 'q2') return { ...weekend, q2Setup: { ...weekend.q2Setup, [DRIVER_ID]: setup } };
  if (phase === 'q3') return { ...weekend, q3Setup: { ...weekend.q3Setup, [DRIVER_ID]: setup } };
  if (phase === 'race') return { ...weekend, raceSetup: { ...weekend.raceSetup, [DRIVER_ID]: setup } };
  return weekend;
}

function carrySetupForward(weekend: OfflineWeekend): OfflineWeekend {
  const nextPhase = WeekendManager.getNextPhase(weekend.currentPhase);
  if (!nextPhase) return weekend;

  if (weekend.currentPhase === 'fp1' && nextPhase === 'fp2') {
    return updateSetupForPhase(weekend, 'fp2', { ...getSetupForPhase(weekend, 'fp1') });
  }

  if (weekend.currentPhase === 'fp2' && nextPhase === 'fp3') {
    return updateSetupForPhase(weekend, 'fp3', { ...getSetupForPhase(weekend, 'fp2') });
  }

  return weekend;
}

function createAICompetitors(playerTeam: string, phaseSetup: SessionSetupState): AICompetitorState[] {
  return DRIVERS
    .filter((driver) => driver.team !== playerTeam)
    .map((driver) => ({
      driverId: driver.id,
      driverName: driver.name,
      team: driver.team,
      setupByPhase: {
        fp1: { ...phaseSetup },
        fp2: { ...phaseSetup },
        fp3: { ...phaseSetup },
        q1: { ...phaseSetup },
        q2: { ...phaseSetup },
        q3: { ...phaseSetup },
      },
      bestLapByPhase: {},
      lapsByPhase: {},
      tyreByPhase: {},
    }));
}

function formatLapTime(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const mins = Math.floor(seconds / 60);
  const sec = seconds - mins * 60;
  return `${mins}:${sec.toFixed(3).padStart(6, '0')}`;
}

export const PracticeQualiDev: React.FC = () => {
  const navigate = useNavigate();
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK.id);
  const selectedDriver = useMemo(
    () => DRIVERS.find((driver) => driver.id === DRIVER_ID),
    []
  );
  const playerTeam = selectedDriver?.team ?? 'McLaren';

  const selectedTrack = useMemo(
    () => TRACK_OPTIONS.find((track) => track.id === trackId) ?? DEFAULT_TRACK,
    [trackId]
  );
  const hiddenIdealSetup = useMemo(
    () => SetupFeedbackSystem.generateIdealSetup(selectedTrack),
    [selectedTrack]
  );

  const [weekend, setWeekend] = useState<OfflineWeekend>(() => createWeekend(selectedTrack));
  const [practiceDevelopment, setPracticeDevelopment] = useState<PracticeDevelopmentState>(createPracticeDevelopmentState);
  const [aiCompetitors, setAiCompetitors] = useState<AICompetitorState[]>(() => createAICompetitors(playerTeam, { ...NEUTRAL_SETUP }));
  const [activePlayback, setActivePlayback] = useState<ActivePlaybackState | null>(null);
  const [pendingRunContext, setPendingRunContext] = useState<PendingRunContext | null>(null);
  const [sceneSpeed, setSceneSpeed] = useState(1);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [garageOpen, setGarageOpen] = useState(true);
  const aiWaitAccumulatorByPhaseRef = useRef<Record<TimedSessionPhase, number>>({
    fp1: 0,
    fp2: 0,
    fp3: 0,
    q1: 0,
    q2: 0,
    q3: 0,
  });
  const trackPreparationRef = useRef(practiceDevelopment.trackPreparation);
  const tractionByPhaseRef = useRef(practiceDevelopment.trackTractionByPhase);

  useEffect(() => {
    setWeekend(createWeekend(selectedTrack));
    const nextDevelopment = createPracticeDevelopmentState();
    nextDevelopment.lastCommittedSetupByPhase.fp1 = { ...NEUTRAL_SETUP };
    setPracticeDevelopment(nextDevelopment);
    setAiCompetitors(createAICompetitors(playerTeam, { ...NEUTRAL_SETUP }));
    aiWaitAccumulatorByPhaseRef.current = { fp1: 0, fp2: 0, fp3: 0, q1: 0, q2: 0, q3: 0 };
    setActivePlayback(null);
    setPendingRunContext(null);
    setSessionPaused(false);
  }, [selectedTrack, playerTeam]);

  const currentSetup = useMemo(
    () => getSetupForPhase(weekend, weekend.currentPhase),
    [weekend]
  );

  useEffect(() => {
    if (!isTimedSessionPhase(weekend.currentPhase)) return;
    const phase = weekend.currentPhase;
    const defaultTyreSetId = chooseDefaultTyreSetId(weekend.tyreAllocations[DRIVER_ID] ?? []);
    setPracticeDevelopment((current) => {
      const hasCommittedSetup = !!current.lastCommittedSetupByPhase[phase];
      const hasTyreSet = !!current.selectedTyreSetByPhase[phase];
      if ((hasCommittedSetup || !currentSetup) && (hasTyreSet || !defaultTyreSetId)) return current;
      return {
        ...current,
        lastCommittedSetupByPhase: {
          ...current.lastCommittedSetupByPhase,
          ...(hasCommittedSetup ? {} : { [phase]: { ...currentSetup } }),
        },
        selectedTyreSetByPhase: {
          ...current.selectedTyreSetByPhase,
          ...(hasTyreSet || !defaultTyreSetId ? {} : { [phase]: defaultTyreSetId }),
        },
      };
    });
  }, [currentSetup, weekend.currentPhase, weekend.tyreAllocations]);

  useEffect(() => {
    if (isTimedSessionPhase(weekend.currentPhase)) {
      setGarageOpen(true);
      setSessionPaused(false);
      aiWaitAccumulatorByPhaseRef.current[weekend.currentPhase] = 0;
    }
  }, [weekend.currentPhase]);
  useEffect(() => {
    trackPreparationRef.current = practiceDevelopment.trackPreparation;
    tractionByPhaseRef.current = practiceDevelopment.trackTractionByPhase;
  }, [practiceDevelopment.trackPreparation, practiceDevelopment.trackTractionByPhase]);
  const driverLearning = selectedDriver?.learning ?? 85;
  const setupLocked = !isPracticePhase(weekend.currentPhase);
  const canEditSetup = isPracticePhase(weekend.currentPhase);
  const isQualifyingSession = isQualifyingPhase(weekend.currentPhase);
  const isTimedSession = isTimedSessionPhase(weekend.currentPhase);
  const feedbackVisible = isPracticePhase(weekend.currentPhase);
  const currentPracticePhaseState = isPracticePhase(weekend.currentPhase)
    ? practiceDevelopment.phases[weekend.currentPhase]
    : null;
  const currentQualifyingPhaseState = isQualifyingSession
    ? practiceDevelopment.qualifying[weekend.currentPhase]
    : null;
  const currentEffects = useMemo(
    () => buildSetupPhysicsEffects(selectedTrack, currentSetup),
    [selectedTrack, currentSetup]
  );
  const currentPhaseElapsedSeconds = isTimedSession ? practiceDevelopment.sessionElapsedSeconds[weekend.currentPhase] : 0;
  const currentPhaseDurationSeconds = isTimedSession ? SESSION_DURATION_SECONDS[weekend.currentPhase] : 0;
  const currentPhaseRemainingSeconds = isTimedSession ? Math.max(0, currentPhaseDurationSeconds - currentPhaseElapsedSeconds) : 0;
  const timedSessionPhase: TimedSessionPhase = isTimedSession ? (weekend.currentPhase as TimedSessionPhase) : 'fp1';
  const currentTrackTraction = isTimedSession ? practiceDevelopment.trackTractionByPhase[timedSessionPhase] : 0;
  const playerAllocation = weekend.tyreAllocations[DRIVER_ID] ?? EMPTY_TYRE_SETS;
  const availableTyreSets = useMemo(
    () => playerAllocation.filter((set) => !set.returned),
    [playerAllocation]
  );
  const selectedTyreSetId = isTimedSession ? (practiceDevelopment.selectedTyreSetByPhase[timedSessionPhase] ?? chooseDefaultTyreSetId(playerAllocation)) : null;
  const selectedTyreSet = selectedTyreSetId ? playerAllocation.find((set) => set.id === selectedTyreSetId) ?? null : null;
  const selectedTyreCompound: TyreCompound = selectedTyreSet?.compound ?? 'soft';
  const selectedTyreWear = selectedTyreSet?.wear ?? 0;
  const weatherLabel = useMemo(() => {
    const rainChance = selectedTrack.weatherChance.rainChance;
    if (rainChance < 0.2) return `Dry · ${Math.round(selectedTrack.baseTemperature)}°C`;
    if (rainChance < 0.45) return `Cloudy · ${Math.round(selectedTrack.baseTemperature)}°C`;
    return `Rain threat ${Math.round(rainChance * 100)}% · ${Math.round(selectedTrack.baseTemperature)}°C`;
  }, [selectedTrack]);
  const estimatedLapTime = isTimedSession && selectedDriver
    ? estimateLapTimeSeconds(selectedTrack, currentEffects, selectedDriver, practiceDevelopment.trackPreparation, timedSessionPhase, currentTrackTraction)
      + getTyreLapTimeAdjustment(selectedTyreCompound, selectedTyreWear)
    : 0;
  const currentFeedback = currentPracticePhaseState?.lastFeedback ?? null;
  const displayKnowledge = currentFeedback?.knowledge ?? practiceDevelopment.biasKnowledge;
  const hasPreservedKnowledge = Object.keys(practiceDevelopment.biasKnowledge).length > 0;
  const currentKnowledgeSkill = SetupFeedbackSystem.getSetupKnowledgeSkillFromQuality(practiceDevelopment.feedbackQuality);
  const flaggedCount = useMemo(
    () =>
      Object.keys(displayKnowledge).length === 0
        ? 0
        : DRIVING_BIAS_FIELDS.filter(({ key }) => {
            const currentValue = getDrivingBiasValue(currentEffects, key);
            const feedback = displayKnowledge[key];
            return getDirection(currentValue, feedback?.optimalRange) !== 'in_window';
          }).length,
    [currentEffects, displayKnowledge]
  );
  const qualifyingLeaderboard = useMemo(() => {
    if (!isQualifyingSession || !selectedDriver) return [];
    const phase = weekend.currentPhase;
    const playerBest = practiceDevelopment.qualifying[phase].bestLapSeconds;
    const aiRows = aiCompetitors
      .map((entry) => ({
        driverId: entry.driverId,
        driverName: entry.driverName,
        team: entry.team,
        bestLapSeconds: entry.bestLapByPhase[phase] ?? null,
        laps: entry.lapsByPhase[phase] ?? 0,
        tyreCompound: entry.tyreByPhase[phase] ?? null,
        isPlayer: false,
      }));
    const playerRow = {
      driverId: selectedDriver.id,
      driverName: selectedDriver.name,
      team: selectedDriver.team,
      bestLapSeconds: playerBest,
      laps: practiceDevelopment.qualifying[phase].lapsCompleted,
      tyreCompound: selectedTyreCompound,
      isPlayer: true,
    };
    return [...aiRows, playerRow]
      .sort((a, b) => {
        if (a.bestLapSeconds === null && b.bestLapSeconds === null) return 0;
        if (a.bestLapSeconds === null) return 1;
        if (b.bestLapSeconds === null) return -1;
        return a.bestLapSeconds - b.bestLapSeconds;
      })
      .map((entry, index) => ({
        ...entry,
        position: index + 1,
      }));
  }, [aiCompetitors, isQualifyingSession, practiceDevelopment.qualifying, selectedDriver, selectedTyreCompound, weekend.currentPhase]);
  const playbackSimSeconds = useMemo(() => {
    if (!activePlayback || !pendingRunContext) return 0;
    if (!isTimedSessionPhase(weekend.currentPhase)) return 0;
    if (pendingRunContext.phase !== weekend.currentPhase) return 0;
    const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[pendingRunContext.phase] ?? pendingRunContext.releaseElapsedSeconds;
    return clamp(phaseElapsed - pendingRunContext.releaseElapsedSeconds, 0, activePlayback.plan.elapsedSeconds);
  }, [activePlayback, pendingRunContext, practiceDevelopment.sessionElapsedSeconds, weekend.currentPhase]);
  const playbackProgressRatio = activePlayback
    ? clamp(playbackSimSeconds / Math.max(activePlayback.plan.elapsedSeconds, 0.1), 0, 1)
    : 0;

  const sceneTrackVehicles = useMemo<TrackMapVehicle[]>(() => {
    if (!isTimedSession || !selectedDriver) return [];
    const activePhase = weekend.currentPhase;
    const totalDistance = selectedTrack.totalDistance;
    if (activePlayback && activePlayback.plan.phase === activePhase) {
      const runSeconds = playbackSimSeconds;
      const playerTrackState = getPlaybackTrackState(
        totalDistance,
        activePlayback.plan.player.lapTimeSeconds,
        activePlayback.plan.player.setupChangeSeconds,
        activePlayback.plan.player.outLapSeconds,
        activePlayback.plan.player.completedLaps,
        activePlayback.plan.player.inLapSeconds,
        runSeconds
      );
      const aiVehicles = activePlayback.plan.aiRuns.map((run) => {
        const trackState = getPlaybackTrackState(
          totalDistance,
          Math.max(run.lapTimeSeconds, 1),
          run.setupChangeSeconds,
          run.outLapSeconds,
          run.completedLaps,
          run.inLapSeconds,
          runSeconds
        );
        const pitDistance = getPitLaneSpawnDistance(selectedTrack, aiCompetitors.findIndex((entry) => entry.driverId === run.driverId) + 1, aiCompetitors.length + 1);
        return {
          id: run.driverId,
          driverId: run.driverId,
          distanceOnLap: run.isReleased ? trackState.distanceOnLap : pitDistance,
          isInPit: !run.isReleased || trackState.isInPit,
        };
      });
      return [
        {
          id: selectedDriver.id,
          driverId: selectedDriver.id,
          distanceOnLap: playerTrackState.distanceOnLap,
          isInPit: playerTrackState.isInPit,
        },
        ...aiVehicles,
      ];
    }
    const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[activePhase];
    const baseline = [
      {
        id: selectedDriver.id,
        driverId: selectedDriver.id,
        distanceOnLap: getPitLaneSpawnDistance(selectedTrack, 0, aiCompetitors.length + 1),
        isInPit: true,
      },
      ...aiCompetitors.map((entry, index) => {
        const activitySignal = deterministicNoise((index + 1) * 31 + phaseElapsed * 0.014 + (entry.lapsByPhase[activePhase] ?? 0) * 0.2);
        const isRunning = activitySignal > (activePhase.startsWith('q') ? 0.62 : 0.48);
        if (!isRunning) {
          return {
            id: entry.driverId,
            driverId: entry.driverId,
            distanceOnLap: getPitLaneSpawnDistance(selectedTrack, index + 1, aiCompetitors.length + 1),
            isInPit: true,
          };
        }
        const rollingLapSeconds = activePhase.startsWith('q')
          ? 86 + ((index * 7) % 14)
          : 92 + ((index * 11) % 19);
        const phaseOffset = deterministicNoise((index + 1) * 43) * rollingLapSeconds;
        return {
          id: entry.driverId,
          driverId: entry.driverId,
          distanceOnLap: (((phaseElapsed + phaseOffset) / rollingLapSeconds) % 1) * totalDistance,
          isInPit: false,
        };
      }),
    ];
    return baseline.map((vehicle) => ({
      ...vehicle,
      distanceOnLap: ((vehicle.distanceOnLap % totalDistance) + totalDistance) % totalDistance,
    }));
  }, [
    activePlayback,
    aiCompetitors,
    isTimedSession,
    playbackSimSeconds,
    practiceDevelopment.sessionElapsedSeconds,
    selectedDriver,
    selectedTrack,
    weekend.currentPhase,
  ]);

  const handleSetupChange = (parameter: SetupTuningParameter, value: number) => {
    if (!canEditSetup) return;

    const activePhase = weekend.currentPhase as PracticePhase;
    setWeekend((currentWeekend) =>
      updateSetupForPhase(currentWeekend, currentWeekend.currentPhase, {
        ...getSetupForPhase(currentWeekend, currentWeekend.currentPhase),
        [parameter]: value,
      })
    );
    setPracticeDevelopment((current) => ({
      ...current,
      phases: {
        ...current.phases,
        [activePhase]: {
          ...current.phases[activePhase],
          needsFreshFeedback: true,
        },
      },
    }));
  };

  const handleResetWeekend = () => {
    setWeekend(createWeekend(selectedTrack));
    const nextDevelopment = createPracticeDevelopmentState();
    nextDevelopment.lastCommittedSetupByPhase.fp1 = { ...NEUTRAL_SETUP };
    setPracticeDevelopment(nextDevelopment);
    setAiCompetitors(createAICompetitors(playerTeam, { ...NEUTRAL_SETUP }));
    aiWaitAccumulatorByPhaseRef.current = { fp1: 0, fp2: 0, fp3: 0, q1: 0, q2: 0, q3: 0 };
    setActivePlayback(null);
    setSessionPaused(false);
    setPendingRunContext(null);
    setGarageOpen(true);
  };

  const handlePracticePhaseUpdate = <K extends keyof PracticePhaseState>(key: K, value: PracticePhaseState[K]) => {
    if (!isPracticePhase(weekend.currentPhase)) return;

    const activePhase = weekend.currentPhase;
    setPracticeDevelopment((current) => ({
      ...current,
      phases: {
        ...current.phases,
        [activePhase]: {
          ...current.phases[activePhase],
          [key]: value,
        },
      },
    }));
  };

  const handleQualifyingPhaseUpdate = <K extends keyof QualifyingPhaseState>(key: K, value: QualifyingPhaseState[K]) => {
    if (!isQualifyingPhase(weekend.currentPhase)) return;
    const activePhase = weekend.currentPhase;
    setPracticeDevelopment((current) => ({
      ...current,
      qualifying: {
        ...current.qualifying,
        [activePhase]: {
          ...current.qualifying[activePhase],
          [key]: value,
        },
      },
    }));
  };

  const handleTyreSetSelection = (setId: string) => {
    if (!isTimedSessionPhase(weekend.currentPhase)) return;
    const activePhase = weekend.currentPhase;
    setPracticeDevelopment((current) => ({
      ...current,
      selectedTyreSetByPhase: {
        ...current.selectedTyreSetByPhase,
        [activePhase]: setId,
      },
    }));
  };

  const simulateAiSessionSlice = useCallback((
    activePhase: TimedSessionPhase,
    timeUsedSeconds: number,
    trackPreparation: number,
    trackTraction: number,
    mode: 'run' | 'wait' = 'run'
  ): { nextCompetitors: AICompetitorState[]; runs: SessionPlaybackPlan['aiRuns'] } => {
    const runs: SessionPlaybackPlan['aiRuns'] = [];
    const nextCompetitors = aiCompetitors.map((entry, index) => {
      const driver = DRIVERS.find((candidate) => candidate.id === entry.driverId);
      if (!driver) return entry;
      const availabilitySignal = deterministicNoise((index + 1) * 17 + timeUsedSeconds * 0.07 + (entry.lapsByPhase[activePhase] ?? 0));
      const runsThisWindow = mode === 'run' ? true : availabilitySignal > (activePhase.startsWith('q') ? 0.42 : 0.56);
      if (!runsThisWindow) {
        runs.push({
          driverId: entry.driverId,
          completedLaps: 0,
          setupChangeSeconds: 0,
          lapTimeSeconds: 0,
          outLapSeconds: 0,
          inLapSeconds: 0,
          isReleased: false,
        });
        return entry;
      }
      const fallbackSetup =
        entry.setupByPhase[activePhase]
        ?? (activePhase === 'q1'
          ? entry.setupByPhase.fp3
          : activePhase === 'q2'
            ? entry.setupByPhase.q1
            : activePhase === 'q3'
              ? entry.setupByPhase.q2
              : activePhase === 'fp2'
                ? entry.setupByPhase.fp1
                : activePhase === 'fp3'
                  ? entry.setupByPhase.fp2
                  : undefined)
        ?? { ...NEUTRAL_SETUP };
      const tunedSetup = buildTunedSetup(fallbackSetup, hiddenIdealSetup, driver.learning, timeUsedSeconds + (index + 1) * 13);
      const effects = buildSetupPhysicsEffects(selectedTrack, tunedSetup);
      const aiTyre: TyreCompound = activePhase.startsWith('q')
        ? (deterministicNoise((index + 1) * 77 + timeUsedSeconds) > 0.7 ? 'medium' : 'soft')
        : (['soft', 'medium', 'hard'] as const)[Math.floor(deterministicNoise((index + 1) * 53 + timeUsedSeconds) * 3)];
      const lapTime = estimateLapTimeSeconds(selectedTrack, effects, driver, trackPreparation * 0.8, activePhase, trackTraction) + getTyreLapTimeAdjustment(aiTyre, 10);
      const setupChangeSeconds = mode === 'wait' ? 0 : (activePhase.startsWith('q') ? 0 : calculateSetupChangeSeconds(fallbackSetup, tunedSetup));
      const plannedLaps = activePhase.startsWith('q')
        ? Math.max(1, Math.floor(1 + deterministicNoise((index + 1) * 9 + timeUsedSeconds) * (mode === 'wait' ? 2 : 4)))
        : Math.max(2, Math.floor(3 + deterministicNoise((index + 1) * 19 + timeUsedSeconds) * (mode === 'wait' ? 6 : 12)));
      const aiRun = simulateSessionLaps(plannedLaps, lapTime, timeUsedSeconds, setupChangeSeconds);
      runs.push({
        driverId: entry.driverId,
        completedLaps: aiRun.completedLaps,
        setupChangeSeconds,
        lapTimeSeconds: lapTime,
        outLapSeconds: aiRun.outLapSeconds,
        inLapSeconds: aiRun.inLapSeconds,
        isReleased: true,
      });
      let bestLap = entry.bestLapByPhase[activePhase as QualifyingPhase] ?? null;
      if (activePhase.startsWith('q') && aiRun.completedLaps > 0) {
        for (let lap = 0; lap < aiRun.completedLaps; lap += 1) {
          const variance = (deterministicNoise((index + 1) * 97 + lap + timeUsedSeconds) - 0.5) * (1.15 - driver.skill.consistency / 120);
          const simulatedLap = lapTime + variance;
          bestLap = bestLap === null ? simulatedLap : Math.min(bestLap, simulatedLap);
        }
      }
      return {
        ...entry,
        setupByPhase: {
          ...entry.setupByPhase,
          [activePhase]: tunedSetup,
        },
        lapsByPhase: {
          ...entry.lapsByPhase,
          [activePhase]: (entry.lapsByPhase[activePhase] ?? 0) + aiRun.completedLaps,
        },
        tyreByPhase: {
          ...entry.tyreByPhase,
          [activePhase]: aiTyre,
        },
        bestLapByPhase: activePhase.startsWith('q')
          ? {
              ...entry.bestLapByPhase,
              [activePhase]: bestLap ?? undefined,
            }
          : entry.bestLapByPhase,
      };
    });
    return { nextCompetitors, runs };
  }, [aiCompetitors, hiddenIdealSetup, selectedTrack]);

  useEffect(() => {
    if (!isTimedSessionPhase(weekend.currentPhase) || sessionPaused) return;
    const activePhase = weekend.currentPhase;
    const timer = window.setInterval(() => {
      const stepSeconds = sceneSpeed;
      let phaseEnded = false;
      setPracticeDevelopment((current) => {
        const elapsed = current.sessionElapsedSeconds[activePhase];
        if (elapsed >= SESSION_DURATION_SECONDS[activePhase]) {
          phaseEnded = true;
          return current;
        }
        return {
          ...current,
          sessionElapsedSeconds: {
            ...current.sessionElapsedSeconds,
            [activePhase]: Math.min(SESSION_DURATION_SECONDS[activePhase], elapsed + stepSeconds),
          },
          trackTractionByPhase: {
            ...current.trackTractionByPhase,
            [activePhase]: clamp(
              current.trackTractionByPhase[activePhase] + calculateTractionGain(stepSeconds, 0, activePhase),
              0,
              100
            ),
          },
        };
      });
      if (phaseEnded) return;
      aiWaitAccumulatorByPhaseRef.current[activePhase] += stepSeconds;
      if (aiWaitAccumulatorByPhaseRef.current[activePhase] < AI_WAIT_SIM_SECONDS) return;
      const aiWindow = aiWaitAccumulatorByPhaseRef.current[activePhase];
      aiWaitAccumulatorByPhaseRef.current[activePhase] = 0;
      const currentTraction = tractionByPhaseRef.current[activePhase] ?? 0;
      const aiSlice = simulateAiSessionSlice(activePhase, aiWindow, trackPreparationRef.current, currentTraction, 'wait');
      const aiLaps = aiSlice.runs.reduce((sum, run) => sum + run.completedLaps, 0);
      setAiCompetitors(aiSlice.nextCompetitors);
      if (aiLaps > 0) {
        setPracticeDevelopment((current) => ({
          ...current,
          trackTractionByPhase: {
            ...current.trackTractionByPhase,
            [activePhase]: clamp(current.trackTractionByPhase[activePhase] + calculateTractionGain(0, aiLaps, activePhase), 0, 100),
          },
        }));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [
    weekend.currentPhase,
    sessionPaused,
    sceneSpeed,
    simulateAiSessionSlice,
  ]);

  const commitSessionRun = useCallback((context: PendingRunContext, availableSeconds: number) => {
    if (!selectedDriver) return;
    const activePhase = context.phase;
    const selectedSet = (weekend.tyreAllocations[DRIVER_ID] ?? EMPTY_TYRE_SETS).find((set) => set.id === context.selectedTyreSetId) ?? null;
    if (!selectedSet) return;
    const runWindow = simulateSessionLaps(context.plannedLaps, context.lapTimeSeconds, availableSeconds, context.setupChangeSeconds);

    if (runWindow.completedLaps > 0) {
      const wearGain = runWindow.completedLaps * context.lapTimeSeconds * TYRE_COMPOUNDS[selectedSet.compound].baseWearRate * currentEffects.tyreWearFactor;
      setWeekend((currentWeekend) => {
        const allocation = currentWeekend.tyreAllocations[DRIVER_ID] ?? EMPTY_TYRE_SETS;
        return {
          ...currentWeekend,
          tyreAllocations: {
            ...currentWeekend.tyreAllocations,
            [DRIVER_ID]: allocation.map((set) => (
              set.id === selectedSet.id
                ? { ...set, wear: clamp(set.wear + wearGain, 0, 100) }
                : set
            )),
          },
        };
      });
    }

    const prepDelta = calculateDriverPrepDelta(selectedSet.compound, runWindow.completedLaps, activePhase);

    if (isPracticePhase(activePhase)) {
      const phaseState = practiceDevelopment.phases[activePhase];
      const focusAllocation = getFocusAllocation(phaseState.focusMode);
      const stintResult = SetupFeedbackSystem.runPracticeStint(
        selectedTrack,
        currentSetup,
        practiceDevelopment.biasKnowledge,
        hiddenIdealSetup,
        driverLearning,
        focusAllocation,
        runWindow.completedLaps,
        practiceDevelopment.trackPreparation
      );
      setPracticeDevelopment((current) => {
        const currentPhaseState = current.phases[activePhase];
        const nextFeedback = stintResult.feedback ?? currentPhaseState.lastFeedback;
        const nextKnowledge = stintResult.feedback?.knowledge ?? current.biasKnowledge;
        return {
          ...current,
          feedbackQuality: stintResult.feedbackQuality,
          trackPreparation: stintResult.trackPreparation,
          qualifyingPrep: clamp(current.qualifyingPrep + prepDelta.qualifying, 0, 100),
          raceConservePrep: clamp(current.raceConservePrep + prepDelta.raceConserve, 0, 100),
          biasKnowledge: nextKnowledge,
          totalPracticeLaps: current.totalPracticeLaps + runWindow.completedLaps,
          trackTractionByPhase: {
            ...current.trackTractionByPhase,
            [activePhase]: clamp(current.trackTractionByPhase[activePhase] + runWindow.completedLaps * 0.3, 0, 100),
          },
          lastCommittedSetupByPhase: {
            ...current.lastCommittedSetupByPhase,
            [activePhase]: { ...currentSetup },
          },
          phases: {
            ...current.phases,
            [activePhase]: {
              ...currentPhaseState,
              lapsCompleted: currentPhaseState.lapsCompleted + runWindow.completedLaps,
              lastFeedback: nextFeedback,
              lastRunSummary: {
                plannedLaps: context.plannedLaps,
                laps: runWindow.completedLaps,
                focusMode: currentPhaseState.focusMode,
                feedbackQualityGain: stintResult.feedbackQualityGain,
                trackPreparationGain: stintResult.trackPreparationGain,
                setupChangeSeconds: context.setupChangeSeconds,
                trafficPenaltySeconds: context.trafficPenaltySeconds,
                trafficStatus: context.trafficStatus,
                cutoffByChequered: runWindow.cutoffByChequered,
              },
              needsFreshFeedback: stintResult.feedback ? false : currentPhaseState.needsFreshFeedback,
            },
          },
        };
      });
      return;
    }

    const lapTimes: number[] = [];
    for (let lap = 0; lap < runWindow.completedLaps; lap += 1) {
      const variance = (deterministicNoise(lap + context.releaseElapsedSeconds * 0.1 + driverLearning) - 0.5) * (1.2 - (selectedDriver.skill.consistency / 120));
      lapTimes.push(context.lapTimeSeconds + variance);
    }
    const bestLapFromRun = lapTimes.length ? Math.min(...lapTimes) : null;
    setPracticeDevelopment((current) => {
      const currentPhaseState = current.qualifying[activePhase];
      const bestLapSeconds = bestLapFromRun === null
        ? currentPhaseState.bestLapSeconds
        : currentPhaseState.bestLapSeconds === null
          ? bestLapFromRun
          : Math.min(currentPhaseState.bestLapSeconds, bestLapFromRun);
      return {
        ...current,
        qualifyingPrep: clamp(current.qualifyingPrep + prepDelta.qualifying, 0, 100),
        raceConservePrep: clamp(current.raceConservePrep + prepDelta.raceConserve, 0, 100),
        trackTractionByPhase: {
          ...current.trackTractionByPhase,
          [activePhase]: clamp(current.trackTractionByPhase[activePhase] + runWindow.completedLaps * 0.3, 0, 100),
        },
        qualifying: {
          ...current.qualifying,
          [activePhase]: {
            ...currentPhaseState,
            lapsCompleted: currentPhaseState.lapsCompleted + runWindow.completedLaps,
            bestLapSeconds,
            lastRunSummary: {
              plannedLaps: context.plannedLaps,
              laps: runWindow.completedLaps,
              setupChangeSeconds: 0,
              trafficPenaltySeconds: context.trafficPenaltySeconds,
              trafficStatus: context.trafficStatus,
              cutoffByChequered: runWindow.cutoffByChequered,
              bestLapSeconds: bestLapFromRun,
            },
          },
        },
      };
    });
  }, [
    selectedDriver,
    weekend.tyreAllocations,
    practiceDevelopment.trackPreparation,
    practiceDevelopment.phases,
    practiceDevelopment.biasKnowledge,
    currentEffects.tyreWearFactor,
    currentSetup,
    selectedTrack,
    hiddenIdealSetup,
    driverLearning,
  ]);

  const handleRunSessionStint = () => {
    if (!isTimedSessionPhase(weekend.currentPhase) || !selectedDriver) return;
    const activePhase = weekend.currentPhase;
    const elapsedSeconds = practiceDevelopment.sessionElapsedSeconds[activePhase];
    const remainingSeconds = Math.max(0, SESSION_DURATION_SECONDS[activePhase] - elapsedSeconds);
    if (remainingSeconds <= 0) return;

    const plannedLaps = isPracticePhase(activePhase)
      ? practiceDevelopment.phases[activePhase].plannedLaps
      : practiceDevelopment.qualifying[activePhase].plannedLaps;
    if (!selectedTyreSet) return;
    const committedSetup = practiceDevelopment.lastCommittedSetupByPhase[activePhase] ?? currentSetup;
    const setupChangeSeconds = activePhase.startsWith('q') ? 0 : calculateSetupChangeSeconds(committedSetup, currentSetup);
    const traffic = estimateTrafficImpact(
      activePhase,
      elapsedSeconds + setupChangeSeconds,
      currentEffects,
      selectedTrack,
      aiCompetitors
    );
    const lapTimeWithTyre = estimateLapTimeSeconds(
      selectedTrack,
      currentEffects,
      selectedDriver,
      practiceDevelopment.trackPreparation,
      activePhase,
      practiceDevelopment.trackTractionByPhase[activePhase] ?? 0,
      traffic.trafficPenaltySeconds
    ) + getTyreLapTimeAdjustment(selectedTyreSet.compound, selectedTyreSet.wear);
    const runWindow = simulateSessionLaps(plannedLaps, lapTimeWithTyre, remainingSeconds, setupChangeSeconds);
    const aiSlice = simulateAiSessionSlice(
      activePhase,
      runWindow.timeUsedSeconds,
      practiceDevelopment.trackPreparation,
      practiceDevelopment.trackTractionByPhase[activePhase] ?? 0,
      'run'
    );
    setActivePlayback({
      plan: {
        phase: activePhase,
        player: {
          plannedLaps,
          completedLaps: runWindow.completedLaps,
          setupChangeSeconds,
          lapTimeSeconds: lapTimeWithTyre,
          outLapSeconds: runWindow.outLapSeconds,
          inLapSeconds: runWindow.inLapSeconds,
        },
        aiRuns: aiSlice.runs,
        elapsedSeconds: runWindow.timeUsedSeconds,
      },
      progressRatio: 0,
      durationSeconds: clamp(runWindow.timeUsedSeconds / 20, 6, 22),
    });
    setPendingRunContext({
      phase: activePhase,
      plannedLaps,
      setupChangeSeconds,
      lapTimeSeconds: lapTimeWithTyre,
      selectedTyreSetId: selectedTyreSet.id,
      releaseElapsedSeconds: elapsedSeconds,
      trafficPenaltySeconds: traffic.trafficPenaltySeconds,
      trafficStatus: traffic.trafficStatus,
    });
    setGarageOpen(false);
  };

  const handleCallToGarage = () => {
    if (activePlayback && pendingRunContext) {
      const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[pendingRunContext.phase] ?? pendingRunContext.releaseElapsedSeconds;
      const partialSeconds = Math.max(0, phaseElapsed - pendingRunContext.releaseElapsedSeconds);
      commitSessionRun(pendingRunContext, partialSeconds);
      setPendingRunContext(null);
    }
    setActivePlayback(null);
    setGarageOpen(true);
  };

  useEffect(() => {
    if (!activePlayback || !pendingRunContext) return;
    if (playbackProgressRatio < 1) return;
    const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[pendingRunContext.phase] ?? pendingRunContext.releaseElapsedSeconds;
    commitSessionRun(pendingRunContext, Math.max(0, phaseElapsed - pendingRunContext.releaseElapsedSeconds));
    setPendingRunContext(null);
    setActivePlayback(null);
  }, [activePlayback, pendingRunContext, playbackProgressRatio, commitSessionRun, practiceDevelopment.sessionElapsedSeconds]);

  useEffect(() => {
    if (!activePlayback || !pendingRunContext) return;
    const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[pendingRunContext.phase] ?? 0;
    if (phaseElapsed < SESSION_DURATION_SECONDS[pendingRunContext.phase]) return;
    commitSessionRun(pendingRunContext, Math.max(0, phaseElapsed - pendingRunContext.releaseElapsedSeconds));
    setPendingRunContext(null);
    setActivePlayback(null);
  }, [activePlayback, pendingRunContext, commitSessionRun, practiceDevelopment.sessionElapsedSeconds]);

  const handleRaceAction = () => {
    if (weekend.currentPhase === 'race') {
      navigate(`/race-dev?track=${selectedTrack.id}`);
      return;
    }

    setActivePlayback(null);
    setPendingRunContext(null);
    setGarageOpen(true);
    setWeekend((currentWeekend) => WeekendManager.transitionToNextPhase(carrySetupForward(currentWeekend)));
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col gap-4 md:gap-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-f1-red/30 bg-f1-red/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-f1-red">
              <RadioTower size={12} /> Session Control
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-orbitron font-black italic tracking-tight text-white">
                Practice & Qualifying Control
              </h1>
              <p className="mt-2 max-w-3xl text-sm md:text-base text-gray-300">
                Unified control style with the race sandbox: run plans, live track scene, session board and setup decisions in one flow.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <GlassButton onClick={() => navigate('/race-dev')} className="inline-flex items-center gap-2">
              <Flag size={16} /> Open Race Sandbox
            </GlassButton>
            <GlassButton onClick={() => navigate(-1)} variant="ghost" className="inline-flex items-center gap-2">
              <ChevronLeft size={16} /> Back
            </GlassButton>
          </div>
        </div>

        <GlassCard className="space-y-5 border-white/10">
          <div className="flex items-center gap-3 text-white">
            <Wrench className="text-yellow-400" />
            <div>
              <h2 className="text-xl font-bold">Weekend flow</h2>
              <p className="text-sm text-gray-400">Advance phases from one horizontal timeline, then tune setup and bias side-by-side below.</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="grid grid-cols-3 gap-3 xl:grid-cols-9">
              {PHASE_FLOW.map((phase) => {
                const currentIndex = PHASE_FLOW.indexOf(weekend.currentPhase);
                const phaseIndex = PHASE_FLOW.indexOf(phase);
                const stateTone =
                  phaseIndex < currentIndex
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                    : phaseIndex === currentIndex
                      ? 'border-f1-red/30 bg-f1-red/10 text-white'
                      : 'border-white/10 bg-white/5 text-gray-400';

                return (
                  <div key={phase} className={clsx('rounded-lg border px-3 py-3 text-center text-xs font-medium uppercase tracking-[0.15em]', stateTone)}>
                    {phase.replace('_', ' ')}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3">
              <GlassButton onClick={handleRaceAction}>
                {weekend.currentPhase === 'pre_weekend'
                  ? 'Start Weekend'
                  : weekend.currentPhase === 'race'
                    ? 'Open Live Race Session'
                    : 'Advance Phase'}
              </GlassButton>
              <GlassButton onClick={handleResetWeekend} variant="ghost">Reset to All 50</GlassButton>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Completed sessions</div>
            <div className="mt-2 text-sm text-white">
              {weekend.completedSessions.length ? weekend.completedSessions.join(' → ') : 'None yet'}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-white/10">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-f1-red/20 bg-f1-red/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-f1-red">Feedback Reliability</div>
              <div className="mt-2 text-3xl font-black text-white">{practiceDevelopment.feedbackQuality.toFixed(1)}%</div>
              <div className="mt-1 text-sm text-red-200">{flaggedCount} clear bias flags</div>
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-violet-300">Preparation</div>
              <div className="mt-2 text-3xl font-black text-white">{practiceDevelopment.trackPreparation.toFixed(1)}%</div>
              <div className="mt-1 text-sm text-violet-200">{practiceDevelopment.totalPracticeLaps} practice laps completed</div>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-sky-300">Quali v Long-Run</div>
              <div className="mt-2 text-3xl font-black text-white">{getRunPlanLabel(currentEffects.runPlanBias)}</div>
              <div className="mt-1 text-sm text-sky-200">
                {(currentEffects.runPlanBias * 100).toFixed(0)}% · tyre wear {currentEffects.tyreWearFactor.toFixed(3)}
              </div>
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-12 gap-4 md:gap-6">
          {garageOpen && (
            <GlassCard className="col-span-12 lg:col-span-5 space-y-6 border-white/10">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Weekend track</label>
                <select
                  value={trackId}
                  onChange={(event) => setTrackId(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-f1-red/40"
                >
                  {TRACK_OPTIONS.map((track) => (
                    <option key={track.id} value={track.id} className="bg-[#111]">
                      {track.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Current phase</div>
                <div className="mt-1 text-xl font-black uppercase text-white">{weekend.currentPhase.replace('_', ' ')}</div>
              </div>
            </div>

            <GlassCard className="space-y-5 border-white/10 bg-black/20">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-white">
                  <SlidersHorizontal className="text-cyan-400" />
                  <div>
                    <h2 className="text-xl font-bold">Current garage setup</h2>
                    <p className="text-sm text-gray-400">
                      {canEditSetup ? 'Adjust the current practice session and carry the setup forward as the weekend progresses.' : 'Mechanical setup is locked once qualifying begins.'}
                    </p>
                  </div>
                </div>
                {setupLocked && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
                    <Lock size={12} /> Parc Ferme
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                {TUNING_FIELDS.map(({ key, label }) => {
                  const value = Math.round(currentSetup[key] ?? 50);
                  return (
                    <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white">{label}</div>
                        <div className="text-lg font-black text-white">{value}</div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={value}
                        onChange={(event) => handleSetupChange(key, Number(event.target.value))}
                        disabled={!canEditSetup}
                        className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-f1-red disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <div className="mt-2 flex justify-between text-xs uppercase tracking-[0.15em] text-gray-500">
                        <span>0</span>
                        <span>50</span>
                        <span>100</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isTimedSession && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <div className="grid gap-4">
                    <div className="space-y-4">
                      {isPracticePhase(weekend.currentPhase) && currentPracticePhaseState ? (
                        <>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Track test programme</div>
                            <div className="mt-1 text-sm text-cyan-100">
                              Choose how {selectedDriver?.name ?? 'the driver'} spends the stint. Setup work improves knowledge of the car&apos;s driving bias targets, while preparation accelerates the longer the car stays out.
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            {(['setup_feedback', 'balanced', 'track_preparation'] as PracticeFocusMode[]).map((focusMode) => {
                              const active = currentPracticePhaseState.focusMode === focusMode;
                              return (
                                <button
                                  key={focusMode}
                                  type="button"
                                  onClick={() => handlePracticePhaseUpdate('focusMode', focusMode)}
                                  className={clsx(
                                    'rounded-lg border px-4 py-3 text-left transition',
                                    active
                                      ? 'border-cyan-300/50 bg-cyan-300/15 text-white'
                                      : 'border-white/10 bg-black/20 text-gray-300 hover:border-cyan-300/30 hover:text-white'
                                  )}
                                >
                                  <div className="text-sm font-bold uppercase tracking-[0.15em]">{getFocusLabel(focusMode)}</div>
                                  <div className="mt-1 text-xs text-gray-300">
                                    {focusMode === 'setup_feedback'
                                      ? 'Maximise engineer feedback quality'
                                      : focusMode === 'track_preparation'
                                        ? 'Maximise driver circuit preparation'
                                        : 'Split the stint between both goals'}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Stint length</div>
                              <input
                                type="number"
                                min={MIN_RUN_LAPS}
                                max={MAX_RUN_LAPS}
                                step={1}
                                value={currentPracticePhaseState.plannedLaps}
                                onChange={(event) => handlePracticePhaseUpdate('plannedLaps', normalizePlannedLaps(Number(event.target.value)))}
                                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-cyan-300/40"
                              />
                              <div className="mt-1 text-xs text-cyan-100">Set any run from {MIN_RUN_LAPS} to {MAX_RUN_LAPS} laps</div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Driver learning</div>
                              <div className="mt-2 text-2xl font-black text-white">{driverLearning}</div>
                              <div className="mt-1 text-xs text-cyan-100">Base gain multiplier for feedback and preparation</div>
                            </div>
                          </div>
                        </>
                      ) : isQualifyingSession && currentQualifyingPhaseState ? (
                        <>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Qualifying run plan</div>
                            <div className="mt-1 text-sm text-cyan-100">
                              Parc ferme is active, so setup changes are blocked and no garage time is spent on mechanical changes. Plan push laps before the session clock expires.
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Planned push laps</div>
                              <input
                                type="number"
                                min={MIN_RUN_LAPS}
                                max={MAX_RUN_LAPS}
                                step={1}
                                value={currentQualifyingPhaseState.plannedLaps}
                                onChange={(event) => handleQualifyingPhaseUpdate('plannedLaps', normalizePlannedLaps(Number(event.target.value)))}
                                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-cyan-300/40"
                              />
                              <div className="mt-1 text-xs text-cyan-100">Set any run from {MIN_RUN_LAPS} to {MAX_RUN_LAPS} laps</div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Best lap</div>
                              <div className="mt-2 text-2xl font-black text-white">{formatLapTime(currentQualifyingPhaseState.bestLapSeconds)}</div>
                              <div className="mt-1 text-xs text-cyan-100">{currentQualifyingPhaseState.lapsCompleted} laps completed in session</div>
                            </div>
                          </div>
                        </>
                      ) : null}
                      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Tyre set grid</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {availableTyreSets.map((set) => {
                            const active = selectedTyreSet?.id === set.id;
                            const tyreColor = getTyreColor(set.compound);
                            return (
                              <button
                                key={set.id}
                                type="button"
                                onClick={() => handleTyreSetSelection(set.id)}
                                className={clsx(
                                  'rounded-lg border px-3 py-2 text-left text-xs transition',
                                  active ? 'text-white' : 'text-gray-100'
                                )}
                                style={{
                                  borderColor: `${tyreColor}cc`,
                                  backgroundColor: active ? `${tyreColor}66` : `${tyreColor}3d`,
                                  boxShadow: active ? `0 0 0 1px ${tyreColor}` : undefined,
                                }}
                              >
                                <div className="flex items-center gap-2 font-bold uppercase tracking-[0.14em]">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tyreColor }} />
                                  {set.compound}
                                </div>
                                <div className="mt-1 text-[11px] text-gray-300">{set.id.split('-').slice(-2).join('-')}</div>
                                <div className="mt-1 text-[11px] text-gray-400">Wear {set.wear.toFixed(1)}%</div>
                              </button>
                            );
                          })}
                        </div>
                        {!availableTyreSets.length && <div className="mt-2 text-xs text-amber-300">No sets available</div>}
                        <div className="mt-2 text-xs text-cyan-100">
                          Active compound {selectedTyreSet ? selectedTyreSet.compound.toUpperCase() : '—'} · wear {selectedTyreSet ? `${selectedTyreSet.wear.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-xs uppercase tracking-[0.15em] text-gray-400">Session clock</div>
                        <div className="mt-2 flex items-center gap-2 text-lg font-black text-white">
                          <Clock3 size={16} className="text-cyan-300" />
                          {formatSessionClock(currentPhaseRemainingSeconds)}
                        </div>
                        <div className="mt-1 text-sm text-gray-300">
                          {formatSessionClock(currentPhaseElapsedSeconds)} elapsed · est. {estimatedLapTime.toFixed(2)}s/lap · traction {currentTrackTraction.toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-xs uppercase tracking-[0.15em] text-gray-400">Current practice phase</div>
                        <div className="mt-2 text-lg font-black text-white">{weekend.currentPhase.toUpperCase()}</div>
                        <div className="mt-1 text-sm text-gray-300">
                          {isPracticePhase(weekend.currentPhase)
                            ? `${currentPracticePhaseState?.lapsCompleted ?? 0} laps completed in this session`
                            : `${currentQualifyingPhaseState?.lapsCompleted ?? 0} laps completed in this session`}
                        </div>
                      </div>
                    </div>
                    <GlassButton onClick={handleRunSessionStint} className="w-full" disabled={currentPhaseRemainingSeconds <= 0 || !selectedTyreSet}>
                      {isPracticePhase(weekend.currentPhase) && currentPracticePhaseState
                        ? `Run ${currentPracticePhaseState.plannedLaps} Laps on ${getFocusLabel(currentPracticePhaseState.focusMode)}`
                        : `Run ${currentQualifyingPhaseState?.plannedLaps ?? 0} Push Laps`}
                    </GlassButton>
                    {!selectedTyreSet && (
                      <div className="mt-2 text-xs text-amber-300">Select an available tyre set to run the next stint.</div>
                    )}
                    {isPracticePhase(weekend.currentPhase) && currentPracticePhaseState?.lastRunSummary && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                        <div className="font-bold uppercase tracking-[0.15em] text-white">Last Stint</div>
                        <div className="mt-2">
                          {currentPracticePhaseState.lastRunSummary.laps}/{currentPracticePhaseState.lastRunSummary.plannedLaps} laps · {getFocusLabel(currentPracticePhaseState.lastRunSummary.focusMode)}
                        </div>
                        <div className="mt-1">Setup change time {currentPracticePhaseState.lastRunSummary.setupChangeSeconds.toFixed(1)}s</div>
                        <div className="mt-1">Traffic {currentPracticePhaseState.lastRunSummary.trafficStatus} (+{currentPracticePhaseState.lastRunSummary.trafficPenaltySeconds.toFixed(2)}s/lap)</div>
                        <div className="mt-1">Feedback quality +{currentPracticePhaseState.lastRunSummary.feedbackQualityGain.toFixed(1)}%</div>
                        <div className="mt-1">Track preparation +{currentPracticePhaseState.lastRunSummary.trackPreparationGain.toFixed(1)}%</div>
                        {currentPracticePhaseState.lastRunSummary.cutoffByChequered && <div className="mt-1 text-amber-300">Chequered flag ended this run early</div>}
                      </div>
                    )}
                    {isQualifyingSession && currentQualifyingPhaseState?.lastRunSummary && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                        <div className="font-bold uppercase tracking-[0.15em] text-white">Last Run</div>
                        <div className="mt-2">
                          {currentQualifyingPhaseState.lastRunSummary.laps}/{currentQualifyingPhaseState.lastRunSummary.plannedLaps} laps completed
                        </div>
                        <div className="mt-1">Traffic {currentQualifyingPhaseState.lastRunSummary.trafficStatus} (+{currentQualifyingPhaseState.lastRunSummary.trafficPenaltySeconds.toFixed(2)}s/lap)</div>
                        <div className="mt-1">Best lap from run {formatLapTime(currentQualifyingPhaseState.lastRunSummary.bestLapSeconds)}</div>
                        {currentQualifyingPhaseState.lastRunSummary.cutoffByChequered && <div className="mt-1 text-amber-300">Chequered flag ended this run early</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </GlassCard>
            </GlassCard>
          )}

          <div className={clsx('col-span-12 space-y-6', garageOpen ? 'lg:col-span-7' : 'lg:col-span-12')}>
            {isTimedSession && (
              <GlassCard className="space-y-4 border-white/10">
                <div className="flex items-center justify-between gap-3 text-white">
                  <div className="flex items-center gap-3">
                    <RadioTower className="text-cyan-300" />
                    <div>
                      <h2 className="text-xl font-bold">Session control</h2>
                      <p className="text-sm text-gray-400">
                        {isQualifyingSession
                          ? 'Progressive qualifying control with circulating cars and live benchmark board.'
                          : 'Progressive practice scene with circulating cars, setup cycles and AI tuning.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-100">
                      Our confidence {practiceDevelopment.feedbackQuality.toFixed(1)}%
                    </div>
                    {isTimedSession && (
                      <button
                        type="button"
                        onClick={handleCallToGarage}
                        className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-white"
                      >
                        {garageOpen ? 'Garage Open' : 'Call to Pit'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSessionPaused((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.15em] text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sessionPaused ? <Play size={12} /> : <Pause size={12} />}
                      {sessionPaused ? 'Resume Session' : 'Pause Session'}
                    </button>
                    {[1, 5, 20].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setSceneSpeed(speed)}
                        className={clsx(
                          'rounded-lg border px-2 py-2 text-[11px] font-bold uppercase tracking-[0.15em]',
                          sceneSpeed === speed ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100' : 'border-white/20 bg-white/5 text-gray-300'
                        )}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Tyre Wear</div>
                    <div className="mt-1 font-bold" style={{ color: getTyreColor(selectedTyreCompound) }}>
                      {selectedTyreSet ? `${selectedTyreSet.wear.toFixed(1)}% ${selectedTyreSet.compound.toUpperCase()}` : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Feedback</div>
                    <div className="mt-1 font-bold text-cyan-100">{practiceDevelopment.feedbackQuality.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Track Prep</div>
                    <div className="mt-1 font-bold text-cyan-100">{practiceDevelopment.trackPreparation.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Traction</div>
                    <div className="mt-1 font-bold text-cyan-100">{currentTrackTraction.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Prep Split</div>
                    <div className="mt-1 font-bold text-cyan-100">Q {practiceDevelopment.qualifyingPrep.toFixed(1)} · R {practiceDevelopment.raceConservePrep.toFixed(1)}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Weather</div>
                    <div className="mt-1 font-bold text-cyan-100">{weatherLabel}</div>
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-gray-300">
                        <MapPin size={12} className="text-cyan-300" /> Live track scene
                      </div>
                      <div className="text-xs text-gray-400">
                        {activePlayback ? `${(playbackProgressRatio * 100).toFixed(0)}%` : 'Idle'}
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <CircularTrackMap
                        vehicles={sceneTrackVehicles}
                        trackId={selectedTrack.id}
                        timeScale={sceneSpeed}
                        title={activePlayback ? `Run replay ${formatSessionClock(playbackSimSeconds)}` : 'Awaiting next run'}
                      />
                    </div>
                    {activePlayback && (
                      <div className="text-xs text-gray-300">
                        Run time simulated {formatSessionClock(playbackSimSeconds)} / {formatSessionClock(activePlayback.plan.elapsedSeconds)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {isQualifyingSession ? (
                      qualifyingLeaderboard.map((entry) => (
                        <div
                          key={entry.driverId}
                          className={clsx(
                            'grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-2 rounded-lg border px-2 py-2 text-xs',
                            entry.isPlayer ? 'border-f1-red/40 bg-f1-red/10 text-white' : 'border-white/10 bg-white/5 text-gray-200'
                          )}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: DRIVERS.find((driver) => driver.id === entry.driverId)?.color ?? '#fff' }}
                          />
                          <div className="font-black uppercase tracking-[0.14em]">{entry.driverId.toUpperCase()}</div>
                          <div className="font-bold tabular-nums">{formatLapTime(entry.bestLapSeconds)}</div>
                          <div className="text-[11px] uppercase" style={{ color: entry.tyreCompound ? getTyreColor(entry.tyreCompound) : '#cbd5e1' }}>
                            {entry.tyreCompound ? getTyreShortLabel(entry.tyreCompound) : '—'}
                          </div>
                          <div className="text-[11px] text-gray-400">{entry.laps}</div>
                        </div>
                      ))
                    ) : (
                      aiCompetitors.slice(0, 8).map((entry) => (
                        <div key={entry.driverId} className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-gray-200">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DRIVERS.find((driver) => driver.id === entry.driverId)?.color ?? '#fff' }} />
                          <div className="font-black uppercase tracking-[0.14em]">{entry.driverId.toUpperCase()}</div>
                          <div className="font-bold tabular-nums">—</div>
                          <div
                            className="text-[11px] uppercase"
                            style={{ color: getTyreColor(entry.tyreByPhase[weekend.currentPhase] ?? 'medium') }}
                          >
                            {getTyreShortLabel(entry.tyreByPhase[weekend.currentPhase] ?? 'medium')}
                          </div>
                          <div className="text-[11px] text-gray-400">{entry.lapsByPhase[weekend.currentPhase] ?? 0}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </GlassCard>
            )}

            {garageOpen && (
              <>
                <GlassCard className="space-y-4 border-white/10">
              <div className="flex items-center justify-between gap-3 text-white">
                <div className="flex items-center gap-3">
                  <RadioTower className="text-f1-red" />
                  <div>
                    <h2 className="text-xl font-bold">Engineer feedback</h2>
                    <p className="text-sm text-gray-400">The garage sees driving-bias changes instantly, including the quali-versus-long-run compromise, but the driver only assesses whether those balance traits sit too low or too high after practice running.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 text-sm leading-relaxed text-gray-300">
                {!feedbackVisible
                  ? `Practice is complete. Final understanding sits at ${practiceDevelopment.feedbackQuality.toFixed(1)}% feedback quality with ${practiceDevelopment.trackPreparation.toFixed(1)}% track preparation.`
                  : !currentPracticePhaseState?.lastFeedback
                    ? hasPreservedKnowledge
                      ? currentPracticePhaseState?.needsFreshFeedback
                        ? 'Using preserved setup knowledge from earlier sessions. Run this phase to refresh the ranges for the current setup.'
                        : 'Using preserved setup knowledge from earlier sessions. Run this phase to keep refining the ranges.'
                      : currentPracticePhaseState?.needsFreshFeedback
                        ? 'The current setup has no fresh engineer read yet. Each bias bar starts with the full domain highlighted, then narrows once the driver reports back from practice.'
                        : 'No setup-focused running has been completed in this phase yet. The bars still show the full possible domain until a feedback run narrows them.'
                    : currentPracticePhaseState.needsFreshFeedback
                      ? 'You have changed the setup since the last run. Previous feedback is still shown as reference, but another stint is needed for a fresh read.'
                    : 'The highlighted section is the learned acceptable window. The white marker shows where the current setup sits inside that bias domain.'}
              </div>
              <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.15em] text-gray-400">Feedback quality</div>
                      <div className="mt-2 text-2xl font-black text-white">{practiceDevelopment.feedbackQuality.toFixed(1)}%</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.15em] text-gray-400">Knowledge skill</div>
                      <div className="mt-2 text-2xl font-black text-white">{currentKnowledgeSkill}/20</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.15em] text-gray-400">Track preparation</div>
                      <div className="mt-2 text-2xl font-black text-white">{practiceDevelopment.trackPreparation.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {DRIVING_BIAS_FIELDS.map(({ key, label, format, domain, leftLabel, rightLabel }) => {
                      const feedback = displayKnowledge[key];
                      const currentValue = getDrivingBiasValue(currentEffects, key);
                      const visibleRange = feedback?.optimalRange ?? domain;
                      const direction = getDirection(currentValue, feedback?.optimalRange);
                      const currentPosition = getBiasPositionPercent(currentValue, domain);
                      const leftRangePosition = getBiasPositionPercent(visibleRange[0], domain);
                      const rightRangePosition = getBiasPositionPercent(visibleRange[1], domain);
                      return (
                        <div key={key} className="rounded-lg border border-white/10 bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm text-gray-300">{label}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                Left range {format(visibleRange[0])} · right range {format(visibleRange[1])}
                              </div>
                            </div>
                            <div className={clsx('rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-[0.15em]', getDirectionTone(direction))}>
                              {getDirectionLabel(direction)}
                            </div>
                          </div>
                          <div className="mt-4">
                            <div className="relative h-3 rounded-full bg-white/10">
                              <div
                                className="absolute top-0 h-3 rounded-full bg-cyan-400/35"
                                style={{
                                  left: `${leftRangePosition}%`,
                                  width: `${Math.max(rightRangePosition - leftRangePosition, 1)}%`,
                                }}
                              />
                              <div
                                className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]"
                                style={{ left: `${currentPosition}%` }}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.15em] text-gray-500">
                              <span>{leftLabel}</span>
                              <span>{rightLabel}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                              <span>Current {format(currentValue)}</span>
                              <span>{feedback ? 'Learned window' : 'Full domain'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!!currentFeedback?.comments.length && (
                    <div className="space-y-3">
                      {currentFeedback.comments.map((comment) => (
                        <div key={comment} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-gray-200">
                          {comment}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            </GlassCard>

            <GlassCard className="space-y-4 border-white/10">
              <div className="text-white">
                <h2 className="text-xl font-bold">Locked snapshots</h2>
                <p className="text-sm text-gray-400">Parc ferme checkpoints stay visible while you compare the setup against the learned bias bars.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Q1 locked snapshot</div>
                  <div className="mt-3 space-y-2 text-sm text-gray-200">
                    <div>Front wing: {weekend.q1Setup[DRIVER_ID]?.frontWingAngle ?? '—'}</div>
                    <div>Rear wing: {weekend.q1Setup[DRIVER_ID]?.rearWingAngle ?? '—'}</div>
                    <div>Ride height: {weekend.q1Setup[DRIVER_ID]?.rideHeight ?? '—'}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Race locked snapshot</div>
                  <div className="mt-3 space-y-2 text-sm text-gray-200">
                    <div>Front wing: {weekend.raceSetup[DRIVER_ID]?.frontWingAngle ?? '—'}</div>
                    <div>Rear wing: {weekend.raceSetup[DRIVER_ID]?.rearWingAngle ?? '—'}</div>
                    <div>Ride height: {weekend.raceSetup[DRIVER_ID]?.rideHeight ?? '—'}</div>
                  </div>
                </div>
              </div>
            </GlassCard>
              </>
            )}

            {weekend.currentPhase === 'race' && (
              <GlassCard className="space-y-4 border-white/10">
                <div className="flex items-center gap-3 text-white">
                  <Flag className="text-f1-red" />
                  <div>
                    <h2 className="text-xl font-bold">Race session</h2>
                    <p className="text-sm text-gray-400">Launch the actual on-track simulation for this same circuit in the live race environment.</p>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 text-sm leading-relaxed text-gray-300">
                  The weekend sandbox now hands off to the same live race experience used by dev race, instead of ending with a static race snapshot.
                </div>
                <GlassButton onClick={handleRaceAction} className="w-full">
                  Open {selectedTrack.name} Live Race
                </GlassButton>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
