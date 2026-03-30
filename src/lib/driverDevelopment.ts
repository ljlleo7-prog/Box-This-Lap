import type { OfflineDriverState, WearyState, DriverTrainingPlan, TrainingIntensity, DaySchedule, DriverActivity } from '../types/championship';

// Strength System
export const applyStrengthDecay = (strength: number, daysWithoutExercise: number): number => {
  return strength * Math.pow(0.99, daysWithoutExercise);
};

export const getStrengthMultiplier = (strength: number): number => {
  // 75 = 1.0x, 100 = 1.15x, 50 = 0.85x
  return 0.85 + (strength / 100) * 0.30;
};

// Create Empty Schedule
export const createEmptySchedule = (raceDays: number[] = [3, 4, 5]): DaySchedule[] => {
  return Array.from({ length: 14 }, (_, i) => ({
    dayNumber: i + 1,
    isRaceDay: raceDays.includes(i + 1),
    amActivity: null,
    pmActivity: null,
  }));
};

// Process Driver Schedule
export const processDriverSchedule = (
  driver: OfflineDriverState,
  schedule: DaySchedule[]
): {
  xpGain: number;
  fatigueChange: number;
  strengthChange: number;
  finalStrength: number;
} => {
  let totalXP = 0;
  let totalFatigue = 0;
  let currentStrength = driver.strength;
  let daysWithoutExercise = 0;

  schedule.forEach((day) => {
    if (day.isRaceDay) {
      totalFatigue += 35;
      totalXP += 10;
      daysWithoutExercise++;
      return;
    }

    [day.amActivity, day.pmActivity].forEach((activity) => {
      if (!activity) {
        daysWithoutExercise++;
        return;
      }

      switch (activity as DriverActivity) {
        case 'simulation':
          totalXP += 3;
          totalFatigue += 2;
          daysWithoutExercise++;
          break;
        case 'exercise':
          totalXP += 1;
          totalFatigue += 3;
          currentStrength = Math.min(100, currentStrength + 1.5);
          daysWithoutExercise = 0;
          break;
        case 'chill':
          totalFatigue -= 5;
          daysWithoutExercise++;
          break;
      }
    });
  });

  // Apply strength decay
  if (daysWithoutExercise > 0) {
    currentStrength = applyStrengthDecay(currentStrength, daysWithoutExercise);
  }

  return {
    xpGain: totalXP,
    fatigueChange: totalFatigue,
    strengthChange: currentStrength - driver.strength,
    finalStrength: currentStrength,
  };
};

// XP & Level System
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

// Weary State Logic
export const getWearyState = (fatigue: number): WearyState => {
  if (fatigue >= 86) return 'burnt-out';
  if (fatigue >= 61) return 'exhausted';
  if (fatigue >= 31) return 'tired';
  return 'fresh';
};

// Fatigue Penalties
export const applyFatiguePenalty = (skill: number, wearyState: WearyState): number => {
  const penalty = wearyState === 'burnt-out' ? 0.90 :
                  wearyState === 'exhausted' ? 0.95 :
                  wearyState === 'tired' ? 0.98 : 1.0;
  return skill * penalty;
};

// Training XP & Fatigue
export const getTrainingXP = (plan: DriverTrainingPlan): number => {
  if (plan.type === 'fitness') return 20;

  const baseXP = 60;
  const intensityMultiplier = plan.intensity === 'intense' ? 1.33 :
                              plan.intensity === 'moderate' ? 1.0 : 0.67;
  return Math.round(baseXP * intensityMultiplier);
};

export const getTrainingFatigue = (plan: DriverTrainingPlan): number => {
  if (plan.type === 'fitness') return -30;

  return plan.intensity === 'intense' ? 25 :
         plan.intensity === 'moderate' ? 15 : 10;
};

// Training Duration
export const getTrainingDuration = (type: string, intensity: TrainingIntensity): number => {
  if (type === 'fitness') return 7;

  return intensity === 'intense' ? 14 :
         intensity === 'moderate' ? 10 : 7;
};

// Skill Caps based on Level
export const getSkillCaps = (level: number) => {
  const baseCap = 85 + (level - 1) * 2;
  return {
    racecraft: baseCap,
    consistency: baseCap,
    tyreManagement: baseCap,
    wetWeather: baseCap,
  };
};

// Race XP Calculation
export const calculateRaceXP = (position: number, totalDrivers: number = 20): number => {
  const baseXP = 200 - (position - 1) * 7.5;
  return Math.max(50, Math.round(baseXP));
};

// Practice XP
export const PRACTICE_XP = 30;

// Complete Training
export const completeDriverTraining = (driver: OfflineDriverState, plan: DriverTrainingPlan): OfflineDriverState => {
  const xpGain = getTrainingXP(plan);
  const fatigueChange = getTrainingFatigue(plan);

  let newFatigue = Math.max(0, Math.min(100, driver.fatigue + fatigueChange));
  const newXP = driver.xp + xpGain;

  // Check for level up
  let newLevel = driver.level;
  while (newXP >= getTotalXPForLevel(newLevel + 1) && newLevel < 10) {
    newLevel++;
  }

  return {
    ...driver,
    xp: newXP,
    level: newLevel,
    fatigue: newFatigue,
    wearyState: getWearyState(newFatigue),
    trainingPlan: undefined,
  };
};
