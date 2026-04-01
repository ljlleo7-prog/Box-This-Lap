import type { CrewState, CrewSpecialization, CrewTrainingPlan, CrewDepartment, DaySchedule, PitCrewActivity } from '../types/championship';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getDrillErrorReduction = (currentErrorRate: number, fatigueLoad: number) => {
  const headroom = clamp(currentErrorRate / 100, 0.2, 1);
  const fatiguePenalty = 1 - 0.4 * Math.pow(clamp(fatigueLoad, 0, 100) / 100, 1.1);
  return 2.8 * Math.pow(headroom, 0.9) * Math.max(0.45, fatiguePenalty);
};

const getExerciseSpeedGain = (currentSpeedBonus: number, fatigueLoad: number) => {
  const diminishingReturns = 1 / (1 + Math.max(0, currentSpeedBonus) / 6);
  const fatiguePenalty = 1 - 0.35 * Math.pow(clamp(fatigueLoad, 0, 100) / 100, 1.15);
  return 0.9 * diminishingReturns * Math.max(0.5, fatiguePenalty);
};

// Process Pit Crew Schedule
export const processPitCrewSchedule = (
  crew: CrewState,
  schedule: DaySchedule[]
): {
  xpGain: number;
  fatigueChange: number;
  errorRateChange: number;
  speedBonusChange: number;
} => {
  let totalXP = 0;
  let totalFatigue = 0;
  let errorRateChange = 0;
  let speedBonusChange = 0;
  let currentFatigue = crew.workload;
  let currentErrorRate = crew.errorRate ?? 50;
  let currentSpeedBonus = crew.speedBonus ?? 0;

  schedule.forEach((day) => {
    if (day.isRaceDay) {
      return;
    }

    [day.amActivity, day.pmActivity].forEach((activity) => {
      if (!activity) {
        return;
      }

      switch (activity as PitCrewActivity) {
        case 'drills': {
          totalXP += Math.round(2 + currentErrorRate / 40);
          totalFatigue += 2.5;
          currentFatigue = clamp(currentFatigue + 2.5, 0, 100);
          const reduction = getDrillErrorReduction(currentErrorRate, currentFatigue);
          errorRateChange -= reduction;
          currentErrorRate = clamp(currentErrorRate - reduction, 0, 100);
          break;
        }
        case 'exercise': {
          totalXP += 1;
          totalFatigue += 3.5;
          currentFatigue = clamp(currentFatigue + 3.5, 0, 100);
          const gain = getExerciseSpeedGain(currentSpeedBonus, currentFatigue);
          speedBonusChange += gain;
          currentSpeedBonus += gain;
          break;
        }
        case 'chill': {
          totalFatigue -= 3;
          currentFatigue = clamp(currentFatigue - 3, 0, 100);
          const drift = 0.45 + 1.35 * Math.pow(currentFatigue / 100, 1.35);
          errorRateChange += drift;
          currentErrorRate = clamp(currentErrorRate + drift, 0, 100);
          break;
        }
      }
    });
  });

  return {
    xpGain: totalXP,
    fatigueChange: Math.round(totalFatigue),
    errorRateChange,
    speedBonusChange,
  };
};

// Error Rate Effect on Pit Stops
export const getErrorRateEffect = (errorRate: number): number => {
  // Returns probability of error (0-1)
  // 50 = 1%, 25 = 0.5%, 15 = 0.3%
  return errorRate / 5000;
};

// XP & Level System (same as driver)
export const getLevelRequirement = (level: number): number => {
  if (level <= 1) return 0;
  return (level - 1) * 500;
};

export const getTotalXPForLevel = (level: number): number => {
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += getLevelRequirement(i);
  }
  return total;
};

// Crew Training XP
export const getCrewTrainingXP = (plan: CrewTrainingPlan): number => {
  return plan.type === 'morale' ? 30 :
         plan.type === 'efficiency' ? 50 : 60; // speed training
};

// Training Duration
export const getCrewTrainingDuration = (type: string): number => {
  return type === 'morale' ? 7 : 14;
};

// Training Cost
export const getCrewTrainingCost = (type: string): number => {
  return type === 'morale' ? 25000 :
         type === 'efficiency' ? 75000 : 100000; // speed
};

// Pit Stop Time Bonus
export const getPitStopTimeBonus = (
  level: number,
  efficiency: number,
  speedBonus: number = 0,
  specialization?: CrewSpecialization
): number => {
  const levelBonus = (level - 1) * 0.025; // -2.5% per level
  const efficiencyBonus = (efficiency - 75) * 0.002; // baseline 75
  const trainingSpeedBonus = speedBonus / 100; // Convert percentage to decimal
  const specializationBonus = specialization === 'speed' ? 0.10 : 0;

  return levelBonus + efficiencyBonus + trainingSpeedBonus + specializationBonus;
};

// R&D Speed Bonus (for technical crew)
export const getRDSpeedBonus = (
  aeroEfficiency: number,
  powerUnitEfficiency: number
): number => {
  const avgEfficiency = (aeroEfficiency + powerUnitEfficiency) / 200;
  // 0.75 avg = no bonus, 1.0 avg = +25% speed
  return Math.max(0, avgEfficiency - 0.75);
};

// Complete Training
export const completeCrewTraining = (crew: CrewState, plan: CrewTrainingPlan): CrewState => {
  const xpGain = getCrewTrainingXP(plan);
  const newXP = crew.xp + xpGain;

  // Apply training effects
  let newEfficiency = crew.efficiency;
  let newMorale = crew.morale;

  if (plan.type === 'efficiency') {
    newEfficiency = Math.min(100, crew.efficiency + 5);
  } else if (plan.type === 'morale') {
    newMorale = Math.min(100, crew.morale + 10);
  }
  // speed training only gives XP

  // Check for level up
  let newLevel = crew.level;
  while (newXP >= getTotalXPForLevel(newLevel + 1) && newLevel < 10) {
    newLevel++;
  }

  return {
    ...crew,
    xp: newXP,
    level: newLevel,
    efficiency: newEfficiency,
    morale: newMorale,
    trainingPlan: undefined,
  };
};

// Pit Stop XP
export const calculatePitStopXP = (pitStopCount: number): number => {
  return pitStopCount * 20;
};

// R&D Completion XP
export const RD_COMPLETION_XP = 50;
