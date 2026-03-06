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
    id: 36060,
    name: '高山茶 HQ',
    craftsmanship: { percent: 4, max: 198 },
    cp: { percent: 6, max: 86 },
  },
  {
    id: 38929,
    name: '近東蝦香飯 HQ',
    control: { percent: 4, max: 172 },
    cp: { percent: 6, max: 79 },
  },
  {
    id: 37282,
    name: '鑲烤墨魚 HQ',
    control: { percent: 4, max: 186 },
    cp: { percent: 6, max: 84 },
  },
  {
    id: 38267,
    name: '懸掛番茄沙拉 HQ',
    craftsmanship: { percent: 4, max: 191 },
    cp: { percent: 6, max: 83 },
  },
  {
    id: 44091,
    name: '犎牛牛排 HQ',
    craftsmanship: { percent: 4, max: 205 },
    cp: { percent: 6, max: 89 },
  },
  {
    id: 44096,
    name: '蔬菜湯 HQ',
    control: { percent: 4, max: 154 },
    cp: { percent: 6, max: 72 },
  },
]

// ── Common crafting medicines (HQ values) ──────────────────────────────

export const COMMON_MEDICINES: FoodBuff[] = [
  {
    id: 44169,
    name: '魔匠藥液 HQ',
    craftsmanship: { percent: 3, max: 86 },
    cp: { percent: 2, max: 21 },
  },
  {
    id: 44168,
    name: '巨匠藥液 HQ',
    control: { percent: 3, max: 86 },
    cp: { percent: 2, max: 21 },
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
