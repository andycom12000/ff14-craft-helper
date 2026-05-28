/**
 * Materia stat tables for the meld advisor.
 * Source: raphael-rs game data + Garland Tools.
 * Last verified patch: 7.x (Dawntrail). When a major patch ships,
 * re-check Grade XII/XI values and itemIds.
 *
 * Stacking note (ADR-0001): materia adds to RAW gear stats. Apply BEFORE
 * `applyCrafterSoulBonus` and before food/medicine. Callers must produce a
 * Δstats triple and feed it through `gearsetToBuffedStats` — never apply
 * after food/medicine.
 */

export type CraftStat = 'craftsmanship' | 'control' | 'cp'

export interface MateriaGrade {
  grade: number       // e.g. 12, 11, 10
  stat: CraftStat
  value: number       // flat bonus
  itemId: number      // Universalis item ID
}

// Values below are illustrative for the patch noted above; verify against the
// game data table in raphael-rs (game_data/items.csv) when bumping patches.
export const MATERIA_GRADES: MateriaGrade[] = [
  // Grade XII (top)
  { grade: 12, stat: 'craftsmanship', value: 54, itemId: 41757 },
  { grade: 12, stat: 'control',       value: 54, itemId: 41758 },
  { grade: 12, stat: 'cp',            value: 14, itemId: 41759 },
  // Grade XI (overmeld top-up tier)
  { grade: 11, stat: 'craftsmanship', value: 45, itemId: 33930 },
  { grade: 11, stat: 'control',       value: 45, itemId: 33931 },
  { grade: 11, stat: 'cp',            value: 12, itemId: 33932 },
  // Grade X (lower top-up, used when caps would waste XI)
  { grade: 10, stat: 'craftsmanship', value: 36, itemId: 33918 },
  { grade: 10, stat: 'control',       value: 36, itemId: 33919 },
  { grade: 10, stat: 'cp',            value:  9, itemId: 33920 },
]

/**
 * Aggregate slot structure for a full crafter gear set (12 pieces:
 * main + off + 5 armor + 5 accessories). Base meld slots are guaranteed
 * (100% success); the rest are overmeld slots subject to OVERMELD_SUCCESS_LADDER.
 *
 * A crafter set has 12 pieces (main + off + 5 armor + 5 accessories), each
 * meldable up to 5 materia (pentameld). Base meld slots vary by piece (weapon
 * & armor: 2; accessories: 1; with some tier-by-tier variance), and the
 * remainder are overmeld slots. v1 hardcodes one representative aggregate
 * shape — ~25 guaranteed + ~35 overmeld — rather than reasoning per-piece;
 * per-version refinement (with cap tables) is v2.
 */
export const SLOT_STRUCTURE = {
  guaranteedSlots: 25,
  overmeldSlots: 35,
} as const

/**
 * Overmeld success-rate ladder indexed by overmeld depth (0 = first
 * overmeld attempt past the guaranteed slots, ...). Game constant.
 * Source: in-game advanced melding rates (high-grade tier). For lower
 * grades the rate is higher, but ②-lite uses one representative ladder.
 */
export const OVERMELD_SUCCESS_LADDER: number[] = [
  0.17, 0.17, 0.10, 0.05,
]

/**
 * BiS reference stats (fully pentamelded community-standard set).
 * One triple per patch, shared across crafter jobs (per-job variance
 * is below the precision of ②-lite). Maintain this when a major patch
 * lands or BiS gear changes. Snapshot test enforces a manual review on
 * change.
 *
 * Last verified patch: 7.x (Dawntrail).
 */
export interface BiSReference {
  patch: string
  craftsmanship: number
  control: number
  cp: number
}

export const BIS_REFERENCE: BiSReference = {
  patch: '7.x',
  craftsmanship: 5050,
  control: 5050,
  cp: 691,
}

/** Return all materia entries for a stat, sorted descending by grade. */
export function materiaForStat(stat: CraftStat): MateriaGrade[] {
  return MATERIA_GRADES
    .filter(m => m.stat === stat)
    .sort((a, b) => b.grade - a.grade)
}

/** Return the highest-grade materia for a stat, or null if none. */
export function topGradeForStat(stat: CraftStat): MateriaGrade | null {
  return materiaForStat(stat)[0] ?? null
}

/**
 * Expected number of materia to purchase to successfully place `placed`
 * melds at overmeld depth `depth` (0-indexed beyond the guaranteed slots).
 * Depths past the ladder length clamp to the final (lowest) rate.
 */
export function expectedCountForOvermeldDepth(depth: number, placed: number): number {
  const idx = Math.min(depth, OVERMELD_SUCCESS_LADDER.length - 1)
  const rate = OVERMELD_SUCCESS_LADDER[idx]
  return placed / rate
}
