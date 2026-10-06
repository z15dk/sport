import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seoChecks } from '../../src/lib/seoChecks.ts'

const base = { title: 'Optakt: A – B', slug: 'optakt-a-b', excerpt: '', focusKeyword: 'A B' }
const level = (content: string, id: string) => seoChecks({ ...base, content }).find((c) => c.id === id)

test('readability checks are in their own group', () => {
  const groups = new Set(seoChecks({ ...base, content: '<p>Kort tekst.</p>' }).map((c) => c.group))
  assert.deepEqual([...groups].sort(), ['read', 'seo'])
})

test('stock phrases are flagged, plain text is not', () => {
  assert.equal(level('<p>Det er værd at bemærke, at det bliver et spændende opgør, som byder på meget.</p>', 'phrases')?.level, 'bad')
  assert.equal(level('<p>Hobro har vundet fire kampe i træk.</p>', 'phrases')?.level, 'good')
})

test('long sentences and repeated openers', () => {
  const long = Array.from({ length: 6 }, () => `Holdet ${'spillede rigtig godt i kampen og '.repeat(5)}vandt.`).join(' ')
  assert.equal(level(`<p>${long}</p>`, 'sentences')?.level, 'bad')
  assert.equal(level(`<p>${long}</p>`, 'openers')?.level, 'ok')
  const varied = '<p>Hobro vandt søndag. Kolding tabte hjemme igen. I næste runde venter Esbjerg. Træneren skiftede to gange. Publikum var mødt talstærkt op.</p>'
  assert.equal(level(varied, 'sentences')?.level, 'good')
  assert.equal(level(varied, 'openers')?.level, 'good')
})

test('question headings, internal links and sources', () => {
  const html = '<h2>Hvor kan jeg se kampen?</h2><p>x</p><h3>Hvem er træner?</h3><p><a href="/klub/a">a</a> <a href="/klub/b">b</a> <a href="/tv">c</a> <a href="https://dbu.dk">DBU</a></p>'
  assert.equal(level(html, 'questions')?.level, 'good')
  assert.equal(level(html, 'internal')?.level, 'good')
  assert.equal(level(html, 'sources')?.level, 'good')
  assert.equal(level('<p><a href="/klub/a">a</a></p>', 'internal')?.level, 'ok')
})
