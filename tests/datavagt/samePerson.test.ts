import { test } from 'node:test'
import assert from 'node:assert/strict'

import { samePerson } from '../../src/lib/samePerson.ts'

test('short and full names', () => {
  assert.ok(samePerson('T. Jeppesen', 'Tommy Jeppesen'))
  assert.ok(samePerson('Hjalte Bo Nørregaard', 'Hjalte Nørregaard'))
  assert.ok(!samePerson('Sancheev Manoharan', 'Hjalte Bo Nørregaard'))
  assert.ok(!samePerson('Claus Jensen', 'Mikkel Thygesen'))
})
