/**
 * Initial quality calculation based on HQ materials provided.
 *
 * Matches the FF14 / bestcraft formula:
 * - Only HQ-eligible items contribute
 * - Weighted by item level: ratio = sum(hqAmount_i × level_i) / sum(amount_i × level_i)
 * - quality = floor(maxQuality × materialQualityFactor / 100 × ratio)
 */
export function calculateInitialQuality(
  maxQuality: number,
  materialQualityFactor: number,
  ingredients: { amount: number; hqAmount: number; level: number; canHq: boolean }[],
): number {
  if (ingredients.length === 0 || materialQualityFactor === 0) return 0

  const hqIngredients = ingredients.filter((ing) => ing.canHq)
  if (hqIngredients.length === 0) return 0

  const totalLevelCount = hqIngredients.reduce((sum, ing) => sum + ing.amount * ing.level, 0)
  if (totalLevelCount === 0) return 0

  const hqLevelCount = hqIngredients.reduce((sum, ing) => sum + ing.hqAmount * ing.level, 0)
  const ratio = hqLevelCount / totalLevelCount

  const quality = Math.floor(maxQuality * (materialQualityFactor / 100) * ratio)
  return Math.min(quality, maxQuality)
}
