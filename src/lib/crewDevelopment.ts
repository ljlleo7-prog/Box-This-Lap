import type { CrewState, CrewSpecialization, CrewTrainingPlan, CrewDepartment, DaySchedule, PitCrewActivity } from '../types/championship';

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

  schedule.forEach((day) => {
    if (day.isRaceDay) {
      totalFatigue += 30;
      totalXP += 5;
      return;
    }

    [day.amActivity, day.pmActivity].forEach((activity) => {
      if (!activity) return;

      switch (activity as PitCrewActivity) {
        case 'drills':
          totalXP += 3;
          totalFatigue += 2;
          errorRateChange -= 2;
          break;
        case 'exercise':
          totalXP += 1;
          totalFatigue += 3;
          speedBonusChange += 0.5;
          break;
        case 'chill':
          totalFatigue -= 5;
          break;
      }
    });
  });

  return {
    xpGain: totalXP,
    fatigueChange: totalFatigue,
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
