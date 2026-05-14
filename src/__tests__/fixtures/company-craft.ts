import type { CompanyCraftSequence } from '@/services/local-data-source.types'

export const SEQ_TATANORA_BOW: CompanyCraftSequence = {
  id: 1, resultItemId: 18715, category: 'submersible', partSlot: 'bow',
  phases: [
    { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
      supplyItems: [
        { itemId: 5057, amount: 12 },
        { itemId: 5058, amount: 6 },
      ] },
    { partIndex: 0, processIndex: 1, jobAbbr: 'GSM', level: 75,
      supplyItems: [{ itemId: 5057, amount: 4 }] },
  ],
}

export const SEQ_TATANORA_STERN: CompanyCraftSequence = {
  id: 2, resultItemId: 18716, category: 'submersible', partSlot: 'stern',
  phases: [
    { partIndex: 0, processIndex: 0, jobAbbr: 'CRP', level: 70,
      supplyItems: [{ itemId: 5057, amount: 3 }] },
  ],
}
