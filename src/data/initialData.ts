import { Driver, Track } from '../types';

export const TRACKS: Track[] = [
  {
    id: 'silverstone-gp',
    name: 'Silverstone Grand Prix',
    totalDistance: 5891, // meters
    sectors: [
      { id: 's1', startDistance: 0, endDistance: 1800, isPassZone: true, difficulty: 0.8 },
      { id: 's2', startDistance: 1800, endDistance: 3800, isPassZone: false, difficulty: 0.9 },
      { id: 's3', startDistance: 3800, endDistance: 5891, isPassZone: true, difficulty: 0.7 },
    ],
    pitLane: {
      entryDistance: 5800,
      exitDistance: 200,
      speedLimit: 22.2, // 80 km/h = 22.2 m/s
      stopTime: 25, // seconds
    },
  },
];

export const DRIVERS: Driver[] = [
  // Red Bull
  {
    id: 'ver',
    name: 'Max Verstappen',
    team: 'Red Bull Racing',
    color: '#3671C6',
    basePace: 88.0,
    skill: { racecraft: 99, consistency: 98, tyreManagement: 95, wetWeather: 99 },
    personality: { aggression: 95, stressResistance: 95, teamPlayer: 60 },
    morale: 100,
    trust: 100,
  },
  {
    id: 'per',
    name: 'Sergio Perez',
    team: 'Red Bull Racing',
    color: '#3671C6',
    basePace: 89.2,
    skill: { racecraft: 85, consistency: 82, tyreManagement: 92, wetWeather: 75 },
    personality: { aggression: 70, stressResistance: 80, teamPlayer: 95 },
    morale: 85,
    trust: 90,
  },
  // Ferrari
  {
    id: 'lec',
    name: 'Charles Leclerc',
    team: 'Ferrari',
    color: '#F91536',
    basePace: 88.3,
    skill: { racecraft: 92, consistency: 88, tyreManagement: 85, wetWeather: 90 },
    personality: { aggression: 85, stressResistance: 80, teamPlayer: 90 },
    morale: 90,
    trust: 90,
  },
  {
    id: 'sai',
    name: 'Carlos Sainz',
    team: 'Ferrari',
    color: '#F91536',
    basePace: 88.9,
    skill: { racecraft: 90, consistency: 90, tyreManagement: 88, wetWeather: 85 },
    personality: { aggression: 80, stressResistance: 85, teamPlayer: 85 },
    morale: 88,
    trust: 85,
  },
  // Mercedes
  {
    id: 'ham',
    name: 'Lewis Hamilton',
    team: 'Mercedes',
    color: '#6CD3BF',
    basePace: 88.5,
    skill: { racecraft: 95, consistency: 95, tyreManagement: 98, wetWeather: 95 },
    personality: { aggression: 80, stressResistance: 90, teamPlayer: 90 },
    morale: 90,
    trust: 95,
  },
  {
    id: 'rus',
    name: 'George Russell',
    team: 'Mercedes',
    color: '#6CD3BF',
    basePace: 88.8,
    skill: { racecraft: 90, consistency: 88, tyreManagement: 85, wetWeather: 88 },
    personality: { aggression: 88, stressResistance: 85, teamPlayer: 85 },
    morale: 85,
    trust: 90,
  },
  // McLaren
  {
    id: 'nor',
    name: 'Lando Norris',
    team: 'McLaren',
    color: '#F58020',
    basePace: 88.6,
    skill: { racecraft: 90, consistency: 92, tyreManagement: 90, wetWeather: 92 },
    personality: { aggression: 85, stressResistance: 85, teamPlayer: 95 },
    morale: 95,
    trust: 100,
  },
  {
    id: 'pia',
    name: 'Oscar Piastri',
    team: 'McLaren',
    color: '#F58020',
    basePace: 89.0,
    skill: { racecraft: 88, consistency: 90, tyreManagement: 85, wetWeather: 85 },
    personality: { aggression: 75, stressResistance: 95, teamPlayer: 90 },
    morale: 90,
    trust: 95,
  },
  // Aston Martin
  {
    id: 'alo',
    name: 'Fernando Alonso',
    team: 'Aston Martin',
    color: '#225941',
    basePace: 89.1,
    skill: { racecraft: 98, consistency: 95, tyreManagement: 90, wetWeather: 90 },
    personality: { aggression: 90, stressResistance: 95, teamPlayer: 70 },
    morale: 85,
    trust: 90,
  },
  {
    id: 'str',
    name: 'Lance Stroll',
    team: 'Aston Martin',
    color: '#225941',
    basePace: 90.5,
    skill: { racecraft: 75, consistency: 70, tyreManagement: 75, wetWeather: 85 },
    personality: { aggression: 80, stressResistance: 70, teamPlayer: 90 },
    morale: 75,
    trust: 80,
  },
];
