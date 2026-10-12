import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkOverride } from '../../src/lib/seoOverrideRules.ts'

const ok = { path: '/klub/kolding-if', title: 'Kolding IF: kampprogram, resultater og stilling 2026/27', description: 'Kolding IF i Betinia Liga 2026/27: næste kamp, TV-kanal, resultater, stilling, topscorere og trup – opdateret efter hver kamp.' }

test('a good title and description pass', () => {
  assert.equal(checkOverride(ok), undefined)
  assert.equal(checkOverride({ path: '/turnering/1-division/2025-2026', title: '1. division 2025/26: slutstilling og topscorere' }), undefined)
})

test('only the pages James may change', () => {
  assert.match(checkOverride({ ...ok, path: '/admin/artikler' })!, /Kun/)
  assert.match(checkOverride({ ...ok, path: '/' })!, /Kun/)
})

test('lengths and words Matchly never uses', () => {
  assert.match(checkOverride({ ...ok, title: 'For kort' })!, /15–60/)
  assert.match(checkOverride({ ...ok, title: 'Kolding IF – kampprogram, resultater, stilling og alt det andet om klubben' })!, /15–60/)
  assert.match(checkOverride({ ...ok, description: 'Kort.' })!, /70–160/)
  assert.match(checkOverride({ ...ok, title: 'Luxembourgs fodboldlandshold: kampe og resultater' })!, /fodboldlandshold/)
  assert.match(checkOverride({ ...ok, description: `${ok.description.slice(0, 120)} Data fra DBU.` })!, /DBU/)
  assert.match(checkOverride({ ...ok, title: 'Kolding IF: kampprogram og stilling | Matchly' })!, /Matchly/)
})

test('questions and answers for the FAQ', () => {
  const faq = [{ q: 'Hvornår spiller Kolding IF næste gang?', a: 'Kolding IF spiller næste gang på hjemmebane – se kampprogrammet øverst på siden.' }]
  assert.equal(checkOverride({ path: '/klub/kolding-if', faq }), undefined)
  assert.equal(checkOverride({ path: '/opgoer/fc-kobenhavn-mod-brondby-if', faq }), undefined)
  assert.match(checkOverride({ path: '/kamp/kolding-if-mod-agf', faq })!, /klub-, liga- og opgørssider/)
  assert.match(checkOverride({ path: '/klub/kolding-if', faq: [{ q: 'Hvornår spiller Kolding IF', a: faq[0].a }] })!, /"\?"/)
  assert.match(checkOverride({ path: '/klub/kolding-if', faq: [{ q: faq[0].q, a: 'Snart.' }] })!, /20–400/)
  assert.match(checkOverride({ path: '/klub/kolding-if', faq: [{ q: faq[0].q, a: 'Se mere på https://example.com om klubben og kampene.' }] })!, /links/)
  assert.match(checkOverride({ path: '/klub/kolding-if', faq: Array(5).fill(faq[0]) })!, /Højst 4/)
  assert.match(checkOverride({ path: '/klub/kolding-if', faq: [{ q: faq[0].q, a: 'Kampene ses på DBU og alle andre steder, hvor man følger fodbold.' }] })!, /DBU/)
})

test("James' text on club and league pages", () => {
  const body = `<p><strong>Kolding IF</strong> ligger nr. 4 i Betinia Liga. ${'Holdet har vundet tre af de seneste fem kampe og scoret i alle hjemmekampe. '.repeat(8)}</p><p>Næste kamp er mod <a href="/klub/hobro-ik">Hobro IK</a>.</p>`
  const intro = { heading: 'Kolding IF stilling og kampe 2026/27', html: body }
  assert.equal(checkOverride({ path: '/klub/kolding-if', intro }), undefined)
  assert.equal(checkOverride({ path: '/turnering/1-division', intro }), undefined)
  assert.match(checkOverride({ path: '/opgoer/fc-kobenhavn-mod-brondby-if', intro })!, /klub- og ligasider/)
  assert.match(checkOverride({ path: '/klub/kolding-if', intro: { ...intro, html: '<p>For kort.</p>' } })!, /500–2.200/)
  assert.match(checkOverride({ path: '/klub/kolding-if', intro: { ...intro, heading: 'Kort' } })!, /15–70/)
  assert.match(checkOverride({ path: '/klub/kolding-if', intro: { ...intro, html: body.replace('/klub/hobro-ik', 'https://example.com') } })!, /egne sider/)
  assert.match(checkOverride({ path: '/klub/kolding-if', intro: { ...intro, html: `<h2>Rubrik</h2>${body}` } })!, /Kun afsnit/)
  assert.match(checkOverride({ path: '/klub/kolding-if', intro: { ...intro, html: body.replace('Betinia Liga', 'Betinia Liga (data fra DBU)') } })!, /DBU/)
})
