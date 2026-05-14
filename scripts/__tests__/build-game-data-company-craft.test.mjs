import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCompanyCraft } from '../build-game-data.mjs'

// Minimal fixture: 1 sequence with 1 part holding 1 process that needs 2 items.
// Unknown1=4 maps to 'LTW' per CRAFT_TYPE_TO_JOB (Unknown1 is the crafter job FK).
const SEQUENCE_CSV = [
  '#,ResultItem,CompanyCraftPart[0],CompanyCraftPart[1]',
  '1,18715,10,0',
].join('\n')

const PART_CSV = [
  '#,CompanyCraftType,Unknown0,Unknown1,CompanyCraftProcess[0],CompanyCraftProcess[1]',
  '10,103,0,4,100,0',
].join('\n')

const PROCESS_CSV = [
  '#,SupplyItem[0],SetQuantity[0],SetsRequired[0],SupplyItem[1],SetQuantity[1],SetsRequired[1]',
  '100,1,3,4,2,2,3',  // FK keys 1, 2 (which map to items 5057, 5058 via SUPPLY_ITEM_CSV)
].join('\n')

const SUPPLY_ITEM_CSV = [
  '#,Item',
  '1,5057',
  '2,5058',
].join('\n')

const itemUICategoryMap = new Map([[18715, 103]]) // 103 = Submersible Bow

test('buildCompanyCraft: builds sequence with phases summed from process supplies', () => {
  const result = buildCompanyCraft({
    sequenceCsv: SEQUENCE_CSV,
    partCsv: PART_CSV,
    processCsv: PROCESS_CSV,
    supplyItemCsv: SUPPLY_ITEM_CSV,
    itemUICategoryMap,
  })
  assert.equal(result.sequences.length, 1)
  const seq = result.sequences[0]
  assert.equal(seq.id, 1)
  assert.equal(seq.resultItemId, 18715)
  assert.equal(seq.category, 'submersible')
  assert.equal(seq.partSlot, 'bow')
  assert.equal(seq.phases.length, 1)
  const phase = seq.phases[0]
  assert.equal(phase.jobAbbr, 'LTW')
  assert.deepEqual(phase.supplyItems, [
    { itemId: 5057, amount: 12 },
    { itemId: 5058, amount: 6 },
  ])
})

test('buildCompanyCraft: skips empty Part/Process slots (id 0)', () => {
  // PART_CSV has CompanyCraftPart[1]=0 and CompanyCraftProcess[1]=0 — both skipped
  const result = buildCompanyCraft({
    sequenceCsv: SEQUENCE_CSV,
    partCsv: PART_CSV,
    processCsv: PROCESS_CSV,
    supplyItemCsv: SUPPLY_ITEM_CSV,
    itemUICategoryMap,
  })
  // Only 1 phase (from part slot 0, process slot 0)
  assert.equal(result.sequences[0].phases.length, 1)
})

test('buildCompanyCraft: assigns workshop category for unmapped items', () => {
  // Use an itemUICategoryMap that doesn't contain 18715
  const emptyMap = new Map()
  const result = buildCompanyCraft({
    sequenceCsv: SEQUENCE_CSV,
    partCsv: PART_CSV,
    processCsv: PROCESS_CSV,
    supplyItemCsv: SUPPLY_ITEM_CSV,
    itemUICategoryMap: emptyMap,
  })
  assert.equal(result.sequences[0].category, 'workshop')
})
