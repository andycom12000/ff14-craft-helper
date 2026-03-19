const NON_ITEM_STRINGS = new Set([
  '籌備軍需品', '籌備補給品', '籌備單位', '持有數量',
  '關閉', '閑閉', '閉閉', '閣閉', '閱閉',
  '木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調',
  '木工師', '鍛造師', '甲冑師', '金工師', '皮革師', '裁縫師', '鍊金術師', '烹調師',
])

/** Patterns that indicate a section header line (not an item) */
const SECTION_HEADER_RE = /籌備軍需品|籌備補給品|籌備單位|持有數量/
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]+/g
const HAS_DIGIT_RE = /\d/

/**
 * Extract CJK item name candidates from a single line.
 * Returns null if the line has no usable CJK content.
 */
function extractCandidate(line: string): string | null {
  const cjkMatches = line.match(CJK_RE)
  if (!cjkMatches) return null

  const filtered = cjkMatches.filter(m => !NON_ITEM_STRINGS.has(m))
  if (filtered.length === 0) return null

  const candidate = filtered.join('')
  if (candidate.length < 2) return null
  if (NON_ITEM_STRINGS.has(candidate)) return null

  return candidate
}

/**
 * Parse OCR raw text from FF14 screenshots.
 *
 * Supports two formats:
 * 1. Supply/provisioning mission table (籌備任務) — has section headers + quantity columns
 * 2. Plain item list — just item names with icons, no numbers
 *
 * Strategy:
 * - First pass: structural section-based parsing (looks for headers + digit lines)
 * - Fallback: if structured parsing yields ≤ 1 result, extract all CJK lines permissively
 */
export function parseSupplyItems(rawText: string): string[] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)

  // --- First pass: structured parsing (for supply mission tables) ---
  const structuredItems: string[] = []
  let inSection = false
  let foundAnyHeader = false

  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line)) {
      inSection = true
      foundAnyHeader = true
      continue
    }

    if (/^[關閑閣閉閱]{2}$/.test(line)) {
      inSection = false
      continue
    }

    if (!inSection && foundAnyHeader) continue
    if (!HAS_DIGIT_RE.test(line)) continue

    const candidate = extractCandidate(line)
    if (candidate) structuredItems.push(candidate)
  }

  // If structured parsing found enough items, use those results
  if (structuredItems.length > 1) {
    return [...new Set(structuredItems)]
  }

  // --- Fallback: permissive extraction (for plain item lists / unknown formats) ---
  const allItems: string[] = []

  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line)) continue
    if (/^[關閑閣閉閱]{2}$/.test(line)) continue

    const candidate = extractCandidate(line)
    if (candidate) allItems.push(candidate)
  }

  return [...new Set(allItems)]
}
