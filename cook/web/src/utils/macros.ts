import type { Config, DayRecord } from '../types';

export const KCAL = { protein: 4, fat: 9, carb: 4 };

/** Energy supplied by each macro (kcal). */
export function proteinKcal(r: DayRecord): number {
  return r.protein * KCAL.protein;
}
export function fatKcal(r: DayRecord): number {
  return r.fat * KCAL.fat;
}
export function carbKcal(r: DayRecord): number {
  return r.carb * KCAL.carb;
}

export function deficit(calories: number, tdee: number): number {
  return tdee - calories;
}
export function deficitPct(calories: number, tdee: number): number {
  return ((tdee - calories) / tdee) * 100;
}
export function proteinPerKg(protein: number, weightKg: number): number {
  return protein / weightKg;
}

/**
 * Map a day's calories (as a ratio to TDEE) to a status color.
 *  - ratio < 0.75 : eating too little (excess deficit) -> blue
 *  - 0.75..1.0    : on target (cutting zone)          -> green
 *  - > 1.0        : over target (surplus)             -> red
 */
export function ratioColor(ratio: number): string {
  if (ratio < 0.75) return '#38bdf8';
  if (ratio <= 1.0) return '#22c55e';
  return '#ef4444';
}

export function calColor(calories: number, tdee: number): string {
  return ratioColor(calories / tdee);
}

/** Warning result for a single metric: optional color + optional small-text hint. */
export interface Warn {
  color?: string;
  hint?: string;
}

/** Calories vs TDEE: too low (ate much less) -> blue, over -> red. */
export function calorieWarn(calories: number, tdee: number): Warn {
  const ratio = calories / tdee;
  if (ratio < 0.75) return { color: '#38bdf8', hint: '偏低' };
  if (ratio > 1.0) return { color: '#ef4444', hint: '超标' };
  return { color: '#22c55e' };
}

/** Deficit % vs allowed max: over the cap -> red. */
export function deficitWarn(pct: number, max: number): Warn {
  if (pct > max) return { color: '#ef4444', hint: '缺口过大' };
  return {};
}

/** Generic bounded metric: below min -> red low hint, above max -> red high hint. */
export function rangeWarn(
  v: number,
  min: number,
  max: number,
  low: string,
  high: string,
): Warn {
  if (v < min) return { color: '#ef4444', hint: low };
  if (v > max) return { color: '#ef4444', hint: high };
  return {};
}

/** Water (ml): only flagged when recorded; below min / above max -> red. */
export function waterWarn(v: number | undefined, min: number, max: number): Warn {
  if (v == null) return {};
  return rangeWarn(v, min, max, '饮水不足', '过量');
}

/** Three-segment stacked bar proportions (0..1) for P/F/C energy. */
export function macroSegments(r: DayRecord): { p: number; f: number; c: number } {
  const pe = proteinKcal(r);
  const fe = fatKcal(r);
  const ce = carbKcal(r);
  const sum = pe + fe + ce;
  if (sum <= 0) return { p: 0, f: 0, c: 0 };
  return { p: pe / sum, f: fe / sum, c: ce / sum };
}

export interface ScopeStats {
  count: number;
  totalCalories: number;
  avgCalories: number;
  avgDeficitPct: number;
  avgProteinPerKg: number;
  avgFiber: number;
  avgProtein: number;
  avgCarb: number;
  avgWater: number; // ml，仅统计有 water 记录的天；无记录天数为 0
}

export function computeStats(recs: DayRecord[], cfg: Config): ScopeStats {
  const count = recs.length;
  if (count === 0) {
    return {
      count: 0,
      totalCalories: 0,
      avgCalories: 0,
      avgDeficitPct: 0,
      avgProteinPerKg: 0,
      avgFiber: 0,
      avgProtein: 0,
      avgCarb: 0,
      avgWater: 0,
    };
  }
  const totalCalories = recs.reduce((s, r) => s + r.calories, 0);
  const avgCalories = totalCalories / count;
  const avgDeficitPrc = recs.reduce((s, r) => s + deficitPct(r.calories, cfg.tdee), 0) / count;
  const avgProtein = recs.reduce((s, r) => s + r.protein, 0) / count;
  const avgCarb = recs.reduce((s, r) => s + r.carb, 0) / count;
  const avgFiber = recs.reduce((s, r) => s + r.fiber, 0) / count;
  const waterDays = recs.filter((r) => r.water != null);
  const avgWater =
    waterDays.length > 0 ? waterDays.reduce((s, r) => s + (r.water as number), 0) / waterDays.length : 0;
  return {
    count,
    totalCalories,
    avgCalories,
    avgDeficitPct: avgDeficitPrc,
    avgProteinPerKg: proteinPerKg(avgProtein, cfg.weightKg),
    avgFiber,
    avgProtein,
    avgCarb,
    avgWater,
  };
}
