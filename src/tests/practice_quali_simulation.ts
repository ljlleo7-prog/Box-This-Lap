import { MONACO } from '../data/tracks/monaco';
import { MONZA } from '../data/tracks/monza';
import { CHINA } from '../data/tracks/china';
import { SetupFeedbackSystem } from '../engine/systems/SetupFeedbackSystem';
import { buildSetupPhysicsEffects } from '../engine/systems/SetupModel';
import { TyreManager } from '../engine/systems/TyreManager';
import { WeekendManager } from '../engine/systems/WeekendManager';
import type { OfflineWeekend, SessionSetupState, SetupFeedback, SetupTuningParameter, TeamSpecs } from '../types';

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    fail(message);
  }
}

interface QualifyingValidationMetrics {
  straightDelta: number;
  lowSpeedDelta: number;
  mediumSpeedDelta: number;
  highSpeedDelta: number;
  topSpeedProxy: number;
  accelerationProxy: number;
  cornerComposite: number;
  consistencyProxy: number;
  qualifyingScore: number;
}

interface QualifyingValidationRow {
  label: string;
  setup: SessionSetupState;
  metrics: QualifyingValidationMetrics;
}

interface RaceValidationMetrics {
  straightDelta: number;
  lowSpeedDelta: number;
  mediumSpeedDelta: number;
  highSpeedDelta: number;
  consistencyProxy: number;
  stintDegradation: number;
  qualifyingScore: number;
  raceStintScore: number;
}

interface RaceValidationRow {
  label: string;
  setup: SessionSetupState;
  metrics: RaceValidationMetrics;
}

const QUALIFYING_VALIDATION_TOLERANCES = {
  sectorDelta: 0.0015,
  topSpeedProxy: 0.004,
  cornerComposite: 0.006,
  consistencyProxy: 0.03,
  qualifyingScore: 0.01,
};

const RACE_VALIDATION_TOLERANCES = {
  sectorDelta: 0.0015,
  stintDegradation: 0.003,
  scoreDelta: 0.005,
};

function clampSetupValue(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function offsetSetup(
  base: SessionSetupState,
  offsets: Partial<Record<SetupTuningParameter, number>>
): SessionSetupState {
  return {
    frontWingAngle: clampSetupValue((base.frontWingAngle ?? 50) + (offsets.frontWingAngle ?? 0)),
    rearWingAngle: clampSetupValue((base.rearWingAngle ?? 50) + (offsets.rearWingAngle ?? 0)),
    rideHeight: clampSetupValue((base.rideHeight ?? 50) + (offsets.rideHeight ?? 0)),
    suspensionStiffness: clampSetupValue((base.suspensionStiffness ?? 50) + (offsets.suspensionStiffness ?? 0)),
    toeOut: clampSetupValue((base.toeOut ?? 50) + (offsets.toeOut ?? 0)),
    camber: clampSetupValue((base.camber ?? 50) + (offsets.camber ?? 0)),
    gearboxSetting: clampSetupValue((base.gearboxSetting ?? 50) + (offsets.gearboxSetting ?? 0)),
  };
}

function toSessionSetup(setup: Partial<Record<SetupTuningParameter, number>>): SessionSetupState {
  return {
    frontWingAngle: setup.frontWingAngle,
    rearWingAngle: setup.rearWingAngle,
    rideHeight: setup.rideHeight,
    suspensionStiffness: setup.suspensionStiffness,
    toeOut: setup.toeOut,
    camber: setup.camber,
    gearboxSetting: setup.gearboxSetting,
  };
}

function buildValidationSetupVariants(idealSetup: SessionSetupState): Record<string, SessionSetupState> {
  return {
    ideal: idealSetup,
    lowDrag: offsetSetup(idealSetup, {
      frontWingAngle: -12,
      rearWingAngle: -12,
      rideHeight: -10,
      suspensionStiffness: 10,
      toeOut: -4,
      camber: -4,
      gearboxSetting: -8,
    }),
    highDownforce: offsetSetup(idealSetup, {
      frontWingAngle: 12,
      rearWingAngle: 12,
      rideHeight: 8,
      suspensionStiffness: -10,
      toeOut: 4,
      camber: 4,
      gearboxSetting: 8,
    }),
    offBalance: offsetSetup(idealSetup, {
      frontWingAngle: 16,
      rearWingAngle: -18,
      rideHeight: -16,
      suspensionStiffness: 14,
      toeOut: -10,
      camber: 12,
      gearboxSetting: -10,
    }),
  };
}

function createWeekend(baseSetup: SessionSetupState): OfflineWeekend {
  return {
    id: 'dev-practice-quali',
    round: 1,
    trackId: MONACO.id,
    currentPhase: 'pre_weekend',
    completedSessions: [],
    selectedTeamId: 'mclaren',
    fp1Setup: { nor: { ...baseSetup } },
    fp2Setup: { nor: { ...baseSetup } },
    fp3Setup: { nor: { ...baseSetup } },
    q1Setup: {},
    q2Setup: {},
    q3Setup: {},
    raceSetup: {},
    tyreAllocations: { nor: TyreManager.initializeAllocation('nor') },
    setupKnowledge: {},
    sessionSummaries: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function runPracticeKnowledgeProbe(): void {
  const monacoIdeal = SetupFeedbackSystem.generateIdealSetup(MONACO);
  const monzaIdeal = SetupFeedbackSystem.generateIdealSetup(MONZA);
  const practiceSetup = toSessionSetup(monzaIdeal);

  const result = SetupFeedbackSystem.evaluateSetup(
    MONACO,
    practiceSetup,
    {} as Partial<Record<SetupTuningParameter, SetupFeedback>>,
    monacoIdeal,
    18
  );

  const poorParameters = Object.values(result.knowledge).filter((feedback) => feedback?.status === 'poor').length;

  assert(result.comments.length > 0, 'Practice feedback should produce actionable setup comments.');
  assert(poorParameters >= 2, 'Practice feedback should detect several poor parameters on a wrong-track setup.');
}

function runTrackPerformanceProbe(): void {
  const monacoIdeal = toSessionSetup(SetupFeedbackSystem.generateIdealSetup(MONACO));
  const monzaIdeal = toSessionSetup(SetupFeedbackSystem.generateIdealSetup(MONZA));
  const qualiBiased = toSessionSetup({
    frontWingAngle: 50,
    rearWingAngle: 50,
    rideHeight: 28,
    suspensionStiffness: 30,
    toeOut: 58,
    camber: 62,
    gearboxSetting: 50,
  });
  const longRunBiased = toSessionSetup({
    frontWingAngle: 50,
    rearWingAngle: 50,
    rideHeight: 72,
    suspensionStiffness: 72,
    toeOut: 42,
    camber: 40,
    gearboxSetting: 50,
  });

  const monacoGood = buildSetupPhysicsEffects(MONACO, monacoIdeal);
  const monacoBad = buildSetupPhysicsEffects(MONACO, monzaIdeal);
  const monzaGood = buildSetupPhysicsEffects(MONZA, monzaIdeal);
  const monzaBad = buildSetupPhysicsEffects(MONZA, monacoIdeal);
  const qualiEffects = buildSetupPhysicsEffects(MONACO, qualiBiased);
  const longRunEffects = buildSetupPhysicsEffects(MONACO, longRunBiased);

  assert(monacoGood.lowSpeedFactor > monacoBad.lowSpeedFactor, 'Monaco setup should improve low-speed balance over a Monza-biased setup.');
  assert(monzaGood.straightFactor > monzaBad.straightFactor, 'Monza setup should improve straight-line efficiency over a Monaco-biased setup.');
  assert(Math.abs(monacoGood.entryRotationDelta) < Math.abs(monacoBad.entryRotationDelta), 'Monaco ideal setup should be closer to the required entry rotation target.');
  assert(Math.abs(monzaGood.exitRotationDelta) < Math.abs(monzaBad.exitRotationDelta), 'Monza ideal setup should be closer to the required exit balance target.');
  assert(qualiEffects.runPlanBias > longRunEffects.runPlanBias, 'Lower ride height and softer suspension should push the setup toward a quali bias.');
  assert(qualiEffects.tyreWearFactor > longRunEffects.tyreWearFactor, 'A quali-biased setup should cost more tyre life than a long-run-biased setup.');
  assert(qualiEffects.straightFactor > longRunEffects.straightFactor, 'A quali-biased setup should gain more single-lap speed than a long-run-biased setup.');
}

function runQualifyingValidationMatrixProbe(): void {
  const idealSetup = toSessionSetup(SetupFeedbackSystem.generateIdealSetup(CHINA));
  const setupVariants = buildValidationSetupVariants(idealSetup);

  const idealEffects = buildSetupPhysicsEffects(CHINA, idealSetup);
  const rows: QualifyingValidationRow[] = Object.entries(setupVariants).map(([label, setup]) => {
    const effects = buildSetupPhysicsEffects(CHINA, setup);
    const topSpeedProxy = effects.straightFactor;
    const cornerComposite = effects.lowSpeedFactor * 0.45 + effects.mediumSpeedFactor * 0.35 + effects.highSpeedFactor * 0.2;
    const consistencyPenalty = (effects.tyreWearFactor - 1) * 0.65
      + Math.abs(effects.entryRotationDelta) * 0.2
      + Math.abs(effects.midRotationDelta) * 0.2
      + Math.abs(effects.exitRotationDelta) * 0.2
      + Math.abs(effects.tyreTempOffset) * 0.01;
    const consistencyProxy = 1 - consistencyPenalty;
    let sectorWeightedPerformance = 0;
    for (const sector of CHINA.sectors) {
      if (sector.type === 'straight') {
        sectorWeightedPerformance += topSpeedProxy;
      } else if (sector.type === 'corner_low_speed') {
        sectorWeightedPerformance += effects.lowSpeedFactor;
      } else if (sector.type === 'corner_medium_speed') {
        sectorWeightedPerformance += effects.mediumSpeedFactor;
      } else {
        sectorWeightedPerformance += effects.highSpeedFactor;
      }
    }
    const normalizedSectorPerformance = sectorWeightedPerformance / CHINA.sectors.length;
    const qualifyingScore = normalizedSectorPerformance - consistencyPenalty * 0.12;

    return {
      label,
      setup,
      metrics: {
        straightDelta: effects.straightFactor - idealEffects.straightFactor,
        lowSpeedDelta: effects.lowSpeedFactor - idealEffects.lowSpeedFactor,
        mediumSpeedDelta: effects.mediumSpeedFactor - idealEffects.mediumSpeedFactor,
        highSpeedDelta: effects.highSpeedFactor - idealEffects.highSpeedFactor,
        topSpeedProxy,
        accelerationProxy: effects.accelerationFactor,
        cornerComposite,
        consistencyProxy,
        qualifyingScore,
      },
    };
  });

  const metricsByLabel = new Map(rows.map((row) => [row.label, row.metrics]));
  const ideal = metricsByLabel.get('ideal');
  const lowDrag = metricsByLabel.get('lowDrag');
  const highDownforce = metricsByLabel.get('highDownforce');
  const offBalance = metricsByLabel.get('offBalance');
  if (!ideal || !lowDrag || !highDownforce || !offBalance) fail('Qualifying validation matrix should include all setup variants.');

  assert(lowDrag.straightDelta > highDownforce.straightDelta + QUALIFYING_VALIDATION_TOLERANCES.sectorDelta, 'Low-drag variant should gain more straight-line sector performance than high-downforce.');
  assert(highDownforce.lowSpeedDelta > lowDrag.lowSpeedDelta + QUALIFYING_VALIDATION_TOLERANCES.sectorDelta, 'High-downforce variant should gain more low-speed corner performance than low-drag.');
  assert(highDownforce.mediumSpeedDelta > lowDrag.mediumSpeedDelta + QUALIFYING_VALIDATION_TOLERANCES.sectorDelta, 'High-downforce variant should gain more medium-speed corner performance than low-drag.');
  assert(lowDrag.topSpeedProxy > highDownforce.topSpeedProxy + QUALIFYING_VALIDATION_TOLERANCES.topSpeedProxy, 'Low-drag variant should improve top-speed proxy over high-downforce.');
  assert(highDownforce.cornerComposite > lowDrag.cornerComposite + QUALIFYING_VALIDATION_TOLERANCES.cornerComposite, 'High-downforce variant should improve cornering composite over low-drag.');
  assert(highDownforce.accelerationProxy > lowDrag.accelerationProxy + QUALIFYING_VALIDATION_TOLERANCES.topSpeedProxy, 'High-downforce variant should gain acceleration proxy from stronger traction support than low-drag.');
  assert(offBalance.consistencyProxy < ideal.consistencyProxy - QUALIFYING_VALIDATION_TOLERANCES.consistencyProxy, 'Off-balance variant should hurt consistency versus ideal setup.');

  const bestQualifyingScore = rows.reduce((best, row) => Math.max(best, row.metrics.qualifyingScore), Number.NEGATIVE_INFINITY);
  assert(
    ideal.qualifyingScore + QUALIFYING_VALIDATION_TOLERANCES.qualifyingScore >= bestQualifyingScore,
    'Ideal setup should be best or tied-best in qualifying score within tolerance.'
  );
}

function runRaceValidationMatrixProbe(): void {
  const idealSetup = toSessionSetup(SetupFeedbackSystem.generateIdealSetup(CHINA));
  const setupVariants = buildValidationSetupVariants(idealSetup);
  const idealEffects = buildSetupPhysicsEffects(CHINA, idealSetup);
  const rows: RaceValidationRow[] = Object.entries(setupVariants).map(([label, setup]) => {
    const effects = buildSetupPhysicsEffects(CHINA, setup);
    let sectorWeightedPerformance = 0;
    for (const sector of CHINA.sectors) {
      if (sector.type === 'straight') {
        sectorWeightedPerformance += effects.straightFactor;
      } else if (sector.type === 'corner_low_speed') {
        sectorWeightedPerformance += effects.lowSpeedFactor;
      } else if (sector.type === 'corner_medium_speed') {
        sectorWeightedPerformance += effects.mediumSpeedFactor;
      } else {
        sectorWeightedPerformance += effects.highSpeedFactor;
      }
    }
    const normalizedSectorPerformance = sectorWeightedPerformance / CHINA.sectors.length;
    const consistencyPenalty = (effects.tyreWearFactor - 1) * 0.82
      + Math.abs(effects.entryRotationDelta) * 0.28
      + Math.abs(effects.midRotationDelta) * 0.24
      + Math.abs(effects.exitRotationDelta) * 0.26
      + Math.abs(effects.tyreTempOffset) * 0.015;
    const consistencyProxy = 1 - consistencyPenalty;
    const stintDegradation = (effects.tyreWearFactor - 1) * 1.15 + Math.max(0, Math.abs(effects.tyreTempOffset) - 1) * 0.028;
    const qualifyingScore = normalizedSectorPerformance - consistencyPenalty * 0.12;
    const raceStintScore = normalizedSectorPerformance - consistencyPenalty * 0.28 - stintDegradation * 0.42;
    return {
      label,
      setup,
      metrics: {
        straightDelta: effects.straightFactor - idealEffects.straightFactor,
        lowSpeedDelta: effects.lowSpeedFactor - idealEffects.lowSpeedFactor,
        mediumSpeedDelta: effects.mediumSpeedFactor - idealEffects.mediumSpeedFactor,
        highSpeedDelta: effects.highSpeedFactor - idealEffects.highSpeedFactor,
        consistencyProxy,
        stintDegradation,
        qualifyingScore,
        raceStintScore,
      },
    };
  });

  const metricsByLabel = new Map(rows.map((row) => [row.label, row.metrics]));
  const ideal = metricsByLabel.get('ideal');
  const lowDrag = metricsByLabel.get('lowDrag');
  const highDownforce = metricsByLabel.get('highDownforce');
  const offBalance = metricsByLabel.get('offBalance');
  if (!ideal || !lowDrag || !highDownforce || !offBalance) fail('Race validation matrix should include all setup variants.');

  assert(
    lowDrag.straightDelta > highDownforce.straightDelta + RACE_VALIDATION_TOLERANCES.sectorDelta,
    'Low-drag race variant should still carry stronger straight-line pace than high-downforce.'
  );
  assert(
    highDownforce.lowSpeedDelta > lowDrag.lowSpeedDelta + RACE_VALIDATION_TOLERANCES.sectorDelta,
    'High-downforce race variant should preserve stronger low-speed cornering over low-drag.'
  );
  assert(
    lowDrag.stintDegradation > ideal.stintDegradation + RACE_VALIDATION_TOLERANCES.stintDegradation,
    'Low-drag race variant should degrade more over a stint than ideal.'
  );
  assert(
    highDownforce.raceStintScore > lowDrag.raceStintScore + RACE_VALIDATION_TOLERANCES.scoreDelta,
    'Race-stint scoring should reward high-downforce over low-drag for sustained pace.'
  );

  const offBalanceQualifyingDeficit = ideal.qualifyingScore - offBalance.qualifyingScore;
  const offBalanceRaceDeficit = ideal.raceStintScore - offBalance.raceStintScore;
  assert(
    offBalanceRaceDeficit > offBalanceQualifyingDeficit + RACE_VALIDATION_TOLERANCES.scoreDelta,
    'Race behavior should punish off-balance setups more than qualifying behavior.'
  );

  const bestRaceStintScore = rows.reduce((best, row) => Math.max(best, row.metrics.raceStintScore), Number.NEGATIVE_INFINITY);
  assert(
    ideal.raceStintScore + RACE_VALIDATION_TOLERANCES.scoreDelta >= bestRaceStintScore,
    'Ideal setup should be best or tied-best in race-stint score within tolerance.'
  );
}

function runQualifyingParcFermeProbe(): void {
  const monacoIdeal = toSessionSetup(SetupFeedbackSystem.generateIdealSetup(MONACO));
  const monacoLowDrag = offsetSetup(monacoIdeal, {
    frontWingAngle: -12,
    rearWingAngle: -12,
    rideHeight: -10,
    suspensionStiffness: 10,
    toeOut: -4,
    camber: -4,
    gearboxSetting: -8,
  });
  let weekend = createWeekend(monacoIdeal);
  weekend.fp3Setup.nor = { ...monacoLowDrag };

  weekend = WeekendManager.transitionToNextPhase(weekend);
  weekend = WeekendManager.transitionToNextPhase(weekend);
  weekend = WeekendManager.transitionToNextPhase(weekend);
  weekend = WeekendManager.transitionToNextPhase(weekend);

  assert(weekend.currentPhase === 'q1', 'Weekend should advance into Q1 after the full practice sequence.');
  assert(weekend.q1Setup.nor?.frontWingAngle === monacoLowDrag.frontWingAngle, 'Q1 should inherit FP3 front wing for parc ferme.');
  assert(weekend.q1Setup.nor?.rearWingAngle === monacoLowDrag.rearWingAngle, 'Q1 should inherit FP3 rear wing for parc ferme.');
  assert(weekend.raceSetup.nor?.rideHeight === monacoLowDrag.rideHeight, 'Race setup should lock in the FP3 ride height at parc ferme.');
  assert(weekend.completedSessions.join(',') === 'fp1,fp2,fp3', 'Practice sessions should be marked complete before qualifying.');

  const lockedRaceSetup = weekend.raceSetup.nor;
  if (!lockedRaceSetup) fail('Race setup should exist after parc ferme lock-in.');
  const lockedRaceEffects = buildSetupPhysicsEffects(MONACO, lockedRaceSetup);
  const idealEffects = buildSetupPhysicsEffects(MONACO, monacoIdeal);
  assert(lockedRaceEffects.straightFactor > idealEffects.straightFactor + 0.003, 'Parc ferme race setup should keep low-drag straight-line gain.');
  assert(lockedRaceEffects.tyreWearFactor > idealEffects.tyreWearFactor + 0.01, 'Parc ferme race setup should keep low-drag tyre-wear trade-off.');

  weekend = WeekendManager.transitionToNextPhase(weekend);
  weekend = WeekendManager.transitionToNextPhase(weekend);
  weekend = WeekendManager.transitionToNextPhase(weekend);
  assert(weekend.currentPhase === 'race', 'Weekend should advance to race while preserving locked setup.');
  assert(
    weekend.raceSetup.nor?.frontWingAngle === monacoLowDrag.frontWingAngle
      && weekend.raceSetup.nor?.rideHeight === monacoLowDrag.rideHeight,
    'Race session should retain the locked setup values from parc ferme.'
  );
}

function runPracticeDevelopmentProbe(): void {
  const monacoIdeal = SetupFeedbackSystem.generateIdealSetup(MONACO);
  const neutralSetup = toSessionSetup({
    frontWingAngle: 50,
    rearWingAngle: 50,
    rideHeight: 50,
    suspensionStiffness: 50,
    toeOut: 50,
    camber: 50,
    gearboxSetting: 50,
  });

  const setupFocused = SetupFeedbackSystem.runPracticeStint(
    MONACO,
    neutralSetup,
    {},
    monacoIdeal,
    85,
    { setupFeedbackShare: 1, trackPreparationShare: 0 },
    15,
    0
  );

  const preparationFocused = SetupFeedbackSystem.runPracticeStint(
    MONACO,
    neutralSetup,
    {},
    monacoIdeal,
    85,
    { setupFeedbackShare: 0, trackPreparationShare: 1 },
    15,
    0
  );

  const longPreparationRun = SetupFeedbackSystem.runPracticeStint(
    MONACO,
    neutralSetup,
    {},
    monacoIdeal,
    85,
    { setupFeedbackShare: 0, trackPreparationShare: 1 },
    30,
    0
  );

  assert(setupFocused.feedbackQuality > 89, 'A 15-lap setup-focused stint should deliver around 90% single-run feedback quality.');
  assert(setupFocused.feedbackQuality < 91, 'A 15-lap setup-focused stint should deliver around 90% single-run feedback quality.');
  assert(!!setupFocused.feedback, 'A setup-focused practice stint should return setup feedback.');
  assert(!!setupFocused.feedback?.knowledge.runPlanBalance, 'Driver feedback should include the quali-versus-long-run balance target.');
  assert(Math.abs(preparationFocused.trackPreparation - 25) < 0.0001, 'A 15-lap preparation-focused stint should add 25% track preparation at baseline learning.');
  assert(longPreparationRun.trackPreparation === 100, 'A 30-lap preparation-focused stint should fully max track preparation at baseline learning.');
}

function runDirectionalNarrowingProbe(): void {
  const monacoIdeal = SetupFeedbackSystem.generateIdealSetup(MONACO);
  const nearBalancedSetup = toSessionSetup({
    frontWingAngle: 50,
    rearWingAngle: 50,
    rideHeight: 50,
    suspensionStiffness: 50,
    toeOut: 50,
    camber: 50,
    gearboxSetting: 50,
  });
  const mildlyBiasedSetup = toSessionSetup({
    frontWingAngle: 50,
    rearWingAngle: 50,
    rideHeight: 60,
    suspensionStiffness: 60,
    toeOut: 48,
    camber: 48,
    gearboxSetting: 50,
  });
  const longRunHeavySetup = toSessionSetup({
    frontWingAngle: 50,
    rearWingAngle: 50,
    rideHeight: 80,
    suspensionStiffness: 80,
    toeOut: 40,
    camber: 38,
    gearboxSetting: 50,
  });

  const nearPass = SetupFeedbackSystem.evaluateDrivingBias(
    MONACO,
    nearBalancedSetup,
    {},
    monacoIdeal,
    12
  );
  const mildPass = SetupFeedbackSystem.evaluateDrivingBias(
    MONACO,
    mildlyBiasedSetup,
    {},
    monacoIdeal,
    12
  );
  const nearRange = nearPass.knowledge.runPlanBalance?.optimalRange;
  const mildRange = mildPass.knowledge.runPlanBalance?.optimalRange;
  if (!nearRange || !mildRange) fail('Narrowing probe should include run-plan ranges for near and mild setups.');
  const nearWidth = nearRange[1] - nearRange[0];
  const mildWidth = mildRange[1] - mildRange[0];
  assert(nearWidth < mildWidth * 0.75, 'Very near-optimal balance should narrow much faster than a mildly biased setup.');

  const firstPass = SetupFeedbackSystem.evaluateDrivingBias(
    MONACO,
    longRunHeavySetup,
    {},
    monacoIdeal,
    10
  );
  const firstRange = firstPass.knowledge.runPlanBalance?.optimalRange;
  if (!firstRange) fail('First directional narrowing pass should produce run-plan knowledge.');

  const leftNarrowAmount = firstRange[0] - (-1);
  const rightNarrowAmount = 1 - firstRange[1];
  assert(leftNarrowAmount > 0.45, 'A strong long-run bias should rapidly cut the low side of the range.');
  assert(leftNarrowAmount > rightNarrowAmount * 4, 'A strong long-run bias should narrow away from the low side far more than the high side.');

  const secondPass = SetupFeedbackSystem.evaluateDrivingBias(
    MONACO,
    longRunHeavySetup,
    firstPass.knowledge,
    monacoIdeal,
    12
  );
  const secondRange = secondPass.knowledge.runPlanBalance?.optimalRange;
  if (!secondRange) fail('Second directional narrowing pass should preserve run-plan knowledge.');

  assert(secondRange[0] >= firstRange[0], 'Range minimum should keep tightening over repeated feedback.');
  assert(secondRange[1] <= firstRange[1], 'Range maximum should keep tightening over repeated feedback.');
  assert(secondRange[0] > firstRange[0] || secondRange[1] < firstRange[1], 'At least one side should continue narrowing each feedback step.');

  let rollingKnowledge = secondPass.knowledge;
  let previousWidth = secondRange[1] - secondRange[0];
  let shrinkingRuns = 0;
  for (let i = 0; i < 5; i += 1) {
    const nextPass = SetupFeedbackSystem.evaluateDrivingBias(
      MONACO,
      longRunHeavySetup,
      rollingKnowledge,
      monacoIdeal,
      12
    );
    const nextRange = nextPass.knowledge.runPlanBalance?.optimalRange;
    if (!nextRange) fail('Repeated directional narrowing should keep run-plan knowledge available.');
    const nextWidth = nextRange[1] - nextRange[0];
    if (nextWidth < previousWidth - 0.000001) shrinkingRuns += 1;
    previousWidth = nextWidth;
    rollingKnowledge = nextPass.knowledge;
  }
  assert(shrinkingRuns >= 4, 'Feedback ranges should continue to narrow over consecutive runs instead of stalling early.');
}

function runTeamDevelopmentBiasIntegrationProbe(): void {
  const neutralSetup = toSessionSetup({
    frontWingAngle: 50,
    rearWingAngle: 50,
    rideHeight: 50,
    suspensionStiffness: 50,
    toeOut: 50,
    camber: 50,
    gearboxSetting: 50,
  });

  const baseTeamSpecs: TeamSpecs = {
    acceleration: 80,
    braking: 80,
    drag_reduction: 80,
    cornering_low: 80,
    cornering_mid: 80,
    cornering_high: 80,
    ers_efficiency: 80,
    cooling: 80,
    lifespan: 80,
    drs_efficiency: 80,
  };

  const qualiFocusedSpecs: TeamSpecs = {
    ...baseTeamSpecs,
    acceleration: 95,
    drag_reduction: 94,
    drs_efficiency: 95,
    ers_efficiency: 92,
    cooling: 70,
    lifespan: 72,
  };

  const longRunFocusedSpecs: TeamSpecs = {
    ...baseTeamSpecs,
    acceleration: 74,
    drag_reduction: 74,
    drs_efficiency: 74,
    ers_efficiency: 76,
    cooling: 96,
    lifespan: 97,
    braking: 90,
  };

  const noTeamEffects = buildSetupPhysicsEffects(MONZA, neutralSetup);
  const qualiEffects = buildSetupPhysicsEffects(MONZA, neutralSetup, qualiFocusedSpecs);
  const longRunEffects = buildSetupPhysicsEffects(MONZA, neutralSetup, longRunFocusedSpecs);

  assert(noTeamEffects.runPlanBias === 0, 'Neutral setup should be setup-balanced without team development input.');
  assert(qualiEffects.runPlanBias > noTeamEffects.runPlanBias + 0.06, 'Quali-focused team development should push run-plan bias toward qualifying.');
  assert(longRunEffects.runPlanBias < noTeamEffects.runPlanBias - 0.06, 'Long-run-focused team development should push run-plan bias toward race pace.');
  assert(qualiEffects.straightFactor > longRunEffects.straightFactor + 0.005, 'Quali-focused development should provide stronger straight-line output.');
  assert(longRunEffects.tyreWearFactor < qualiEffects.tyreWearFactor - 0.01, 'Long-run-focused development should improve tyre wear profile.');
}

function main(): void {
  console.log('Running practice and qualifying dev module checks...');
  runPracticeKnowledgeProbe();
  console.log('Practice feedback probe passed.');
  runTrackPerformanceProbe();
  console.log('Track performance probe passed.');
  runQualifyingValidationMatrixProbe();
  console.log('Qualifying validation matrix probe passed.');
  runRaceValidationMatrixProbe();
  console.log('Race validation matrix probe passed.');
  runPracticeDevelopmentProbe();
  console.log('Practice development probe passed.');
  runDirectionalNarrowingProbe();
  console.log('Directional narrowing probe passed.');
  runTeamDevelopmentBiasIntegrationProbe();
  console.log('Team development integration probe passed.');
  runQualifyingParcFermeProbe();
  console.log('Qualifying parc ferme probe passed.');
  console.log('Practice and qualifying dev module completed successfully.');
}

main();
