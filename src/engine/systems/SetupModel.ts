import type { SessionSetupState, SetupFeedback, SetupTuningParameter, TeamSpecs, Track } from '../../types';

export const TUNABLE_SETUP_PARAMETERS: SetupTuningParameter[] = [
  'frontWingAngle',
  'rearWingAngle',
  'rideHeight',
  'suspensionStiffness',
  'toeOut',
  'camber',
  'gearboxSetting',
];

type SetupTargets = Record<SetupTuningParameter, number>;

interface TrackSetupProfile {
  setupTargets: SetupTargets;
  entryRotationTarget: number;
  midRotationTarget: number;
  exitRotationTarget: number;
  straightPriority: number;
  lowSpeedPriority: number;
  highSpeedPriority: number;
  bumpiness: number;
}

export interface SetupPhysicsEffects {
  specAdjustments: Partial<TeamSpecs>;
  straightFactor: number;
  lowSpeedFactor: number;
  mediumSpeedFactor: number;
  highSpeedFactor: number;
  accelerationFactor: number;
  brakingFactor: number;
  entryRotationDelta: number;
  midRotationDelta: number;
  exitRotationDelta: number;
  runPlanBias: number;
  tyreWearFactor: number;
  tyreTempOffset: number;
}

export interface SetupFeedbackCommentary {
  label: string;
  message: string;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalize = (value: number | undefined, fallback = 50): number => (clamp(value ?? fallback, 0, 100) - 50) / 50;
const normalizeTeamSpec = (value: number | undefined, center = 80, span = 20): number =>
  clamp((clamp(value ?? center, 0, 100) - center) / span, -1, 1);

const setupValue = (setup: Pick<SessionSetupState, SetupTuningParameter>, key: SetupTuningParameter): number =>
  clamp(setup[key] ?? 50, 0, 100);

const TRACK_SETUP_OVERRIDES: Partial<Record<Track['id'], Partial<TrackSetupProfile>>> = {
  'monza-gp': {
    setupTargets: {
      frontWingAngle: 20,
      rearWingAngle: 16,
      rideHeight: 30,
      suspensionStiffness: 62,
      toeOut: 58,
      camber: 60,
      gearboxSetting: 24,
    },
    entryRotationTarget: 0.12,
    midRotationTarget: -0.04,
    exitRotationTarget: -0.18,
    straightPriority: 0.95,
    lowSpeedPriority: 0.4,
    highSpeedPriority: 0.45,
    bumpiness: 0.2,
  },
  'monaco-gp': {
    setupTargets: {
      frontWingAngle: 88,
      rearWingAngle: 92,
      rideHeight: 74,
      suspensionStiffness: 26,
      toeOut: 66,
      camber: 42,
      gearboxSetting: 78,
    },
    entryRotationTarget: 0.22,
    midRotationTarget: 0.12,
    exitRotationTarget: -0.1,
    straightPriority: 0.1,
    lowSpeedPriority: 0.95,
    highSpeedPriority: 0.15,
    bumpiness: 0.9,
  },
  'singapore-gp': {
    setupTargets: {
      frontWingAngle: 82,
      rearWingAngle: 88,
      rideHeight: 68,
      suspensionStiffness: 34,
      toeOut: 62,
      camber: 46,
      gearboxSetting: 72,
    },
    entryRotationTarget: 0.16,
    midRotationTarget: 0.08,
    exitRotationTarget: -0.08,
    straightPriority: 0.18,
    lowSpeedPriority: 0.9,
    highSpeedPriority: 0.18,
    bumpiness: 0.85,
  },
  'silverstone-gp': {
    setupTargets: {
      frontWingAngle: 64,
      rearWingAngle: 60,
      rideHeight: 38,
      suspensionStiffness: 66,
      toeOut: 54,
      camber: 64,
      gearboxSetting: 40,
    },
    entryRotationTarget: -0.02,
    midRotationTarget: -0.12,
    exitRotationTarget: -0.04,
    straightPriority: 0.42,
    lowSpeedPriority: 0.35,
    highSpeedPriority: 0.95,
    bumpiness: 0.25,
  },
  'spa-gp': {
    setupTargets: {
      frontWingAngle: 42,
      rearWingAngle: 40,
      rideHeight: 42,
      suspensionStiffness: 58,
      toeOut: 56,
      camber: 60,
      gearboxSetting: 34,
    },
    entryRotationTarget: 0.04,
    midRotationTarget: -0.08,
    exitRotationTarget: -0.08,
    straightPriority: 0.8,
    lowSpeedPriority: 0.35,
    highSpeedPriority: 0.78,
    bumpiness: 0.25,
  },
  'bahrain-gp': {
    setupTargets: {
      frontWingAngle: 56,
      rearWingAngle: 62,
      rideHeight: 54,
      suspensionStiffness: 44,
      toeOut: 58,
      camber: 54,
      gearboxSetting: 58,
    },
    entryRotationTarget: 0.08,
    midRotationTarget: 0,
    exitRotationTarget: -0.12,
    straightPriority: 0.45,
    lowSpeedPriority: 0.7,
    highSpeedPriority: 0.25,
    bumpiness: 0.45,
  },
  'china-gp': {
    setupTargets: {
      frontWingAngle: 42,
      rearWingAngle: 50,
      rideHeight: 48,
      suspensionStiffness: 42,
      toeOut: 62,
      camber: 58,
      gearboxSetting: 50,
    },
    entryRotationTarget: 0.12,
    midRotationTarget: -0.02,
    exitRotationTarget: -0.1,
    straightPriority: 0.55,
    lowSpeedPriority: 0.55,
    highSpeedPriority: 0.45,
    bumpiness: 0.35,
  },
  'melbourne-gp': {
    setupTargets: {
      frontWingAngle: 48,
      rearWingAngle: 52,
      rideHeight: 50,
      suspensionStiffness: 46,
      toeOut: 58,
      camber: 56,
      gearboxSetting: 48,
    },
    entryRotationTarget: 0.08,
    midRotationTarget: 0,
    exitRotationTarget: -0.06,
    straightPriority: 0.42,
    lowSpeedPriority: 0.55,
    highSpeedPriority: 0.38,
    bumpiness: 0.48,
  },
  'mexico-city-gp': {
    setupTargets: {
      frontWingAngle: 62,
      rearWingAngle: 68,
      rideHeight: 54,
      suspensionStiffness: 42,
      toeOut: 58,
      camber: 52,
      gearboxSetting: 36,
    },
    entryRotationTarget: 0.1,
    midRotationTarget: 0.02,
    exitRotationTarget: -0.08,
    straightPriority: 0.58,
    lowSpeedPriority: 0.72,
    highSpeedPriority: 0.15,
    bumpiness: 0.38,
  },
  'suzuka-gp': {
    setupTargets: {
      frontWingAngle: 58,
      rearWingAngle: 56,
      rideHeight: 42,
      suspensionStiffness: 64,
      toeOut: 56,
      camber: 62,
      gearboxSetting: 38,
    },
    entryRotationTarget: 0,
    midRotationTarget: -0.1,
    exitRotationTarget: -0.06,
    straightPriority: 0.52,
    lowSpeedPriority: 0.42,
    highSpeedPriority: 0.88,
    bumpiness: 0.3,
  },
  'jeddah-gp': {
    setupTargets: {
      frontWingAngle: 46,
      rearWingAngle: 44,
      rideHeight: 46,
      suspensionStiffness: 58,
      toeOut: 54,
      camber: 60,
      gearboxSetting: 34,
    },
    entryRotationTarget: 0.04,
    midRotationTarget: -0.08,
    exitRotationTarget: -0.1,
    straightPriority: 0.78,
    lowSpeedPriority: 0.24,
    highSpeedPriority: 0.82,
    bumpiness: 0.32,
  },
  'miami-gp': {
    setupTargets: {
      frontWingAngle: 54,
      rearWingAngle: 58,
      rideHeight: 52,
      suspensionStiffness: 48,
      toeOut: 56,
      camber: 56,
      gearboxSetting: 52,
    },
    entryRotationTarget: 0.08,
    midRotationTarget: 0.01,
    exitRotationTarget: -0.09,
    straightPriority: 0.6,
    lowSpeedPriority: 0.5,
    highSpeedPriority: 0.36,
    bumpiness: 0.4,
  },
  'imola-gp': {
    setupTargets: {
      frontWingAngle: 60,
      rearWingAngle: 64,
      rideHeight: 50,
      suspensionStiffness: 52,
      toeOut: 58,
      camber: 58,
      gearboxSetting: 54,
    },
    entryRotationTarget: 0.1,
    midRotationTarget: 0,
    exitRotationTarget: -0.08,
    straightPriority: 0.44,
    lowSpeedPriority: 0.62,
    highSpeedPriority: 0.35,
    bumpiness: 0.34,
  },
  'catalunya-gp': {
    setupTargets: {
      frontWingAngle: 50,
      rearWingAngle: 52,
      rideHeight: 40,
      suspensionStiffness: 62,
      toeOut: 54,
      camber: 62,
      gearboxSetting: 42,
    },
    entryRotationTarget: 0.02,
    midRotationTarget: -0.06,
    exitRotationTarget: -0.08,
    straightPriority: 0.5,
    lowSpeedPriority: 0.35,
    highSpeedPriority: 0.74,
    bumpiness: 0.22,
  },
  'montreal-gp': {
    setupTargets: {
      frontWingAngle: 56,
      rearWingAngle: 60,
      rideHeight: 56,
      suspensionStiffness: 40,
      toeOut: 60,
      camber: 52,
      gearboxSetting: 62,
    },
    entryRotationTarget: 0.14,
    midRotationTarget: 0.04,
    exitRotationTarget: -0.1,
    straightPriority: 0.58,
    lowSpeedPriority: 0.64,
    highSpeedPriority: 0.2,
    bumpiness: 0.5,
  },
  'spielberg-gp': {
    setupTargets: {
      frontWingAngle: 44,
      rearWingAngle: 46,
      rideHeight: 38,
      suspensionStiffness: 60,
      toeOut: 56,
      camber: 60,
      gearboxSetting: 40,
    },
    entryRotationTarget: 0.06,
    midRotationTarget: -0.06,
    exitRotationTarget: -0.1,
    straightPriority: 0.72,
    lowSpeedPriority: 0.34,
    highSpeedPriority: 0.62,
    bumpiness: 0.28,
  },
  'hungaroring-gp': {
    setupTargets: {
      frontWingAngle: 78,
      rearWingAngle: 82,
      rideHeight: 62,
      suspensionStiffness: 34,
      toeOut: 64,
      camber: 46,
      gearboxSetting: 74,
    },
    entryRotationTarget: 0.2,
    midRotationTarget: 0.1,
    exitRotationTarget: -0.06,
    straightPriority: 0.16,
    lowSpeedPriority: 0.92,
    highSpeedPriority: 0.12,
    bumpiness: 0.62,
  },
  'zandvoort-gp': {
    setupTargets: {
      frontWingAngle: 66,
      rearWingAngle: 70,
      rideHeight: 52,
      suspensionStiffness: 56,
      toeOut: 60,
      camber: 64,
      gearboxSetting: 50,
    },
    entryRotationTarget: 0.06,
    midRotationTarget: -0.04,
    exitRotationTarget: -0.06,
    straightPriority: 0.34,
    lowSpeedPriority: 0.58,
    highSpeedPriority: 0.66,
    bumpiness: 0.48,
  },
  'baku-gp': {
    setupTargets: {
      frontWingAngle: 38,
      rearWingAngle: 44,
      rideHeight: 56,
      suspensionStiffness: 40,
      toeOut: 58,
      camber: 52,
      gearboxSetting: 32,
    },
    entryRotationTarget: 0.12,
    midRotationTarget: 0.02,
    exitRotationTarget: -0.14,
    straightPriority: 0.9,
    lowSpeedPriority: 0.52,
    highSpeedPriority: 0.18,
    bumpiness: 0.52,
  },
  'austin-gp': {
    setupTargets: {
      frontWingAngle: 58,
      rearWingAngle: 62,
      rideHeight: 54,
      suspensionStiffness: 50,
      toeOut: 58,
      camber: 58,
      gearboxSetting: 56,
    },
    entryRotationTarget: 0.1,
    midRotationTarget: -0.02,
    exitRotationTarget: -0.08,
    straightPriority: 0.46,
    lowSpeedPriority: 0.56,
    highSpeedPriority: 0.48,
    bumpiness: 0.4,
  },
  'interlagos-gp': {
    setupTargets: {
      frontWingAngle: 62,
      rearWingAngle: 66,
      rideHeight: 56,
      suspensionStiffness: 46,
      toeOut: 60,
      camber: 56,
      gearboxSetting: 60,
    },
    entryRotationTarget: 0.12,
    midRotationTarget: 0.02,
    exitRotationTarget: -0.06,
    straightPriority: 0.38,
    lowSpeedPriority: 0.66,
    highSpeedPriority: 0.3,
    bumpiness: 0.44,
  },
  'las-vegas-gp': {
    setupTargets: {
      frontWingAngle: 24,
      rearWingAngle: 20,
      rideHeight: 34,
      suspensionStiffness: 64,
      toeOut: 54,
      camber: 58,
      gearboxSetting: 22,
    },
    entryRotationTarget: 0.08,
    midRotationTarget: -0.08,
    exitRotationTarget: -0.2,
    straightPriority: 0.95,
    lowSpeedPriority: 0.22,
    highSpeedPriority: 0.28,
    bumpiness: 0.26,
  },
  'qatar-gp': {
    setupTargets: {
      frontWingAngle: 52,
      rearWingAngle: 54,
      rideHeight: 44,
      suspensionStiffness: 64,
      toeOut: 55,
      camber: 66,
      gearboxSetting: 44,
    },
    entryRotationTarget: -0.02,
    midRotationTarget: -0.1,
    exitRotationTarget: -0.08,
    straightPriority: 0.48,
    lowSpeedPriority: 0.3,
    highSpeedPriority: 0.9,
    bumpiness: 0.24,
  },
  'abu-dhabi-gp': {
    setupTargets: {
      frontWingAngle: 52,
      rearWingAngle: 58,
      rideHeight: 50,
      suspensionStiffness: 42,
      toeOut: 58,
      camber: 54,
      gearboxSetting: 54,
    },
    entryRotationTarget: 0.08,
    midRotationTarget: -0.02,
    exitRotationTarget: -0.1,
    straightPriority: 0.5,
    lowSpeedPriority: 0.65,
    highSpeedPriority: 0.18,
    bumpiness: 0.28,
  },
};

function buildBaseTrackSetupProfile(track: Track): TrackSetupProfile {
  const total = Math.max(1, track.sectors.length);
  const straightRatio = track.sectors.filter((sector) => sector.type === 'straight').length / total;
  const lowRatio = track.sectors.filter((sector) => sector.type === 'corner_low_speed').length / total;
  const mediumRatio = track.sectors.filter((sector) => sector.type === 'corner_medium_speed').length / total;
  const highRatio = track.sectors.filter((sector) => sector.type === 'corner_high_speed').length / total;
  const straightPriority = clamp(straightRatio * 1.4 + (1 - track.overtakingDifficulty) * 0.15, 0.1, 0.95);
  const lowSpeedPriority = clamp(lowRatio * 1.6 + track.trackDifficulty * 0.15, 0.15, 0.95);
  const highSpeedPriority = clamp(highRatio * 1.8 + mediumRatio * 0.3, 0.1, 0.95);
  const bumpiness = clamp(track.trackDifficulty * 0.55 + lowRatio * 0.25, 0.1, 0.9);

  return {
    setupTargets: {
      frontWingAngle: clamp(48 + lowSpeedPriority * 30 - straightPriority * 25 + highSpeedPriority * 10, 10, 90),
      rearWingAngle: clamp(52 + lowSpeedPriority * 28 - straightPriority * 20 + highSpeedPriority * 14, 12, 92),
      rideHeight: clamp(44 + bumpiness * 28 - highSpeedPriority * 8, 18, 84),
      suspensionStiffness: clamp(54 + highSpeedPriority * 18 - bumpiness * 30, 18, 82),
      toeOut: clamp(50 + lowSpeedPriority * 14 - highSpeedPriority * 6, 30, 72),
      camber: clamp(48 + highSpeedPriority * 18 + mediumRatio * 8 - bumpiness * 10, 34, 72),
      gearboxSetting: clamp(48 + lowSpeedPriority * 24 - straightPriority * 26, 16, 82),
    },
    entryRotationTarget: clamp(lowSpeedPriority * 0.22 - highSpeedPriority * 0.12, -0.18, 0.24),
    midRotationTarget: clamp(mediumRatio * 0.12 - highSpeedPriority * 0.14, -0.16, 0.14),
    exitRotationTarget: clamp(-0.08 - straightPriority * 0.08 + lowSpeedPriority * 0.04, -0.24, 0.08),
    straightPriority,
    lowSpeedPriority,
    highSpeedPriority,
    bumpiness,
  };
}

export function getTrackSetupProfile(track: Track): TrackSetupProfile {
  const base = buildBaseTrackSetupProfile(track);
  const override = TRACK_SETUP_OVERRIDES[track.id];

  if (!override) {
    return base;
  }

  return {
    setupTargets: {
      ...base.setupTargets,
      ...override.setupTargets,
    },
    entryRotationTarget: override.entryRotationTarget ?? base.entryRotationTarget,
    midRotationTarget: override.midRotationTarget ?? base.midRotationTarget,
    exitRotationTarget: override.exitRotationTarget ?? base.exitRotationTarget,
    straightPriority: override.straightPriority ?? base.straightPriority,
    lowSpeedPriority: override.lowSpeedPriority ?? base.lowSpeedPriority,
    highSpeedPriority: override.highSpeedPriority ?? base.highSpeedPriority,
    bumpiness: override.bumpiness ?? base.bumpiness,
  };
}

function getSetupRotations(setup: Pick<SessionSetupState, SetupTuningParameter>): {
  entryRotation: number;
  midRotation: number;
  exitRotation: number;
  straightLineBias: number;
  tractionBias: number;
  runPlanBias: number;
  bottomingRisk: number;
  wearBias: number;
  thermalBias: number;
  specAdjustments: Partial<TeamSpecs>;
  lowSpeedFactor: number;
  mediumSpeedFactor: number;
  highSpeedFactor: number;
} {
  const frontWing = normalize(setup.frontWingAngle);
  const rearWing = normalize(setup.rearWingAngle);
  const rideHeight = normalize(setup.rideHeight);
  const suspension = normalize(setup.suspensionStiffness);
  const toeOut = normalize(setup.toeOut);
  const camber = normalize(setup.camber);
  const gearbox = normalize(setup.gearboxSetting);
  const aeroBalance = frontWing - rearWing;
  const dragBias = ((frontWing + rearWing) / 2) * 0.8 - gearbox * 0.2;
  const bottomingRisk = clamp((-rideHeight + suspension * 0.35 + (frontWing + rearWing) * 0.15 + camber * 0.1) * 0.5 + 0.2, 0, 1);
  const entryRotation = aeroBalance * 0.5 + toeOut * 0.32 - suspension * 0.08;
  const midRotation = aeroBalance * 0.24 + camber * 0.28 + toeOut * 0.12;
  const exitRotation = aeroBalance * 0.14 + toeOut * 0.08 - rearWing * 0.18 - suspension * 0.24 + gearbox * 0.12;
  const tractionBias = rearWing * 0.24 - suspension * 0.3 - camber * 0.12 + gearbox * 0.18;
  const runPlanBias = clamp((-rideHeight * 0.45) + (-suspension * 0.35) + (camber * 0.18) + (toeOut * 0.14), -1, 1);
  const wearBias = Math.abs(toeOut) * 0.18 + Math.abs(camber) * 0.2 + Math.max(0, suspension) * 0.08;
  const thermalBias = dragBias * 0.04 + wearBias * 0.22 + runPlanBias * 0.1;

  return {
    entryRotation,
    midRotation,
    exitRotation,
    straightLineBias: -dragBias,
    tractionBias,
    runPlanBias,
    bottomingRisk,
    wearBias,
    thermalBias,
    specAdjustments: {
      drag_reduction: clamp((-dragBias * 14) + (1 - Math.abs(toeOut)) * 1.5, -14, 14),
      cornering_low: clamp((frontWing + rearWing) * 6 + tractionBias * 10 - bottomingRisk * 4, -12, 16),
      cornering_mid: clamp((frontWing + rearWing) * 8 + camber * 7 + toeOut * 3 - bottomingRisk * 4, -12, 18),
      cornering_high: clamp((frontWing + rearWing) * 10 + camber * 8 - rideHeight * 4 - bottomingRisk * 8, -16, 20),
      acceleration: clamp(gearbox * 14 + tractionBias * 12 - dragBias * 2, -14, 18),
      braking: clamp(camber * 3 - toeOut * 4 - bottomingRisk * 6 + rearWing * 3, -12, 10),
      cooling: clamp(-thermalBias * 8, -10, 4),
      lifespan: clamp(-wearBias * 10, -12, 3),
    },
    lowSpeedFactor: 1 + (tractionBias * 0.05) + ((frontWing + rearWing) * 0.02),
    mediumSpeedFactor: 1 + ((frontWing + rearWing) * 0.035) + (camber * 0.02),
    highSpeedFactor: 1 + ((frontWing + rearWing) * 0.04) - (rideHeight * 0.02) - (bottomingRisk * 0.05),
  };
}

function applySpecAdjustments(teamSpecs: TeamSpecs | undefined, adjustments: Partial<TeamSpecs>): TeamSpecs | undefined {
  if (!teamSpecs) {
    return undefined;
  }

  const merged: TeamSpecs = { ...teamSpecs };

  for (const [key, delta] of Object.entries(adjustments) as Array<[keyof TeamSpecs, number]>) {
    merged[key] = clamp((merged[key] ?? 0) + delta, 0, 100);
  }

  return merged;
}

interface TeamDevelopmentBiasEffects {
  runPlanBiasShift: number;
  straightFactorShift: number;
  lowSpeedFactorShift: number;
  highSpeedFactorShift: number;
  accelerationFactorShift: number;
  brakingFactorShift: number;
  tyreWearShift: number;
  tyreTempOffset: number;
}

function getTeamDevelopmentBiasEffects(teamSpecs?: TeamSpecs): TeamDevelopmentBiasEffects {
  if (!teamSpecs) {
    return {
      runPlanBiasShift: 0,
      straightFactorShift: 0,
      lowSpeedFactorShift: 0,
      highSpeedFactorShift: 0,
      accelerationFactorShift: 0,
      brakingFactorShift: 0,
      tyreWearShift: 0,
      tyreTempOffset: 0,
    };
  }

  const acceleration = normalizeTeamSpec(teamSpecs.acceleration);
  const braking = normalizeTeamSpec(teamSpecs.braking);
  const dragReduction = normalizeTeamSpec(teamSpecs.drag_reduction);
  const corneringLow = normalizeTeamSpec(teamSpecs.cornering_low);
  const corneringMid = normalizeTeamSpec(teamSpecs.cornering_mid);
  const corneringHigh = normalizeTeamSpec(teamSpecs.cornering_high);
  const ersEfficiency = normalizeTeamSpec(teamSpecs.ers_efficiency);
  const cooling = normalizeTeamSpec(teamSpecs.cooling);
  const lifespan = normalizeTeamSpec(teamSpecs.lifespan);
  const drsEfficiency = normalizeTeamSpec(teamSpecs.drs_efficiency);

  const qualiStack = acceleration * 0.42 + dragReduction * 0.34 + drsEfficiency * 0.28 + ersEfficiency * 0.18;
  const longRunStack = cooling * 0.4 + lifespan * 0.44 + braking * 0.16;

  return {
    runPlanBiasShift: clamp((qualiStack - longRunStack) * 0.16, -0.28, 0.28),
    straightFactorShift: clamp((dragReduction * 0.018) + (drsEfficiency * 0.014) + (acceleration * 0.008), -0.035, 0.04),
    lowSpeedFactorShift: clamp((corneringLow * 0.016) + (braking * 0.008), -0.03, 0.03),
    highSpeedFactorShift: clamp((corneringHigh * 0.018) + (corneringMid * 0.006) - (cooling * 0.003), -0.03, 0.03),
    accelerationFactorShift: clamp((acceleration * 0.017) + (ersEfficiency * 0.012), -0.03, 0.035),
    brakingFactorShift: clamp(braking * 0.01, -0.018, 0.018),
    tyreWearShift: clamp(-(lifespan * 0.05) - (cooling * 0.015) + Math.max(0, qualiStack - longRunStack) * 0.02, -0.06, 0.03),
    tyreTempOffset: clamp((-cooling * 1.3) + (qualiStack - longRunStack) * 0.9, -1.6, 1.6),
  };
}

export function buildSetupPhysicsEffects(track: Track, setup: Pick<SessionSetupState, SetupTuningParameter>, teamSpecs?: TeamSpecs): SetupPhysicsEffects {
  const profile = getTrackSetupProfile(track);
  const rotations = getSetupRotations(setup);
  const teamDevelopmentBias = getTeamDevelopmentBiasEffects(teamSpecs);
  const rideHeight = normalize(setup.rideHeight);
  const suspension = normalize(setup.suspensionStiffness);
  const targetRideHeight = normalize(profile.setupTargets.rideHeight);
  const targetSuspension = normalize(profile.setupTargets.suspensionStiffness);
  const rideHeightDeltaFromTarget = rideHeight - targetRideHeight;
  const suspensionDeltaFromTarget = suspension - targetSuspension;
  const bottomingPenalty = rotations.bottomingRisk * (0.4 + profile.highSpeedPriority * 0.6) * (1 - profile.bumpiness * 0.35);
  const entryRotationDelta = rotations.entryRotation - profile.entryRotationTarget;
  const midRotationDelta = rotations.midRotation - profile.midRotationTarget;
  const exitRotationDelta = rotations.exitRotation - profile.exitRotationTarget;
  const runPlanBias = teamSpecs
    ? clamp(rotations.runPlanBias * 0.45 + teamDevelopmentBias.runPlanBiasShift, -1, 1)
    : rotations.runPlanBias;
  const runPlanPaceBoost = runPlanBias * 0.018;
  const runPlanWearDelta = runPlanBias * 0.15;
  const lowDragWearPenalty = Math.max(0, -rideHeightDeltaFromTarget) * 0.03 + Math.max(0, suspensionDeltaFromTarget) * 0.02;

  return {
    specAdjustments: applySpecAdjustments(teamSpecs, rotations.specAdjustments) ?? ({} as Partial<TeamSpecs>),
    straightFactor: 1 + rotations.straightLineBias * 0.03 - profile.straightPriority * bottomingPenalty * 0.015 + runPlanPaceBoost * 0.8 + teamDevelopmentBias.straightFactorShift,
    lowSpeedFactor: rotations.lowSpeedFactor - Math.max(0, -rideHeight) * profile.bumpiness * 0.025 - Math.max(0, suspension) * profile.bumpiness * 0.02 + runPlanPaceBoost * 0.55 + teamDevelopmentBias.lowSpeedFactorShift,
    mediumSpeedFactor: rotations.mediumSpeedFactor - bottomingPenalty * 0.015 + runPlanPaceBoost * 0.65,
    highSpeedFactor: rotations.highSpeedFactor - bottomingPenalty * 0.03 + runPlanPaceBoost * 0.6 + teamDevelopmentBias.highSpeedFactorShift,
    accelerationFactor: 1 + rotations.tractionBias * 0.11 - bottomingPenalty * 0.01 + runPlanPaceBoost * 0.45 + teamDevelopmentBias.accelerationFactorShift,
    brakingFactor: 1 + ((rotations.specAdjustments.braking ?? 0) / 100) + teamDevelopmentBias.brakingFactorShift,
    entryRotationDelta,
    midRotationDelta,
    exitRotationDelta,
    runPlanBias,
    tyreWearFactor: 1 + rotations.wearBias * 0.18 + bottomingPenalty * 0.08 + profile.bumpiness * Math.max(0, suspension) * 0.08 + runPlanWearDelta + lowDragWearPenalty + teamDevelopmentBias.tyreWearShift,
    tyreTempOffset: rotations.thermalBias * 7 + bottomingPenalty * 6 + runPlanBias * 3.5 + teamDevelopmentBias.tyreTempOffset,
  };
}

export function getIdealSetup(track: Track): SetupTargets {
  return getTrackSetupProfile(track).setupTargets;
}

export function buildFeedbackMap(track: Track, setup: Pick<SessionSetupState, SetupTuningParameter>): Partial<Record<SetupTuningParameter, SetupFeedback>> {
  const targets = getIdealSetup(track);
  const result: Partial<Record<SetupTuningParameter, SetupFeedback>> = {};

  for (const key of TUNABLE_SETUP_PARAMETERS) {
    const currentValue = setupValue(setup, key);
    const target = targets[key];
    const diff = Math.abs(currentValue - target);
    const status: SetupFeedback['status'] =
      diff <= 3 ? 'optimal' : diff <= 8 ? 'good' : diff <= 16 ? 'okay' : 'poor';
    const width = diff <= 3 ? 4 : diff <= 8 ? 8 : diff <= 16 ? 14 : 22;
    result[key] = {
      optimalRange: [clamp(target - width, 0, 100), clamp(target + width, 0, 100)],
      currentValue,
      status,
    };
  }

  return result;
}

export function buildHandlingFeedback(track: Track, setup: Pick<SessionSetupState, SetupTuningParameter>): SetupFeedbackCommentary[] {
  const profile = getTrackSetupProfile(track);
  const rotations = getSetupRotations(setup);
  const comments: SetupFeedbackCommentary[] = [];
  const entryDelta = rotations.entryRotation - profile.entryRotationTarget;
  const midDelta = rotations.midRotation - profile.midRotationTarget;
  const exitDelta = rotations.exitRotation - profile.exitRotationTarget;

  if (entryDelta < -0.08) {
    comments.push({ label: 'entry-understeer', message: 'The front does not bite enough on corner entry for this track.' });
  } else if (entryDelta > 0.1) {
    comments.push({ label: 'entry-oversteer', message: 'The rear feels too lively on corner entry for the fast changes of direction here.' });
  }

  if (midDelta < -0.08) {
    comments.push({ label: 'mid-understeer', message: 'Mid-corner balance is washing wide instead of holding the intended line.' });
  } else if (midDelta > 0.1) {
    comments.push({ label: 'mid-oversteer', message: 'Mid-corner balance is too sharp and risks overheating the rear axle.' });
  }

  if (exitDelta < -0.08) {
    comments.push({ label: 'exit-understeer', message: 'The car is reluctant to rotate on exit, costing time before the next straight.' });
  } else if (exitDelta > 0.08) {
    comments.push({ label: 'exit-oversteer', message: 'Rear traction is fragile on corner exit and needs more support.' });
  }

  const ideal = profile.setupTargets;
  const frontWingDelta = setupValue(setup, 'frontWingAngle') - ideal.frontWingAngle;
  const rearWingDelta = setupValue(setup, 'rearWingAngle') - ideal.rearWingAngle;
  const rideHeightDelta = setupValue(setup, 'rideHeight') - ideal.rideHeight;
  const suspensionDelta = setupValue(setup, 'suspensionStiffness') - ideal.suspensionStiffness;

  if (frontWingDelta < -10) {
    comments.push({ label: 'front-wing-low', message: 'Front wing is too trimmed for the turn-in this circuit rewards.' });
  } else if (frontWingDelta > 10) {
    comments.push({ label: 'front-wing-high', message: 'Front wing is carrying more drag than this track really wants.' });
  }

  if (rearWingDelta < -10) {
    comments.push({ label: 'rear-wing-low', message: 'Rear wing support is too low for stable exits over a full stint.' });
  } else if (rearWingDelta > 10) {
    comments.push({ label: 'rear-wing-high', message: 'Rear wing is protecting the rear axle, but it is costing too much on the straights.' });
  }

  if (rideHeightDelta < -10) {
    comments.push({ label: 'ride-height-low', message: 'Ride height is flirting with bottoming and upsetting the platform.' });
  } else if (rideHeightDelta > 10) {
    comments.push({ label: 'ride-height-high', message: 'Ride height is leaving aero load on the table.' });
  }

  if (suspensionDelta < -10) {
    comments.push({ label: 'suspension-soft', message: 'The platform feels too soft for the fast load changes of this layout.' });
  } else if (suspensionDelta > 10) {
    comments.push({ label: 'suspension-stiff', message: 'The car is too stiff over bumps and kerbs for this track.' });
  }

  return comments.slice(0, 4);
}
