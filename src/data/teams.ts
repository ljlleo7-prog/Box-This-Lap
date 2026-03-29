import { Driver } from '../types';
import { DRIVERS } from './initialData';

export interface TeamTemplate {
  name: string;
  color: string;
  budget: number;
  reputation: number;
  tokenCost: number;
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
  performance: {
    car: number; // 0-100
    industry: number; // 0-100
    drivers: number; // Average of drivers
  };
  drivers: Driver[];
}

// Helper to get drivers for a team
const getDrivers = (teamName: string) => DRIVERS.filter(d => d.team === teamName);

// Helper to calculate driver average
const getDriverAvg = (drivers: Driver[]) => {
  if (!drivers.length) return 0;
  const total = drivers.reduce((sum, d) => sum + d.basePace, 0); // Using basePace as proxy for now, or use overall skill
  // Let's use a simpler skill average
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
    tokenCost: 200,
    specs: {
      acceleration: 92.4,
      braking: 91.3,
      drag_reduction: 90.6,
      cornering_low: 90.2,
      cornering_mid: 92.8,
      cornering_high: 94.1,
      ers_efficiency: 90.4,
      cooling: 88.7,
      lifespan: 87.5,
      drs_efficiency: 92.1
    },
    performance: { car: 98, industry: 95, drivers: 0 },
    drivers: getDrivers('Red Bull Racing')
  },
  {
    name: 'Ferrari',
    color: '#F91536',
    budget: 140000000,
    reputation: 95,
    tokenCost: 180,
    specs: {
      acceleration: 90.8,
      braking: 89.6,
      drag_reduction: 88.2,
      cornering_low: 89.0,
      cornering_mid: 91.1,
      cornering_high: 92.0,
      ers_efficiency: 88.9,
      cooling: 87.4,
      lifespan: 86.2,
      drs_efficiency: 90.1
    },
    performance: { car: 94, industry: 90, drivers: 0 },
    drivers: getDrivers('Ferrari')
  },
  {
    name: 'Mercedes',
    color: '#6CD3BF',
    budget: 140000000,
    reputation: 95,
    tokenCost: 175,
    specs: {
      acceleration: 89.9,
      braking: 90.4,
      drag_reduction: 87.6,
      cornering_low: 88.5,
      cornering_mid: 90.2,
      cornering_high: 91.0,
      ers_efficiency: 90.7,
      cooling: 90.2,
      lifespan: 89.1,
      drs_efficiency: 88.6
    },
    performance: { car: 92, industry: 92, drivers: 0 },
    drivers: getDrivers('Mercedes')
  },
  {
    name: 'McLaren',
    color: '#F58020',
    budget: 135000000,
    reputation: 90,
    tokenCost: 170,
    specs: {
      acceleration: 90.6,
      braking: 89.2,
      drag_reduction: 89.8,
      cornering_low: 88.0,
      cornering_mid: 90.5,
      cornering_high: 92.3,
      ers_efficiency: 89.6,
      cooling: 88.9,
      lifespan: 87.9,
      drs_efficiency: 90.4
    },
    performance: { car: 93, industry: 88, drivers: 0 },
    drivers: getDrivers('McLaren')
  },
  {
    name: 'Aston Martin',
    color: '#225941',
    budget: 130000000,
    reputation: 85,
    tokenCost: 140,
    specs: {
      acceleration: 87.8,
      braking: 87.2,
      drag_reduction: 86.9,
      cornering_low: 86.4,
      cornering_mid: 87.6,
      cornering_high: 88.4,
      ers_efficiency: 86.8,
      cooling: 87.1,
      lifespan: 85.5,
      drs_efficiency: 86.9
    },
    performance: { car: 88, industry: 85, drivers: 0 },
    drivers: getDrivers('Aston Martin')
  },
  {
    name: 'Alpine',
    color: '#0090FF',
    budget: 125000000,
    reputation: 80,
    tokenCost: 120,
    specs: {
      acceleration: 86.9,
      braking: 86.1,
      drag_reduction: 85.4,
      cornering_low: 85.8,
      cornering_mid: 86.5,
      cornering_high: 87.3,
      ers_efficiency: 85.7,
      cooling: 86.0,
      lifespan: 84.8,
      drs_efficiency: 85.3
    },
    performance: { car: 85, industry: 82, drivers: 0 },
    drivers: getDrivers('Alpine')
  },
  {
    name: 'Williams',
    color: '#005AFF',
    budget: 120000000,
    reputation: 75,
    tokenCost: 100,
    specs: {
      acceleration: 85.2,
      braking: 84.7,
      drag_reduction: 84.9,
      cornering_low: 82.8,
      cornering_mid: 83.6,
      cornering_high: 84.4,
      ers_efficiency: 84.1,
      cooling: 84.8,
      lifespan: 83.9,
      drs_efficiency: 85.7
    },
    performance: { car: 80, industry: 78, drivers: 0 },
    drivers: getDrivers('Williams')
  },
  {
    name: 'RB',
    color: '#6692FF',
    budget: 115000000,
    reputation: 70,
    tokenCost: 90,
    specs: {
      acceleration: 84.6,
      braking: 84.0,
      drag_reduction: 84.2,
      cornering_low: 83.4,
      cornering_mid: 84.2,
      cornering_high: 85.1,
      ers_efficiency: 84.4,
      cooling: 84.2,
      lifespan: 83.4,
      drs_efficiency: 84.7
    },
    performance: { car: 82, industry: 75, drivers: 0 },
    drivers: getDrivers('RB')
  },
  {
    name: 'Sauber',
    color: '#52E252',
    budget: 110000000,
    reputation: 65,
    tokenCost: 70,
    specs: {
      acceleration: 83.2,
      braking: 82.9,
      drag_reduction: 82.6,
      cornering_low: 81.9,
      cornering_mid: 82.4,
      cornering_high: 83.0,
      ers_efficiency: 82.7,
      cooling: 82.9,
      lifespan: 82.4,
      drs_efficiency: 82.8
    },
    performance: { car: 75, industry: 70, drivers: 0 },
    drivers: getDrivers('Sauber')
  },
  {
    name: 'Haas',
    color: '#B6BABD',
    budget: 105000000,
    reputation: 60,
    tokenCost: 50,
    specs: {
      acceleration: 82.5,
      braking: 82.1,
      drag_reduction: 82.3,
      cornering_low: 81.2,
      cornering_mid: 81.7,
      cornering_high: 82.2,
      ers_efficiency: 82.0,
      cooling: 82.5,
      lifespan: 81.7,
      drs_efficiency: 82.4
    },
    performance: { car: 72, industry: 65, drivers: 0 },
    drivers: getDrivers('Haas')
  }
].map(t => ({
  ...t,
  performance: {
    ...t.performance,
    drivers: getDriverAvg(t.drivers)
  }
}));
