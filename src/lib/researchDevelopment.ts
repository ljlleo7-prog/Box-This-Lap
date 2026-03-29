import type { FacilityState, PartCategory, PartDesign, ResearchDepartmentState, TeamSpecs, ManufacturingMode } from '../types';

export type ResearchFocusOption = {
  id: string;
  label: string;
  effects: Partial<TeamSpecs>;
};

export type ResearchProjectDefinition = {
  id: PartCategory;
  name: string;
  category: string;
  codePrefix: string;
  baseDurationWeeks: number;
  baseManufacturingDays: number;
  baseManufacturingCost: number;
  partSize: 'small' | 'medium' | 'large';
  moneyScale: number;
  focusOptions: ResearchFocusOption[];
};

const SPEC_KEYS: Array<keyof TeamSpecs> = [
  'acceleration',
  'braking',
  'drag_reduction',
  'cornering_low',
  'cornering_mid',
  'cornering_high',
  'ers_efficiency',
  'cooling',
  'lifespan',
  'drs_efficiency',
];

const ATR_CAPS_BY_STANDING: Record<number, { windTunnelHours: number; cfdHours: number }> = {
  1: { windTunnelHours: 36, cfdHours: 180 },
  2: { windTunnelHours: 38, cfdHours: 190 },
  3: { windTunnelHours: 40, cfdHours: 200 },
  4: { windTunnelHours: 42, cfdHours: 210 },
  5: { windTunnelHours: 44, cfdHours: 220 },
  6: { windTunnelHours: 46, cfdHours: 230 },
  7: { windTunnelHours: 48, cfdHours: 240 },
  8: { windTunnelHours: 50, cfdHours: 250 },
  9: { windTunnelHours: 52, cfdHours: 260 },
  10: { windTunnelHours: 54, cfdHours: 270 },
};

const roundTwo = (value: number) => Math.round(value * 100) / 100;

export const getAtrCapsForStanding = (constructorStanding: number) => {
  return ATR_CAPS_BY_STANDING[constructorStanding] ?? ATR_CAPS_BY_STANDING[5];
};

export const createEmptyResearchState = (constructorStanding = 5): ResearchDepartmentState => {
  const caps = getAtrCapsForStanding(constructorStanding);
  return {
    atr: {
      periodLabel: 'Current ATR Period',
      constructorStanding,
      windTunnelHoursCap: caps.windTunnelHours,
      cfdHoursCap: caps.cfdHours,
      windTunnelHoursUsed: 0,
      cfdHoursUsed: 0,
    },
    activeDesignProjects: [],
    completedDesigns: [],
    manufacturingQueue: [],
    carAssignments: [
      { carId: 'car-1', installedDesignByPart: {} },
      { carId: 'car-2', installedDesignByPart: {} },
    ],
  };
};

export const normalizeBiasAllocations = <T extends { weight: number }>(allocations: T[]): T[] => {
  const total = allocations.reduce((sum, allocation) => sum + Math.max(0, allocation.weight), 0);
  if (total <= 0) return allocations.map((allocation) => ({ ...allocation, weight: 0 }));
  return allocations.map((allocation) => ({
    ...allocation,
    weight: roundTwo((Math.max(0, allocation.weight) / total) * 100),
  }));
};

export const buildNextDesignCode = (partDesigns: PartDesign[], codePrefix: string) => {
  const numbers = partDesigns
    .map((design) => {
      const match = design.code.match(/-(\d+)$/);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value));

  const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${codePrefix}-${String(nextNumber).padStart(2, '0')}`;
};

export const calculateProjectedEffects = (
  definition: ResearchProjectDefinition,
  normalizedWeights: Array<{ focusId: string; weight: number }>,
  money: number,
  windTunnelHours: number,
  cfdHours: number,
  facilities?: Partial<FacilityState>
): Partial<TeamSpecs> => {
  const weightedEffects = SPEC_KEYS.reduce<Record<keyof TeamSpecs, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<keyof TeamSpecs, number>);

  normalizedWeights.forEach(({ focusId, weight }) => {
    const focus = definition.focusOptions.find((option) => option.id === focusId);
    if (!focus || weight <= 0) return;

    Object.entries(focus.effects).forEach(([key, value]) => {
      weightedEffects[key as keyof TeamSpecs] += (value ?? 0) * (weight / 100);
    });
  });

  const investmentFactor = 1 + Math.min(1.25, Math.log10(Math.max(10, money)) * 0.22);
  const aeroFactor = 1 + Math.min(0.8, windTunnelHours / 120 + cfdHours / 600);
  const facilityFactor = 1 + (((facilities?.aero ?? 1) - 1) * 0.04) + (((facilities?.factory ?? 1) - 1) * 0.03) + (((facilities?.powertrain ?? 1) - 1) * 0.02);

  return SPEC_KEYS.reduce<Partial<TeamSpecs>>((acc, key) => {
    acc[key] = roundTwo(weightedEffects[key] * investmentFactor * aeroFactor * facilityFactor);
    return acc;
  }, {});
};

export const calculateDevelopmentTimeWeeks = (
  definition: ResearchProjectDefinition,
  money: number,
  windTunnelHours: number,
  cfdHours: number,
  facilities?: Partial<FacilityState>
) => {
  const investmentSpeedFactor = 1 + Math.min(1.1, Math.log10(Math.max(10, money)) * 0.18);
  const resourceSpeedFactor = 1 + Math.min(0.9, windTunnelHours / 140 + cfdHours / 700);
  const facilityFactor = 1 + (((facilities?.aero ?? 1) - 1) * 0.03) + (((facilities?.factory ?? 1) - 1) * 0.04);

  return roundTwo(definition.baseDurationWeeks / (investmentSpeedFactor * resourceSpeedFactor * facilityFactor));
};

export const calculateManufacturingOrder = (
  definition: ResearchProjectDefinition,
  quantity: number,
  mode: ManufacturingMode,
  facilities?: Partial<FacilityState>
) => {
  const factoryFactor = 1 + (((facilities?.factory ?? 1) - 1) * 0.08);

  const sizeMultiplier = {
    small: 0.7,
    medium: 1.0,
    large: 1.4,
  }[definition.partSize];

  const modeConfig = {
    normal: { timeMultiplier: 1.0, costMultiplier: 1.0, baseDays: [3, 6] },
    intense: { timeMultiplier: 0.6, costMultiplier: 1.8, baseDays: [2, 4] },
    urgent: { timeMultiplier: 0, costMultiplier: 3.5, baseDays: [0, 0] },
  }[mode];

  const baseDays = definition.baseManufacturingDays * sizeMultiplier;
  const adjustedDays = baseDays * modeConfig.timeMultiplier / factoryFactor;
  const durationDays = Math.max(0, Math.round(adjustedDays * quantity));

  const baseCost = definition.baseManufacturingCost * sizeMultiplier;
  const adjustedCost = baseCost * modeConfig.costMultiplier;
  const factoryCostReduction = 1 - Math.min(0.35, ((facilities?.factory ?? 1) - 1) * 0.04);
  const cost = Math.round(adjustedCost * quantity * factoryCostReduction);

  return { durationDays, cost };
};

export const deriveInstalledTeamSpecs = (
  baseSpecs: TeamSpecs,
  researchState: ResearchDepartmentState,
  carId?: 'car-1' | 'car-2'
): TeamSpecs => {
  const designMap = new Map(researchState.completedDesigns.map((design) => [design.id, design]));

  const applyAssignment = (assignmentId?: 'car-1' | 'car-2') => {
    const assignment = researchState.carAssignments.find((entry) => entry.carId === assignmentId);
    const totals = { ...baseSpecs };

    Object.values(assignment?.installedDesignByPart ?? {}).forEach((designId) => {
      if (!designId) return;
      const design = designMap.get(designId);
      if (!design) return;
      SPEC_KEYS.forEach((key) => {
        totals[key] = Math.max(0, Math.min(100, roundTwo(totals[key] + (design.actualEffects[key] ?? 0))));
      });
    });

    return totals;
  };

  if (carId) return applyAssignment(carId);

  const car1 = applyAssignment('car-1');
  const car2 = applyAssignment('car-2');

  return SPEC_KEYS.reduce<TeamSpecs>((acc, key) => {
    acc[key] = roundTwo((car1[key] + car2[key]) / 2);
    return acc;
  }, { ...baseSpecs });
};
