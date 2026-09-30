import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backNameFits, pickName, squadsFromSheets, type SquadRow } from '../../src/lib/photos/names.ts'

const squad: SquadRow[] = [
  { number: 9, name: 'Anders Angriber', validFrom: '2026-07-01', validTo: '2026-08-31' },
  { number: 9, name: 'Bo Nyindkøbt', validFrom: '2026-09-01', validTo: null },
  { number: 10, name: 'Carl Ti', validFrom: '2026-07-01', validTo: null },
  { number: 7, name: 'Dan Syv', validFrom: '2026-07-01', validTo: null, uncertain: true },
]

test('holdkortet vinder over truppen', () => {
  const r = pickName(9, '2026-08-15', [{ number: 9, name: 'Holdkort Ni' }], squad)
  assert.deepEqual(r, { name: 'Holdkort Ni', source: 'kamp' })
})

test('nummer der ikke står på holdkortet giver intet navn', () => {
  const r = pickName(10, '2026-08-15', [{ number: 9, name: 'Holdkort Ni' }], squad)
  assert.equal(r.name, undefined)
  assert.match(r.note!, /holdkort/)
})

test('samme nummer to gange på holdkortet giver intet navn', () => {
  assert.equal(pickName(9, '2026-08-15', [{ number: 9, name: 'A' }, { number: 9, name: 'B' }], squad).name, undefined)
})

test('truppen efter dato: nummeret skifter ejer', () => {
  assert.equal(pickName(9, '2026-08-15', undefined, squad).name, 'Anders Angriber')
  assert.equal(pickName(9, '2026-09-10', undefined, squad).name, 'Bo Nyindkøbt')
  assert.equal(pickName(9, '2026-09-10', [], squad).source, 'trup')
})

test('usikre og ukendte numre giver intet navn', () => {
  assert.equal(pickName(7, '2026-08-15', undefined, squad).name, undefined)
  assert.equal(pickName(33, '2026-08-15', undefined, squad).name, undefined)
  // Før spilleren er set med nummeret
  assert.equal(pickName(10, '2026-06-01', undefined, squad).name, undefined)
})

test('uden dato tæller kun den nuværende ejer', () => {
  assert.equal(pickName(9, undefined, undefined, squad).name, 'Bo Nyindkøbt')
})

test('trup fra holdkort: perioder, nummerskift og konflikter', () => {
  const rows = squadsFromSheets([
    { date: '2026-08-01', players: { k: [{ number: 29, name: 'Søren' }, { number: 7, name: 'A' }] } },
    { date: '2026-08-07', players: { k: [{ number: 28, name: 'Søren' }, { number: 7, name: 'A' }] } },
    { date: '2026-08-14', players: { k: [{ number: 29, name: 'Jesper' }, { number: 7, name: 'B' }] } },
    { date: '2026-08-21', players: { k: [{ number: 7, name: 'A' }] } },
  ])
  const get = (nr: number, name: string) => rows.find((r) => r.number === nr && r.name === name)!
  // Søren skiftede fra 29 til 28: 29 lukkes dagen før
  assert.equal(get(29, 'Søren').validTo, '2026-08-06')
  assert.equal(get(28, 'Søren').validTo, null)
  assert.equal(get(29, 'Jesper').validFrom, '2026-08-14')
  // #7 brugt af A og B i samme periode: begge usikre
  assert.equal(get(7, 'A').uncertain, true)
  assert.equal(get(7, 'B').uncertain, true)
  assert.equal(get(28, 'Søren').uncertain, false)
})

test('rygnavn: efternavn, forkortelser og danske bogstaver', () => {
  assert.equal(backNameFits('BRYLD', 'August Andreas Rømer Bryld'), true)
  assert.equal(backNameFits('BREDAHL', 'Andreas Pedersen Bredahl'), true)
  assert.equal(backNameFits('M. JENSEN', 'Mikkel Jensen'), true)
  assert.equal(backNameFits('SØRENSEN', 'Casper Sorensen'), false)
  assert.equal(backNameFits('SOERENSEN', 'Casper Sørensen'), true)
  assert.equal(backNameFits('HANSEN', 'Mikkel Jensen'), false)
  assert.equal(backNameFits('J.', 'Mikkel Jensen'), false)
})

test('en rettelse i admin vinder over holdkortenes trup', () => {
  const rows: SquadRow[] = [
    { number: 7, name: 'Fra Holdkort', validFrom: '2026-07-01', validTo: null, uncertain: true },
    { number: 7, name: 'Rettet I Admin', validFrom: null, validTo: null, manual: true },
  ]
  assert.deepEqual(pickName(7, '2026-08-15', undefined, rows), { name: 'Rettet I Admin', source: 'trup' })
})
