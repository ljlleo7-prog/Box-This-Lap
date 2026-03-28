import { TyreManager } from '../src/engine/systems/TyreManager';
import { WeekendManager } from '../src/engine/systems/WeekendManager';
// Mock weekend
var weekend = {
    id: 'w1',
    round: 1,
    trackId: 't1',
    currentPhase: 'pre_weekend',
    completedSessions: [],
    selectedTeamId: 'team1',
    fp1Setup: {
        'driver1': { frontWingAngle: 60, rearWingAngle: 60 }
    },
    fp2Setup: {},
    fp3Setup: {
        'driver1': { frontWingAngle: 70, rearWingAngle: 75, rideHeight: 30 }
    },
    q1Setup: {},
    q2Setup: {},
    q3Setup: {},
    raceSetup: {},
    tyreAllocations: {
        'driver1': TyreManager.initializeAllocation('driver1')
    },
    setupKnowledge: {},
    sessionSummaries: {},
    createdAt: '',
    updatedAt: ''
};
console.log('Initial Allocations:', weekend.tyreAllocations['driver1'].length); // Should be 20
// pre_weekend -> fp1
weekend = WeekendManager.transitionToNextPhase(weekend);
console.log('Phase:', weekend.currentPhase); // fp1
// fp1 -> fp2
weekend = WeekendManager.transitionToNextPhase(weekend);
console.log('Phase:', weekend.currentPhase); // fp2
console.log('Allocations (returned):', weekend.tyreAllocations['driver1'].filter(function (t) { return t.returned; }).length); // 2
// fp2 -> fp3
weekend = WeekendManager.transitionToNextPhase(weekend);
console.log('Phase:', weekend.currentPhase); // fp3
console.log('Allocations (returned):', weekend.tyreAllocations['driver1'].filter(function (t) { return t.returned; }).length); // 4
// fp3 -> q1 (Parc Ferme)
weekend = WeekendManager.transitionToNextPhase(weekend);
console.log('Phase:', weekend.currentPhase); // q1
console.log('Allocations (returned):', weekend.tyreAllocations['driver1'].filter(function (t) { return t.returned; }).length); // 6
console.log('Q1 Setup:', weekend.q1Setup['driver1']); // Should have frontWingAngle: 70, etc.
// q1 -> q2 -> q3 -> race
weekend = WeekendManager.transitionToNextPhase(weekend);
weekend = WeekendManager.transitionToNextPhase(weekend);
weekend = WeekendManager.transitionToNextPhase(weekend);
console.log('Phase:', weekend.currentPhase); // race
console.log('Allocations (returned):', weekend.tyreAllocations['driver1'].filter(function (t) { return t.returned; }).length); // 7 (6 + 1 from q3)
console.log('Race Setup:', weekend.raceSetup['driver1']); // Should have frontWingAngle: 70, etc.
