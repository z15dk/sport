import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { SEASON, shownDivisions, sportOf } from '../../data/leagues'
import { getMatches } from '../../data/matches'
import { getRealData } from '../../data/real'
import { externalLeagueKey } from '../../data/external'
import { divisionOfGame } from '../../data/ourLeagues'
import { Faq } from '../../components/Faq'
import { TeamBadge } from '../../components/TeamBadge'
import { readArchive } from '../../lib/archive'
import { publishedArticles } from '../../lib/articles'
import { getBadges } from '../../lib/badges'
import { customLogoUrl } from '../../lib/customLogos'
import { readDatavagt } from '../../lib/datavagt'
import type { FaqItem } from '../../lib/faq'
import { JsonLd, breadcrumbLd, faqLd, organizationLd } from '../../lib/jsonld'
import { indexable } from '../../lib/settings'
import { CONTACT_EMAIL, SITE_NAME, paths } from '../../lib/site'
import { formatFull, formatTime, isoDate } from '../../lib/time'
import { sportById } from '../../sports'

// About Matchly: who is behind it, what it covers (with live numbers from our own data), how the
// datavagt checks the facts every night, how the articles are written and corrected, a door for the
// clubs, and questions and answers. The trust page Google News looks for, in the league pages' look.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Om Matchly – hvem vi er, hvor tallene kommer fra og hvordan vi skriver' },
  description:
    'Matchly følger hele dansk fodbold – også 2. og 3. division og A-Ligaen – plus de store ligaer i fodbold, ishockey og basketball. Læs hvem der står bag, hvordan vi tjekker vores data hver nat, hvordan vi skriver og retter, og hvordan du kontakter redaktionen.',
  alternates: { canonical: paths.about() },
}

const DANISH = new Set(['superliga', '1div', '2div', '3div'])

/** What the datavagt holds up against what, every night */
const CHECKS: { what: string; how: string }[] = [
  { what: 'Træner', how: 'minimum 2 kilder målt op mod hinanden' },
  { what: 'Stadion', how: 'minimum 2 kilder målt op mod hinanden' },
  { what: 'Tabel', how: 'vores kampe ↔ officiel stilling' },
  { what: 'TV-kanal', how: 'ugens Superliga- og 1. divisionskampe' },
  { what: 'Kampstatus', how: 'kampe, der ikke er afsluttet' },
]

/** When the datavagt last ran, as a person says it: "i nat kl. 03.12", "i dag kl. 11.20", "i går kl. 03.10" */
function whenRun(at: number, now: number): string {
  const day = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(ms))
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hourCycle: 'h23' }).format(new Date(at)))
  const time = `kl. ${formatTime(new Date(at))}`
  if (day(at) === day(now)) return `${hour < 6 ? 'i nat' : 'i dag'} ${time}`
  if (day(at) === day(now - 24 * 3600_000)) return `${hour >= 22 ? 'i nat' : 'i går'} ${time}`
  return `${formatFull(new Date(at))} ${time}`
}
const number = (n: number) => n.toLocaleString('da-DK')

/** What we cover beyond our own leagues in Denmark (A-Liga, B-Liga, the cup): the tournaments the big sites skip */
function danishTournaments(): { key: string; name: string; logo?: string }[] {
  const seen = new Map<string, { key: string; name: string; logo?: string }>()
  for (const g of getRealData()?.external ?? []) {
    if (divisionOfGame(g) || g.sport !== 'soccer' || !/^(denmark|danmark)$/i.test(g.league.country ?? '')) continue
    const key = externalLeagueKey(g.league)
    if (!seen.has(key)) seen.set(key, { key, name: g.league.name, logo: customLogoUrl(`liga-${key}`) ?? g.league.logo })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'da'))
}

/** How many other tournaments we follow (the footer's "Alle turneringer, vi følger") */
function otherTournaments(): number {
  const keys = new Set<string>()
  for (const g of getRealData()?.external ?? []) if (!divisionOfGame(g)) keys.add(externalLeagueKey(g.league))
  return keys.size
}

export default async function AboutPage() {
  const now = Date.now()
  const divisions = shownDivisions()
  const badges = await getBadges()
  const logoOf = (slug: string, name: string) => customLogoUrl(`liga-${slug}`) ?? badges[name]
  const clubs = divisions.reduce((n, d) => n + d.clubs.length, 0)
  const live = getMatches(isoDate(now), 'all', now).filter((m) => m.state === 'live').length
  const others = otherTournaments()
  const tournaments = divisions.length + others
  const archived = readArchive().length
  const articles = publishedArticles({ limit: 1 }).total
  const danish = danishTournaments()
  const sports = [...new Set(divisions.map((d) => sportOf(d)))]

  // The datavagt: when it last ran ("i nat", "i dag kl. 11.20") and how many clubs it looks at
  const vagt = readDatavagt()
  const checkedClubs = divisions.filter((d) => DANISH.has(d.id)).reduce((n, d) => n + d.clubs.length, 0)
  const lastRun = vagt.at > 0 ? whenRun(vagt.at, now) : undefined

  const faq: FaqItem[] = [
    { q: 'Er Matchly gratis?', a: 'Ja. Resultater, tabeller, statistik og artikler er gratis for alle. Siden betales af annoncer.' },
    { q: 'Kan man stole på resultaterne?', a: 'Resultaterne kontrolleres automatisk, før de vises, og hver nat holder datavagten vores tal op mod flere uafhængige kilder. Finder du alligevel en fejl, så skriv til os, så retter vi den.' },
    { q: 'Hvilke ligaer dækker Matchly?', a: `${divisions.map((d) => d.name).join(', ')}${danish.length ? ` og ${danish.map((t) => t.name).join(', ')}` : ''} – i alt ${number(tournaments)} turneringer i sæson ${SEASON}.` },
    { q: 'Hvordan kommer min klub med på Matchly?', a: `Alle klubber i de ligaer, vi følger, har deres egen side automatisk. Spiller jeres klub i en række, vi ikke dækker endnu, så skriv til ${CONTACT_EMAIL}.` },
    { q: 'Kan vi vise Matchlys tabel på vores egen hjemmeside?', a: 'Ja. Under "Tabel til din side" kan en klub eller et fanmedie hente en gratis tabel eller kampoversigt, der opdaterer sig selv.' },
    { q: 'Hvordan kontakter jeg redaktionen?', a: `Skriv til ${CONTACT_EMAIL} – med rettelser, tips, nyheder fra din klub eller spørgsmål om annoncering.` },
  ]

  return (
    <div className="page about-page">
      <JsonLd data={organizationLd()} />
      <JsonLd data={breadcrumbLd([{ name: `Om ${SITE_NAME}`, path: paths.about() }])} />
      {faqLd(faq) && <JsonLd data={faqLd(faq)!} />}
      <div className="clubs">
        <header className="lx-hero about-hero" style={{ '--lx-c': '#2c3a0c' } as CSSProperties}>
          <span className="lx-hero__m" aria-hidden>
            M
          </span>
          <div>
            <span className="lx-hero__kicker">Om {SITE_NAME}</span>
            <h1 className="lx-hero__title">Al dansk fodbold. Også den, de andre springer over.</h1>
          </div>
          <p className="about-hero__lead">
            Livescore, tabeller, statistik og nyheder – fra Superligaen til 3. division og A-Ligaen, og de store ligaer i Europa. Gratis og på dansk.
          </p>
          {!indexable() && <p className="banner">Matchly er under udvikling. Odds er eksempler.</p>}
          <div className="about-hero__nums">
            <Link className="lx-hero__num" href="/?live=1">
              <strong>{number(live)}</strong>
              <span>{live === 1 ? 'kamp live lige nu' : 'kampe live lige nu'}</span>
            </Link>
            <div className="lx-hero__num">
              <strong>{number(tournaments)}</strong>
              <span>turneringer</span>
            </div>
            <Link className="lx-hero__num" href={paths.clubs()}>
              <strong>{number(clubs)}</strong>
              <span>klubber i vores ligaer</span>
            </Link>
            <div className="lx-hero__num">
              <strong>{number(archived)}</strong>
              <span>kampe i arkivet</span>
            </div>
            <Link className="lx-hero__num" href={paths.articles()}>
              <strong>{number(articles)}</strong>
              <span>artikler</span>
            </Link>
          </div>
        </header>

        <section className="panel prose__section">
          <h2 className="panel__title">Hvad er Matchly?</h2>
          <p>
            Matchly samler resultater, kampprogram, stillinger og statistik for fodbold, ishockey og basketball i Danmark, Tyskland, England, Spanien, Portugal, Sverige og Norge. Hver kamp har sin egen side med resultat, kampstatistik, klubbernes form og de seneste indbyrdes opgør.
          </p>
          <p>
            Ideen er enkel: de små rækker fortjener samme behandling som de store. Derfor dækker vi alle {number(clubs)} klubber i vores ligaer lige grundigt i sæson {SEASON} – også 2. og 3. division og kvindernes A-Liga, som andre sider kun dækker sparsomt.
          </p>
        </section>

        <section className="panel about-cover" aria-labelledby="about-cover">
          <h2 id="about-cover" className="panel__title">
            Det dækker vi
          </h2>
          {sports.map((sport) => (
            <div key={sport} className="about-cover__group">
              <h3>{sportById(sport).label}</h3>
              <ul className="about-cover__list">
                {divisions
                  .filter((d) => sportOf(d) === sport)
                  .map((d) => (
                    <li key={d.id}>
                      <Link href={paths.league(d.slug)}>
                        <TeamBadge link={false} name={d.name} src={logoOf(d.slug, d.name)} size={36} />
                        <span>{d.name}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {danish.length > 0 && (
            <div className="about-cover__group">
              <h3>Mere dansk fodbold</h3>
              <ul className="about-cover__list">
                {danish.map((t) => (
                  <li key={t.key}>
                    <Link href={paths.league(t.key)}>
                      <TeamBadge link={false} name={t.name} src={t.logo} size={36} />
                      <span>{t.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {others > danish.length && <p className="about-cover__more">Plus {number(others - danish.length)} turneringer mere i hele verden – se dem alle nederst på siden.</p>}
        </section>

        <section className="panel about-vagt" id="datavagten" aria-labelledby="about-vagt">
          <div className="about-vagt__intro">
            <h2 id="about-vagt" className="about-vagt__title">
              Vi tjekker os selv. Hver nat.
            </h2>
            <p>
              Kilder er ikke altid enige. Derfor holder Matchlys datavagt hver nat vores data op mod hinanden. Det, der ser forkert ud, tjekkes i minimum 2 uafhængige kilder og rettes, før du ser det.
            </p>
            {lastRun && (
              <p className="about-vagt__status">
                Seneste tjek: <b>{lastRun}</b>
              </p>
            )}
          </div>
          <ul className="about-vagt__checks" aria-label="Det tjekker datavagten">
            {CHECKS.map((c) => (
              <li key={c.what}>
                <span className="about-vagt__tick" aria-hidden="true">
                  ✓
                </span>
                <b>{c.what}</b>
                <span>{c.how}</span>
              </li>
            ))}
          </ul>
          <p className="about-vagt__strip">
            <b>{number(checkedClubs)}</b> danske klubber <span aria-hidden="true">·</span> <b>{CHECKS.length}</b> tjek <span aria-hidden="true">·</span> <b>hver nat</b>
          </p>
        </section>

        <section className="panel prose__section" id="artikler">
          <h2 className="panel__title">Hvordan skriver vi artikler?</h2>
          <p>
            I <Link href={paths.articles()}>artiklerne</Link> skriver vi nyheder, optakter og analyser om især dansk fodbold – også de rækker og kvindeligaer, som de store medier sjældent dækker.
          </p>
          <p>
            Hver artikel bygger på navngivne kilder: klubbernes egne meddelelser, forbundene og danske og udenlandske medier. Fakta om personer, stadioner og TV-kanaler tjekker vi i mindst to kilder, og tal fra vores egne kampdata kontrolleres, før de bruges. Kilderne står nederst i artiklen.
          </p>
          <p>
            Vi bringer ikke citater, vi ikke selv har fået, og vi gætter ikke på det, vi ikke ved. Alle artikler læses og godkendes af redaktionen, før de udgives.
          </p>
        </section>

        <section className="panel prose__section" id="rettelser">
          <h2 className="panel__title">Har du fundet en fejl?</h2>
          <p>
            Skriv til <a href={`mailto:${CONTACT_EMAIL}?subject=Rettelse`}>{CONTACT_EMAIL}</a>, så retter vi det hurtigst muligt. En artikel, der er rettet efter udgivelsen, viser datoen for den seneste opdatering. Fejl i resultater og tabeller retter vi i data, så de er rigtige på alle sider.
          </p>
        </section>

        <section className="panel about-clubs" aria-labelledby="about-clubs">
          <h2 id="about-clubs" className="panel__title">
            Til klubber og fanmedier
          </h2>
          <div className="about-clubs__grid">
            <Link className="about-clubs__card" href="/widget">
              <em>Gratis</em>
              <b>Sæt tabellen på jeres hjemmeside</b>
              <span>Tabel, kampprogram og resultater, der opdaterer sig selv.</span>
            </Link>
            <a className="about-clubs__card" href={`mailto:${CONTACT_EMAIL}?subject=Nyhed fra klubben`}>
              <em>Nyheder</em>
              <b>Send os jeres nyheder</b>
              <span>Trænerskifte, nye spillere, jubilæer – vi skriver om det.</span>
            </a>
            <Link className="about-clubs__card" href={paths.advertising()}>
              <em>Synlighed</em>
              <b>Annoncér på Matchly</b>
              <span>Nå fodboldfans i hele landet med jeres budskab.</span>
            </Link>
          </div>
        </section>

        <section className="panel prose__section" id="redaktionen">
          <h2 className="panel__title">Hvem står bag Matchly?</h2>
          <p>
            Matchly.dk er en del af Z-15. Du kan skrive til redaktionen på <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> – også med tips, ønsker til nye ligaer og henvendelser fra klubber.
          </p>
          <p>Klubnavne og logoer tilhører klubberne. Vi bruger dem kun til at vise, hvilke hold der spiller.</p>
        </section>

        <Faq items={faq} />
      </div>
    </div>
  )
}
