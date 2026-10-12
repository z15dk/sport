import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addInternalLink } from '../../src/lib/articleLinks.ts'

test('an internal link on the first plain mention', () => {
  const html = '<h2>Al-Nassr stillinger</h2><p>Se <a href="/klub/x">Al-Nassr stillinger</a> her.</p><p>Her er al-nassr stillinger i dag.</p>'
  assert.equal(addInternalLink(html, 'Al-Nassr stillinger', '/klub/al-nassr').html, '<h2>Al-Nassr stillinger</h2><p>Se <a href="/klub/x">Al-Nassr stillinger</a> her.</p><p>Her er <a href="/klub/al-nassr">al-nassr stillinger</a> i dag.</p>')
  assert.match(addInternalLink('<p>Intet her.</p>', 'Al-Nassr', '/klub/al-nassr').error!, /står ikke/)
  assert.match(addInternalLink('<p>Al-Nassr <a href="/klub/al-nassr">x</a></p>', 'Al-Nassr', '/klub/al-nassr').error!, /allerede/)
  assert.match(addInternalLink('<p>Al-Nassr</p>', 'Al-Nassr', 'https://example.com').error!, /egne sider/)
  // Whole words only
  assert.match(addInternalLink('<p>AaBs kamp</p>', 'AaB', '/klub/aab').error!, /står ikke/)
})
