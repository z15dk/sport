import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boldChannelName, parseBold, parseSportLive } from '../../src/data/tvProgrammes.ts'

test('Bold: alle kampe med kanal, med kanalnavne som vi skriver dem', () => {
  const data = [
    { name: 'Braga vs Gil Vicente', program_start: '2026-10-19 21:15:00', channel: { id: 74, name: 'Bold+' } },
    { name: 'Elche vs Racing Santander', program_start: '2027-05-30 15:00:00', channel: { id: 76, name: 'Disney+' } },
    { name: 'Brøndby IF vs Lyngby Boldklub', program_start: '2026-10-11 16:00:00', channel: { id: 67, name: 'TV2 Sport X' } },
    { name: 'FC Midtjylland vs F.C. København', program_start: '2026-10-11 18:00:00', channel: { id: 25, name: '3+' } },
    { name: 'Studiet', program_start: '2026-10-19 20:45:00', channel: { id: 74, name: 'Bold+' } },
    { name: 'Porto vs Benfica', channel: { id: 74, name: 'Bold+' } },
    { name: 'Chelsea vs Bournemouth', program_start: '2026-10-10 18:30:00' },
  ]
  assert.deepEqual(parseBold(data), [
    { name: 'Braga vs Gil Vicente', start: '2026-10-19 21:15:00', channel: 'Bold+' },
    { name: 'Elche vs Racing Santander', start: '2027-05-30 15:00:00', channel: 'Disney+' },
    { name: 'Brøndby IF vs Lyngby Boldklub', start: '2026-10-11 16:00:00', channel: 'TV 2 Sport X' },
    { name: 'FC Midtjylland vs F.C. København', start: '2026-10-11 18:00:00', channel: 'TV3+' },
  ])
  assert.deepEqual(parseBold(undefined), [])
  assert.deepEqual(parseBold({ fejl: true }), [])
})

test('Bold: kanalnavne', () => {
  assert.equal(boldChannelName('TV2 Play'), 'TV 2 Play')
  assert.equal(boldChannelName('Viaplay Sport News DK'), 'Viaplay Sport News')
  assert.equal(boldChannelName('Viaplay'), 'Viaplay')
  assert.equal(boldChannelName(' Disney+ '), 'Disney+')
})

test('SPORT LIVE: kun direkte kampe, ikke genudsendelser og optakter', () => {
  const event = (date: string, title: string, episode: string, status: string, genre = 'Basketball') =>
    `<Event><Date>${date}</Date><StartTime>18:55</StartTime><PrimaryGenre>${genre}</PrimaryGenre><Title>${title}</Title><EpisodeTitle>${episode}</EpisodeTitle><Status>${status}</Status></Event>`
  const xml = `<?xml version="1.0" encoding="UTF-8"?><EPG>${[
    event('08/10/2026', 'Basketligaen', 'Optakt til BK Vejen-Værløse Blue Hawks', 'Live'),
    event('08/10/2026', 'Basketligaen', 'BK Vejen-Værløse Blue Hawks', 'Live'),
    event('09/10/2026', 'Basketligaen', 'BK Vejen-Værløse Blue Hawks', 'Repeat'),
    event('11/10/2026', 'China Smash', 'Finale (k)', 'Relive'),
    event('18/10/2026', 'Individuelt EM', 'Finale (m)', 'Live'),
    event('16/10/2026', 'UEFA Women&apos;s Champions League', 'HB Køge-PSV Eindhoven &amp; co.', 'Live', 'Fodbold'),
    // Futsal is not football: the national teams' football match the same day must not get the channel
    event('16/10/2026', 'VM-kvalifikation', 'Portugal-Danmark', 'Live', 'Futsal'),
  ].join('')}</EPG>`
  assert.deepEqual(parseSportLive(xml), [
    { day: '2026-10-08', sport: 'basketball', title: 'Basketligaen', match: 'BK Vejen-Værløse Blue Hawks' },
    { day: '2026-10-16', sport: 'soccer', title: "UEFA Women's Champions League", match: 'HB Køge-PSV Eindhoven & co.' },
  ])
  assert.deepEqual(parseSportLive('ikke xml'), [])
})
