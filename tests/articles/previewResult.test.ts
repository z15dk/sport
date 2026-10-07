import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasResult, previewMatchSlug, withResult } from '../../src/lib/previewResultText.ts'

const html = '<p>Lørdag møder <a href="/klub/esbjerg-fb">Esbjerg</a> AaB. Følg den på <a href="/kamp/esbjerg-fb-aab-2026-10-10">kampsiden</a> og <a href="/kamp/kolding-if-ab-2026-10-24">næste kamp</a>.</p>'

test('the first match link is the match', () => {
  assert.equal(previewMatchSlug(html), 'esbjerg-fb-aab-2026-10-10')
  assert.equal(previewMatchSlug('<p>Ingen kamp</p>'), undefined)
})

test('the result goes first, once', () => {
  const once = withResult(html, { slug: 'esbjerg-fb-aab-2026-10-10', home: 'Esbjerg fB', away: 'AaB', hs: 1, as: 1 })
  assert.ok(once.startsWith('<p><strong>Kampen er spillet: Esbjerg fB – AaB 1-1.</strong>'))
  assert.ok(once.includes('href="/kamp/esbjerg-fb-aab-2026-10-10"'))
  assert.ok(once.endsWith(html))
  assert.ok(hasResult(once))
  assert.equal(withResult(once, { slug: 'x-2026-01-01', home: 'A', away: 'B', hs: 2, as: 0 }), once)
})
