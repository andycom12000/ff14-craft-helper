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
