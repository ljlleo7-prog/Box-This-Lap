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
import { TyreManager } from './TyreManager';
var WeekendManager = /** @class */ (function () {
    function WeekendManager() {
    }
    WeekendManager.getNextPhase = function (currentPhase) {
        var idx = this.PHASE_ORDER.indexOf(currentPhase);
        if (idx === -1 || idx === this.PHASE_ORDER.length - 1)
            return null;
        return this.PHASE_ORDER[idx + 1];
    };
    WeekendManager.transitionToNextPhase = function (weekend) {
        var nextPhase = this.getNextPhase(weekend.currentPhase);
        if (!nextPhase)
            return weekend;
        var updatedWeekend = __assign(__assign({}, weekend), { currentPhase: nextPhase });
        // Handle session-specific logic when transitioning FROM a session
        if (weekend.currentPhase !== 'pre_weekend' && weekend.currentPhase !== 'post_race') {
            var completedSession_1 = weekend.currentPhase;
            if (!updatedWeekend.completedSessions.includes(completedSession_1)) {
                updatedWeekend.completedSessions = __spreadArray(__spreadArray([], updatedWeekend.completedSessions, true), [completedSession_1], false);
            }
            // Apply Tyre Return Rules
            var newAllocations_1 = __assign({}, weekend.tyreAllocations);
            Object.keys(newAllocations_1).forEach(function (driverId) {
                newAllocations_1[driverId] = TyreManager.applySessionReturnRules(newAllocations_1[driverId], completedSession_1);
            });
            updatedWeekend.tyreAllocations = newAllocations_1;
        }
        // Handle Parc Ferme (Transitioning TO Q1)
        if (nextPhase === 'q1') {
            // Copy FP3 mechanical setups to Q1, Q2, Q3, and Race
            var drivers = Object.keys(weekend.fp3Setup || {});
            drivers.forEach(function (driverId) {
                var _a, _b, _c, _d;
                var _e, _f, _g, _h;
                var fp3 = weekend.fp3Setup[driverId];
                if (fp3) {
                    var mechanical = {
                        frontWingAngle: fp3.frontWingAngle,
                        rearWingAngle: fp3.rearWingAngle,
                        rideHeight: fp3.rideHeight,
                        suspensionStiffness: fp3.suspensionStiffness,
                        toeOut: fp3.toeOut,
                        camber: fp3.camber,
                        gearboxSetting: fp3.gearboxSetting,
                    };
                    updatedWeekend.q1Setup = __assign(__assign({}, updatedWeekend.q1Setup), (_a = {}, _a[driverId] = __assign(__assign({}, (_e = updatedWeekend.q1Setup) === null || _e === void 0 ? void 0 : _e[driverId]), mechanical), _a));
                    updatedWeekend.q2Setup = __assign(__assign({}, updatedWeekend.q2Setup), (_b = {}, _b[driverId] = __assign(__assign({}, (_f = updatedWeekend.q2Setup) === null || _f === void 0 ? void 0 : _f[driverId]), mechanical), _b));
                    updatedWeekend.q3Setup = __assign(__assign({}, updatedWeekend.q3Setup), (_c = {}, _c[driverId] = __assign(__assign({}, (_g = updatedWeekend.q3Setup) === null || _g === void 0 ? void 0 : _g[driverId]), mechanical), _c));
                    updatedWeekend.raceSetup = __assign(__assign({}, updatedWeekend.raceSetup), (_d = {}, _d[driverId] = __assign(__assign({}, (_h = updatedWeekend.raceSetup) === null || _h === void 0 ? void 0 : _h[driverId]), mechanical), _d));
                }
            });
        }
        return updatedWeekend;
    };
    WeekendManager.PHASE_ORDER = [
        'pre_weekend', 'fp1', 'fp2', 'fp3', 'q1', 'q2', 'q3', 'race', 'post_race'
    ];
    return WeekendManager;
}());
export { WeekendManager };
