import { Driver, Track } from '../types';

export const TRACKS: Track[] = [
  {
    id: 'silverstone-gp',
    name: 'Silverstone Grand Prix',
    totalDistance: 5891, // meters
    sectors: [
      // Hamilton Straight (Start/Finish)
      { id: 'hamilton_str', name: 'Hamilton Straight', startDistance: 0, endDistance: 270, type: 'straight', difficulty: 0.1 },
      // T1 Abbey - High speed right
      { id: 't1_abbey', name: 'Abbey', startDistance: 270, endDistance: 400, type: 'corner_high_speed', difficulty: 0.7 },
      // T2 Farm - Flat out left
      { id: 't2_farm', name: 'Farm', startDistance: 400, endDistance: 600, type: 'straight', difficulty: 0.2 },
      // T3 Village - Slow right (braking zone)
      { id: 't3_village', name: 'Village', startDistance: 600, endDistance: 750, type: 'corner_low_speed', difficulty: 0.8 },
      // T4 The Loop - Very slow left hairpin
      { id: 't4_loop', name: 'The Loop', startDistance: 750, endDistance: 900, type: 'corner_low_speed', difficulty: 0.9 },
      // T5 Aintree - Flat out left onto straight
      { id: 't5_aintree', name: 'Aintree', startDistance: 900, endDistance: 1050, type: 'corner_medium_speed', difficulty: 0.5 },
      // Wellington Straight (DRS 1)
      { id: 'wellington_str', name: 'Wellington Straight', startDistance: 1050, endDistance: 1800, type: 'straight', difficulty: 0.1 },
      // T6 Brooklands - Medium left
      { id: 't6_brooklands', name: 'Brooklands', startDistance: 1800, endDistance: 2000, type: 'corner_medium_speed', difficulty: 0.7 },
      // T7 Luffield - Long medium right
      { id: 't7_luffield', name: 'Luffield', startDistance: 2000, endDistance: 2300, type: 'corner_medium_speed', difficulty: 0.8 },
      // T8 Woodcote - Flat out right
      { id: 't8_woodcote', name: 'Woodcote', startDistance: 2300, endDistance: 2600, type: 'straight', difficulty: 0.3 },
      // T9 Copse - Super high speed right
      { id: 't9_copse', name: 'Copse', startDistance: 2600, endDistance: 2850, type: 'corner_high_speed', difficulty: 0.9 },
      // Maggots/Becketts Complex - High speed S-bends
      { id: 't10_maggots', name: 'Maggots', startDistance: 2850, endDistance: 3100, type: 'corner_high_speed', difficulty: 0.95 },
      { id: 't11_becketts', name: 'Becketts', startDistance: 3100, endDistance: 3300, type: 'corner_high_speed', difficulty: 0.95 },
      { id: 't12_chapel', name: 'Chapel', startDistance: 3300, endDistance: 3500, type: 'corner_high_speed', difficulty: 0.9 },
      // Hangar Straight (DRS 2)
      { id: 'hangar_str', name: 'Hangar Straight', startDistance: 3500, endDistance: 4300, type: 'straight', difficulty: 0.1 },
      // T15 Stowe - High speed right
      { id: 't15_stowe', name: 'Stowe', startDistance: 4300, endDistance: 4600, type: 'corner_high_speed', difficulty: 0.8 },
      // T16 Vale - Heavy braking chicane/straight
      { id: 'vale_str', name: 'Vale Entry', startDistance: 4600, endDistance: 4800, type: 'straight', difficulty: 0.2 },
      { id: 't16_vale', name: 'Vale', startDistance: 4800, endDistance: 4950, type: 'corner_low_speed', difficulty: 0.8 },
      // T17/18 Club - Slow to accelerating right
      { id: 't17_club', name: 'Club', startDistance: 4950, endDistance: 5300, type: 'corner_medium_speed', difficulty: 0.7 },
      // Main Straight run to line
      { id: 'main_str', name: 'Main Straight', startDistance: 5300, endDistance: 5891, type: 'straight', difficulty: 0.1 },
    ],
    drsZones: [
        { detectionDistance: 600, activationDistance: 1050, endDistance: 1800 }, // Wellington Straight (after The Loop)
        { detectionDistance: 3300, activationDistance: 3550, endDistance: 4300 } // Hangar Straight (after Chapel)
    ],
    pitLane: {
      entryDistance: 4800, // Vale
      exitDistance: 400, // Farm
      speedLimit: 22.2, // 80 km/h
      stopTime: 25,
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
    basePace: 88.4,
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
    basePace: 88.1,
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
    basePace: 88.2,
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
    basePace: 88.2,
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
    basePace: 88.3,
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
    basePace: 88.1,
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
    basePace: 88.3,
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
    basePace: 88.5,
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
    basePace: 89.0,
    skill: { racecraft: 75, consistency: 70, tyreManagement: 75, wetWeather: 85 },
    personality: { aggression: 80, stressResistance: 70, teamPlayer: 90 },
    morale: 75,
    trust: 80,
  },
  // Alpine
  {
    id: 'gas',
    name: 'Pierre Gasly',
    team: 'Alpine',
    color: '#0090FF',
    basePace: 88.9,
    skill: { racecraft: 88, consistency: 85, tyreManagement: 85, wetWeather: 92 },
    personality: { aggression: 85, stressResistance: 80, teamPlayer: 80 },
    morale: 80,
    trust: 85,
  },
  {
    id: 'oco',
    name: 'Esteban Ocon',
    team: 'Alpine',
    color: '#0090FF',
    basePace: 89.0,
    skill: { racecraft: 90, consistency: 85, tyreManagement: 82, wetWeather: 90 },
    personality: { aggression: 90, stressResistance: 85, teamPlayer: 70 },
    morale: 80,
    trust: 80,
  },
  // Williams
  {
    id: 'alb',
    name: 'Alexander Albon',
    team: 'Williams',
    color: '#005AFF',
    basePace: 89.1,
    skill: { racecraft: 88, consistency: 88, tyreManagement: 90, wetWeather: 85 },
    personality: { aggression: 80, stressResistance: 85, teamPlayer: 95 },
    morale: 85,
    trust: 90,
  },
  {
    id: 'sar',
    name: 'Logan Sargeant',
    team: 'Williams',
    color: '#005AFF',
    basePace: 89.5,
    skill: { racecraft: 75, consistency: 70, tyreManagement: 75, wetWeather: 70 },
    personality: { aggression: 75, stressResistance: 70, teamPlayer: 90 },
    morale: 70,
    trust: 80,
  },
  // RB (Visa Cash App RB)
  {
    id: 'ric',
    name: 'Daniel Ricciardo',
    team: 'RB',
    color: '#6692FF',
    basePace: 89.0,
    skill: { racecraft: 92, consistency: 85, tyreManagement: 88, wetWeather: 85 },
    personality: { aggression: 85, stressResistance: 90, teamPlayer: 90 },
    morale: 85,
    trust: 90,
  },
  {
    id: 'tsu',
    name: 'Yuki Tsunoda',
    team: 'RB',
    color: '#6692FF',
    basePace: 88.9,
    skill: { racecraft: 85, consistency: 80, tyreManagement: 80, wetWeather: 82 },
    personality: { aggression: 92, stressResistance: 75, teamPlayer: 80 },
    morale: 85,
    trust: 85,
  },
  // Sauber (Stake F1 Team Kick Sauber)
  {
    id: 'bot',
    name: 'Valtteri Bottas',
    team: 'Sauber',
    color: '#52E252',
    basePace: 89.2,
    skill: { racecraft: 85, consistency: 92, tyreManagement: 90, wetWeather: 85 },
    personality: { aggression: 70, stressResistance: 95, teamPlayer: 95 },
    morale: 80,
    trust: 90,
  },
  {
    id: 'zho',
    name: 'Guanyu Zhou',
    team: 'Sauber',
    color: '#52E252',
    basePace: 89.3,
    skill: { racecraft: 80, consistency: 85, tyreManagement: 85, wetWeather: 80 },
    personality: { aggression: 75, stressResistance: 85, teamPlayer: 90 },
    morale: 80,
    trust: 85,
  },
  // Haas
  {
    id: 'hul',
    name: 'Nico Hulkenberg',
    team: 'Haas',
    color: '#B6BABD',
    basePace: 89.1,
    skill: { racecraft: 88, consistency: 88, tyreManagement: 80, wetWeather: 90 },
    personality: { aggression: 85, stressResistance: 90, teamPlayer: 85 },
    morale: 85,
    trust: 90,
  },
  {
    id: 'mag',
    name: 'Kevin Magnussen',
    team: 'Haas',
    color: '#B6BABD',
    basePace: 89.2,
    skill: { racecraft: 90, consistency: 80, tyreManagement: 75, wetWeather: 88 },
    personality: { aggression: 95, stressResistance: 85, teamPlayer: 80 },
    morale: 80,
    trust: 85,
  },
];
