import { SessionSetupState, SetupFeedback, SetupTuningParameter, Track } from '../../types';
import { buildFeedbackMap, buildHandlingFeedback, buildSetupPhysicsEffects, getIdealSetup, TUNABLE_SETUP_PARAMETERS } from './SetupModel';

export interface SetupFeedbackResult {
  knowledge: Partial<Record<SetupTuningParameter, SetupFeedback>>;
  comments: string[];
}

export type DrivingBiasMetricKey =
  | 'cornerEntryBalance'
  | 'midCornerBalance'
  | 'cornerExitBalance'
  | 'straightLineEfficiency'
  | 'lowSpeedCornering'
  | 'highSpeedStability'
  | 'traction'
  | 'runPlanBalance';

export interface DrivingBiasFeedback {
  optimalRange: [number, number];
  currentValue: number;
  targetValue: number;
  status: 'poor' | 'okay' | 'good' | 'optimal';
}

export interface DrivingBiasFeedbackResult {
  knowledge: Partial<Record<DrivingBiasMetricKey, DrivingBiasFeedback>>;
  comments: string[];
}

export interface PracticeFocusAllocation {
  setupFeedbackShare: number;
  trackPreparationShare: number;
}

export interface PracticeStintResult {
  feedback: DrivingBiasFeedbackResult | null;
  feedbackQuality: number;
  feedbackQualityGain: number;
  trackPreparation: number;
  trackPreparationGain: number;
  setupKnowledgeSkill: number;
}

export class SetupFeedbackSystem {
  private static clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private static getLearningMultiplier(driverLearning: number): number {
    return Math.max(0.5, driverLearning / 85);
  }

  public static generateIdealSetup(track: Track): Partial<Record<SetupTuningParameter, number>> {
    return getIdealSetup(track);
  }

  public static getSetupKnowledgeSkillFromQuality(feedbackQuality: number): number {
    return SetupFeedbackSystem.clamp(Math.round(1 + (feedbackQuality / 100) * 19), 1, 20);
  }

  public static calculateFeedbackQualityGain(
    driverLearning: number,
    setupFeedbackShare: number,
    laps: number
  ): number {
    if (setupFeedbackShare <= 0 || laps <= 0) return 0;

    const learningMultiplier = SetupFeedbackSystem.getLearningMultiplier(driverLearning);
    const normalizedLaps = laps / 15;
    const exponent = Math.log(10) * learningMultiplier * setupFeedbackShare * normalizedLaps;
    return 100 * (1 - Math.exp(-exponent));
  }

  public static calculateTrackPreparationGain(
    driverLearning: number,
    trackPreparationShare: number,
    laps: number
  ): number {
    if (trackPreparationShare <= 0 || laps <= 0) return 0;

    const learningMultiplier = SetupFeedbackSystem.getLearningMultiplier(driverLearning);
    const stintFactor = (laps / 15) ** 2;

    return 25 * learningMultiplier * trackPreparationShare * stintFactor;
  }

  public static runPracticeStint(
    track: Track,
    currentSetup: SessionSetupState,
    currentKnowledge: Partial<Record<DrivingBiasMetricKey, DrivingBiasFeedback>> | undefined,
    idealSetup: Partial<Record<SetupTuningParameter, number>>,
    driverLearning: number,
    focusAllocation: PracticeFocusAllocation,
    laps: number,
    currentTrackPreparation: number
  ): PracticeStintResult {
    const feedbackQualityGain = SetupFeedbackSystem.calculateFeedbackQualityGain(
      driverLearning,
      focusAllocation.setupFeedbackShare,
      laps
    );
    const feedbackQuality = SetupFeedbackSystem.clamp(feedbackQualityGain, 0, 100);
    const trackPreparationGain = SetupFeedbackSystem.calculateTrackPreparationGain(
      driverLearning,
      focusAllocation.trackPreparationShare,
      laps
    );
    const trackPreparation = SetupFeedbackSystem.clamp(currentTrackPreparation + trackPreparationGain, 0, 100);
    const setupKnowledgeSkill = SetupFeedbackSystem.getSetupKnowledgeSkillFromQuality(feedbackQuality);

    return {
      feedback:
        focusAllocation.setupFeedbackShare > 0
          ? SetupFeedbackSystem.evaluateDrivingBias(
              track,
              currentSetup,
              currentKnowledge,
              idealSetup,
              setupKnowledgeSkill
            )
          : null,
      feedbackQuality,
      feedbackQualityGain,
      trackPreparation,
      trackPreparationGain,
      setupKnowledgeSkill,
    };
  }

  public static evaluateDrivingBias(
    track: Track,
    currentSetup: SessionSetupState,
    currentKnowledge: Partial<Record<DrivingBiasMetricKey, DrivingBiasFeedback>> | undefined,
    idealSetup: Partial<Record<SetupTuningParameter, number>>,
    driverSetupKnowledgeSkill: number
  ): DrivingBiasFeedbackResult {
    const newKnowledge = { ...(currentKnowledge ?? {}) };
    const currentBias = SetupFeedbackSystem.buildDrivingBiasSnapshot(track, currentSetup);
    const targetBias = SetupFeedbackSystem.buildDrivingBiasSnapshot(track, idealSetup as SessionSetupState);
    const metricBaseWidths: Record<DrivingBiasMetricKey, number> = {
      cornerEntryBalance: 0.1,
      midCornerBalance: 0.08,
      cornerExitBalance: 0.08,
      straightLineEfficiency: 0.035,
      lowSpeedCornering: 0.04,
      highSpeedStability: 0.04,
      traction: 0.028,
      runPlanBalance: 0.12,
    };
    const metricDomains: Record<DrivingBiasMetricKey, [number, number]> = {
      cornerEntryBalance: [-0.35, 0.35],
      midCornerBalance: [-0.3, 0.3],
      cornerExitBalance: [-0.3, 0.3],
      straightLineEfficiency: [0.92, 1.08],
      lowSpeedCornering: [0.92, 1.08],
      highSpeedStability: [0.92, 1.08],
      traction: [0.92, 1.08],
      runPlanBalance: [-1, 1],
    };

    (Object.keys(metricBaseWidths) as DrivingBiasMetricKey[]).forEach((metric) => {
      const currentValue = currentBias[metric];
      const targetValue = metric === 'runPlanBalance' ? 0 : targetBias[metric];
      const diff = Math.abs(currentValue - targetValue);
      const width = metricBaseWidths[metric];
      const domain = metricDomains[metric];
      const domainSpan = domain[1] - domain[0];
      const desiredRangeMin = SetupFeedbackSystem.clamp(targetValue - width, domain[0], domain[1]);
      const desiredRangeMax = SetupFeedbackSystem.clamp(targetValue + width, domain[0], domain[1]);
      const existingRange = newKnowledge[metric]?.optimalRange ?? domain;
      const skillRatio = driverSetupKnowledgeSkill / 20;
      const preRunRangeSpan = Math.max(existingRange[1] - existingRange[0], domainSpan * 0.03);
      const narrowingStage = SetupFeedbackSystem.clamp(1 - preRunRangeSpan / domainSpan, 0, 1);
      const baseStageMultiplier = 0.40 + narrowingStage * 2;
      const stageMultiplier = metric === 'runPlanBalance' ? baseStageMultiplier * 1.24 : baseStageMultiplier;
      const preRunDistanceRatio = SetupFeedbackSystem.clamp(diff / preRunRangeSpan, 0, 1.2);
      const directionalDenominator = metric === 'runPlanBalance'
        ? Math.max(width * 2.2, domainSpan * 0.08)
        : preRunRangeSpan;
      const signedDistanceRatio = SetupFeedbackSystem.clamp((currentValue - targetValue) / directionalDenominator, -1, 1);
      const baseLinearProgress = 0.24 + skillRatio * 0.264;
      const centerThreshold = 0.4;
      const nearOptimalBoost = metric === 'runPlanBalance'
        ? SetupFeedbackSystem.clamp((0.2 - preRunDistanceRatio) / 0.2, 0, 1) * 0.48
        : 0;
      const centerBoost = SetupFeedbackSystem.clamp((centerThreshold - preRunDistanceRatio) / centerThreshold, 0, 1)
        * (0.9 + skillRatio * 0.4)
        * (1 + nearOptimalBoost);
      const farFactor = SetupFeedbackSystem.clamp((preRunDistanceRatio - 0.22) / 0.38, 0, 1);
      const strongAsymBoost = farFactor * (1.04 + skillRatio * 0.48);
      const weakSideDrop = farFactor * (0.42 + skillRatio * 0.216);
      const minDirectionalWeight = SetupFeedbackSystem.clamp(-signedDistanceRatio, 0, 1);
      const maxDirectionalWeight = SetupFeedbackSystem.clamp(signedDistanceRatio, 0, 1);
      let minProgress = baseLinearProgress + centerBoost + minDirectionalWeight * strongAsymBoost - maxDirectionalWeight * weakSideDrop;
      let maxProgress = baseLinearProgress + centerBoost + maxDirectionalWeight * strongAsymBoost - minDirectionalWeight * weakSideDrop;
      if (metric === 'runPlanBalance') {
        const directionalAcceleration = 0.22 + skillRatio * 0.14;
        minProgress += minDirectionalWeight * directionalAcceleration;
        maxProgress += maxDirectionalWeight * directionalAcceleration;
        const dominantDirectionalWeight = Math.max(minDirectionalWeight, maxDirectionalWeight);
        const oppositeSideSuppression = 1 - dominantDirectionalWeight * 0.78;
        if (minDirectionalWeight > maxDirectionalWeight) {
          maxProgress *= oppositeSideSuppression;
        } else if (maxDirectionalWeight > minDirectionalWeight) {
          minProgress *= oppositeSideSuppression;
        }
      }
      minProgress *= stageMultiplier;
      maxProgress *= stageMultiplier;
      minProgress = SetupFeedbackSystem.clamp(minProgress, 0.02, 0.995);
      maxProgress = SetupFeedbackSystem.clamp(maxProgress, 0.02, 0.995);

      const narrowedMin = existingRange[0] + (desiredRangeMin - existingRange[0]) * minProgress;
      const narrowedMax = existingRange[1] + (desiredRangeMax - existingRange[1]) * maxProgress;
      let rangeMin = SetupFeedbackSystem.clamp(Math.max(existingRange[0], narrowedMin), domain[0], domain[1]);
      let rangeMax = SetupFeedbackSystem.clamp(Math.min(existingRange[1], narrowedMax), domain[0], domain[1]);
      const spanAfterPrimary = rangeMax - rangeMin;
      if (spanAfterPrimary > 0.000001) {
        const percentageTrim = spanAfterPrimary * (0.055 + skillRatio * 0.04) * stageMultiplier;
        const absoluteTrim = domainSpan * (0.0015 + skillRatio * 0.001) * (0.35 + narrowingStage * 1.2);
        const guaranteedTotalTrim = Math.min(spanAfterPrimary * 0.85, percentageTrim + absoluteTrim);
        if (guaranteedTotalTrim > 0) {
          const weightSum = Math.max(minProgress + maxProgress, 0.0001);
          const minTrimShare = minProgress / weightSum;
          const maxTrimShare = maxProgress / weightSum;
          rangeMin += guaranteedTotalTrim * minTrimShare;
          rangeMax -= guaranteedTotalTrim * maxTrimShare;
        }
      }
      const status: DrivingBiasFeedback['status'] =
        diff <= width * 0.35 ? 'optimal' : diff <= width * 0.7 ? 'good' : diff <= width ? 'okay' : 'poor';

      newKnowledge[metric] = {
        optimalRange: [rangeMin, rangeMax],
        currentValue,
        targetValue,
        status,
      };
    });

    const comments = SetupFeedbackSystem.buildDrivingBiasComments(currentBias, targetBias);

    return {
      knowledge: newKnowledge,
      comments: comments.length > 0 ? comments : ['The driver is comfortable with the current balance profile.'],
    };
  }

  public static evaluateSetup(
    track: Track,
    currentSetup: SessionSetupState,
    currentKnowledge: Partial<Record<SetupTuningParameter, SetupFeedback>> | undefined,
    idealSetup: Partial<Record<SetupTuningParameter, number>>,
    driverSetupKnowledgeSkill: number // 1-20
  ): SetupFeedbackResult {
    const newKnowledge = { ...(currentKnowledge ?? {}) };

    TUNABLE_SETUP_PARAMETERS.forEach((param) => {
      const currentVal = currentSetup[param] as number | undefined;
      const idealVal = idealSetup[param] as number | undefined;

      if (currentVal !== undefined && idealVal !== undefined) {
        const diff = Math.abs(currentVal - idealVal);
        
        let status: SetupFeedback['status'] = 'poor';
        if (diff <= 2) status = 'optimal';
        else if (diff <= 10) status = 'good';
        else if (diff <= 25) status = 'okay';

        const existingKnowledge = newKnowledge[param];
        let rangeMin = existingKnowledge ? existingKnowledge.optimalRange[0] : 0;
        let rangeMax = existingKnowledge ? existingKnowledge.optimalRange[1] : 100;

        const narrowingFactor = 0.05 + (driverSetupKnowledgeSkill / 20) * 0.15;
        
        if (rangeMin < idealVal) {
          rangeMin = Math.min(idealVal - diff, rangeMin + (100 * narrowingFactor));
        }
        if (rangeMax > idealVal) {
          rangeMax = Math.max(idealVal + diff, rangeMax - (100 * narrowingFactor));
        }

        rangeMin = Math.max(0, Math.floor(rangeMin));
        rangeMax = Math.min(100, Math.ceil(rangeMax));
        if (rangeMin > rangeMax) {
          const temp = rangeMin;
          rangeMin = rangeMax;
          rangeMax = temp;
        }

        newKnowledge[param] = {
          optimalRange: [rangeMin, rangeMax],
          currentValue: currentVal,
          status
        };
      }
    });

    const baselineKnowledge = buildFeedbackMap(track, currentSetup);
    for (const param of TUNABLE_SETUP_PARAMETERS) {
      if (!newKnowledge[param] && baselineKnowledge[param]) {
        newKnowledge[param] = baselineKnowledge[param];
      }
    }

    const comments = buildHandlingFeedback(track, currentSetup).map((comment) => comment.message);
    if (comments.length === 0) {
      comments.push("Driver is extremely happy with the setup!");
    }

    return {
      knowledge: newKnowledge,
      comments
    };
  }

  private static buildDrivingBiasSnapshot(
    track: Track,
    setup: SessionSetupState
  ): Record<DrivingBiasMetricKey, number> {
    const effects = buildSetupPhysicsEffects(track, setup);

    return {
      cornerEntryBalance: effects.entryRotationDelta,
      midCornerBalance: effects.midRotationDelta,
      cornerExitBalance: effects.exitRotationDelta,
      straightLineEfficiency: effects.straightFactor,
      lowSpeedCornering: effects.lowSpeedFactor,
      highSpeedStability: effects.highSpeedFactor,
      traction: effects.accelerationFactor,
      runPlanBalance: effects.runPlanBias,
    };
  }

  private static buildDrivingBiasComments(
    currentBias: Record<DrivingBiasMetricKey, number>,
    targetBias: Record<DrivingBiasMetricKey, number>
  ): string[] {
    const comments: string[] = [];
    const addComment = (metric: DrivingBiasMetricKey, tooLow: string, tooHigh: string, tolerance: number): void => {
      const delta = currentBias[metric] - targetBias[metric];
      if (delta < -tolerance) {
        comments.push(tooLow);
      } else if (delta > tolerance) {
        comments.push(tooHigh);
      }
    };

    addComment(
      'cornerEntryBalance',
      'Corner entry balance is too safe and the car needs more front response.',
      'Corner entry balance is too sharp and the rear feels nervous on turn-in.',
      0.035
    );
    addComment(
      'midCornerBalance',
      'Mid-corner rotation is too low and the car washes wide through the apex.',
      'Mid-corner rotation is too aggressive and the rear starts to step out at apex.',
      0.03
    );
    addComment(
      'cornerExitBalance',
      'Corner exit balance is too lazy and the car resists rotating onto throttle.',
      'Corner exit balance is too loose and traction breaks away too easily.',
      0.03
    );
    addComment(
      'straightLineEfficiency',
      'Straight-line efficiency is too low and the car carries too much drag.',
      'Straight-line efficiency is too extreme and the car gives away too much corner support.',
      0.015
    );
    addComment(
      'lowSpeedCornering',
      'Low-speed cornering support is below the target for this circuit.',
      'Low-speed cornering bias is too aggressive and compromises overall balance.',
      0.02
    );
    addComment(
      'highSpeedStability',
      'High-speed stability is below target and the platform feels too weak in fast corners.',
      'High-speed stability is overshot and the car feels too compromised elsewhere.',
      0.02
    );
    addComment(
      'traction',
      'Traction support is too low and the driver cannot commit cleanly on exit.',
      'Traction bias is too strong and the car feels held back when rotating.',
      0.02
    );
    addComment(
      'runPlanBalance',
      'The car is too long-run biased and gives away too much peak pace.',
      'The car is too quali biased and will lean too hard on the tyres over a run.',
      0.05
    );

    return comments.slice(0, 4);
  }
}
