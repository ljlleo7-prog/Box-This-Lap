import { Driver } from '../types/index.ts';
import { DRIVERS } from './initialData.ts';

export interface TeamTemplate {
  name: string;
  color: string;
  budget: number;
  reputation: number;
  tokenCost: number;
  performance: {
    car: number; // 0-100
    industry: number; // 0-100
    drivers: number; // Average of drivers
  };
  specs: {
    acceleration: number;
    braking: number;
    drag_reduction: number;
    cornering_low: number;
    cornering_mid: number;
    cornering_high: number;
    ers_efficiency: number;
    cooling: number;
    lifespan: number;
    drs_efficiency: number;
  };
  drivers: Driver[];
}

// Helper to get drivers for a team
const getDrivers = (teamName: string) => DRIVERS.filter(d => d.team === teamName);

// Helper to calculate driver average
const getDriverAvg = (drivers: Driver[]) => {
  if (!drivers.length) return 0;
  // Use simple skill average
  const skillAvg = drivers.reduce((sum, d) => {
    const skills = Object.values(d.skill);
    return sum + (skills.reduce((a, b) => a + b, 0) / skills.length);
  }, 0);
  return Math.round(skillAvg / drivers.length);
};

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    name: 'Red Bull Racing',
    color: '#3671C6',
    budget: 145000000,
    reputation: 100,
    tokenCost: 175,
    performance: { car: 92, industry: 95, drivers: 0 },
    specs: {
      acceleration: 95,
      braking: 93,
      drag_reduction: 92,
      cornering_low: 92,
      cornering_mid: 96,
      cornering_high: 96,
      ers_efficiency: 95,
      cooling: 92,
      lifespan: 95,
      drs_efficiency: 94
    },
    drivers: getDrivers('Red Bull Racing')
  },
  {
    name: 'Ferrari',
    color: '#F91536',
    budget: 140000000,
    reputation: 95,
    tokenCost: 180,
    performance: { car: 94, industry: 90, drivers: 0 },
    specs: {
      acceleration: 92,
      braking: 94,
      drag_reduction: 90,
      cornering_low: 95,
      cornering_mid: 92,
      cornering_high: 93,
      ers_efficiency: 92,
      cooling: 90,
      lifespan: 93,
      drs_efficiency: 90
    },
    drivers: getDrivers('Ferrari')
  },
  {
    name: 'Mercedes',
    color: '#6CD3BF',
    budget: 140000000,
    reputation: 95,
    tokenCost: 175,
    performance: { car: 92, industry: 92, drivers: 0 },
    specs: {
      acceleration: 90,
      braking: 95,
      drag_reduction: 90,
      cornering_low: 92,
      cornering_mid: 92,
      cornering_high: 92,
      ers_efficiency: 93,
      cooling: 91,
      lifespan: 94,
      drs_efficiency: 89
    },
    drivers: getDrivers('Mercedes')
  },
  {
    name: 'McLaren',
    color: '#F58020',
    budget: 135000000,
    reputation: 90,
    tokenCost: 165,
    performance: { car: 96, industry: 88, drivers: 0 },
    specs: {
      acceleration: 93,
      braking: 91,
      drag_reduction: 91,
      cornering_low: 88,
      cornering_mid: 94,
      cornering_high: 95,
      ers_efficiency: 92,
      cooling: 90,
      lifespan: 92,
      drs_efficiency: 92
    },
    drivers: getDrivers('McLaren')
  },
  {
    name: 'Aston Martin',
    color: '#225941',
    budget: 130000000,
    reputation: 85,
    tokenCost: 140,
    performance: { car: 88, industry: 85, drivers: 0 },
    specs: {
      acceleration: 88,
      braking: 90,
      drag_reduction: 86,
      cornering_low: 92,
      cornering_mid: 90,
      cornering_high: 88,
      ers_efficiency: 88,
      cooling: 89,
      lifespan: 90,
      drs_efficiency: 86
    },
    drivers: getDrivers('Aston Martin')
  },
  {
    name: 'Alpine',
    color: '#0090FF',
    budget: 125000000,
    reputation: 80,
    tokenCost: 120,
    performance: { car: 85, industry: 82, drivers: 0 },
    specs: {
      acceleration: 84,
      braking: 85,
      drag_reduction: 82,
      cornering_low: 84,
      cornering_mid: 85,
      cornering_high: 83,
      ers_efficiency: 84,
      cooling: 85,
      lifespan: 88,
      drs_efficiency: 82
    },
    drivers: getDrivers('Alpine')
  },
  {
    name: 'Williams',
    color: '#005AFF',
    budget: 120000000,
    reputation: 75,
    tokenCost: 100,
    performance: { car: 80, industry: 78, drivers: 0 },
    specs: {
      acceleration: 82,
      braking: 78,
      drag_reduction: 88,
      cornering_low: 72,
      cornering_mid: 75,
      cornering_high: 76,
      ers_efficiency: 82,
      cooling: 86,
      lifespan: 88,
      drs_efficiency: 88
    },
    drivers: getDrivers('Williams')
  },
  {
    name: 'RB',
    color: '#6692FF',
    budget: 115000000,
    reputation: 70,
    tokenCost: 80,
    performance: { car: 78, industry: 75, drivers: 0 },
    specs: {
      acceleration: 80,
      braking: 82,
      drag_reduction: 80,
      cornering_low: 82,
      cornering_mid: 84,
      cornering_high: 82,
      ers_efficiency: 82,
      cooling: 84,
      lifespan: 86,
      drs_efficiency: 80
    },
    drivers: getDrivers('RB')
  },
  {
    name: 'Sauber',
    color: '#52E252',
    budget: 110000000,
    reputation: 65,
    tokenCost: 55,
    performance: { car: 74, industry: 64, drivers: 0 },
    specs: {
      acceleration: 78,
      braking: 80,
      drag_reduction: 78,
      cornering_low: 80,
      cornering_mid: 82,
      cornering_high: 80,
      ers_efficiency: 80,
      cooling: 82,
      lifespan: 85,
      drs_efficiency: 78
    },
    drivers: getDrivers('Sauber')
  },
  {
    name: 'Haas',
    color: '#B6BABD',
    budget: 105000000,
    reputation: 60,
    tokenCost: 60,
    performance: { car: 78, industry: 68, drivers: 0 },
    specs: {
      acceleration: 76,
      braking: 78,
      drag_reduction: 76,
      cornering_low: 78,
      cornering_mid: 78,
      cornering_high: 76,
      ers_efficiency: 78,
      cooling: 80,
      lifespan: 84,
      drs_efficiency: 76
    },
    drivers: getDrivers('Haas')
  }
].map(t => ({
  ...t,
  performance: {
    ...t.performance,
    drivers: getDriverAvg(t.drivers)
  }
}));
