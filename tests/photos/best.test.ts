import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bestOfMatch, postPhoto, postText, type Candidate } from '../../src/lib/photos/best.ts'
import { zip } from '../../src/lib/photos/zip.ts'

const c = (id: number, o: Partial<Candidate> = {}): Candidate => ({ id, matchKey: 'k', approved: false, players: [], sharpness: 10, ...o })

test('kampens bedste: skarpe og jubel først, én pr. serie, spredt over spillere', () => {
  const out = bestOfMatch(
    [
      c(1, { sharpness: 20, players: ['A'] }),
      c(2, { sharpness: 19, players: ['A'], dhash: '0000000000000000' }),
      c(3, { sharpness: 5, players: ['A'], dhash: '0000000000000001' }), // serie med 2 – kun 2 med
      c(4, { sharpness: 10, situation: 'jubel', players: ['B'] }),
      c(5, { sharpness: 18, players: ['A'] }), // A er allerede med to gange
      c(6, { sharpness: 2, players: ['C'] }),
    ],
    4,
  )
  // 1 og jubelbilledet 4 scorer ens (skarphed mod jubel); 5 venter, fordi A allerede er med to gange
  assert.deepEqual(out, [1, 4, 2, 6])
})

test('opslagstekst ude og hjemme', () => {
  const t = postText({ own: 'Skive', opponent: 'Brabrand', ownGoals: 3, oppGoals: 1, home: false, goals: [{ own: true, minute: 18, name: 'Malthe Larsson' }, { own: false, minute: 42, name: 'Simon Vesterbæk' }], credit: 'Matchly.dk' })
  assert.equal(t, "Sejr: Brabrand 1-3 Skive\nMål Skive: Malthe Larsson 18'\nMål Brabrand: Simon Vesterbæk 42'\n\nFoto: Matchly.dk")
})

test('billede til opslaget: målscoreren først, ellers jubel', () => {
  const cs = [c(1, { players: ['Malthe Larsson'], sharpness: 5 }), c(2, { situation: 'jubel', sharpness: 30 }), c(3, { sharpness: 40 })]
  assert.deepEqual(postPhoto(cs, ['Malthe Larsson']), { id: 1, scorer: 'Malthe Larsson' })
  assert.deepEqual(postPhoto(cs, ['Ingen Billede']), { id: 2 })
  assert.deepEqual(postPhoto([], []), { id: undefined })
})

test('zip: gyldig fil med to filer', () => {
  const z = zip([{ name: 'a.txt', data: Buffer.from('hej') }, { name: 'ø.jpg', data: Buffer.alloc(10, 1) }])
  assert.equal(z.readUInt32LE(0), 0x04034b50)
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50)
  assert.equal(z.readUInt16LE(z.length - 12), 2)
})
