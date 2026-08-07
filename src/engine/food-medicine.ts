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
// Source: xivapi/ffxiv-datamining `ItemFood.csv`（Value/Max = NQ，
// ValueHQ/MaxHQ = HQ），繁中名稱取自 andycom12000/ffxiv-datamining-tw。
// 排序：物品等級由低到高。只收「當前仍值得使用」的製作用食物，
// 舊世代同型且已被完全取代的（如 6.x 的 幸福汁 / 大鰭鱈魚醬）不列入。

export const COMMON_FOODS: FoodBuff[] = [
  {
    // ilvl 554
    id: 36060,
    name: '高山茶 HQ',
    control: { percent: 5, max: 76 },
    cp: { percent: 26, max: 78 },
    nq: { control: { percent: 4, max: 61 }, cp: { percent: 21, max: 62 } },
  },
  {
    // ilvl 590
    id: 37282,
    name: '鑲烤墨魚 HQ',
    craftsmanship: { percent: 5, max: 120 },
    cp: { percent: 26, max: 82 },
    nq: { craftsmanship: { percent: 4, max: 96 }, cp: { percent: 21, max: 66 } },
  },
  {
    // ilvl 620
    id: 38929,
    name: '近東蝦香飯 HQ',
    control: { percent: 5, max: 90 },
    cp: { percent: 26, max: 86 },
    nq: { control: { percent: 4, max: 72 }, cp: { percent: 21, max: 69 } },
  },
  {
    // ilvl 657 — 作業精度特化
    id: 44088,
    name: '巧克力奶油蛋糕 HQ',
    craftsmanship: { percent: 9, max: 240 },
    cp: { percent: 10, max: 38 },
    nq: { craftsmanship: { percent: 7, max: 192 }, cp: { percent: 8, max: 30 } },
  },
  {
    // ilvl 670 — 加工精度特化
    id: 44077,
    name: '鮭魚乾 HQ',
    control: { percent: 9, max: 215 },
    craftsmanship: { percent: 5, max: 98 },
    nq: { control: { percent: 7, max: 172 }, craftsmanship: { percent: 4, max: 78 } },
  },
  {
    // ilvl 684
    id: 44091,
    name: '犎牛牛排 HQ',
    control: { percent: 5, max: 97 },
    cp: { percent: 26, max: 92 },
    nq: { control: { percent: 4, max: 77 }, cp: { percent: 21, max: 73 } },
  },
  {
    // ilvl 720
    id: 44842,
    name: '酸檸檬醃魚 HQ',
    craftsmanship: { percent: 5, max: 150 },
    cp: { percent: 26, max: 96 },
    nq: { craftsmanship: { percent: 4, max: 120 }, cp: { percent: 21, max: 76 } },
  },
  {
    // ilvl 750 — 目前 CP 上限最高的製作食物
    id: 46253,
    name: '椒麻鰻魚 HQ',
    control: { percent: 5, max: 115 },
    cp: { percent: 26, max: 100 },
    nq: { control: { percent: 4, max: 92 }, cp: { percent: 21, max: 80 } },
  },
]

// ── Common crafting medicines (HQ values) ──────────────────────────────
// Source: xivapi/ffxiv-datamining `ItemFood.csv`，繁中名稱取自
// andycom12000/ffxiv-datamining-tw。排序：物品等級由低到高。
// 7.0 的「藥液」系列全面取代 6.x 的「藥酒」系列，故只收藥液。

export const COMMON_MEDICINES: FoodBuff[] = [
  {
    // ilvl 665
    id: 44167,
    name: '名匠藥液 HQ',
    craftsmanship: { percent: 3, max: 63 },
    nq: { craftsmanship: { percent: 2, max: 50 } },
  },
  {
    // ilvl 670
    id: 44168,
    name: '巨匠藥液 HQ',
    control: { percent: 3, max: 63 },
    nq: { control: { percent: 2, max: 50 } },
  },
  {
    // ilvl 675
    id: 44169,
    name: '魔匠藥液 HQ',
    cp: { percent: 6, max: 27 },
    nq: { cp: { percent: 5, max: 21 } },
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
 * Look up a buff by ID from a list and return HQ or NQ version.
 */
export function resolveBuff(list: FoodBuff[], id: number | null, isHq = true): FoodBuff | null {
  if (!id) return null
  const buff = list.find(x => x.id === id)
  if (!buff) return null
  return isHq ? buff : scaleForNq(buff)
}

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

/**
 * Apply food and medicine buffs to base stats.
 *
 * NOTE: This helper does NOT apply the Soul of the Crafter (+20/+20/+15)
 * bonus. Non-test callers that take a `GearsetStats` should use
 * `gearsetToBuffedStats` from `@/services/stat-stacking` instead — see
 * docs/adr/0001-stat-stacking-order.md. Direct use of this function on a
 * raw gearset will silently drop the specialist Soul bonus.
 *
 * Applies food buff first, then medicine buff, in sequence.
 */
export function applyBuffsToStats(
  stats: EnhancedStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
): EnhancedStats {
  if (!buffs) return stats
  return applyMedicineBuff(applyFoodBuff(stats, buffs.food), buffs.medicine)
}
