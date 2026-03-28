import { TyreCompound, TyreSet } from '../../types';

export class TyreManager {
  /**
   * Standard 2026 Weekend Allocation: 13 dry sets, 4 inters, 3 wets
   * We assign an ID to each physical set.
   */
  public static initializeAllocation(driverId: string): TyreSet[] {
    const allocation: TyreSet[] = [];
    let idCounter = 1;

    const addSets = (compound: TyreCompound, count: number) => {
      for (let i = 0; i < count; i++) {
        allocation.push({
          id: `${driverId}-${compound}-${idCounter++}`,
          compound,
          wear: 0,
          returned: false,
        });
      }
    };

    // Standard allocation: 8 Softs, 3 Mediums, 2 Hards, 4 Inters, 3 Wets
    addSets('soft', 8);
    addSets('medium', 3);
    addSets('hard', 2);
    addSets('intermediate', 4);
    addSets('wet', 3);

    return allocation;
  }

  /**
   * After a session, certain number of tyres must be returned to Pirelli.
   * This function marks the most worn eligible sets as returned.
   */
  public static returnTyres(allocation: TyreSet[], numSetsToReturn: number, compound?: TyreCompound): TyreSet[] {
    const updatedAllocation = [...allocation];
    
    // Find eligible sets (not returned, and optionally matching a specific compound)
    const eligibleSets = updatedAllocation.filter(t => !t.returned && (!compound || t.compound === compound));
    
    // Sort by wear descending (most worn first)
    eligibleSets.sort((a, b) => b.wear - a.wear);
    
    // Return the required number of sets
    for (let i = 0; i < numSetsToReturn && i < eligibleSets.length; i++) {
      const set = eligibleSets[i];
      const index = updatedAllocation.findIndex(t => t.id === set.id);
      if (index !== -1) {
        updatedAllocation[index] = { ...updatedAllocation[index], returned: true };
      }
    }
    
    return updatedAllocation;
  }

  /**
   * Standard rules for returning tyres:
   * After FP1: return 2 sets
   * After FP2: return 2 sets
   * After FP3: return 2 sets
   * After Q3: return 1 soft set (for Q3 participants)
   */
  public static applySessionReturnRules(allocation: TyreSet[], completedSession: string): TyreSet[] {
    switch (completedSession) {
      case 'fp1':
        return this.returnTyres(allocation, 2);
      case 'fp2':
        return this.returnTyres(allocation, 2);
      case 'fp3':
        return this.returnTyres(allocation, 2);
      case 'q3':
        // Specifically return one Soft set
        return this.returnTyres(allocation, 1, 'soft');
      default:
        return allocation;
    }
  }
}
