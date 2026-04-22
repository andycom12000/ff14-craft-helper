// Smoke test for scripts/build-game-data.mjs `parseCsv` helper.
// Runnable via `node --test` and also discovered by Vitest
// (it treats `test(...)` from 'node:test' similarly).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from '../build-game-data.mjs'

test('parseCsv: SaintCoinach rawexd format uses header row 1 (names)', () => {
  // Mimic harukaxxxx/ffxiv-datamining-tw rawexd shape.
  const csv = [
    'key,0,1,2,3',
    '#,Singular,Level{Item},CanBeHq,Icon',
    'int32,str,byte,bool,int32',
    '5057,黑鐵錠,20,True,21204',
    '5106,黑鐵砂,20,False,20405',
  ].join('\n')
  const { headers, rows } = parseCsv(csv, 'saintcoinach')
  assert.deepEqual(headers, ['#', 'Singular', 'Level{Item}', 'CanBeHq', 'Icon'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0]['#'], '5057')
  assert.equal(rows[0].Singular, '黑鐵錠')
  assert.equal(rows[0]['Level{Item}'], '20')
  assert.equal(rows[0].CanBeHq, 'True')
  assert.equal(rows[1]['#'], '5106')
  assert.equal(rows[1].Icon, '20405')
})

test('parseCsv: Oxidizer format uses header row 0 directly', () => {
  // Mimic xivapi/ffxiv-datamining csv/en shape.
  const csv = [
    '#,Name,LevelItem,CanBeHq,Icon',
    '5057,Iron Ingot,20,True,21204',
    '5106,Iron Ore,20,False,20405',
  ].join('\n')
  const { headers, rows } = parseCsv(csv, 'oxidizer')
  assert.deepEqual(headers, ['#', 'Name', 'LevelItem', 'CanBeHq', 'Icon'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].Name, 'Iron Ingot')
  assert.equal(rows[1]['#'], '5106')
  assert.equal(rows[0].CanBeHq, 'True')
})

test('parseCsv: skips fully-empty rows', () => {
  const csv = ['#,Name', '1,A', ',', '2,B'].join('\n')
  const { rows } = parseCsv(csv, 'oxidizer')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].Name, 'A')
  assert.equal(rows[1].Name, 'B')
})

test('parseCsv: handles quoted commas in values', () => {
  const csv = ['#,Name', '1,"Hello, World"'].join('\n')
  const { rows } = parseCsv(csv, 'oxidizer')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].Name, 'Hello, World')
})
