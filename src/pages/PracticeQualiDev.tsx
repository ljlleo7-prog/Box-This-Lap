import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock3, Flag, Lock, MapPin, Pause, Play, RadioTower, SlidersHorizontal, Wrench } from 'lucide-react';
import { clsx } from 'clsx';
import { DRIVERS } from '../data/initialData';
import { TRACKS } from '../data/tracks';
import { TEAM_TEMPLATES } from '../data/teams';
import { SetupFeedbackSystem } from '../engine/systems/SetupFeedbackSystem';
import { buildSetupPhysicsEffects } from '../engine/systems/SetupModel';
import { TyreManager } from '../engine/systems/TyreManager';
import { TYRE_COMPOUNDS } from '../engine/systems/TyreModel';
import { WeekendManager } from '../engine/systems/WeekendManager';
import { GlassButton } from '../components/ui/GlassButton';
import { GlassCard } from '../components/ui/GlassCard';
import { CircularTrackMap, type TrackMapVehicle } from '../components/CircularTrackMap';
import { loadTeamSpecs } from '../lib/localSaves';
import { useI18n } from '../i18n/I18nProvider';
import { TCC_API } from '../lib/tcc-api';
import { resolveStaticDriversForTeam } from '../lib/onlineTrainingEffects';
import { useChampionshipStore } from '../store/championshipStore';
import {
  carrySetupForward,
  chooseDefaultTyreSetId,
  getPhaseDriverKey,
  getSetupForPhase,
  isPracticePhase,
  isQualifyingPhase,
  isTimedSessionPhase,
  NEUTRAL_SESSION_SETUP,
  updateSetupForPhase,
} from '../lib/weekend/setupState';
import type { OfflineWeekend, OnlineWeekendGaragePlan, SessionSetupState, SessionSummary, SetupTuningParameter, TeamSpecs, Track, TyreCompound, TyreSet, WeekendPhase } from '../types';
import type { DrivingBiasFeedback, DrivingBiasFeedbackResult, DrivingBiasMetricKey, PracticeFocusAllocation } from '../engine/systems/SetupFeedbackSystem';

const TRACK_OPTIONS: Track[] = TRACKS;
const DEFAULT_TRACK = TRACK_OPTIONS[0]!;
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
  bestLapSeconds: number | null;
}

interface PracticePhaseState {
  focusMode: PracticeFocusMode;
  plannedLaps: number;
  lapsCompleted: number;
  bestLapSeconds: number | null;
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
    lapTimes: number[];
  };
  aiRuns: Array<{
    driverId: string;
    completedLaps: number;
    setupChangeSeconds: number;
    lapTimeSeconds: number;
    outLapSeconds: number;
    inLapSeconds: number;
    isReleased: boolean;
    lapTimes: number[];
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
  lapTimes: number[];
  selectedTyreSetId: string;
  releaseElapsedSeconds: number;
  trafficPenaltySeconds: number;
  trafficStatus: 'clear' | 'moderate' | 'traffic';
}

interface PlaybackTrackState {
  distanceOnLap: number;
  isInPit: boolean;
  completedLaps: number;
  bestLapSeconds: number | null;
}

function createPracticePhaseState(): PracticePhaseState {
  return {
    focusMode: 'balanced',
    plannedLaps: DEFAULT_STINT_LAPS,
    lapsCompleted: 0,
    bestLapSeconds: null,
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

function createWeekend(track: Track, driverIds: string[], selectedTeamId: string): OfflineWeekend {
  const initialSetups = driverIds.reduce<Record<string, SessionSetupState>>((acc, driverId) => {
    acc[driverId] = { ...NEUTRAL_SESSION_SETUP };
    return acc;
  }, {});
  const initialTyres = driverIds.reduce<Record<string, TyreSet[]>>((acc, driverId) => {
    acc[driverId] = TyreManager.initializeAllocation(driverId);
    return acc;
  }, {});
  return {
    id: `practice-quali-${track.id}`,
    round: 1,
    trackId: track.id,
    currentPhase: 'pre_weekend',
    completedSessions: [],
    selectedTeamId,
    fp1Setup: initialSetups,
    fp2Setup: initialSetups,
    fp3Setup: initialSetups,
    q1Setup: {},
    q2Setup: {},
    q3Setup: {},
    raceSetup: {},
    tyreAllocations: initialTyres,
    setupKnowledge: {},
    sessionSummaries: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
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
  equivalentLaps: number;
  timeUsedSeconds: number;
  cutoffByChequered: boolean;
  outLapSeconds: number;
  inLapSeconds: number;
} {
  if (remainingSeconds <= 0) {
    return {
      completedLaps: 0,
      equivalentLaps: 0,
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
      equivalentLaps: 0,
      timeUsedSeconds: remainingSeconds,
      cutoffByChequered: true,
      outLapSeconds: 0,
      inLapSeconds: 0,
    };
  }
  const trackWindow = Math.max(0, remainingSeconds - fixedRunSeconds);
  const possibleLaps = Math.floor(trackWindow / lapTimeSeconds);
  const completedLaps = Math.max(0, Math.min(plannedLaps, possibleLaps));
  const trackWorkSeconds = Math.max(0, remainingSeconds - setupChangeSeconds);
  const equivalentLaps = trackWorkSeconds / Math.max(lapTimeSeconds, 1);
  const fullPlanTime = fixedRunSeconds + plannedLaps * lapTimeSeconds;
  if (fullPlanTime > remainingSeconds) {
    return {
      completedLaps,
      equivalentLaps,
      timeUsedSeconds: remainingSeconds,
      cutoffByChequered: true,
      outLapSeconds,
      inLapSeconds,
    };
  }
  return {
    completedLaps,
    equivalentLaps,
    timeUsedSeconds: fixedRunSeconds + completedLaps * lapTimeSeconds,
    cutoffByChequered: false,
    outLapSeconds,
    inLapSeconds,
  };
}

function getPlaybackTrackState(
  track: Track,
  lapTimeSeconds: number,
  setupChangeSeconds: number,
  outLapSeconds: number,
  completedLaps: number,
  inLapSeconds: number,
  progressSeconds: number,
  lapTimes: number[] = []
): PlaybackTrackState {
  const { entryDistance, exitDistance } = track.pitLane;
  const totalDistance = track.totalDistance;
  const pitDistance = getPitLaneSpawnDistance(track, 0, 1);
  if (progressSeconds <= setupChangeSeconds) {
    return { distanceOnLap: pitDistance, isInPit: true, completedLaps: 0, bestLapSeconds: null };
  }
  let remaining = progressSeconds - setupChangeSeconds;
  if (remaining <= outLapSeconds) {
    const outProgress = remaining / Math.max(outLapSeconds, 0.1);
    return {
      distanceOnLap: (entryDistance + outProgress * ((exitDistance - entryDistance + totalDistance) % totalDistance)) % totalDistance,
      isInPit: outProgress < 1,
      completedLaps: 0,
      bestLapSeconds: null,
    };
  }
  remaining -= outLapSeconds;
  const hotLapTotal = completedLaps * lapTimeSeconds;
  if (remaining <= hotLapTotal) {
    const lapsDone = Math.min(completedLaps, Math.floor(remaining / Math.max(lapTimeSeconds, 0.1)));
    const lapProgress = remaining / Math.max(lapTimeSeconds, 0.1);
    const completedLapTimes = lapTimes.slice(0, lapsDone);
    return {
      distanceOnLap: ((lapProgress % 1) * totalDistance + totalDistance) % totalDistance,
      isInPit: false,
      completedLaps: lapsDone,
      bestLapSeconds: completedLapTimes.length ? Math.min(...completedLapTimes) : null,
    };
  }
  remaining -= hotLapTotal;
  if (remaining <= inLapSeconds) {
    const inProgress = remaining / Math.max(inLapSeconds, 0.1);
    return {
      distanceOnLap: (exitDistance + inProgress * ((entryDistance - exitDistance + totalDistance) % totalDistance)) % totalDistance,
      isInPit: false,
      completedLaps,
      bestLapSeconds: lapTimes.length ? Math.min(...lapTimes.slice(0, completedLaps)) : null,
    };
  }
  return {
    distanceOnLap: pitDistance,
    isInPit: true,
    completedLaps,
    bestLapSeconds: lapTimes.length ? Math.min(...lapTimes.slice(0, completedLaps)) : null,
  };
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

function createAICompetitors(controlledDriverIds: string[], phaseSetup: SessionSetupState): AICompetitorState[] {
  const controlledDriverIdSet = new Set(controlledDriverIds);
  return DRIVERS
    .filter((driver) => !controlledDriverIdSet.has(driver.id))
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

function advanceWeekendToPhase(baseWeekend: OfflineWeekend, targetPhase: WeekendPhase, driverIds: string[]): OfflineWeekend {
  let currentWeekend = baseWeekend;
  while (currentWeekend.currentPhase !== targetPhase) {
    const nextWeekend = WeekendManager.transitionToNextPhase(carrySetupForward(currentWeekend, driverIds));
    if (nextWeekend.currentPhase === currentWeekend.currentPhase) break;
    currentWeekend = nextWeekend;
  }
  return currentWeekend;
}

function buildTimedSessionSummary(
  phase: TimedSessionPhase,
  controlledDrivers: Array<{ id: string; name: string; team: string; skill: { consistency?: number } ; learning: number }>,
  aiCompetitors: AICompetitorState[],
  practiceDevelopment: PracticeDevelopmentState,
): SessionSummary {
  if (isPracticePhase(phase)) {
    const playerRows = controlledDrivers.map((driver) => ({
      driverId: driver.id,
      position: 0,
      bestLapTime: practiceDevelopment.phases[phase].bestLapSeconds,
      lapsCompleted: practiceDevelopment.phases[phase].lapsCompleted,
    }));
    const aiRows = aiCompetitors.map((entry) => ({
      driverId: entry.driverId,
      position: 0,
      bestLapTime: null,
      lapsCompleted: entry.lapsByPhase[phase] ?? 0,
    }));
    const classification = [...aiRows, ...playerRows]
      .sort((a, b) => {
        if (a.bestLapTime == null && b.bestLapTime == null) return 0;
        if (a.bestLapTime == null) return 1;
        if (b.bestLapTime == null) return -1;
        return a.bestLapTime - b.bestLapTime;
      })
      .map((entry, index) => ({
        driverId: entry.driverId,
        position: index + 1,
        bestLapTime: entry.bestLapTime,
        lapsCompleted: entry.lapsCompleted,
      }));

    return {
      sessionType: phase,
      completed: true,
      classification,
      notes: [],
      weather: 'dry',
    };
  }

  const classification = [...aiCompetitors.map((entry) => ({
    driverId: entry.driverId,
    driverName: entry.driverName,
    team: entry.team,
    bestLapSeconds: entry.bestLapByPhase[phase] ?? null,
    laps: entry.lapsByPhase[phase] ?? 0,
  })), ...controlledDrivers.map((driver) => ({
    driverId: driver.id,
    driverName: driver.name,
    team: driver.team,
    bestLapSeconds: practiceDevelopment.qualifying[phase].bestLapSeconds,
    laps: practiceDevelopment.qualifying[phase].lapsCompleted,
  }))]
    .sort((a, b) => {
      if (a.bestLapSeconds == null && b.bestLapSeconds == null) return 0;
      if (a.bestLapSeconds == null) return 1;
      if (b.bestLapSeconds == null) return -1;
      return a.bestLapSeconds - b.bestLapSeconds;
    })
    .map((entry, index) => ({
      driverId: entry.driverId,
      position: index + 1,
      bestLapTime: entry.bestLapSeconds,
      lapsCompleted: entry.laps,
    }));

  return {
    sessionType: phase,
    completed: true,
    classification,
    notes: [],
    weather: 'dry',
  };
}

interface WeekendTimedSessionControlProps {
  initialTrackId?: string;
  initialPhase?: WeekendPhase;
  weekendId?: string;
  onBack?: () => void;
  onOpenRaceSession?: (trackId: string) => void;
}

const buildInteractiveSessionPreset = (params: {
  weekend: OfflineWeekend;
  activeDriverId: string;
  practiceDevelopment: PracticeDevelopmentState;
  aiCompetitors: AICompetitorState[];
  activePlaybackByDriver: Record<string, ActivePlaybackState | null>;
  pendingRunContextByDriver: Record<string, PendingRunContext | null>;
  garageOpenByDriver: Record<string, boolean>;
  sessionPaused: boolean;
  sceneSpeed: number;
}): OnlineWeekendGaragePlan['interactiveSessionStateByPhase'] => {
  const activePhase = params.weekend.currentPhase;
  if (!isTimedSessionPhase(activePhase)) return undefined;

  return {
    [activePhase]: {
      weekend: params.weekend,
      activeDriverId: params.activeDriverId,
      practiceDevelopment: params.practiceDevelopment as unknown as Record<string, unknown>,
      aiCompetitors: params.aiCompetitors as unknown as Array<Record<string, unknown>>,
      activePlaybackByDriver: params.activePlaybackByDriver as unknown as Record<string, Record<string, unknown> | null>,
      pendingRunContextByDriver: params.pendingRunContextByDriver as unknown as Record<string, Record<string, unknown> | null>,
      garageOpenByDriver: params.garageOpenByDriver,
      sessionPaused: params.sessionPaused,
      sceneSpeed: params.sceneSpeed,
    },
  };
};

export const WeekendTimedSessionControl: React.FC<WeekendTimedSessionControlProps> = ({
  initialTrackId = DEFAULT_TRACK.id,
  initialPhase = 'pre_weekend',
  weekendId,
  onBack,
  onOpenRaceSession,
}) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const championshipMode = useChampionshipStore((state) => state.mode);
  const championshipId = useChampionshipStore((state) => state.championshipId);
  const teamId = useChampionshipStore((state) => state.teamId);
  const teamName = useChampionshipStore((state) => state.teamName);
  const activeChampionship = useChampionshipStore((state) => state.activeChampionship);
  const [onlineTeamDrivers, setOnlineTeamDrivers] = useState<Array<{ name?: string | null }>>([]);
  const [trackId, setTrackId] = useState<string>(initialTrackId);
  const resolvedPlayerTeam = useMemo(() => {
    if (championshipMode === 'local') {
      return activeChampionship?.teams.find((team) => team.teamId === activeChampionship.selectedTeamId)?.teamName ?? teamName ?? null;
    }
    return teamName ?? null;
  }, [activeChampionship, championshipMode, teamName]);
  const controlledDrivers = useMemo(
    () => resolveStaticDriversForTeam(resolvedPlayerTeam, onlineTeamDrivers),
    [resolvedPlayerTeam, onlineTeamDrivers]
  );
  const controlledDriverIds = useMemo(
    () => controlledDrivers.map((driver) => driver.id),
    [controlledDrivers]
  );
  const fallbackDriver = controlledDrivers[0] ?? DRIVERS[0];
  const [activeDriverId, setActiveDriverId] = useState<string>(() => fallbackDriver?.id ?? DRIVERS[0]?.id ?? '');
  const selectedDriver = useMemo(
    () => controlledDrivers.find((driver) => driver.id === activeDriverId) ?? controlledDrivers[0] ?? fallbackDriver,
    [activeDriverId, controlledDrivers, fallbackDriver]
  );
  const playerTeam = resolvedPlayerTeam ?? fallbackDriver?.team ?? t('practiceDev.defaultTeam');
  useEffect(() => {
    let isActive = true;

    if (championshipMode !== 'online' || !championshipId) {
      setOnlineTeamDrivers([]);
      return () => {
        isActive = false;
      };
    }

    const loadOnlineTeamDrivers = async () => {
      try {
        const { data } = await TCC_API.getMyTeam(championshipId);
        if (!isActive) return;
        setOnlineTeamDrivers((data?.tcc_drivers ?? []).slice(0, 2));
      } catch (error) {
        console.error('Failed to load online team drivers', error);
        if (isActive) setOnlineTeamDrivers([]);
      }
    };

    void loadOnlineTeamDrivers();
    return () => {
      isActive = false;
    };
  }, [championshipId, championshipMode]);

  useEffect(() => {
    if (!controlledDriverIds.length) return;
    if (controlledDriverIds.includes(activeDriverId)) return;
    setActiveDriverId(controlledDriverIds[0]);
  }, [activeDriverId, controlledDriverIds]);

  const playerTeamSpecs = useMemo<TeamSpecs | undefined>(() => {
    const baseSpecs = TEAM_TEMPLATES.find((team) => team.name === playerTeam)?.specs;
    const storedSpecs = loadTeamSpecs()[playerTeam];
    return storedSpecs ?? baseSpecs;
  }, [playerTeam]);

  const selectedTrack = useMemo(
    () => TRACK_OPTIONS.find((track) => track.id === trackId) ?? DEFAULT_TRACK,
    [trackId]
  );
  const hiddenIdealSetup = useMemo(
    () => SetupFeedbackSystem.generateIdealSetup(selectedTrack),
    [selectedTrack]
  );

  const [weekend, setWeekend] = useState<OfflineWeekend>(() => advanceWeekendToPhase(createWeekend(selectedTrack, controlledDriverIds, teamId ?? 'player-team'), initialPhase, controlledDriverIds));
  const [practiceDevelopment, setPracticeDevelopment] = useState<PracticeDevelopmentState>(createPracticeDevelopmentState);
  const [aiCompetitors, setAiCompetitors] = useState<AICompetitorState[]>(() => createAICompetitors(controlledDriverIds, { ...NEUTRAL_SESSION_SETUP }));
  const [activePlaybackByDriver, setActivePlaybackByDriver] = useState<Record<string, ActivePlaybackState | null>>({});
  const [pendingRunContextByDriver, setPendingRunContextByDriver] = useState<Record<string, PendingRunContext | null>>({});
  const [sceneSpeed, setSceneSpeed] = useState(1);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [garageOpenByDriver, setGarageOpenByDriver] = useState<Record<string, boolean>>({});
  const [isHydratingWeekendState, setIsHydratingWeekendState] = useState(false);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
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
    setWeekend(advanceWeekendToPhase(createWeekend(selectedTrack, controlledDriverIds, teamId ?? 'player-team'), initialPhase, controlledDriverIds));
    const nextDevelopment = createPracticeDevelopmentState();
    controlledDriverIds.forEach((driverId) => {
      nextDevelopment.lastCommittedSetupByPhase[getPhaseDriverKey(driverId, 'fp1')] = { ...NEUTRAL_SESSION_SETUP };
    });
    setPracticeDevelopment(nextDevelopment);
    setAiCompetitors(createAICompetitors(controlledDriverIds, { ...NEUTRAL_SESSION_SETUP }));
    aiWaitAccumulatorByPhaseRef.current = { fp1: 0, fp2: 0, fp3: 0, q1: 0, q2: 0, q3: 0 };
    setActivePlaybackByDriver(controlledDriverIds.reduce<Record<string, ActivePlaybackState | null>>((acc, driverId) => {
      acc[driverId] = null;
      return acc;
    }, {}));
    setPendingRunContextByDriver(controlledDriverIds.reduce<Record<string, PendingRunContext | null>>((acc, driverId) => {
      acc[driverId] = null;
      return acc;
    }, {}));
    setGarageOpenByDriver(controlledDriverIds.reduce<Record<string, boolean>>((acc, driverId) => {
      acc[driverId] = true;
      return acc;
    }, {}));
    setSessionPaused(false);
  }, [selectedTrack, controlledDriverIds, initialPhase]);

  useEffect(() => {
    if (!weekendId || !teamId || !isTimedSessionPhase(initialPhase)) return;

    let isActive = true;
    const hydrate = async () => {
      setIsHydratingWeekendState(true);
      try {
        const plan = await TCC_API.getWeekendPlanForSession(weekendId, teamId, initialPhase);
        if (!isActive) return;
        const interactiveState = plan?.interactiveSessionStateByPhase?.[initialPhase];
        if (!interactiveState) return;

        setWeekend(interactiveState.weekend as OfflineWeekend);
        setActiveDriverId(interactiveState.activeDriverId ?? controlledDriverIds[0] ?? DRIVERS[0]?.id ?? '');
        setPracticeDevelopment(interactiveState.practiceDevelopment as unknown as PracticeDevelopmentState);
        setAiCompetitors((interactiveState.aiCompetitors ?? []) as unknown as AICompetitorState[]);
        setActivePlaybackByDriver((interactiveState.activePlaybackByDriver ?? {}) as unknown as Record<string, ActivePlaybackState | null>);
        setPendingRunContextByDriver((interactiveState.pendingRunContextByDriver ?? {}) as unknown as Record<string, PendingRunContext | null>);
        setGarageOpenByDriver(interactiveState.garageOpenByDriver ?? {});
        setSessionPaused(Boolean(interactiveState.sessionPaused));
        setSceneSpeed(typeof interactiveState.sceneSpeed === 'number' ? interactiveState.sceneSpeed : 1);
      } catch (error) {
        console.error('Failed to hydrate interactive weekend session', error);
      } finally {
        if (isActive) setIsHydratingWeekendState(false);
      }
    };

    hydrate();
    return () => {
      isActive = false;
    };
  }, [weekendId, teamId, initialPhase, controlledDriverIds]);

  const currentSetup = useMemo(
    () => getSetupForPhase(weekend, weekend.currentPhase, selectedDriver?.id ?? activeDriverId),
    [weekend, selectedDriver, activeDriverId]
  );

  useEffect(() => {
    if (!isTimedSessionPhase(weekend.currentPhase)) return;
    const phase = weekend.currentPhase;
    const driverId = selectedDriver?.id ?? activeDriverId;
    const phaseKey = getPhaseDriverKey(driverId, phase);
    const defaultTyreSetId = chooseDefaultTyreSetId(weekend.tyreAllocations[driverId] ?? []);
    setPracticeDevelopment((current) => {
      const hasCommittedSetup = !!current.lastCommittedSetupByPhase[phaseKey];
      const hasTyreSet = !!current.selectedTyreSetByPhase[phaseKey];
      if ((hasCommittedSetup || !currentSetup) && (hasTyreSet || !defaultTyreSetId)) return current;
      return {
        ...current,
        lastCommittedSetupByPhase: {
          ...current.lastCommittedSetupByPhase,
          ...(hasCommittedSetup ? {} : { [phaseKey]: { ...currentSetup } }),
        },
        selectedTyreSetByPhase: {
          ...current.selectedTyreSetByPhase,
          ...(hasTyreSet || !defaultTyreSetId ? {} : { [phaseKey]: defaultTyreSetId }),
        },
      };
    });
  }, [activeDriverId, currentSetup, selectedDriver, weekend.currentPhase, weekend.tyreAllocations]);

  useEffect(() => {
    if (!weekendId || !teamId || !isTimedSessionPhase(weekend.currentPhase) || isHydratingWeekendState) return;

    const activePhase = weekend.currentPhase;
    const interactiveSessionStateByPhase = buildInteractiveSessionPreset({
      weekend,
      activeDriverId,
      practiceDevelopment,
      aiCompetitors,
      activePlaybackByDriver,
      pendingRunContextByDriver,
      garageOpenByDriver,
      sessionPaused,
      sceneSpeed,
    });

    const setupByPhase: OnlineWeekendGaragePlan['setupByPhase'] = {
      [activePhase]: Object.fromEntries(
        controlledDriverIds.map((driverId) => [driverId, getSetupForPhase(weekend, activePhase, driverId)])
      ),
    };

    const selectedTyreSetByPhase: OnlineWeekendGaragePlan['selectedTyreSetByPhase'] = {
      [activePhase]: Object.fromEntries(
        controlledDriverIds
          .map((driverId) => {
            const key = getPhaseDriverKey(driverId, activePhase);
            const value = practiceDevelopment.selectedTyreSetByPhase[key];
            return value ? [driverId, value] : null;
          })
          .filter((entry): entry is [string, string] => entry !== null)
      ),
    };

    const lastCommittedSetupByPhase: OnlineWeekendGaragePlan['lastCommittedSetupByPhase'] = {
      [activePhase]: Object.fromEntries(
        controlledDriverIds
          .map((driverId) => {
            const key = getPhaseDriverKey(driverId, activePhase);
            const value = practiceDevelopment.lastCommittedSetupByPhase[key];
            return value ? [driverId, value] : null;
          })
          .filter((entry): entry is [string, SessionSetupState] => entry !== null)
      ),
    };

    void TCC_API.saveWeekendPlanForSession(weekendId, teamId, activePhase, {
      setupByPhase,
      selectedTyreSetByPhase,
      lastCommittedSetupByPhase,
      sessionSummaries: weekend.sessionSummaries,
      interactiveSessionStateByPhase,
    }).catch((error) => {
      console.error('Failed to persist interactive weekend session', error);
    });
  }, [
    weekendId,
    teamId,
    weekend,
    activeDriverId,
    practiceDevelopment,
    aiCompetitors,
    activePlaybackByDriver,
    pendingRunContextByDriver,
    garageOpenByDriver,
    sessionPaused,
    sceneSpeed,
    controlledDriverIds,
    isHydratingWeekendState,
  ]);

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
    () => buildSetupPhysicsEffects(selectedTrack, currentSetup, playerTeamSpecs),
    [selectedTrack, currentSetup, playerTeamSpecs]
  );
  const currentPhaseElapsedSeconds = isTimedSession ? practiceDevelopment.sessionElapsedSeconds[weekend.currentPhase] : 0;
  const currentPhaseDurationSeconds = isTimedSession ? SESSION_DURATION_SECONDS[weekend.currentPhase] : 0;
  const currentPhaseRemainingSeconds = isTimedSession ? Math.max(0, currentPhaseDurationSeconds - currentPhaseElapsedSeconds) : 0;
  const timedSessionPhase: TimedSessionPhase = isTimedSession ? (weekend.currentPhase as TimedSessionPhase) : 'fp1';
  const currentTrackTraction = isTimedSession ? practiceDevelopment.trackTractionByPhase[timedSessionPhase] : 0;
  const activeDriverRuntimeId = selectedDriver?.id ?? activeDriverId;
  const activePlayback = activePlaybackByDriver[activeDriverRuntimeId] ?? null;
  const pendingRunContext = pendingRunContextByDriver[activeDriverRuntimeId] ?? null;
  const garageOpen = garageOpenByDriver[activeDriverRuntimeId] ?? true;
  const playerAllocation = weekend.tyreAllocations[activeDriverRuntimeId] ?? EMPTY_TYRE_SETS;
  const availableTyreSets = useMemo(
    () => playerAllocation.filter((set) => !set.returned),
    [playerAllocation]
  );
  const selectedTyreSetId = isTimedSession
    ? (practiceDevelopment.selectedTyreSetByPhase[getPhaseDriverKey(activeDriverRuntimeId, timedSessionPhase)] ?? chooseDefaultTyreSetId(playerAllocation))
    : null;
  const selectedTyreSet = selectedTyreSetId ? playerAllocation.find((set) => set.id === selectedTyreSetId) ?? null : null;
  const selectedTyreCompound: TyreCompound = selectedTyreSet?.compound ?? 'soft';
  const selectedTyreWear = selectedTyreSet?.wear ?? 0;
  const weatherLabel = useMemo(() => {
    const rainChance = selectedTrack.weatherChance.rainChance;
    if (rainChance < 0.2) return `${t('practiceDev.weather.dry')} · ${Math.round(selectedTrack.baseTemperature)}°C`;
    if (rainChance < 0.45) return `${t('practiceDev.weather.cloudy')} · ${Math.round(selectedTrack.baseTemperature)}°C`;
    return `${t('practiceDev.weather.rainThreat')} ${Math.round(rainChance * 100)}% · ${Math.round(selectedTrack.baseTemperature)}°C`;
  }, [selectedTrack, t]);
  const formatMessage = useCallback((key: string, vars: Record<string, string | number>) => {
    let message = t(key);
    Object.entries(vars).forEach(([name, value]) => {
      message = message.split(`{${name}}`).join(String(value));
    });
    return message;
  }, [t]);
  const getFocusModeLabel = useCallback((focusMode: PracticeFocusMode): string => {
    if (focusMode === 'setup_feedback') return t('practiceDev.focus.setupFeedback');
    if (focusMode === 'track_preparation') return t('practiceDev.focus.trackPreparation');
    return t('practiceDev.focus.balanced');
  }, [t]);
  const getDirectionDisplayLabel = useCallback((direction: SetupDirection): string => {
    if (direction === 'awaiting_data') return t('practiceDev.direction.awaitingData');
    if (direction === 'too_low') return t('practiceDev.direction.tooLow');
    if (direction === 'too_high') return t('practiceDev.direction.tooHigh');
    return t('practiceDev.direction.inRange');
  }, [t]);
  const getRunPlanDisplayLabel = useCallback((value: number): string => {
    if (value > 0.08) return t('practiceDev.runPlan.qualiBiased');
    if (value < -0.08) return t('practiceDev.runPlan.longRunBiased');
    return t('common.balanced');
  }, [t]);
  const getPhaseLabel = useCallback((phase: WeekendPhase): string => {
    return t(`practiceDev.phase.${phase}`);
  }, [t]);
  const getTuningFieldLabel = useCallback((fieldKey: SetupTuningParameter): string => {
    return t(`practiceDev.tuning.${fieldKey}`);
  }, [t]);
  const getBiasLabel = useCallback((metricKey: DrivingBiasMetricKey): string => {
    return t(`practiceDev.bias.${metricKey}.label`);
  }, [t]);
  const getBiasLeftLabel = useCallback((metricKey: DrivingBiasMetricKey): string => {
    return t(`practiceDev.bias.${metricKey}.left`);
  }, [t]);
  const getBiasRightLabel = useCallback((metricKey: DrivingBiasMetricKey): string => {
    return t(`practiceDev.bias.${metricKey}.right`);
  }, [t]);
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
  const playbackSimSeconds = useMemo(() => {
    if (!activePlayback || !pendingRunContext) return 0;
    if (!isTimedSessionPhase(weekend.currentPhase)) return 0;
    if (pendingRunContext.phase !== weekend.currentPhase) return 0;
    const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[pendingRunContext.phase] ?? pendingRunContext.releaseElapsedSeconds;
    return clamp(phaseElapsed - pendingRunContext.releaseElapsedSeconds, 0, activePlayback.plan.elapsedSeconds);
  }, [activePlayback, pendingRunContext, practiceDevelopment.sessionElapsedSeconds, weekend.currentPhase]);
  const practiceLeaderboard = useMemo(() => {
    if (!isPracticePhase(weekend.currentPhase)) return [];
    const phase = weekend.currentPhase;
    const playerPlayback = activePlayback && activePlayback.plan.phase === phase
      ? getPlaybackTrackState(
          selectedTrack,
          activePlayback.plan.player.lapTimeSeconds,
          activePlayback.plan.player.setupChangeSeconds,
          activePlayback.plan.player.outLapSeconds,
          activePlayback.plan.player.completedLaps,
          activePlayback.plan.player.inLapSeconds,
          playbackSimSeconds,
          activePlayback.plan.player.lapTimes,
        )
      : null;
    const playerRows = controlledDrivers.map((driver) => ({
      driverId: driver.id,
      bestLapSeconds: driver.id === activeDriverRuntimeId && playerPlayback?.bestLapSeconds !== null
        ? (practiceDevelopment.phases[phase].bestLapSeconds === null
            ? playerPlayback.bestLapSeconds
            : Math.min(practiceDevelopment.phases[phase].bestLapSeconds, playerPlayback.bestLapSeconds))
        : practiceDevelopment.phases[phase].bestLapSeconds,
      laps: practiceDevelopment.phases[phase].lapsCompleted + (driver.id === activeDriverRuntimeId ? (playerPlayback?.completedLaps ?? 0) : 0),
      tyreCompound: weekend.tyreAllocations[driver.id]?.find(
        (set) => set.id === practiceDevelopment.selectedTyreSetByPhase[getPhaseDriverKey(driver.id, phase)]
      )?.compound ?? null,
      isPlayer: true,
    }));
    const aiRows = aiCompetitors.map((entry) => {
      const activeRun = activePlayback?.plan.phase === phase
        ? activePlayback.plan.aiRuns.find((run) => run.driverId === entry.driverId)
        : null;
      const playbackState = activeRun
        ? getPlaybackTrackState(
            selectedTrack,
            Math.max(activeRun.lapTimeSeconds, 1),
            activeRun.setupChangeSeconds,
            activeRun.outLapSeconds,
            activeRun.completedLaps,
            activeRun.inLapSeconds,
            playbackSimSeconds,
            activeRun.lapTimes,
          )
        : null;
      return {
        driverId: entry.driverId,
        bestLapSeconds: playbackState?.bestLapSeconds ?? null,
        laps: (entry.lapsByPhase[phase] ?? 0) + (playbackState?.completedLaps ?? 0),
        tyreCompound: entry.tyreByPhase[phase] ?? null,
        isPlayer: false,
      };
    });
    return [...aiRows, ...playerRows]
      .sort((a, b) => {
        if (a.bestLapSeconds === null && b.bestLapSeconds === null) return 0;
        if (a.bestLapSeconds === null) return 1;
        if (b.bestLapSeconds === null) return -1;
        return a.bestLapSeconds - b.bestLapSeconds;
      })
      .map((entry, index) => ({ ...entry, position: index + 1 }));
  }, [activeDriverRuntimeId, activePlayback, aiCompetitors, controlledDrivers, isPracticePhase, playbackSimSeconds, practiceDevelopment.phases, practiceDevelopment.selectedTyreSetByPhase, selectedTrack, weekend.currentPhase, weekend.tyreAllocations]);
  const qualifyingLeaderboard = useMemo(() => {
    if (!isQualifyingSession) return [];
    const phase = weekend.currentPhase as QualifyingPhase;
    const playerPlayback = activePlayback && activePlayback.plan.phase === phase
      ? getPlaybackTrackState(
          selectedTrack,
          activePlayback.plan.player.lapTimeSeconds,
          activePlayback.plan.player.setupChangeSeconds,
          activePlayback.plan.player.outLapSeconds,
          activePlayback.plan.player.completedLaps,
          activePlayback.plan.player.inLapSeconds,
          playbackSimSeconds,
          activePlayback.plan.player.lapTimes,
        )
      : null;
    const playerRows = controlledDrivers.map((driver) => ({
      driverId: driver.id,
      driverName: driver.name,
      team: driver.team,
      bestLapSeconds: driver.id === activeDriverRuntimeId && playerPlayback?.bestLapSeconds !== null
        ? (practiceDevelopment.qualifying[phase].bestLapSeconds === null
            ? playerPlayback.bestLapSeconds
            : Math.min(practiceDevelopment.qualifying[phase].bestLapSeconds, playerPlayback.bestLapSeconds))
        : practiceDevelopment.qualifying[phase].bestLapSeconds,
      laps: practiceDevelopment.qualifying[phase].lapsCompleted + (driver.id === activeDriverRuntimeId ? (playerPlayback?.completedLaps ?? 0) : 0),
      tyreCompound: weekend.tyreAllocations[driver.id]?.find(
        (set) => set.id === practiceDevelopment.selectedTyreSetByPhase[getPhaseDriverKey(driver.id, phase)]
      )?.compound ?? null,
      isPlayer: true,
    }));
    const aiRows = aiCompetitors
      .map((entry) => {
        const activeRun = activePlayback?.plan.phase === phase
          ? activePlayback.plan.aiRuns.find((run) => run.driverId === entry.driverId)
          : null;
        const playbackState = activeRun
          ? getPlaybackTrackState(
              selectedTrack,
              Math.max(activeRun.lapTimeSeconds, 1),
              activeRun.setupChangeSeconds,
              activeRun.outLapSeconds,
              activeRun.completedLaps,
              activeRun.inLapSeconds,
              playbackSimSeconds,
              activeRun.lapTimes,
            )
          : null;
        return {
          driverId: entry.driverId,
          driverName: entry.driverName,
          team: entry.team,
          bestLapSeconds: playbackState?.bestLapSeconds !== null && playbackState?.bestLapSeconds !== undefined
            ? (entry.bestLapByPhase[phase] == null ? playbackState.bestLapSeconds : Math.min(entry.bestLapByPhase[phase]!, playbackState.bestLapSeconds))
            : entry.bestLapByPhase[phase] ?? null,
          laps: (entry.lapsByPhase[phase] ?? 0) + (playbackState?.completedLaps ?? 0),
          tyreCompound: entry.tyreByPhase[phase] ?? null,
          isPlayer: false,
        };
      });
    return [...aiRows, ...playerRows]
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
  }, [activeDriverRuntimeId, activePlayback, aiCompetitors, controlledDrivers, isQualifyingSession, playbackSimSeconds, practiceDevelopment.qualifying, practiceDevelopment.selectedTyreSetByPhase, selectedTrack, weekend.currentPhase, weekend.tyreAllocations]);
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
        selectedTrack,
        activePlayback.plan.player.lapTimeSeconds,
        activePlayback.plan.player.setupChangeSeconds,
        activePlayback.plan.player.outLapSeconds,
        activePlayback.plan.player.completedLaps,
        activePlayback.plan.player.inLapSeconds,
        runSeconds,
        activePlayback.plan.player.lapTimes,
      );
      const aiVehicles = activePlayback.plan.aiRuns.map((run) => {
        const trackState = getPlaybackTrackState(
          selectedTrack,
          Math.max(run.lapTimeSeconds, 1),
          run.setupChangeSeconds,
          run.outLapSeconds,
          run.completedLaps,
          run.inLapSeconds,
          runSeconds,
          run.lapTimes,
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
    const baseline = [
      {
        id: selectedDriver.id,
        driverId: selectedDriver.id,
        distanceOnLap: getPitLaneSpawnDistance(selectedTrack, 0, aiCompetitors.length + 1),
        isInPit: true,
      },
      ...aiCompetitors.map((entry, index) => ({
        id: entry.driverId,
        driverId: entry.driverId,
        distanceOnLap: getPitLaneSpawnDistance(selectedTrack, index + 1, aiCompetitors.length + 1),
        isInPit: true,
      })),
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
    const driverId = selectedDriver?.id ?? activeDriverId;
    setWeekend((currentWeekend) =>
      updateSetupForPhase(currentWeekend, currentWeekend.currentPhase, driverId, {
        ...getSetupForPhase(currentWeekend, currentWeekend.currentPhase, driverId),
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
    setWeekend(createWeekend(selectedTrack, controlledDriverIds, teamId ?? 'player-team'));
    const nextDevelopment = createPracticeDevelopmentState();
    controlledDriverIds.forEach((driverId) => {
      nextDevelopment.lastCommittedSetupByPhase[getPhaseDriverKey(driverId, 'fp1')] = { ...NEUTRAL_SESSION_SETUP };
    });
    setPracticeDevelopment(nextDevelopment);
    setAiCompetitors(createAICompetitors(controlledDriverIds, { ...NEUTRAL_SESSION_SETUP }));
    aiWaitAccumulatorByPhaseRef.current = { fp1: 0, fp2: 0, fp3: 0, q1: 0, q2: 0, q3: 0 };
    setActivePlaybackByDriver(controlledDriverIds.reduce<Record<string, ActivePlaybackState | null>>((acc, driverId) => {
      acc[driverId] = null;
      return acc;
    }, {}));
    setSessionPaused(false);
    setPendingRunContextByDriver(controlledDriverIds.reduce<Record<string, PendingRunContext | null>>((acc, driverId) => {
      acc[driverId] = null;
      return acc;
    }, {}));
    setGarageOpenByDriver(controlledDriverIds.reduce<Record<string, boolean>>((acc, driverId) => {
      acc[driverId] = true;
      return acc;
    }, {}));
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
    const phaseKey = getPhaseDriverKey(activeDriverRuntimeId, activePhase);
    setPracticeDevelopment((current) => ({
      ...current,
      selectedTyreSetByPhase: {
        ...current.selectedTyreSetByPhase,
        [phaseKey]: setId,
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
          lapTimes: [],
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
        ?? { ...NEUTRAL_SESSION_SETUP };
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
      let bestLap = entry.bestLapByPhase[activePhase as QualifyingPhase] ?? null;
      const lapTimes: number[] = [];
      if (activePhase.startsWith('q') && aiRun.completedLaps > 0) {
        for (let lap = 0; lap < aiRun.completedLaps; lap += 1) {
          const variance = (deterministicNoise((index + 1) * 97 + lap + timeUsedSeconds) - 0.5) * (1.15 - driver.skill.consistency / 120);
          const simulatedLap = lapTime + variance;
          lapTimes.push(simulatedLap);
          bestLap = bestLap === null ? simulatedLap : Math.min(bestLap, simulatedLap);
        }
      }
      runs.push({
        driverId: entry.driverId,
        completedLaps: aiRun.completedLaps,
        setupChangeSeconds,
        lapTimeSeconds: lapTime,
        outLapSeconds: aiRun.outLapSeconds,
        inLapSeconds: aiRun.inLapSeconds,
        isReleased: true,
        lapTimes,
      });
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

  const commitSessionRun = useCallback((driverId: string, context: PendingRunContext, availableSeconds: number) => {
    const driver = controlledDrivers.find((entry) => entry.id === driverId);
    if (!driver) return;
    const activePhase = context.phase;
    const selectedSet = (weekend.tyreAllocations[driverId] ?? EMPTY_TYRE_SETS).find((set) => set.id === context.selectedTyreSetId) ?? null;
    if (!selectedSet) return;
    const driverSetup = getSetupForPhase(weekend, activePhase, driverId);
    const driverEffects = buildSetupPhysicsEffects(selectedTrack, driverSetup, playerTeamSpecs);
    const runWindow = simulateSessionLaps(context.plannedLaps, context.lapTimeSeconds, availableSeconds, context.setupChangeSeconds);
    const progressionLaps = Math.max(runWindow.completedLaps, runWindow.equivalentLaps);
    const feedbackLaps = Math.max(runWindow.completedLaps, Math.round(runWindow.equivalentLaps));

    if (progressionLaps > 0) {
      const wearGain = progressionLaps * context.lapTimeSeconds * TYRE_COMPOUNDS[selectedSet.compound].baseWearRate * driverEffects.tyreWearFactor;
      setWeekend((currentWeekend) => {
        const allocation = currentWeekend.tyreAllocations[driverId] ?? EMPTY_TYRE_SETS;
        return {
          ...currentWeekend,
          tyreAllocations: {
            ...currentWeekend.tyreAllocations,
            [driverId]: allocation.map((set) => (
              set.id === selectedSet.id
                ? { ...set, wear: clamp(set.wear + wearGain, 0, 100) }
                : set
            )),
          },
        };
      });
    }

    const prepDelta = calculateDriverPrepDelta(selectedSet.compound, progressionLaps, activePhase);

    const runLapTimes = context.lapTimes.slice(0, runWindow.completedLaps);
    const bestLapFromRun = runLapTimes.length ? Math.min(...runLapTimes) : null;

    if (isPracticePhase(activePhase)) {
      const phaseState = practiceDevelopment.phases[activePhase];
      const focusAllocation = getFocusAllocation(phaseState.focusMode);
      const stintResult = SetupFeedbackSystem.runPracticeStint(
        selectedTrack,
        driverSetup,
        practiceDevelopment.biasKnowledge,
        hiddenIdealSetup,
        driver.learning,
        focusAllocation,
        feedbackLaps,
        practiceDevelopment.trackPreparation,
        playerTeamSpecs
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
            [activePhase]: clamp(current.trackTractionByPhase[activePhase] + progressionLaps * 0.3, 0, 100),
          },
          lastCommittedSetupByPhase: {
            ...current.lastCommittedSetupByPhase,
            [getPhaseDriverKey(driverId, activePhase)]: { ...driverSetup },
          },
          phases: {
            ...current.phases,
            [activePhase]: {
              ...currentPhaseState,
              lapsCompleted: currentPhaseState.lapsCompleted + runWindow.completedLaps,
              bestLapSeconds: bestLapFromRun === null
                ? currentPhaseState.bestLapSeconds
                : currentPhaseState.bestLapSeconds === null
                  ? bestLapFromRun
                  : Math.min(currentPhaseState.bestLapSeconds, bestLapFromRun),
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
                bestLapSeconds: bestLapFromRun,
              },
              needsFreshFeedback: stintResult.feedback ? false : currentPhaseState.needsFreshFeedback,
            },
          },
        };
      });
      return;
    }

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
          [activePhase]: clamp(current.trackTractionByPhase[activePhase] + progressionLaps * 0.3, 0, 100),
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
    controlledDrivers,
    weekend,
    practiceDevelopment.trackPreparation,
    practiceDevelopment.phases,
    practiceDevelopment.biasKnowledge,
    selectedTrack,
    hiddenIdealSetup,
    playerTeamSpecs,
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
    const committedSetup = practiceDevelopment.lastCommittedSetupByPhase[getPhaseDriverKey(activeDriverRuntimeId, activePhase)] ?? currentSetup;
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
    const lapTimes = Array.from({ length: runWindow.completedLaps }, (_, lap) => {
      const variance = (deterministicNoise(lap + elapsedSeconds * 0.1 + driverLearning) - 0.5) * (1.2 - ((selectedDriver.skill.consistency ?? 80) / 120));
      return lapTimeWithTyre + variance;
    });
    const aiSlice = simulateAiSessionSlice(
      activePhase,
      runWindow.timeUsedSeconds,
      practiceDevelopment.trackPreparation,
      practiceDevelopment.trackTractionByPhase[activePhase] ?? 0,
      'run'
    );
    setAiCompetitors(aiSlice.nextCompetitors);
    setActivePlaybackByDriver((current) => ({
      ...current,
      [activeDriverRuntimeId]: {
      plan: {
        phase: activePhase,
        player: {
          plannedLaps,
          completedLaps: runWindow.completedLaps,
          setupChangeSeconds,
          lapTimeSeconds: lapTimeWithTyre,
          outLapSeconds: runWindow.outLapSeconds,
          inLapSeconds: runWindow.inLapSeconds,
          lapTimes,
        },
        aiRuns: aiSlice.runs,
        elapsedSeconds: runWindow.timeUsedSeconds,
      },
      progressRatio: 0,
      durationSeconds: clamp(runWindow.timeUsedSeconds / 20, 6, 22),
      },
    }));
    setPendingRunContextByDriver((current) => ({
      ...current,
      [activeDriverRuntimeId]: {
      phase: activePhase,
      plannedLaps,
      setupChangeSeconds,
      lapTimeSeconds: lapTimeWithTyre,
      lapTimes,
      selectedTyreSetId: selectedTyreSet.id,
      releaseElapsedSeconds: elapsedSeconds,
      trafficPenaltySeconds: traffic.trafficPenaltySeconds,
      trafficStatus: traffic.trafficStatus,
      },
    }));
    setGarageOpenByDriver((current) => ({ ...current, [activeDriverRuntimeId]: false }));
  };

  const handleCallToGarage = () => {
    if (activePlayback && pendingRunContext) {
      const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[pendingRunContext.phase] ?? pendingRunContext.releaseElapsedSeconds;
      const partialSeconds = Math.max(0, phaseElapsed - pendingRunContext.releaseElapsedSeconds);
      commitSessionRun(activeDriverRuntimeId, pendingRunContext, partialSeconds);
      setPendingRunContextByDriver((current) => ({ ...current, [activeDriverRuntimeId]: null }));
    }
    setActivePlaybackByDriver((current) => ({ ...current, [activeDriverRuntimeId]: null }));
    setGarageOpenByDriver((current) => ({ ...current, [activeDriverRuntimeId]: true }));
  };

  useEffect(() => {
    controlledDriverIds.forEach((driverId) => {
      const playback = activePlaybackByDriver[driverId];
      const context = pendingRunContextByDriver[driverId];
      if (!playback || !context) return;
      const phaseElapsed = practiceDevelopment.sessionElapsedSeconds[context.phase] ?? context.releaseElapsedSeconds;
      const elapsedSinceRelease = Math.max(0, phaseElapsed - context.releaseElapsedSeconds);
      const reachedRunEnd = elapsedSinceRelease >= playback.plan.elapsedSeconds;
      const reachedChequered = phaseElapsed >= SESSION_DURATION_SECONDS[context.phase];
      if (!reachedRunEnd && !reachedChequered) return;
      commitSessionRun(driverId, context, elapsedSinceRelease);
      setPendingRunContextByDriver((current) => ({ ...current, [driverId]: null }));
      setActivePlaybackByDriver((current) => ({ ...current, [driverId]: null }));
      setGarageOpenByDriver((current) => ({ ...current, [driverId]: true }));
    });
  }, [activePlaybackByDriver, commitSessionRun, controlledDriverIds, pendingRunContextByDriver, practiceDevelopment.sessionElapsedSeconds]);

  const completeTimedSession = useCallback(async () => {
    if (!weekendId || !teamId || !isTimedSessionPhase(weekend.currentPhase) || isCompletingSession) return;

    const activePhase = weekend.currentPhase;
    const summary = buildTimedSessionSummary(
      activePhase,
      controlledDrivers,
      aiCompetitors,
      practiceDevelopment,
    );

    setIsCompletingSession(true);
    try {
      const result = await TCC_API.completeInteractiveSession(weekendId, teamId, activePhase, summary);
      setWeekend(result.weekend);
    } catch (error) {
      console.error('Failed to complete interactive session', error);
    } finally {
      setIsCompletingSession(false);
    }
  }, [aiCompetitors, controlledDrivers, isCompletingSession, practiceDevelopment, teamId, weekend, weekendId]);

  const handleRaceAction = () => {
    if (weekend.currentPhase === 'race') {
      if (onOpenRaceSession) {
        onOpenRaceSession(selectedTrack.id);
        return;
      }
      navigate(`/race-dev?track=${selectedTrack.id}`);
      return;
    }

    if (isTimedSessionPhase(weekend.currentPhase)) {
      void completeTimedSession();
      return;
    }

    setActivePlaybackByDriver((current) => controlledDriverIds.reduce<Record<string, ActivePlaybackState | null>>((acc, driverId) => {
      acc[driverId] = null;
      return acc;
    }, current));
    setPendingRunContextByDriver((current) => controlledDriverIds.reduce<Record<string, PendingRunContext | null>>((acc, driverId) => {
      acc[driverId] = null;
      return acc;
    }, current));
    setGarageOpenByDriver((current) => controlledDriverIds.reduce<Record<string, boolean>>((acc, driverId) => {
      acc[driverId] = true;
      return acc;
    }, current));
    setWeekend((currentWeekend) => WeekendManager.transitionToNextPhase(carrySetupForward(currentWeekend, controlledDriverIds)));
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col gap-4 md:gap-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-f1-red/30 bg-f1-red/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-f1-red">
              <RadioTower size={12} /> {t('practiceDev.sessionControlBadge')}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-orbitron font-black italic tracking-tight text-white">
                {t('practiceDev.title')}
              </h1>
              <p className="mt-2 max-w-3xl text-sm md:text-base text-gray-300">
                {formatMessage('practiceDev.subtitle', { driverName: selectedDriver?.name ?? t('practiceDev.theDriver') })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <GlassButton onClick={() => navigate('/race-dev')} className="inline-flex items-center gap-2">
              <Flag size={16} /> {t('practiceDev.openRaceSandbox')}
            </GlassButton>
            <GlassButton onClick={() => (onBack ? onBack() : navigate(-1))} variant="ghost" className="inline-flex items-center gap-2">
              <ChevronLeft size={16} /> {t('practiceDev.back')}
            </GlassButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
          {controlledDrivers.map((driver) => {
            const isActive = driver.id === activeDriverRuntimeId;
            return (
              <button
                key={driver.id}
                type="button"
                onClick={() => setActiveDriverId(driver.id)}
                className={clsx(
                  'rounded-lg px-4 py-2 text-sm font-semibold transition',
                  isActive
                    ? 'bg-f1-red text-white'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                )}
              >
                {driver.name}
              </button>
            );
          })}
        </div>

        <GlassCard className="space-y-5 border-white/10">
          <div className="flex items-center gap-3 text-white">
            <Wrench className="text-yellow-400" />
            <div>
              <h2 className="text-xl font-bold">{t('practiceDev.weekendFlow')}</h2>
              <p className="text-sm text-gray-400">{t('practiceDev.weekendFlowHint')}</p>
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
                    {getPhaseLabel(phase)}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3">
              <GlassButton onClick={handleRaceAction} disabled={isCompletingSession}>
                {weekend.currentPhase === 'pre_weekend'
                  ? t('practiceDev.startWeekend')
                  : weekend.currentPhase === 'race'
                    ? t('practiceDev.openLiveRaceSession')
                    : isCompletingSession
                      ? t('common.loading')
                      : t('practiceDev.advancePhase')}
              </GlassButton>
              <GlassButton onClick={handleResetWeekend} variant="ghost">{t('practiceDev.resetToAll50')}</GlassButton>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-400">{t('practiceDev.completedSessions')}</div>
            <div className="mt-2 text-sm text-white">
              {weekend.completedSessions.length ? weekend.completedSessions.map((session) => getPhaseLabel(session)).join(' → ') : t('practiceDev.noneYet')}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-white/10">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-f1-red/20 bg-f1-red/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-f1-red">{t('practiceDev.feedbackReliability')}</div>
              <div className="mt-2 text-3xl font-black text-white">{practiceDevelopment.feedbackQuality.toFixed(1)}%</div>
              <div className="mt-1 text-sm text-red-200">{formatMessage('practiceDev.clearBiasFlags', { count: flaggedCount })}</div>
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-violet-300">{t('practiceDev.preparation')}</div>
              <div className="mt-2 text-3xl font-black text-white">{practiceDevelopment.trackPreparation.toFixed(1)}%</div>
              <div className="mt-1 text-sm text-violet-200">{formatMessage('practiceDev.practiceLapsCompleted', { count: practiceDevelopment.totalPracticeLaps })}</div>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-sky-300">{t('practiceDev.qualiVsLongRun')}</div>
              <div className="mt-2 text-3xl font-black text-white">{getRunPlanDisplayLabel(currentEffects.runPlanBias)}</div>
              <div className="mt-1 text-sm text-sky-200">
                {formatMessage('practiceDev.runPlanTyreWear', { bias: (currentEffects.runPlanBias * 100).toFixed(0), wear: currentEffects.tyreWearFactor.toFixed(3) })}
              </div>
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-12 gap-4 md:gap-6">
          {garageOpen && (
            <GlassCard className="col-span-12 lg:col-span-5 space-y-6 border-white/10">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{t('practiceDev.weekendTrack')}</label>
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
                <div className="text-xs uppercase tracking-[0.2em] text-gray-400">{t('practiceDev.currentPhase')}</div>
                <div className="mt-1 text-xl font-black uppercase text-white">{getPhaseLabel(weekend.currentPhase)}</div>
              </div>
            </div>

            <GlassCard className="space-y-5 border-white/10 bg-black/20">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-white">
                  <SlidersHorizontal className="text-cyan-400" />
                  <div>
                    <h2 className="text-xl font-bold">{t('practiceDev.currentGarageSetup')}</h2>
                    <p className="text-sm text-gray-400">
                      {canEditSetup ? t('practiceDev.currentGarageSetupHint') : t('practiceDev.mechanicalSetupLocked')}
                    </p>
                  </div>
                </div>
                {setupLocked && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
                    <Lock size={12} /> {t('practiceDev.parcFerme')}
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                {TUNING_FIELDS.map(({ key, label }) => {
                  const value = Math.round(currentSetup[key] ?? 50);
                  return (
                    <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white">{getTuningFieldLabel(key) || label}</div>
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
                            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{t('practiceDev.trackTestProgramme')}</div>
                            <div className="mt-1 text-sm text-cyan-100">
                              {formatMessage('practiceDev.trackTestProgrammeHint', { driverName: selectedDriver?.name ?? t('practiceDev.theDriver') })}
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
                                  <div className="text-sm font-bold uppercase tracking-[0.15em]">{getFocusModeLabel(focusMode)}</div>
                                  <div className="mt-1 text-xs text-gray-300">
                                    {focusMode === 'setup_feedback'
                                      ? t('practiceDev.maximiseFeedback')
                                      : focusMode === 'track_preparation'
                                        ? t('practiceDev.maximisePreparation')
                                        : t('practiceDev.splitGoals')}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">{t('practiceDev.stintLength')}</div>
                              <input
                                type="number"
                                min={MIN_RUN_LAPS}
                                max={MAX_RUN_LAPS}
                                step={1}
                                value={currentPracticePhaseState.plannedLaps}
                                onChange={(event) => handlePracticePhaseUpdate('plannedLaps', normalizePlannedLaps(Number(event.target.value)))}
                                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-cyan-300/40"
                              />
                              <div className="mt-1 text-xs text-cyan-100">{formatMessage('practiceDev.stintLengthHint', { min: MIN_RUN_LAPS, max: MAX_RUN_LAPS })}</div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">{t('practiceDev.driverLearning')}</div>
                              <div className="mt-2 text-2xl font-black text-white">{driverLearning}</div>
                              <div className="mt-1 text-xs text-cyan-100">{t('practiceDev.driverLearningHint')}</div>
                              <div className="mt-2 text-[11px] text-cyan-200">Feedback ×{Math.max(0.5, driverLearning / 85).toFixed(2)}</div>
                              {currentPracticePhaseState && (
                                <div className="mt-2 text-[11px] text-white/80">Best lap {formatLapTime(currentPracticePhaseState.bestLapSeconds)}</div>
                              )}
                            </div>
                          </div>
                        </>
                      ) : isQualifyingSession && currentQualifyingPhaseState ? (
                        <>
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{t('practiceDev.qualifyingRunPlan')}</div>
                            <div className="mt-1 text-sm text-cyan-100">
                              {t('practiceDev.qualifyingRunPlanHint')}
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">{t('practiceDev.plannedPushLaps')}</div>
                              <input
                                type="number"
                                min={MIN_RUN_LAPS}
                                max={MAX_RUN_LAPS}
                                step={1}
                                value={currentQualifyingPhaseState.plannedLaps}
                                onChange={(event) => handleQualifyingPhaseUpdate('plannedLaps', normalizePlannedLaps(Number(event.target.value)))}
                                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-cyan-300/40"
                              />
                              <div className="mt-1 text-xs text-cyan-100">{formatMessage('practiceDev.stintLengthHint', { min: MIN_RUN_LAPS, max: MAX_RUN_LAPS })}</div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                              <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">{t('practiceDev.bestLap')}</div>
                              <div className="mt-2 text-2xl font-black text-white">{formatLapTime(currentQualifyingPhaseState.bestLapSeconds)}</div>
                              <div className="mt-1 text-xs text-cyan-100">{formatMessage('practiceDev.lapsCompletedInSession', { count: currentQualifyingPhaseState.lapsCompleted })}</div>
                            </div>
                          </div>
                        </>
                      ) : null}
                      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                        <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">{t('practiceDev.tyreSetGrid')}</div>
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
                                <div className="mt-1 text-[11px] text-gray-400">{formatMessage('practiceDev.wearValue', { wear: set.wear.toFixed(1) })}</div>
                              </button>
                            );
                          })}
                        </div>
                        {!availableTyreSets.length && <div className="mt-2 text-xs text-amber-300">{t('practiceDev.noSetsAvailable')}</div>}
                        <div className="mt-2 text-xs text-cyan-100">
                          {formatMessage('practiceDev.activeCompoundWear', {
                            compound: selectedTyreSet ? selectedTyreSet.compound.toUpperCase() : '—',
                            wear: selectedTyreSet ? `${selectedTyreSet.wear.toFixed(1)}%` : '—'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-xs uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.sessionClock')}</div>
                        <div className="mt-2 flex items-center gap-2 text-lg font-black text-white">
                          <Clock3 size={16} className="text-cyan-300" />
                          {formatSessionClock(currentPhaseRemainingSeconds)}
                        </div>
                        <div className="mt-1 text-sm text-gray-300">
                          {formatMessage('practiceDev.sessionClockDetails', {
                            elapsed: formatSessionClock(currentPhaseElapsedSeconds),
                            estimatedLapTime: estimatedLapTime.toFixed(2),
                            traction: currentTrackTraction.toFixed(1)
                          })}
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-xs uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.currentPracticePhase')}</div>
                        <div className="mt-2 text-lg font-black text-white">{getPhaseLabel(weekend.currentPhase)}</div>
                        <div className="mt-1 text-sm text-gray-300">
                          {formatMessage('practiceDev.lapsCompletedInThisSession', {
                            count: isPracticePhase(weekend.currentPhase)
                              ? (currentPracticePhaseState?.lapsCompleted ?? 0)
                              : (currentQualifyingPhaseState?.lapsCompleted ?? 0)
                          })}
                        </div>
                      </div>
                    </div>
                    <GlassButton onClick={handleRunSessionStint} className="w-full" disabled={currentPhaseRemainingSeconds <= 0 || !selectedTyreSet}>
                      {isPracticePhase(weekend.currentPhase) && currentPracticePhaseState
                        ? formatMessage('practiceDev.runLapsOnFocus', { laps: currentPracticePhaseState.plannedLaps, focus: getFocusModeLabel(currentPracticePhaseState.focusMode) })
                        : formatMessage('practiceDev.runPushLaps', { laps: currentQualifyingPhaseState?.plannedLaps ?? 0 })}
                    </GlassButton>
                    {!selectedTyreSet && (
                      <div className="mt-2 text-xs text-amber-300">{t('practiceDev.selectTyreSet')}</div>
                    )}
                    {isPracticePhase(weekend.currentPhase) && currentPracticePhaseState?.lastRunSummary && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                        <div className="font-bold uppercase tracking-[0.15em] text-white">{t('practiceDev.lastStint')}</div>
                        <div className="mt-2">
                          {formatMessage('practiceDev.lastStintLapsAndFocus', {
                            laps: currentPracticePhaseState.lastRunSummary.laps,
                            plannedLaps: currentPracticePhaseState.lastRunSummary.plannedLaps,
                            focus: getFocusModeLabel(currentPracticePhaseState.lastRunSummary.focusMode)
                          })}
                        </div>
                        <div className="mt-1">{formatMessage('practiceDev.setupChangeTime', { seconds: currentPracticePhaseState.lastRunSummary.setupChangeSeconds.toFixed(1) })}</div>
                        <div className="mt-1">{formatMessage('practiceDev.trafficSummary', {
                          status: t(`practiceDev.traffic.${currentPracticePhaseState.lastRunSummary.trafficStatus}`),
                          penalty: currentPracticePhaseState.lastRunSummary.trafficPenaltySeconds.toFixed(2)
                        })}</div>
                        <div className="mt-1">{formatMessage('practiceDev.feedbackQualityGain', { gain: currentPracticePhaseState.lastRunSummary.feedbackQualityGain.toFixed(1) })}</div>
                        <div className="mt-1">{formatMessage('practiceDev.trackPreparationGain', { gain: currentPracticePhaseState.lastRunSummary.trackPreparationGain.toFixed(1) })}</div>
                        <div className="mt-1">Best lap {formatLapTime(currentPracticePhaseState.lastRunSummary.bestLapSeconds)}</div>
                        {currentPracticePhaseState.lastRunSummary.cutoffByChequered && <div className="mt-1 text-amber-300">{t('practiceDev.chequeredEndedEarly')}</div>}
                      </div>
                    )}
                    {isQualifyingSession && currentQualifyingPhaseState?.lastRunSummary && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                        <div className="font-bold uppercase tracking-[0.15em] text-white">{t('practiceDev.lastRun')}</div>
                        <div className="mt-2">
                          {formatMessage('practiceDev.lastRunLapsCompleted', {
                            laps: currentQualifyingPhaseState.lastRunSummary.laps,
                            plannedLaps: currentQualifyingPhaseState.lastRunSummary.plannedLaps
                          })}
                        </div>
                        <div className="mt-1">{formatMessage('practiceDev.trafficSummary', {
                          status: t(`practiceDev.traffic.${currentQualifyingPhaseState.lastRunSummary.trafficStatus}`),
                          penalty: currentQualifyingPhaseState.lastRunSummary.trafficPenaltySeconds.toFixed(2)
                        })}</div>
                        <div className="mt-1">{formatMessage('practiceDev.bestLapFromRun', { lap: formatLapTime(currentQualifyingPhaseState.lastRunSummary.bestLapSeconds) })}</div>
                        {currentQualifyingPhaseState.lastRunSummary.cutoffByChequered && <div className="mt-1 text-amber-300">{t('practiceDev.chequeredEndedEarly')}</div>}
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
                      <h2 className="text-xl font-bold">{t('practiceDev.sessionControl')}</h2>
                      <p className="text-sm text-gray-400">
                        {isQualifyingSession
                          ? t('practiceDev.qualifyingControlHint')
                          : t('practiceDev.practiceControlHint')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-100">
                      {formatMessage('practiceDev.ourConfidence', { confidence: practiceDevelopment.feedbackQuality.toFixed(1) })}
                    </div>
                    {isTimedSession && (
                      <button
                        type="button"
                        onClick={handleCallToGarage}
                        className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-white"
                      >
                        {garageOpen ? t('practiceDev.garageOpen') : t('practiceDev.callToPit')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSessionPaused((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.15em] text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sessionPaused ? <Play size={12} /> : <Pause size={12} />}
                      {sessionPaused ? t('practiceDev.resumeSession') : t('practiceDev.pauseSession')}
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
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.tyreWear')}</div>
                    <div className="mt-1 font-bold" style={{ color: getTyreColor(selectedTyreCompound) }}>
                      {selectedTyreSet ? `${selectedTyreSet.wear.toFixed(1)}% ${selectedTyreSet.compound.toUpperCase()}` : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.feedback')}</div>
                    <div className="mt-1 font-bold text-cyan-100">{practiceDevelopment.feedbackQuality.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.trackPrep')}</div>
                    <div className="mt-1 font-bold text-cyan-100">{practiceDevelopment.trackPreparation.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.traction')}</div>
                    <div className="mt-1 font-bold text-cyan-100">{currentTrackTraction.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.prepSplit')}</div>
                    <div className="mt-1 font-bold text-cyan-100">Q {practiceDevelopment.qualifyingPrep.toFixed(1)} · R {practiceDevelopment.raceConservePrep.toFixed(1)}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.weather')}</div>
                    <div className="mt-1 font-bold text-cyan-100">{weatherLabel}</div>
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-gray-300">
                        <MapPin size={12} className="text-cyan-300" /> {t('practiceDev.liveTrackScene')}
                      </div>
                      <div className="text-xs text-gray-400">
                        {activePlayback ? `${(playbackProgressRatio * 100).toFixed(0)}%` : t('practiceDev.idle')}
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <CircularTrackMap
                        vehicles={sceneTrackVehicles}
                        trackId={selectedTrack.id}
                        timeScale={sceneSpeed}
                        title={activePlayback ? formatMessage('practiceDev.runReplay', { time: formatSessionClock(playbackSimSeconds) }) : t('practiceDev.awaitingNextRun')}
                      />
                    </div>
                    {activePlayback && (
                      <div className="text-xs text-gray-300">
                        {formatMessage('practiceDev.runTimeSimulated', {
                          current: formatSessionClock(playbackSimSeconds),
                          total: formatSessionClock(activePlayback.plan.elapsedSeconds)
                        })}
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
                      practiceLeaderboard.slice(0, 8).map((entry) => (
                        <div
                          key={entry.driverId}
                          className={clsx(
                            'grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-2 rounded-lg border px-2 py-2 text-xs',
                            entry.isPlayer ? 'border-f1-red/40 bg-f1-red/10 text-white' : 'border-white/10 bg-white/5 text-gray-200'
                          )}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DRIVERS.find((driver) => driver.id === entry.driverId)?.color ?? '#fff' }} />
                          <div className="font-black uppercase tracking-[0.14em]">{entry.driverId.toUpperCase()}</div>
                          <div className="font-bold tabular-nums">{formatLapTime(entry.bestLapSeconds)}</div>
                          <div
                            className="text-[11px] uppercase"
                            style={{ color: entry.tyreCompound ? getTyreColor(entry.tyreCompound) : '#cbd5e1' }}
                          >
                            {entry.tyreCompound ? getTyreShortLabel(entry.tyreCompound) : '—'}
                          </div>
                          <div className="text-[11px] text-gray-400">{entry.laps}</div>
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
                    <h2 className="text-xl font-bold">{t('practiceDev.engineerFeedback')}</h2>
                    <p className="text-sm text-gray-400">{t('practiceDev.engineerFeedbackHint')}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 text-sm leading-relaxed text-gray-300">
                {!feedbackVisible
                  ? formatMessage('practiceDev.practiceCompleteSummary', {
                    feedbackQuality: practiceDevelopment.feedbackQuality.toFixed(1),
                    trackPreparation: practiceDevelopment.trackPreparation.toFixed(1)
                  })
                  : !currentPracticePhaseState?.lastFeedback
                    ? hasPreservedKnowledge
                      ? currentPracticePhaseState?.needsFreshFeedback
                        ? t('practiceDev.preservedKnowledgeRefresh')
                        : t('practiceDev.preservedKnowledgeRefine')
                      : currentPracticePhaseState?.needsFreshFeedback
                        ? t('practiceDev.noFreshEngineerRead')
                        : t('practiceDev.noSetupFocusedRunning')
                    : currentPracticePhaseState.needsFreshFeedback
                      ? t('practiceDev.setupChangedNeedFreshRead')
                    : t('practiceDev.learnedWindowHint')}
              </div>
              <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.feedbackQuality')}</div>
                      <div className="mt-2 text-2xl font-black text-white">{practiceDevelopment.feedbackQuality.toFixed(1)}%</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.knowledgeSkill')}</div>
                      <div className="mt-2 text-2xl font-black text-white">{currentKnowledgeSkill}/20</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.15em] text-gray-400">{t('practiceDev.trackPreparation')}</div>
                      <div className="mt-2 text-2xl font-black text-white">{practiceDevelopment.trackPreparation.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {DRIVING_BIAS_FIELDS.map(({ key, format, domain }) => {
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
                              <div className="text-sm text-gray-300">{getBiasLabel(key)}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                {formatMessage('practiceDev.leftRightRange', {
                                  left: format(visibleRange[0]),
                                  right: format(visibleRange[1])
                                })}
                              </div>
                            </div>
                            <div className={clsx('rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-[0.15em]', getDirectionTone(direction))}>
                              {getDirectionDisplayLabel(direction)}
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
                              <span>{getBiasLeftLabel(key)}</span>
                              <span>{getBiasRightLabel(key)}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                              <span>{formatMessage('practiceDev.currentValue', { value: format(currentValue) })}</span>
                              <span>{feedback ? t('practiceDev.learnedWindow') : t('practiceDev.fullDomain')}</span>
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
                <h2 className="text-xl font-bold">{t('practiceDev.lockedSnapshots')}</h2>
                <p className="text-sm text-gray-400">{t('practiceDev.lockedSnapshotsHint')}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-400">{t('practiceDev.q1LockedSnapshot')}</div>
                  <div className="mt-3 space-y-2 text-sm text-gray-200">
                    <div>{t('practiceDev.frontWing')}: {weekend.q1Setup[activeDriverRuntimeId]?.frontWingAngle ?? '—'}</div>
                    <div>{t('practiceDev.rearWing')}: {weekend.q1Setup[activeDriverRuntimeId]?.rearWingAngle ?? '—'}</div>
                    <div>{t('practiceDev.rideHeight')}: {weekend.q1Setup[activeDriverRuntimeId]?.rideHeight ?? '—'}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-400">{t('practiceDev.raceLockedSnapshot')}</div>
                  <div className="mt-3 space-y-2 text-sm text-gray-200">
                    <div>{t('practiceDev.frontWing')}: {weekend.raceSetup[activeDriverRuntimeId]?.frontWingAngle ?? '—'}</div>
                    <div>{t('practiceDev.rearWing')}: {weekend.raceSetup[activeDriverRuntimeId]?.rearWingAngle ?? '—'}</div>
                    <div>{t('practiceDev.rideHeight')}: {weekend.raceSetup[activeDriverRuntimeId]?.rideHeight ?? '—'}</div>
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
                    <h2 className="text-xl font-bold">{t('practiceDev.raceSession')}</h2>
                    <p className="text-sm text-gray-400">{t('practiceDev.raceSessionHint')}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 text-sm leading-relaxed text-gray-300">
                  {t('practiceDev.raceSessionDescription')}
                </div>
                <GlassButton onClick={handleRaceAction} className="w-full">
                  {formatMessage('practiceDev.openTrackLiveRace', { trackName: selectedTrack.name })}
                </GlassButton>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PracticeQualiDev: React.FC = () => <WeekendTimedSessionControl />;
