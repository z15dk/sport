import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildReport, runningScore, storyOf, type ReportInput } from '../../src/lib/reports/build.ts'
import { checkReport } from '../../src/lib/previews/quality.ts'

// Holbæk B&I – ASA Aarhus 2-1 in 3. division, 3 October 2026 (the real match's data)
const base = (): ReportInput => ({
  match: { key: 'dbu:309090_508657', date: '2026-10-03', time: '13:00', venue: 'Holbæk Sportsby', referee: 'Julie Alsbro Thomsen', home: { id: 'hol', name: 'Holbæk B&I', page: '/klub/holbaek-b-og-i', coach: 'Saban Özdogan' }, away: { id: 'asa', name: 'ASA Aarhus', coach: 'Lennart Lindsted' }, hs: 2, as: 1 },
  league: { name: '3. division', sponsor: 'CampoBet 3. Division', page: '/turnering/3-division' },
  season: '2026/27',
  results: [
    { date: '2026-09-26', homeId: 'asa', awayId: 'x', hs: 2, as: 0 },
    { date: '2026-09-26', homeId: 'hol', awayId: 'y', hs: 0, as: 1 },
    { date: '2026-10-03', homeId: 'hol', awayId: 'asa', hs: 2, as: 1 },
  ],
  names: { hol: 'Holbæk B&I', asa: 'ASA Aarhus', x: 'Klub X', y: 'Klub Y' },
  goals: [
    { minute: 25, name: 'Miron Zuberovski', clubId: 'hol' },
    { minute: 49, name: 'William Saleh', clubId: 'asa' },
    { minute: 81, name: 'Mehmet Coskun', clubId: 'hol' },
  ],
  events: [
    { kind: 'yellow', minute: 29, name: 'Andreas Lauridsen', clubId: 'asa' },
    { kind: 'red', minute: 88, name: 'Miron Zuberovski', clubId: 'hol' },
  ],
  next: { hol: { date: '2026-10-10', opponent: 'Klub X', home: false } },
})

test('målene i rækkefølge med stillingen', () => {
  assert.deepEqual(runningScore(base().match, base().goals).map((g) => g.score), ['1-0', '1-1', '2-1'])
})

test('historien: sejrsmål sent, comeback, hattrick', () => {
  assert.equal(storyOf(base())?.headline, 'sejrsmål i 81. minut')
  const back = base()
  back.goals = [{ minute: 10, name: 'William Saleh', clubId: 'asa' }, { minute: 30, name: 'A', clubId: 'hol' }, { minute: 60, name: 'B', clubId: 'hol' }]
  assert.equal(storyOf(back)?.headline, 'Holbæk B&I vendte kampen')
  const hat = base()
  hat.match = { ...hat.match, hs: 3, as: 0 }
  hat.goals = [10, 20, 30].map((minute) => ({ minute, name: 'Miron Zuberovski', clubId: 'hol' }))
  assert.equal(storyOf(hat)?.headline, 'hattrick af Miron Zuberovski')
})

test('referatet: svar først, mål, kort, stilling og næste kamp', () => {
  const r = buildReport(base())
  assert.equal(r.slug, 'referat-holbaek-b-i-asa-aarhus-2026-10-03')
  assert.equal(r.title, 'Holbæk B&I – ASA Aarhus 2-1: sejrsmål i 81. minut')
  assert.match(r.content, /^<p>Holbæk B&amp;I mod ASA Aarhus endte 2-1 i <a href="\/turnering\/3-division">3\. division<\/a> lørdag 3\. oktober 2026 kl\. 13\.00 på Holbæk Sportsby\. <a href="\/klub\/holbaek-b-og-i">Holbæk B&amp;I<\/a> tog alle tre point på hjemmebane\./)
  assert.ok(r.content.includes('2-1: Mehmet Coskun (Holbæk B&amp;I), 81. minut'))
  assert.ok(r.content.includes('rødt kort til Miron Zuberovski (88.)'))
  assert.match(r.content, /Holbæk B&amp;I (rykker fra nr\. 4 op på nr\. [0-9]|bliver på nr\.)/)
  assert.ok(r.content.includes('spiller ude mod Klub X'))
  assert.ok(!/DBU/.test(r.content), 'datakilden nævnes ikke')
})

test('kvalitet: ufuldstændige mål blokerer, ukendte navne gør gul', () => {
  const i = base()
  const r = buildReport(i)
  assert.equal(checkReport({ ...i, goals: i.goals.slice(0, 2) }, r).level, 'blocked')
  const sheets = { hol: ['Miron Zuberovski', 'Mehmet Coskun'], asa: ['William Saleh', 'Andreas Lauridsen'] }
  const ok = checkReport(i, r, { sheets })
  assert.notEqual(ok.level, 'blocked')
  assert.ok(!ok.reasons.some((x) => x.includes('holdkort')), ok.reasons.join('; '))
  assert.ok(checkReport(i, r, { sheets: { ...sheets, asa: ['William Saleh'] } }).reasons.some((x) => x.includes('Andreas Lauridsen')))
})
