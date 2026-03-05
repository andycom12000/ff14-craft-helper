/**
 * Initial quality calculation based on HQ materials provided.
 *
 * In FF14, each ingredient contributes equally to the quality pool.
 * The total HQ contribution is scaled by materialQualityFactor.
 *
 * Formula:
 *   quality = maxQuality * materialQualityFactor / 100
 *           * sum(hqAmount_i / amount_i) / ingredientCount
 */
export function calculateInitialQuality(
  maxQuality: number,
  materialQualityFactor: number,
  ingredients: { amount: number; hqAmount: number }[],
): number {
  if (ingredients.length === 0 || materialQualityFactor === 0) return 0

  // Only ingredients that can be HQ contribute (amount > 0)
  const contributingIngredients = ingredients.filter((ing) => ing.amount > 0)
  if (contributingIngredients.length === 0) return 0

  // Each ingredient contributes proportionally: hqAmount / amount
  const totalContribution = contributingIngredients.reduce(
    (sum, ing) => sum + ing.hqAmount / ing.amount,
    0,
  )

  const averageContribution = totalContribution / contributingIngredients.length
  const quality = Math.floor(
    maxQuality * (materialQualityFactor / 100) * averageContribution,
  )

  return Math.min(quality, maxQuality)
}
