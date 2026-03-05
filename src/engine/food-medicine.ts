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
}

export interface EnhancedStats {
  craftsmanship: number
  control: number
  cp: number
}

// ── Common crafting foods (HQ values) ──────────────────────────────────

export const COMMON_FOODS: FoodBuff[] = [
  {
    id: 1,
    name: 'Tsai tou Vounou HQ',
    craftsmanship: { percent: 4, max: 198 },
    cp: { percent: 6, max: 86 },
  },
  {
    id: 2,
    name: 'Jhinga Biryani HQ',
    control: { percent: 4, max: 172 },
    cp: { percent: 6, max: 79 },
  },
  {
    id: 3,
    name: 'Calamari Ripieni HQ',
    control: { percent: 4, max: 186 },
    cp: { percent: 6, max: 84 },
  },
  {
    id: 4,
    name: 'Piennolo Tomato Salad HQ',
    craftsmanship: { percent: 4, max: 191 },
    cp: { percent: 6, max: 83 },
  },
  {
    id: 5,
    name: 'Rroneek Steak HQ',
    craftsmanship: { percent: 4, max: 205 },
    cp: { percent: 6, max: 89 },
  },
  {
    id: 6,
    name: 'Vegetable Soup HQ',
    control: { percent: 4, max: 154 },
    cp: { percent: 6, max: 72 },
  },
]

// ── Common crafting medicines (HQ values) ──────────────────────────────

export const COMMON_MEDICINES: FoodBuff[] = [
  {
    id: 101,
    name: 'Cunning Craftsman\'s Draught HQ',
    craftsmanship: { percent: 3, max: 86 },
    cp: { percent: 2, max: 21 },
  },
  {
    id: 102,
    name: 'Commanding Craftsman\'s Draught HQ',
    control: { percent: 3, max: 86 },
    cp: { percent: 2, max: 21 },
  },
  {
    id: 103,
    name: 'Cunning Craftsman\'s Syrup HQ',
    craftsmanship: { percent: 4, max: 102 },
    cp: { percent: 2, max: 24 },
  },
  {
    id: 104,
    name: 'Commanding Craftsman\'s Syrup HQ',
    control: { percent: 4, max: 102 },
    cp: { percent: 2, max: 24 },
  },
]

// ── Buff application helpers ───────────────────────────────────────────

function applyBonus(base: number, bonus: StatBonus | undefined): number {
  if (!bonus) return base
  const increase = Math.floor(base * bonus.percent / 100)
  return base + Math.min(increase, bonus.max)
}

/**
 * Apply a food buff to crafter stats.
 * If food is null, returns stats unchanged.
 */
export function applyFoodBuff(
  stats: EnhancedStats,
  food: FoodBuff | null,
): EnhancedStats {
  if (!food) return { ...stats }
  return {
    craftsmanship: applyBonus(stats.craftsmanship, food.craftsmanship),
    control: applyBonus(stats.control, food.control),
    cp: applyBonus(stats.cp, food.cp),
  }
}

/**
 * Apply a medicine buff to crafter stats.
 * If medicine is null, returns stats unchanged.
 */
export function applyMedicineBuff(
  stats: EnhancedStats,
  medicine: FoodBuff | null,
): EnhancedStats {
  if (!medicine) return { ...stats }
  return {
    craftsmanship: applyBonus(stats.craftsmanship, medicine.craftsmanship),
    control: applyBonus(stats.control, medicine.control),
    cp: applyBonus(stats.cp, medicine.cp),
  }
}

/**
 * Scale a FoodBuff for HQ (doubles percent and max values).
 * If input is NQ, pass it through scaleForHq to get HQ values.
 * The hardcoded COMMON_FOODS / COMMON_MEDICINES are already HQ.
 * For NQ items, halve the bonuses.
 */
export function scaleForNq(buff: FoodBuff): FoodBuff {
  const halve = (b: StatBonus | undefined): StatBonus | undefined => {
    if (!b) return undefined
    return {
      percent: b.percent,
      max: Math.floor(b.max / 2),
    }
  }
  return {
    ...buff,
    craftsmanship: halve(buff.craftsmanship),
    control: halve(buff.control),
    cp: halve(buff.cp),
  }
}
