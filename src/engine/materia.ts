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
 * meldable up to 5 materia (pentameld) -> 12 x 5 = 60 slots total. Base meld
 * slots (100% guaranteed) come from the per-piece breakdown:
 *   main weapon          2
 *   off-hand / tool      1
 *   5 armor x 2         10
 *   5 accessories x 1    5
 *   -----------------------
 *   guaranteed          18
 * The remaining 60 - 18 = 42 are overmeld slots, subject to
 * OVERMELD_SUCCESS_LADDER. v1 hardcodes this aggregate shape rather than
 * reasoning per-piece; per-version refinement (with cap tables) is v2.
 */
export const SLOT_STRUCTURE = {
  guaranteedSlots: 18,
  overmeldSlots: 42,
} as const

/**
 * Physical upper bound on materia placed across a full gearset (#141): every
 * guaranteed slot plus every overmeld slot. The forward 試算台 caps each stat's
 * count here so a physically-impossible placement (e.g. 999 顆) can never read
 * can-hq or emit an override. Per-stat budgeting *across* stats (60 shared
 * between all three) is the full Workbench IA (#129) — out of scope here; this
 * is the coarse single-axis guard that kills the absurd case.
 */
export const MAX_MELD_COUNT = SLOT_STRUCTURE.guaranteedSlots + SLOT_STRUCTURE.overmeldSlots

/**
 * Overmeld success-rate ladder indexed by overmeld depth (0 = first
 * overmeld attempt past the guaranteed slots, ...). Game constant.
 * Source: in-game advanced melding rates (Grade V+, two community sources
 * agree). Per-depth rates: [0.17, 0.10, 0.07, 0.05], giving per-slot
 * expected purchase counts of [5.88, 10, 14.29, 20] (1 / rate).
 * The deeper even-vs-odd top-grade mechanic is out of scope; lite uses
 * one representative ladder.
 */
export const OVERMELD_SUCCESS_LADDER: number[] = [
  0.17, 0.10, 0.07, 0.05,
]

/**
 * #159 — overmeld slot pool per depth, derived from the per-piece structure.
 * Overmeld depth is PER PIECE (each piece's first overmeld attempt is depth 0
 * at 17%, its second depth 1 at 10%, …), so the aggregate pool by depth is:
 *
 *   depth 0: 12  (every piece has ≥1 overmeld slot)
 *   depth 1: 12
 *   depth 2: 12
 *   depth 3:  6  (only pieces with 1 guaranteed slot — off-hand + 5 accessories
 *                 — have a 4th overmeld slot)
 *
 * Sums to SLOT_STRUCTURE.overmeldSlots (42). The old per-stat monotone depth
 * model clamped every slot past a stat's 4th overmeld to the 5% floor, charging
 * 20 expected materia per slot and inflating the advertised 顆數 by ~2-3×.
 */
export const OVERMELD_DEPTH_POOLS: number[] = [12, 12, 12, 6]

/**
 * Shared zh-TW presentation tables for materia labels. Exported (#160 review)
 * so every surface (hero sentence, plan table, override chip) reads the same
 * source — a per-component copy is exactly the drift `formatMeldStepShort`'s
 * sharing note warns about.
 */
export const STAT_SHORT_LABELS: Record<CraftStat, string> = {
  craftsmanship: '作業',
  control: '加工',
  cp: 'CP',
}
export const GRADE_ROMAN: Record<number, string> = { 12: 'Ⅻ', 11: 'Ⅺ', 10: 'Ⅹ' }

/**
 * Shopping-oriented short label for one meld step, e.g. 「8 顆 加工魔晶石Ⅻ」.
 * `count` = the whole-materia purchase count (overmeld-waste expectation
 * rounded up). Shared by MeldAdvisorCard's ability sentence and the
 * session-override chip in FoodMedicine so the two never drift.
 */
export function formatMeldStepShort(step: { stat: CraftStat; grade: number; expectedCount: number }): string {
  const stat = STAT_SHORT_LABELS[step.stat] ?? step.stat
  const grade = GRADE_ROMAN[step.grade] ?? String(step.grade)
  return `${Math.ceil(step.expectedCount)} 顆 ${stat}魔晶石${grade}`
}

/**
 * #159/#160 — merge meld steps by (stat, grade), summing placed and expected
 * counts, preserving first-seen order. The advisor's plan keeps one step per
 * overmeld depth (the cost math needs the per-depth split), but user-facing
 * surfaces (ability sentence, session-override chip) must show ONE clause per
 * materia type — without this, a deep plan repeats the same materia name once
 * per depth level.
 */
export function summarizeMeldSteps(
  steps: Array<{ stat: CraftStat; grade: number; placedCount: number; expectedCount: number }>,
): Array<{ stat: CraftStat; grade: number; placedCount: number; expectedCount: number }> {
  const merged = new Map<string, { stat: CraftStat; grade: number; placedCount: number; expectedCount: number }>()
  for (const s of steps) {
    const key = `${s.stat}:${s.grade}`
    const existing = merged.get(key)
    if (existing) {
      existing.placedCount += s.placedCount
      existing.expectedCount += s.expectedCount
    } else {
      merged.set(key, { stat: s.stat, grade: s.grade, placedCount: s.placedCount, expectedCount: s.expectedCount })
    }
  }
  return [...merged.values()]
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
