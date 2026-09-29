import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { isAdmin } from '../../../../lib/admin'
import { pickMatches, todayIso } from '../../../../lib/social'
import { captionFor, contentFor, logosFor, type PostSpec } from '../../../../lib/socialContent'
import { readPosts, socialConfig, TOPICS } from '../../../../lib/socialStore'
import { addDays, formatLong, isValidIsoDate } from '../../../../lib/time'
import s from '../sociale.module.css'
import { getMatches } from '../../../../data/matches'
import { teamByName } from '../../../../data/teams'
import { shownDivisions } from '../../../../data/leagues'
import { paths } from '../../../../lib/site'
import { CaptionBox, Day, PostCards, slotsOf } from '../cards'
import { FitRows } from '../FitRows'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Skabeloner · Sociale medier', robots: { index: false, follow: false } }

type SearchParams = Promise<{ dato?: string }>

// Every post a day can get, and every topic, from the real data: the same
// cards the engine makes into pictures. Nothing is posted from here; each card
// can be saved as a picture by hand.

/** One kind of post: its cards and text, or why it is left out */
async function Section({ spec, now, time, label, title, where, empty }: { spec: PostSpec; now: number; time: string; label: string; title: string; where: string; empty: string }) {
  const content = contentFor(spec, now)
  const rail = `${spec.date}-${spec.kind}${spec.topic ? `-${spec.topic}` : ''}${spec.slot ? `-${spec.slot.replace(/\D/g, '')}` : ''}`
  return (
    <Day rail={rail} time={time} label={label} title={title} where={where}>
      {content ? (
        <>
          <PostCards content={content} logos={await logosFor(content)} />
          {spec.kind !== 'story' && <CaptionBox text={captionFor(content)} />}
        </>
      ) : (
        <p className={s.empty}>{empty}</p>
      )}
    </Day>
  )
}

/**
 * The pictures shown when a page is shared (Facebook, X, Messenger, Slack, Google):
 * the real ones from the pages' opengraph-image routes, for the front page, one of
 * the day's matches, a league and a club.
 */
function ShareImages({ date, now }: { date: string; now: number }) {
  const matches = getMatches(date, 'all', now)
  const match = matches.find((m) => m.state === 'finished') ?? matches[0]
  const club = matches.map((m) => teamByName(m.home.name)).find(Boolean)
  const league = shownDivisions()[0]
  const pictures = [
    { title: 'Forsiden', page: '/', image: '/opengraph-image' },
    ...(match ? [{ title: `Kamp: ${match.home.name} – ${match.away.name}`, page: paths.match(match.slug), image: `${paths.match(match.slug)}/opengraph-image` }] : []),
    ...(league ? [{ title: `Liga: ${league.name}`, page: paths.league(league.slug), image: `${paths.league(league.slug)}/opengraph-image` }] : []),
    ...(club ? [{ title: `Klub: ${club.name}`, page: paths.club(club.slug), image: `${paths.club(club.slug)}/opengraph-image` }] : []),
  ]
  return (
    <section className={s.share}>
      <h2>Delingsbilleder (Open Graph)</h2>
      <p className="muted small">
        Billedet, der vises, når en side deles på Facebook, Messenger, X og Slack, og som Google får med kampene: 1200×630, lavet af sidens rigtige data
        og logoer. Hver side har sit eget.
      </p>
      <div className={s.shareGrid}>
        {pictures.map((p) => (
          <figure key={p.image}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the page's own share picture, as it is served */}
            <img src={p.image} alt={`Delingsbillede for ${p.title}`} width={1200} height={630} loading="lazy" />
            <figcaption>
              <Link href={p.page}>{p.title}</Link> · <a href={p.image}>åbn billedet</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

export default async function TemplatesPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const now = Date.now()
  const { dato } = await searchParams
  const date = isValidIsoDate(dato) ? dato : todayIso(now)
  const cfg = socialConfig()
  // The day's matches as the engine picked them, else as it would pick them now
  const ids = readPosts().days[date]?.matchIds ?? (cfg.manual[date]?.length ? cfg.manual[date] : pickMatches(date, now).map((p) => p.fixture.id))
  const picks = pickMatches(date, now).filter((p) => ids.includes(p.fixture.id))
  const slots = slotsOf(picks)
  const weekdayTopic = cfg.topics[String(new Date(`${date}T12:00:00Z`).getUTCDay())]
  const base = { date, matchIds: ids }
  // Women's football: its own pick of the day's women's games
  const womenPicks = pickMatches(date, now, () => true, cfg.matches, true)
  const womenBase = { date, matchIds: womenPicks.map((p) => p.fixture.id), women: true }
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/sociale/skabeloner" />
        <FitRows />
        <h1 className="feed__title">Skabeloner</h1>
        <p>
          Alle opslag, en dag kan få, lavet af sidens rigtige data og logoer – de samme kort, som motoren laver billeder af. Intet bliver postet herfra.
          Dagens emne står øverst; de andre emner vises under det, så de kan finpudses.
        </p>
        <p className="filter-bar">
          <Link className="pill" href={`/admin/sociale/skabeloner?dato=${addDays(date, -1)}`}>
            ← {formatLong(addDays(date, -1))}
          </Link>
          <span className="pill is-active">{formatLong(date)}</span>
          <Link className="pill" href={`/admin/sociale/skabeloner?dato=${addDays(date, 1)}`}>
            {formatLong(addDays(date, 1))} →
          </Link>
        </p>

        <Section spec={{ ...base, kind: 'programme' }} now={now} time={cfg.times.programme} label="Morgen" title="Dagens kampe" where={`Feed og story · ${picks.length} udvalgte kampe`} empty="Ingen udvalgte kampe denne dag." />
        {[...TOPICS].sort((a, b) => Number(b.id === weekdayTopic) - Number(a.id === weekdayTopic)).map((t) => (
          <Section
            key={t.id}
            spec={{ ...base, kind: 'topic', topic: t.id }}
            now={now}
            time={cfg.times.topic}
            label={t.id === weekdayTopic ? 'Dagens emne' : 'Emne'}
            title={t.name}
            where={`Karrusel i feed · ${t.description}`}
            empty="Ingen data, der er gode nok til emnet i dag. Så springes det over."
          />
        ))}
        {slots.map(([slot]) => (
          <Section key={slot} spec={{ ...base, kind: 'story', slot }} now={now} time={`–${cfg.times.storyBefore} m`} label="Før kamp" title={`Story før kampstart kl. ${slot}`} where="Story på Facebook og Instagram" empty="" />
        ))}
        <Section
          spec={{ ...base, kind: 'results' }}
          now={now}
          time={`+${cfg.times.resultsAfter} m`}
          label="Efter kampene"
          title="Resultater"
          where="Karrusel i feed · forsiden viser de udvalgte kampes resultater; eget kort kun til kampe, hvor alle mål har en målscorer med navn"
          empty="Ingen færdige kampe endnu."
        />
        <h2 className="feed__title" style={{ marginTop: 32 }}>Kvindefodbold</h2>
        <p className="muted">Dagens kvindekampe med samme kort, i kvindefodboldens farver og med mærket øverst.</p>
        <Section spec={{ ...womenBase, kind: 'programme' }} now={now} time={cfg.times.programme} label="Morgen" title="Kvindefodbold: dagens kampe" where={`Feed og story · ${womenPicks.length} kampe`} empty="Ingen kvindekampe denne dag." />
        {slotsOf(womenPicks).map(([slot]) => (
          <Section key={`w-${slot}`} spec={{ ...womenBase, kind: 'story', slot }} now={now} time={`–${cfg.times.storyBefore} m`} label="Før kamp" title={`Kvindefodbold: story kl. ${slot}`} where="Story på Facebook og Instagram" empty="" />
        ))}
        <Section spec={{ ...womenBase, kind: 'results' }} now={now} time={`+${cfg.times.resultsAfter} m`} label="Efter kampene" title="Kvindefodbold: resultater" where="Karrusel i feed" empty="Ingen færdige kvindekampe endnu." />
        <p className="muted small">Kortene vises formindsket: 4:5 til feed (1080×1350) og 9:16 til stories (1080×1920).</p>
        <ShareImages date={date} now={now} />
      </div>
    </div>
  )
}
