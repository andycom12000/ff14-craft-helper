const NON_ITEM_STRINGS = new Set([
  '籌備軍需品', '籌備補給品', '籌備單位', '持有數量',
  '關閉', '閑閉', '閉閉', '閣閉',
  '木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調',
  '木工師', '鍛造師', '甲冑師', '金工師', '皮革師', '裁縫師', '鍊金術師', '烹調師',
])

/**
 * Parse OCR raw text from FF14 supply mission screenshot.
 * Extracts item names from the "籌備軍需品" section only.
 *
 * Strategy: identify lines that contain item data by looking for
 * the "0/60" pattern (OCR often reads as "0/C0", "0/co", "0/G0" etc.)
 * in the held quantity column. Supply items have this pattern,
 * provisioning items only have plain "0".
 */
export function parseSupplyItems(rawText: string): string[] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const itemNames: string[] = []

  for (const line of lines) {
    // Supply items have "0/60" pattern (OCR variants: 0/C0, 0/co, 0/G0, 0/cO)
    // This distinguishes them from provisioning items (which just have "0")
    if (!/0\/[CcGg][0Oo]/i.test(line)) continue

    // Extract all CJK character segments from the line
    const cjkMatches = line.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g)
    if (!cjkMatches) continue

    // Filter out known non-item fragments
    const filtered = cjkMatches.filter(m => !NON_ITEM_STRINGS.has(m))
    if (filtered.length === 0) continue

    // Join all CJK fragments on this line to form the item name
    const candidate = filtered.join('')

    // Skip if too short (likely noise)
    if (candidate.length < 3) continue
    if (NON_ITEM_STRINGS.has(candidate)) continue

    itemNames.push(candidate)
  }

  // Deduplicate while preserving order
  return [...new Set(itemNames)]
}
