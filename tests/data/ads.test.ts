import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bannerNumber, numberedCode } from '../../src/data/ads.ts'

test('every banner on a page has its own number', () => {
  assert.equal(bannerNumber('top'), 0)
  assert.equal(bannerNumber('feed', 1), 1)
  assert.equal(bannerNumber('feed', 4), 4)
  assert.equal(bannerNumber('side'), -1)
  assert.equal(bannerNumber('content'), -2)
  assert.equal(bannerNumber('content', 0, 1), -5)
  assert.equal(bannerNumber('scroll'), -3)
})

test("{nr:6} in an ad's code is the banner's number from 0 to 5, {nr} the number itself", () => {
  const code = '<a href="https://shop.example/klik?p={nr:6}"><img src="https://shop.example/728x90.png?p={nr:6}"></a>'
  const at = (n: number) => numberedCode(code, n).match(/p=(\d+)/g)
  assert.deepEqual(at(bannerNumber('top')), ['p=0', 'p=0'])
  assert.deepEqual(at(bannerNumber('feed', 1)), ['p=1', 'p=1'])
  assert.deepEqual(at(bannerNumber('feed', 2)), ['p=2', 'p=2'])
  assert.deepEqual(at(bannerNumber('feed', 7)), ['p=1', 'p=1'])
  assert.deepEqual(at(bannerNumber('side')), ['p=5', 'p=5'])
  assert.deepEqual(at(bannerNumber('content')), ['p=4', 'p=4'])
  assert.equal(numberedCode('x?p={nr}', 11), 'x?p=11')
  assert.equal(numberedCode('x?p={nr}', bannerNumber('side')), 'x?p=101')
  // Code without the placeholder is left as it is
  assert.equal(numberedCode('<ins class="adsbygoogle"></ins>', 3), '<ins class="adsbygoogle"></ins>')
})
