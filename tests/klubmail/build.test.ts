import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildConfirmMail, buildWeeklyMail, mailSubject, tracked, whenShort, type ClubDigest } from '../../src/lib/klubmail/build.ts'

// Monday 12 October 2026, 07.00 Danish time
const NOW = Date.parse('2026-10-12T05:00:00Z')
const SITE = 'https://matchly.dk'

const fck = (): ClubDigest => ({
  slug: 'fc-koebenhavn',
  name: 'FC København',
  league: 'Superliga',
  last: { slug: 'fck-brondby-2026-10-11', kickoff: Date.parse('2026-10-11T12:00:00Z'), league: 'Superliga', home: true, opponent: 'Brøndby IF', goalsFor: 2, goalsAgainst: 1 },
  next: { slug: 'agf-fck-2026-10-17', kickoff: Date.parse('2026-10-17T13:00:00Z'), league: 'Superliga', home: false, opponent: 'AGF', tv: 'TV3+' },
  table: [
    { rank: 1, name: 'FC Midtjylland', played: 12, points: 28, me: false },
    { rank: 2, name: 'AGF', played: 12, points: 25, me: false },
    { rank: 3, name: 'FC København', played: 12, points: 24, me: true },
    { rank: 4, name: 'Brøndby IF', played: 12, points: 20, me: false },
    { rank: 5, name: 'Randers FC', played: 12, points: 18, me: false },
  ],
  articles: [{ title: 'FCK & Brøndby: <derbyet> i tal', slug: 'derbyet-i-tal' }],
})

test('emnet: resultat, næste kamp, tid og kanal', () => {
  assert.equal(mailSubject([fck()], NOW), 'FC København: 2-1 mod Brøndby IF – næste kamp lørdag kl. 15 på TV3+')
  const two = mailSubject([fck(), { slug: 'agf', name: 'AGF', articles: [] }], NOW)
  assert.equal(two, 'FC København: 2-1 mod Brøndby IF – næste kamp lørdag kl. 15 på TV3+ · og AGF')
  const noLast = { ...fck(), last: undefined }
  assert.equal(mailSubject([noLast], NOW), 'FC København: næste kamp lørdag kl. 15 mod AGF på TV3+')
  assert.equal(mailSubject([{ ...fck(), next: { ...fck().next!, tv: 'TV3+, Viaplay' } }], NOW), 'FC København: 2-1 mod Brøndby IF – næste kamp lørdag kl. 15 på TV3+')
  assert.equal(whenShort(Date.parse('2026-10-24T13:30:00Z'), NOW), 'lørdag 24. okt. kl. 15.30')
})

test('ugens mail: links med utm, afmeldingslink, James og ingen kilder', () => {
  const m = buildWeeklyMail([fck()], { site: SITE, unsubscribeUrl: `${SITE}/klubmail/afmeld?t=abc`, week: '2026-W42', now: NOW })
  assert.match(m.html, /href="https:\/\/matchly\.dk\/kamp\/fck-brondby-2026-10-11\?utm_source=klubmail&amp;utm_medium=email"/)
  assert.match(m.html, /klub\/fc-koebenhavn\?utm_source=klubmail/)
  assert.match(m.html, /artikler\/derbyet-i-tal\?utm_source=klubmail/)
  assert.match(m.html, /https:\/\/matchly\.dk\/klubmail\/afmeld\?t=abc/)
  assert.match(m.text, /Afmeld med ét klik: https:\/\/matchly\.dk\/klubmail\/afmeld\?t=abc/)
  assert.match(m.html, /James, Matchly/)
  assert.match(m.text, /James, Matchly/)
  assert.match(m.html, /uge 42/)
  assert.match(m.html, /TV3\+/)
  // Escaped, and the club's own row marked in the mini table
  assert.match(m.html, /FCK &amp; Brøndby: &lt;derbyet&gt; i tal/)
  assert.match(m.html, /background:#c6f135;font-weight:bold;">3</)
  assert.match(m.text, /> {2}3\. FC København – 12 kampe, 24 point/)
  assert.match(m.text, /Seneste resultat: Sejr 2-1 hjemme mod Brøndby IF/)
  for (const word of [/fodboldlandshold/i, /api-sports/i, /\bDBU\b/, /Z-15/i, /Claude/]) {
    assert.doesNotMatch(m.html, word)
    assert.doesNotMatch(m.text, word)
  }
  // Gmail: tables and inline styles, no <style> block or scripts
  assert.doesNotMatch(m.html, /<style|<script/)
})

test('en klub uden kampe og tabel', () => {
  const m = buildWeeklyMail([{ slug: 'x', name: 'Klub X', articles: [] }], { site: SITE, unsubscribeUrl: 'u', week: '2026-W42', now: NOW })
  assert.match(m.html, /Ingen kampe i kalenderen lige nu/)
})

test('utm-parametre bevarer adressens egne', () => {
  assert.equal(tracked('https://matchly.dk/klub/agf#stilling'), 'https://matchly.dk/klub/agf?utm_source=klubmail&utm_medium=email#stilling')
  assert.equal(tracked('https://matchly.dk/?a=1'), 'https://matchly.dk/?a=1&utm_source=klubmail&utm_medium=email')
})

test('bekræftelsesmailen', () => {
  const m = buildConfirmMail(['FC København', 'Brøndby IF (K)'], { confirmUrl: `${SITE}/klubmail/bekraeft?t=abc`, site: SITE })
  assert.equal(m.subject, 'Bekræft: FC København og Brøndby IF (K) i din indbakke hver mandag')
  assert.match(m.html, /klubmail\/bekraeft\?t=abc/)
  assert.match(m.text, /7 dage/)
})
