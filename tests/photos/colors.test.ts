import assert from 'node:assert/strict'
import { test } from 'node:test'
import { colorFamilies, colorScore, decideSide } from '../../src/lib/photos/colors.ts'

test('synonymer: bordeaux og vinrød er rød, marineblå er blå', () => {
  assert.deepEqual(colorFamilies('bordeaux'), ['rød'])
  assert.deepEqual(colorFamilies('Vinrød'), ['rød'])
  assert.deepEqual(colorFamilies('marineblå'), ['blå'])
  assert.deepEqual(colorFamilies('navy'), ['blå'])
  assert.deepEqual(colorFamilies('light blue'), ['lyseblå'])
  assert.deepEqual(colorFamilies('mørkebordeaux'), ['rød'])
})

test('flere farver: hovedfarven først', () => {
  assert.deepEqual(colorFamilies('rød og hvid'), ['rød', 'hvid'])
  assert.deepEqual(colorFamilies('blå/hvid'), ['blå', 'hvid'])
})

test('ukendte ord giver ingen farve', () => {
  assert.deepEqual(colorFamilies('stribet'), [])
  assert.deepEqual(colorFamilies(''), [])
  assert.deepEqual(colorFamilies(undefined), [])
})

test('score: klubbens hovedfarve = 3, anden farve = 2, nabonuance = 1, ellers 0', () => {
  assert.equal(colorScore(['rød'], ['rød', 'hvid']), 3)
  assert.equal(colorScore(['hvid'], ['rød', 'hvid']), 2)
  assert.equal(colorScore(['blå'], ['lyseblå']), 1)
  assert.equal(colorScore(['grøn'], ['rød']), 0)
  // Trøjens bifarve alene er ikke nok
  assert.equal(colorScore(['rød', 'hvid'], ['hvid']), 1)
})

test('egen klub og modstander med forskellige farver', () => {
  assert.deepEqual(decideSide('bordeaux', ['rød', 'hvid'], ['grøn']), { side: 'egen' })
  assert.deepEqual(decideSide('grøn', ['rød', 'hvid'], ['grøn']), { side: 'modstander' })
})

test('begge hold i blåt: ukendt, aldrig gættet', () => {
  const r = decideSide('blå', ['blå'], ['marineblå'])
  assert.equal(r.side, 'ukendt')
  assert.match(r.note!, /begge/)
})

test('nabonuancer giver ukendt (lyseblå mod blå)', () => {
  assert.equal(decideSide('lyseblå', ['blå'], ['hvid']).side, 'ukendt')
})

test('ukendt farve og manglende klubfarver giver ukendt', () => {
  assert.equal(decideSide('stribet', ['rød'], ['blå']).side, 'ukendt')
  assert.equal(decideSide('rød', [], ['blå']).side, 'ukendt')
})

test('modstanderens farver mangler: egen farve er ikke sikker nok', () => {
  assert.equal(decideSide('rød', ['rød'], undefined).side, 'ukendt')
  assert.equal(decideSide('grøn', ['rød'], undefined).side, 'modstander')
})

test('flerfarvet klub (Skive: gul/blå) mod et blåt hold', () => {
  assert.equal(decideSide('gul', ['gul', 'blå'], ['grøn']).side, 'egen')
  // Blå er Fremad Amagers hovedfarve, men kun Skives anden farve
  assert.equal(decideSide('blå', ['gul', 'blå'], ['blå']).side, 'modstander')
  assert.equal(decideSide('blå', ['blå'], ['gul', 'blå']).side, 'egen')
  // En anden farve alene afgør ikke: hvidt mod Thisted (blå/hvid) kan være shorts eller en træningstrøje
  assert.equal(decideSide('hvid', ['blå', 'hvid'], ['blå']).side, 'ukendt')
  assert.equal(decideSide('hvid', ['grøn'], ['blå', 'hvid']).side, 'ukendt')
  // Begge har blå som anden farve
  assert.equal(decideSide('blå', ['gul', 'blå'], ['hvid', 'blå']).side, 'ukendt')
})
