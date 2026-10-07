import { test } from 'node:test'
import assert from 'node:assert/strict'

import { samePerson } from '../../src/lib/samePerson.ts'

test('short and full names', () => {
  assert.ok(samePerson('T. Jeppesen', 'Tommy Jeppesen'))
  assert.ok(samePerson('Hjalte Bo Nørregaard', 'Hjalte Nørregaard'))
  assert.ok(!samePerson('Sancheev Manoharan', 'Hjalte Bo Nørregaard'))
  assert.ok(!samePerson('Claus Jensen', 'Mikkel Thygesen'))
  // Danish letters as English sources write them
  assert.ok(samePerson('Thomas Nørgaard', 'Thomas Norgaard'))
  assert.ok(samePerson('Morten Dahm Kjærgaard', 'Morten Dahm Kjaergaard'))
  assert.ok(samePerson('Christian Lønstrup', 'Christian Lonstrup'))
  assert.ok(!samePerson('Thomas Thomasberg', 'Martin Lanig'))
})
