var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var TyreManager = /** @class */ (function () {
    function TyreManager() {
    }
    /**
     * Standard 2026 Weekend Allocation: 13 dry sets, 4 inters, 3 wets
     * We assign an ID to each physical set.
     */
    TyreManager.initializeAllocation = function (driverId) {
        var allocation = [];
        var idCounter = 1;
        var addSets = function (compound, count) {
            for (var i = 0; i < count; i++) {
                allocation.push({
                    id: "".concat(driverId, "-").concat(compound, "-").concat(idCounter++),
                    compound: compound,
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
    };
    /**
     * After a session, certain number of tyres must be returned to Pirelli.
     * This function marks the most worn eligible sets as returned.
     */
    TyreManager.returnTyres = function (allocation, numSetsToReturn, compound) {
        var updatedAllocation = __spreadArray([], allocation, true);
        // Find eligible sets (not returned, and optionally matching a specific compound)
        var eligibleSets = updatedAllocation.filter(function (t) { return !t.returned && (!compound || t.compound === compound); });
        // Sort by wear descending (most worn first)
        eligibleSets.sort(function (a, b) { return b.wear - a.wear; });
        var _loop_1 = function (i) {
            var set = eligibleSets[i];
            var index = updatedAllocation.findIndex(function (t) { return t.id === set.id; });
            if (index !== -1) {
                updatedAllocation[index] = __assign(__assign({}, updatedAllocation[index]), { returned: true });
            }
        };
        // Return the required number of sets
        for (var i = 0; i < numSetsToReturn && i < eligibleSets.length; i++) {
            _loop_1(i);
        }
        return updatedAllocation;
    };
    /**
     * Standard rules for returning tyres:
     * After FP1: return 2 sets
     * After FP2: return 2 sets
     * After FP3: return 2 sets
     * After Q3: return 1 soft set (for Q3 participants)
     */
    TyreManager.applySessionReturnRules = function (allocation, completedSession) {
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
    };
    return TyreManager;
}());
export { TyreManager };
