import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KLUBFARVER, STANDARD_KLUBFARVE, klubfarve } from '../../src/data/klubfarver.ts'

test('klubbens farve kommer fra listen, ellers fra klubbens egne farver, ellers sidens lime', () => {
  assert.equal(klubfarve('broendby-if', ['#ffd500', '#0a3a8c']), KLUBFARVER['broendby-if'])
  assert.equal(klubfarve('en-klub-uden-for-listen', ['#00843d', '#ffffff']), '#00843d')
  assert.equal(klubfarve('en-klub-uden-for-listen'), STANDARD_KLUBFARVE)
})

test('en næsten sort farve kan ikke ses på den sorte baggrund: den anden farve eller standarden bruges', () => {
  assert.equal(klubfarve('ukendt', ['#111111', '#e30613']), '#e30613')
  assert.equal(klubfarve('ukendt', ['#0b2a7a', '#ffffff']), '#ffffff')
  assert.equal(klubfarve('ukendt', ['#111111', '#0a0a0a']), STANDARD_KLUBFARVE)
  // Ingen farve i listen er for mørk til at kunne ses
  for (const [slug, hex] of Object.entries(KLUBFARVER)) assert.equal(klubfarve(slug), hex, slug)
})
