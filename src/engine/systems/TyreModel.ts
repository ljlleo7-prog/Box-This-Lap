import { TyreCompound, Track } from '../../types';

export interface TyreCharacteristics {
    name: string;
    basePaceDelta: number; // Seconds slower per lap than Soft (approx)
    baseWearRate: number; // % per second at standard load
    grip: number; // 0-1 (1 = max grip)
    optimalTempWindow: [number, number]; // Min, Max Celsius
    rainPerformance: number; // 0-1 (1 = best in wet)
}

export const TYRE_COMPOUNDS: Record<TyreCompound, TyreCharacteristics> = {
    'soft': {
        name: 'Soft',
        basePaceDelta: 0.0,
        baseWearRate: 0.07, // ~15 laps
        grip: 1.0,
        optimalTempWindow: [90, 110],
        rainPerformance: 0.1
    },
    'medium': {
        name: 'Medium',
        basePaceDelta: 0.6, // +0.6s
        baseWearRate: 0.045, // ~25 laps
        grip: 0.992, // ~0.8% slower
        optimalTempWindow: [100, 120],
        rainPerformance: 0.1
    },
    'hard': {
        name: 'Hard',
        basePaceDelta: 1.2, // +1.2s
        baseWearRate: 0.025, // ~40 laps
        grip: 0.985, // ~1.5% slower
        optimalTempWindow: [110, 130],
        rainPerformance: 0.1
    },
    'intermediate': {
        name: 'Intermediate',
        basePaceDelta: 3.0, // Slower in dry
        baseWearRate: 0.05, // Wears fast in dry
        grip: 0.96, // Good in light rain
        optimalTempWindow: [80, 100],
        rainPerformance: 0.8
    },
    'wet': {
        name: 'Wet',
        basePaceDelta: 8.0,
        baseWearRate: 0.06,
        grip: 0.90,
        optimalTempWindow: [60, 80],
        rainPerformance: 1.0
    }
};

export class TyreModel {
    
    public static getWearRate(compound: TyreCompound, track: Track, paceMode: string, currentWear: number): number {
        const props = TYRE_COMPOUNDS[compound];
        let rate = props.baseWearRate;

        // 1. Track Abrasiveness
        // Default to 1.0 if not set
        const abrasion = track.tireDegradationFactor || 1.0;
        rate *= abrasion;

        // 2. Pace Mode
        if (paceMode === 'aggressive') rate *= 1.3;
        if (paceMode === 'conservative') rate *= 0.7;

        // 3. Wear Acceleration (The "Cliff")
        // As wear increases, degradation accelerates slightly?
        // Actually, usually wear rate is constant, but performance drops.
        // But for simulation, maybe worn tires wear faster due to sliding?
        if (currentWear > 60) {
            rate *= 1.1;
        }
        if (currentWear > 80) {
            rate *= 1.2;
        }

        return rate;
    }

    public static getGripFactor(compound: TyreCompound, wear: number, waterDepth: number): number {
        const props = TYRE_COMPOUNDS[compound];
        
        // 1. Base Grip
        let grip = props.grip;

        // 2. Wear Impact (Non-linear)
        // 0-50%: Minimal loss
        // 50-80%: Noticeable loss
        // 80-100%: The Cliff
        let wearPenalty = 0;
        if (wear < 40) {
            wearPenalty = (wear / 40) * 0.02; // 0 - 2%
        } else if (wear < 70) {
            wearPenalty = 0.02 + ((wear - 40) / 30) * 0.05; // 2% - 7%
        } else {
            wearPenalty = 0.07 + ((wear - 70) / 30) * 0.15; // 7% - 22% (Massive drop)
        }
        grip *= (1 - wearPenalty);

        // 3. Water Impact
        // If track is wet, Slicks lose grip drastically
        if (waterDepth > 0) {
            if (compound === 'soft' || compound === 'medium' || compound === 'hard') {
                // Slick on wet
                // 1mm water = massive loss
                // 0.1mm = damp, noticeable
                const waterPenalty = Math.min(1.0, waterDepth * 2.0); // 0.5mm = 100% loss
                grip *= (1 - waterPenalty);
            } else if (compound === 'intermediate') {
                // Inter sweet spot: 0 - 2mm (roughly)
                if (waterDepth > 2.0) {
                    grip *= 0.8; // Too wet for inters
                }
            } else if (compound === 'wet') {
                // Wet is good for deep water
                if (waterDepth < 1.0) {
                    grip *= 0.95; // Too dry for wets (overheating)
                }
            }
        }

        return Math.max(0.1, grip);
    }
}
