import { test } from 'node:test'
import assert from 'node:assert/strict'
import { womenMarked } from '../../src/data/countries.ts'

test('every team of a women\'s league gets the women\'s mark, once', () => {
  assert.equal(womenMarked('ASA Aarhus', 'A-Liga'), 'ASA Aarhus (K)')
  assert.equal(womenMarked('Østerbro IF', 'B-Liga'), 'Østerbro IF (K)')
  assert.equal(womenMarked('FC Nordsjælland', 'Kvindeliga'), 'FC Nordsjælland (K)')
  assert.equal(womenMarked('HB Køge (K)', 'A-Liga'), 'HB Køge (K)')
})

test('men\'s leagues keep the name', () => {
  assert.equal(womenMarked('ASA Aarhus', '3. division'), 'ASA Aarhus')
  assert.equal(womenMarked('Inter', 'Serie A'), 'Inter')
  assert.equal(womenMarked('Boca Juniors', 'Liga Profesional Argentina'), 'Boca Juniors')
})
