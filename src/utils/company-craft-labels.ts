import type { CompanyCraftCategory, PartSlot } from '@/services/local-data-source.types'

export const CATEGORY_META: Record<CompanyCraftCategory, { icon: string; label: string; hint: string }> = {
  submersible: { icon: '🛰', label: '潛水艇', hint: '4 零件' },
  airship: { icon: '✈', label: '飛空艇', hint: '4 零件' },
  workshop: { icon: '🛠', label: '工坊建材', hint: '單件' },
}

export const SLOT_LABEL: Record<PartSlot, string> = {
  bow: '船首',
  stern: '船尾',
  hull: '船身',
  bridge: '船底',
}
