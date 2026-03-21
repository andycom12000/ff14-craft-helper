export interface StatBonus {
  percent: number
  max: number
}

export interface FoodBuff {
  id: number
  name: string
  craftsmanship?: StatBonus
  control?: StatBonus
  cp?: StatBonus
  /** NQ overrides — if absent, scaleForNq uses a rough approximation */
  nq?: {
    craftsmanship?: StatBonus
    control?: StatBonus
    cp?: StatBonus
  }
}

export interface EnhancedStats {
  craftsmanship: number
  control: number
  cp: number
}

// ── Common crafting foods (HQ values) ──────────────────────────────────
// Source: Garland Tools + raphael-rs game data

export const COMMON_FOODS: FoodBuff[] = [
  {
    id: 36060,
    name: '高山茶 HQ',
    control: { percent: 5, max: 76 },
    cp: { percent: 26, max: 78 },
    nq: { control: { percent: 4, max: 61 }, cp: { percent: 21, max: 62 } },
  },
  {
    id: 38929,
    name: '近東蝦香飯 HQ',
    control: { percent: 5, max: 90 },
    cp: { percent: 26, max: 86 },
    nq: { control: { percent: 4, max: 72 }, cp: { percent: 21, max: 69 } },
  },
  {
    id: 37282,
    name: '鑲烤墨魚 HQ',
    craftsmanship: { percent: 5, max: 120 },
    cp: { percent: 26, max: 82 },
    nq: { craftsmanship: { percent: 4, max: 96 }, cp: { percent: 21, max: 66 } },
  },
  {
    id: 44091,
    name: '犎牛牛排 HQ',
    control: { percent: 5, max: 97 },
    cp: { percent: 26, max: 92 },
    nq: { control: { percent: 4, max: 77 }, cp: { percent: 21, max: 73 } },
  },
]

// ── Common crafting medicines (HQ values) ──────────────────────────────
// Source: Garland Tools + raphael-rs game data

export const COMMON_MEDICINES: FoodBuff[] = [
  {
    id: 44169,
    name: '魔匠藥液 HQ',
    cp: { percent: 6, max: 27 },
    nq: { cp: { percent: 5, max: 21 } },
  },
  {
    id: 44168,
    name: '巨匠藥液 HQ',
    control: { percent: 3, max: 63 },
    nq: { control: { percent: 2, max: 50 } },
  },
]

// ── Buff application helpers ───────────────────────────────────────────

function applyBonus(base: number, bonus: StatBonus | undefined): number {
  if (!bonus) return base
  const increase = Math.floor(base * bonus.percent / 100)
  return base + Math.min(increase, bonus.max)
}

export function applyBuff(
  stats: EnhancedStats,
  buff: FoodBuff | null,
): EnhancedStats {
  if (!buff) return { ...stats }
  return {
    craftsmanship: applyBonus(stats.craftsmanship, buff.craftsmanship),
    control: applyBonus(stats.control, buff.control),
    cp: applyBonus(stats.cp, buff.cp),
  }
}

export const applyFoodBuff = applyBuff
export const applyMedicineBuff = applyBuff

/**
 * Return the NQ version of a FoodBuff.
 * Uses explicit nq data if available, otherwise falls back to a rough approximation.
 */
export function scaleForNq(buff: FoodBuff): FoodBuff {
  if (buff.nq) {
    return {
      id: buff.id,
      name: buff.name.replace(' HQ', ''),
      craftsmanship: buff.nq.craftsmanship,
      control: buff.nq.control,
      cp: buff.nq.cp,
    }
  }
  // Fallback: reduce percent by 1 and max by ~20%
  const reduce = (b: StatBonus | undefined): StatBonus | undefined => {
    if (!b) return undefined
    return {
      percent: Math.max(1, b.percent - 1),
      max: Math.floor(b.max * 4 / 5),
    }
  }
  return {
    id: buff.id,
    name: buff.name.replace(' HQ', ''),
    craftsmanship: reduce(buff.craftsmanship),
    control: reduce(buff.control),
    cp: reduce(buff.cp),
  }
}
