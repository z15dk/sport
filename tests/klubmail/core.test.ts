import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { CONFIRMS_PER_DAY, KlubmailStore, PENDING_MS, isoWeek, maskEmail, runWeekly, sendWindow, validEmail, type Db, type Subscriber } from '../../src/lib/klubmail/core.ts'

const store = () => new KlubmailStore(new DatabaseSync(':memory:') as unknown as Db)
// Monday 12 October 2026, 07.00 Danish summer time = 05.00 UTC
const MONDAY_7 = Date.parse('2026-10-12T05:00:00Z')
const H = 3_600_000

test('mailadresser', () => {
  for (const ok of ['rune@example.dk', 'Fan.Nr1+fck@gmail.com', ' a@b.co ']) assert.ok(validEmail(ok), ok)
  for (const bad of ['', 'rune', 'rune@', '@gmail.com', 'a b@c.dk', 'a@b', 'a..b@c.dk', 'a@b..dk', '<a@b.dk>', `${'x'.repeat(250)}@b.dk`]) assert.ok(!validEmail(bad), bad)
  assert.equal(maskEmail('Rune@Gmail.com'), 'r***@gmail.com')
})

test('ISO-uger', () => {
  assert.equal(isoWeek('2026-10-12'), '2026-W42')
  assert.equal(isoWeek('2026-10-18'), '2026-W42')
  assert.equal(isoWeek('2027-01-01'), '2026-W53')
  assert.equal(isoWeek('2024-12-30'), '2025-W01')
})

test('mandag kl. 7 til og med onsdag', () => {
  assert.equal(sendWindow(MONDAY_7 - 60_000), undefined)
  assert.deepEqual(sendWindow(MONDAY_7), { week: '2026-W42', cutoff: MONDAY_7 })
  assert.equal(sendWindow(MONDAY_7 + 2 * 24 * H + 16 * H)?.week, '2026-W42') // Wednesday 23.00
  assert.equal(sendWindow(MONDAY_7 + 3 * 24 * H), undefined) // Thursday
  assert.equal(sendWindow(MONDAY_7 - 24 * H), undefined) // Sunday
  // Winter time: Monday 26 October 2026 07.00 is 06.00 UTC
  assert.equal(sendWindow(Date.parse('2026-10-26T05:30:00Z')), undefined)
  assert.equal(sendWindow(Date.parse('2026-10-26T06:00:00Z'))?.week, '2026-W44')
})

test('dobbelt opt-in: kun bekræftede får mailen', () => {
  const s = store()
  const t0 = MONDAY_7 - 3 * 24 * H
  const r = s.signUp('Fan@Example.dk', ['fc-koebenhavn'], t0)
  assert.equal(r.kind, 'confirm')
  assert.equal(s.due('2026-W42', MONDAY_7).length, 0)
  const c = s.confirm(r.kind === 'confirm' ? r.token : '', t0 + H)
  assert.deepEqual(c?.clubs, ['fc-koebenhavn'])
  assert.equal(s.due('2026-W42', MONDAY_7).length, 1)
  assert.equal(s.due('2026-W42', MONDAY_7)[0].email, 'fan@example.dk')
  // Clicked again: still fine, nothing changes
  assert.deepEqual(s.confirm(r.kind === 'confirm' ? r.token : '', t0 + 2 * H)?.clubs, ['fc-koebenhavn'])
  // Confirmed after Monday 07.00: waits for next week
  const late = s.signUp('sen@example.dk', ['agf'], MONDAY_7 + H)
  s.confirm(late.kind === 'confirm' ? late.token : '', MONDAY_7 + 2 * H)
  assert.equal(s.due('2026-W42', MONDAY_7).length, 1)
  assert.equal(s.confirm('f'.repeat(48), t0), undefined)
  assert.equal(s.confirm('not a token', t0), undefined)
})

test('flere klubber: kendt klub giver intet, ny klub venter på bekræftelse', () => {
  const s = store()
  const r = s.signUp('fan@example.dk', ['agf'], 0)
  s.confirm(r.kind === 'confirm' ? r.token : '', 1)
  assert.equal(s.signUp('FAN@example.dk', ['agf'], 2).kind, 'already')
  const more = s.signUp('fan@example.dk', ['agf', 'brondby-if'], 3)
  assert.equal(more.kind, 'confirm')
  assert.deepEqual(more.kind === 'confirm' && more.sub.pending, ['brondby-if'])
  assert.deepEqual(s.byEmail('fan@example.dk')?.clubs, ['agf'])
  s.confirm(more.kind === 'confirm' ? more.token : '', 4)
  assert.deepEqual(s.byEmail('fan@example.dk')?.clubs, ['agf', 'brondby-if'])
})

test('højst 3 bekræftelsesmails pr. adresse pr. døgn', () => {
  const s = store()
  for (let i = 0; i < CONFIRMS_PER_DAY; i++) {
    assert.equal(s.signUp('offer@example.dk', ['agf'], 1000 + i).kind, 'confirm')
    s.noteConfirmMail('offer@example.dk', 1000 + i)
  }
  assert.equal(s.signUp('Offer@Example.dk', ['agf'], 2000).kind, 'limited')
  assert.equal(s.signUp('offer@example.dk', ['agf'], 1000 + 25 * H).kind, 'confirm')
  assert.equal(s.sentToday(1000 + 25 * H) >= 0, true)
})

test('ubekræftede slettes efter 7 dage', () => {
  const s = store()
  const r = s.signUp('glemt@example.dk', ['agf'], 0)
  s.expire(PENDING_MS - 1)
  assert.ok(s.byEmail('glemt@example.dk'))
  s.expire(PENDING_MS + 1)
  assert.equal(s.byEmail('glemt@example.dk'), undefined)
  assert.equal(s.confirm(r.kind === 'confirm' ? r.token : '', PENDING_MS + 2), undefined)
  // A confirmed address keeps its clubs; only the club it never confirmed goes
  const ok = s.signUp('fan@example.dk', ['agf'], 0)
  s.confirm(ok.kind === 'confirm' ? ok.token : '', 1)
  s.signUp('fan@example.dk', ['ob'], 2)
  s.expire(PENDING_MS + 10)
  assert.deepEqual(s.byEmail('fan@example.dk')?.clubs, ['agf'])
  assert.deepEqual(s.byEmail('fan@example.dk')?.pending, [])
})

test('afmelding sletter adressen', () => {
  const s = store()
  const r = s.signUp('fan@example.dk', ['agf'], 0)
  s.confirm(r.kind === 'confirm' ? r.token : '', 1)
  const sub = s.byEmail('fan@example.dk')!
  assert.deepEqual(s.unsubscribe(sub.unsub, 2)?.clubs, ['agf'])
  assert.equal(s.byEmail('fan@example.dk'), undefined)
  assert.equal(s.unsubscribe(sub.unsub, 3), undefined)
  const st = s.stats(4)
  assert.equal(st.confirmed, 0)
  assert.equal(st.unsubscribed, 1)
})

function withSubs(n: number) {
  const s = store()
  for (let i = 0; i < n; i++) {
    const r = s.signUp(`fan${i}@example.dk`, ['agf'], MONDAY_7 - 48 * H)
    s.confirm(r.kind === 'confirm' ? r.token : '', MONDAY_7 - 47 * H)
  }
  return s
}

test('ugens mail: én pr. abonnent pr. uge, også efter genstart', async () => {
  const s = withSubs(5)
  const sent: string[] = []
  const pauses: number[] = []
  const opts = {
    now: () => MONDAY_7 + 60_000,
    send: async (sub: Subscriber) => {
      sent.push(sub.email)
      return 'ok' as const
    },
    sleep: async (ms: number) => void pauses.push(ms),
    cap: 400,
    gapMs: 3_000,
  }
  const first = await runWeekly(s, opts)
  assert.equal(first.sent, 5)
  assert.equal(first.stopped, 'done')
  assert.deepEqual(pauses, [3_000, 3_000, 3_000, 3_000])
  // A second run (a restart, the next tick) sends nothing
  const again = await runWeekly(s, opts)
  assert.equal(again.sent, 0)
  assert.equal(sent.length, 5)
  assert.equal(s.sentInWeek('2026-W42'), 5)
  // Outside the window nothing happens
  assert.equal((await runWeekly(s, { ...opts, now: () => MONDAY_7 - H })).stopped, 'outside')
  // Next Monday: everyone again
  const next = await runWeekly(s, { ...opts, now: () => MONDAY_7 + 7 * 24 * H })
  assert.equal(next.sent, 5)
})

test('dagens loft stopper køen, og resten sendes dagen efter', async () => {
  const s = withSubs(6)
  let clock = MONDAY_7
  const opts = { now: () => clock, send: async () => 'ok' as const, sleep: async () => undefined, cap: 4, reserve: 1 }
  const monday = await runWeekly(s, opts)
  assert.equal(monday.sent, 3)
  assert.equal(monday.stopped, 'cap')
  assert.equal(monday.left, 3)
  clock = MONDAY_7 + 24 * H
  const tuesday = await runWeekly(s, opts)
  assert.equal(tuesday.sent, 3)
  assert.equal(tuesday.stopped, 'done')
})

test('en fejl hos mailserveren frigiver abonnenten og stopper kørslen', async () => {
  const s = withSubs(3)
  let calls = 0
  const res = await runWeekly(s, {
    now: () => MONDAY_7,
    send: async () => {
      calls++
      if (calls === 2) throw new Error('ECONNECTION')
      return 'ok'
    },
    sleep: async () => undefined,
    cap: 400,
  })
  assert.equal(res.stopped, 'error')
  assert.equal(res.sent, 1)
  // The one that failed and the one after it are tried at the next run
  const next = await runWeekly(s, { now: () => MONDAY_7 + 5 * 60_000, send: async () => 'ok', sleep: async () => undefined, cap: 400 })
  assert.equal(next.sent, 2)
})

test('afviste adresser fjernes efter 3 uger, og uger uden nyt tæller ikke som mail', async () => {
  const s = withSubs(1)
  for (let w = 0; w < 3; w++) {
    const r = await runWeekly(s, { now: () => MONDAY_7 + w * 7 * 24 * H + H, send: async () => 'refused', sleep: async () => undefined, cap: 400 })
    assert.equal(r.refused, 1)
  }
  assert.equal(s.byEmail('fan0@example.dk'), undefined)
  const t = withSubs(1)
  const skip = await runWeekly(t, { now: () => MONDAY_7, send: async () => 'skip', sleep: async () => undefined, cap: 400 })
  assert.equal(skip.skipped, 1)
  assert.equal(t.sentToday(MONDAY_7), 0)
  assert.equal((await runWeekly(t, { now: () => MONDAY_7 + 60_000, send: async () => 'ok', sleep: async () => undefined, cap: 400 })).sent, 0)
})
