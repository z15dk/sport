import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { ActionButton, CaptionEditor, ConfigSwitch, MatchPicker, OwnPostForm } from '../../../components/admin/SocialAdmin'
import { isAdmin } from '../../../lib/admin'
import { candidates, otherLeagues, picksFor, todayIso } from '../../../lib/social'
import { targetsOf } from '../../../lib/socialEngine'
import { connected, platformCaption, storyOk } from '../../../lib/socialPlatforms'
import { chromiumPath } from '../../../lib/socialRender'
import { mailReady } from '../../../lib/mail'
import { KIND_NAMES, TOPICS, PLATFORMS, STATUS_NAMES, PLATFORM_NAMES, readPosts, socialConfig, socialSecrets, type SocialPost } from '../../../lib/socialStore'
import { addDays, formatLong, formatTime, isValidIsoDate } from '../../../lib/time'
import { shownDivisions } from '../../../data/leagues'
import { allArticles } from '../../../lib/articles'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sociale medier · Admin', robots: { index: false, follow: false } }

type SearchParams = Promise<{ dato?: string }>

// The social media engine's day: its matches, its posts (pictures, text,
// approval, status per platform) and the engine's log. src/lib/socialEngine.ts.


const clock = (ms: number) => formatTime(new Date(ms))

const LogItem = ({ at, level, text }: { at: number; level: string; text: string }) => (
  <li className={level === 'error' ? 'is-error' : undefined}>
    <span className="muted">
      {formatLong(new Date(at))} {clock(at)}
    </span>{' '}
    {text}
  </li>
)

function Post({ p, now }: { p: SocialPost; now: number }) {
  const targets = targetsOf(p)
  const cfg = socialConfig()
  const out = p.status === 'published' || p.status === 'partly' || p.status === 'publishing'
  const state =
    p.status === 'waiting' && p.approval === 'pending' ? 'Venter på godkendelse' : p.status === 'waiting' && !p.images.length ? 'Laver billeder' : STATUS_NAMES[p.status]
  return (
    <article className={`social-post is-${p.status}${p.approval === 'pending' && p.status === 'waiting' ? ' is-pending' : ''}`}>
      <header>
        <strong className="social-post__time">{clock(p.scheduledAt)}</strong>
        <div>
          <h3>{p.title}</h3>
          <p className="muted small">
            {p.article ? 'Ny artikel' : KIND_NAMES[p.kind]} · {state}
            {p.approval === 'approved' && p.approvedAt ? ` · godkendt ${clock(p.approvedAt)}` : ''}
            {p.mailedAt ? ` · mail sendt ${clock(p.mailedAt)}` : ''} · udløber {clock(p.expiresAt)}
            {' · '}
            {targets.length ? targets.map((t) => `${PLATFORM_NAMES[t.platform]}${t.surface === 'story' ? ' story' : ''}`).join(', ') : 'ingen platforme slået til'}
          </p>
        </div>
      </header>
      {p.note && <p className="small">{p.note}</p>}
      {p.renderError && <p className="small social-msg is-error">Billeder: {p.renderError}</p>}
      {p.images.length > 0 && (
        <div className="social-thumbs">
          {p.images.map((i) => (
            <a key={i.file} href={`/sociale-billeder/${i.file}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- the card's own picture */}
              <img src={`/sociale-billeder/${i.file}`} alt="" className={i.surface === 'story' ? 'is-story' : undefined} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {p.kind !== 'story' && p.status !== 'empty' && <CaptionEditor id={p.id} caption={p.caption} edited={p.captionEdited} locked={out} />}
      {p.kind !== 'story' && p.status !== 'empty' && targets.some((t) => t.surface === 'feed') && (
        <details className="social-preview">
          <summary>Teksten pr. platform (med tags)</summary>
          <dl>
            {targets
              .filter((t) => t.surface === 'feed')
              .map((t) => (
                <div key={t.platform} style={{ display: 'contents' }}>
                  <dt>{PLATFORM_NAMES[t.platform]}</dt>
                  <dd>{platformCaption(t.platform, p.caption, p.link, cfg.hashtags)}</dd>
                </div>
              ))}
          </dl>
        </details>
      )}
      {Object.values(p.results).length > 0 && (
        <ul className="social-results">
          {Object.values(p.results).map((r) => (
            <li key={`${r.platform}:${r.surface}`} className={`is-${r.status}`}>
              <b>
                {PLATFORM_NAMES[r.platform]}
                {r.surface === 'story' ? ' story' : ''}
              </b>{' '}
              {r.status === 'ok' ? (
                <>
                  postet {clock(r.at)}
                  {r.url && (
                    <>
                      {' · '}
                      <a href={r.url} target="_blank" rel="noreferrer">
                        se opslaget
                      </a>
                    </>
                  )}
                </>
              ) : r.status === 'dry' ? (
                `tør-kørt ${clock(r.at)} (intet sendt)`
              ) : (
                `fejl: ${r.error}`
              )}
            </li>
          ))}
        </ul>
      )}
      <footer>
        {/* Stories can't go through Make: the story pictures to download and post by hand (Meta Business Suite) */}
        {p.images
          .filter((i) => i.surface === 'story')
          .map((i, n, all) => (
            <a key={i.file} className="pill" href={`/sociale-billeder/${i.file}`} download={`matchly-story-${p.date}${all.length > 1 ? `-${n + 1}` : ''}.jpg`}>
              ⬇ Hent story{all.length > 1 ? ` ${n + 1}` : ''}
            </a>
          ))}
        {p.approval === 'pending' && p.status === 'waiting' && <ActionButton pill body={{ action: 'approve', ids: [p.id] }} label="Godkend" />}
        {p.status === 'waiting' && <ActionButton body={{ action: 'skip', ids: [p.id] }} label="Spring over" />}
        {p.status === 'skipped' && <ActionButton body={{ action: 'unskip', id: p.id }} label="Med igen" />}
        {p.kind === 'own' && !out && <ActionButton body={{ action: 'ownDelete', id: p.id }} label="Slet" confirm="Slet opslaget og dets billeder?" />}
        {p.kind !== 'own' && !out && p.status !== 'skipped' && <ActionButton body={{ action: 'render', id: p.id }} label={p.images.length ? 'Lav billederne igen' : 'Lav billederne'} busyLabel="Laver billeder …" />}
        {/* Also a post that was only dry-run: it can be sent for real once the dry run is off */}
        {p.images.length > 0 &&
          (p.status === 'waiting' || p.status === 'failed' || p.status === 'partly' || p.status === 'expired' || (p.status === 'published' && Object.values(p.results).every((r) => r.status === 'dry'))) &&
          now < p.expiresAt + 12 * 3_600_000 && (
          <ActionButton
            body={{ action: 'publish', id: p.id }}
            label={p.status === 'failed' || p.status === 'partly' ? 'Prøv igen' : 'Post nu'}
            busyLabel="Poster …"
            confirm="Post opslaget nu på de valgte platforme?"
          />
        )}
        {p.kind === 'own' && p.images.length > 0 && (p.status === 'published' || p.status === 'partly') && Object.values(p.results).some((r) => r.status === 'ok') && (
          <ActionButton
            body={{ action: 'publish', id: p.id, again: true }}
            label="Send igen"
            busyLabel="Sender …"
            confirm="Send opslaget igen? Kom det ud første gang, står det der nu to gange."
          />
        )}
      </footer>
    </article>
  )
}

export default async function SocialPlan({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const now = Date.now()
  const { dato } = await searchParams
  const today = todayIso(now)
  const date = isValidIsoDate(dato) ? dato : today
  const cfg = socialConfig()
  const secrets = socialSecrets()
  const data = readPosts()
  const plan = data.days[date]
  const posts = data.posts.filter((p) => p.date === date).sort((a, b) => a.scheduledAt - b.scheduledAt)
  const chosen = plan ? picksFor(date, now, plan.matchIds) : []
  const all = candidates(date, now)
  const pending = data.posts.filter((p) => p.approval === 'pending' && p.status === 'waiting')
  const browser = chromiumPath()
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/sociale" />
        <h1 className="feed__title">Sociale medier</h1>

        <section className="panel prose__section social-status">
          <div className="social-switches">
            <ConfigSwitch value={cfg.enabled} label="Motoren kører" setting="enabled" />
            <ConfigSwitch value={cfg.dryRun} label="Tør-kørsel (intet sendes til platformene)" setting="dryRun" />
            <ConfigSwitch value={cfg.articles.enabled} label="Del nye artikler automatisk" setting="articles" />
          </div>
          <div className="social-switches">
            {PLATFORMS.map((p) => (
              <ConfigSwitch
                key={p}
                value={cfg.platforms[p]}
                label={`${PLATFORM_NAMES[p]}${connected(p, secrets) ? '' : ' (ikke forbundet)'}`}
                setting={`platform:${p}`}
              />
            ))}
          </div>
          <p className="small">
            {cfg.approval.always
              ? 'Alle opslag skal godkendes.'
              : cfg.approval.until
                ? `Opslag skal godkendes til og med ${formatLong(cfg.approval.until)}.`
                : 'Opslag postes uden godkendelse.'}{' '}
            {mailReady() ? `Godkendelser mailes til ${cfg.email.to}.` : <b>Mail er ikke sat op – godkend her på siden.</b>}{' '}
            {browser ? '' : <b>Chromium mangler på serveren, så der kan ikke laves billeder endnu (installeres ved næste udrulning).</b>}{' '}
            <Link href="/admin/sociale/indstillinger">Indstillinger</Link>
          </p>
          <p>
            {pending.length > 1 && <ActionButton pill body={{ action: 'approve', ids: pending.map((p) => p.id) }} label={`Godkend alle ${pending.length} ventende`} />}{' '}
            <ActionButton pill body={{ action: 'tick' }} label="Kør en runde nu" busyLabel="Kører …" />
          </p>
        </section>

        {(() => {
          // Everything that is to go out, whatever the day: posts waiting for their time (or approval), and
          // scheduled articles that are shared by themselves when they go live
          const waiting = data.posts.filter((p) => p.status === 'waiting' && p.expiresAt > now).sort((a, b) => a.scheduledAt - b.scheduledAt)
          const articles = cfg.articles.enabled
            ? allArticles()
                .filter((a) => a.status === 'published' && a.publishedAt && Date.parse(a.publishedAt) > now && !data.posts.some((p) => p.article === a.id))
                .sort((a, b) => Date.parse(a.publishedAt!) - Date.parse(b.publishedAt!))
            : []
          const when = (t: number) => `${formatLong(new Date(t))} kl. ${clock(t)}`
          return (
            <section className="panel">
              <h2 className="panel__title">Kø ({waiting.length + articles.length})</h2>
              {waiting.length + articles.length === 0 ? (
                <p className="muted small pad">
                  Intet venter på at blive postet.{' '}
                  {cfg.articles.enabled ? 'Nye artikler deles automatisk, når de går live.' : 'Slå "Del nye artikler automatisk" til for at dele artiklerne af sig selv.'}
                </p>
              ) : (
                <ul className="own-upcoming">
                  {[
                    ...waiting.map((p) => ({ at: p.scheduledAt, p, a: undefined })),
                    ...articles.map((a) => ({ at: Date.parse(a.publishedAt!), p: undefined, a })),
                  ]
                    .sort((x, y) => x.at - y.at)
                    .map(({ at, p, a }) =>
                      p ? (
                        <li key={p.id}>
                          <span>{when(at)}</span>
                          <strong>{p.title}</strong>
                          <span className="muted small">
                            {p.article ? 'Ny artikel' : KIND_NAMES[p.kind]} ·{' '}
                            {p.approval === 'pending' ? 'venter på godkendelse' : p.own?.template && !p.images.length ? 'billederne laves, når det skal ud' : !p.images.length ? 'laver billeder' : 'klar'} ·{' '}
                            {targetsOf(p)
                              .map((t) => `${PLATFORM_NAMES[t.platform]}${t.surface === 'story' ? ' story' : ''}`)
                              .join(', ') || 'ingen platforme slået til'}
                          </span>
                          <Link href={`/admin/sociale?dato=${p.date}`}>Vis</Link>
                          {p.kind === 'own' && <ActionButton body={{ action: 'ownDelete', id: p.id }} label="Slet" confirm="Slet opslaget og dets billeder?" />}
                        </li>
                      ) : (
                        <li key={`a-${a!.id}`}>
                          <span>{when(at)}</span>
                          <strong>{a!.title}</strong>
                          <span className="muted small">Artikel · deles automatisk, når den går live</span>
                          <Link href={`/admin/artikler/${a!.id}`}>Artiklen</Link>
                        </li>
                      ),
                    )}
                </ul>
              )}
            </section>
          )
        })()}

        <section className="panel">
          <h2 className="panel__title">Nyt opslag</h2>
          <p className="muted small pad">
            Skriv dit eget opslag med billeder og vælg, hvornår det skal ud. Det postes på sit tidspunkt – også når motoren er slået fra – og står i
            dagens plan herunder.
          </p>
          <OwnPostForm
            templates={[
              { value: 'programme', label: 'Dagens kampe' },
              { value: 'results', label: 'Resultater' },
              ...TOPICS.map((t) => ({ value: `topic:${t.id}`, label: t.name })),
            ]}
            leagues={[...shownDivisions().map((d) => ({ id: d.id, name: d.name, group: 'Vores ligaer' })), ...otherLeagues(now).map((l) => ({ ...l, group: 'Pokaler og andre turneringer' }))]}
            platforms={PLATFORMS.map((p) => ({ id: p, name: PLATFORM_NAMES[p], connected: connected(p, secrets), story: storyOk(p, secrets) }))}
          />
        </section>

        <p className="filter-bar">
          <Link className="pill" href={`/admin/sociale?dato=${addDays(date, -1)}`}>
            ← {formatLong(addDays(date, -1))}
          </Link>
          <span className="pill is-active">
            {formatLong(date)}
            {date === today ? ' (i dag)' : ''}
          </span>
          <Link className="pill" href={`/admin/sociale?dato=${addDays(date, 1)}`}>
            {formatLong(addDays(date, 1))} →
          </Link>
        </p>

        <section className="panel prose__section">
          <h2 className="panel__title">Dagens udvalgte kampe</h2>
          <div className="social-pad">
            {plan ? (
              <>
                <ul className="social-matches">
                  {chosen.map((p) => (
                    <li key={p.fixture.id}>
                      <b>{formatTime(p.fixture.kickoff)}</b> {p.fixture.home.name} – {p.fixture.away.name} <span className="muted small">· {p.league}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted small">
                  Planlagt {formatLong(new Date(plan.plannedAt))} kl. {clock(plan.plannedAt)}
                  {plan.allFinishedAt ? ` · alle kampe slut kl. ${clock(plan.allFinishedAt)}` : ''}.
                </p>
              </>
            ) : (
              <p className="muted">Ikke planlagt endnu. Dagen planlægges kl. {cfg.times.draft}, når motoren kører.</p>
            )}
            <p>
              <ActionButton pill body={{ action: 'plan', date }} label={plan ? 'Planlæg dagen igen' : 'Planlæg dagen nu'} confirm={plan ? 'Opslag, der ikke er postet, laves forfra. Fortsæt?' : undefined} />
            </p>
            {all.length > 0 && (
              <MatchPicker
                date={date}
                chosen={plan?.matchIds ?? []}
                manual={!!cfg.manual[date]?.length}
                candidates={all.slice(0, 40).map((c) => ({
                  id: c.fixture.id,
                  label: `${c.fixture.home.name} – ${c.fixture.away.name}`,
                  league: c.league,
                  time: formatTime(c.fixture.kickoff),
                  score: c.score,
                }))}
              />
            )}
          </div>
        </section>

        <h2>Opslag</h2>
        {posts.length ? posts.map((p) => <Post key={p.id} p={p} now={now} />) : <p className="muted">Ingen opslag denne dag endnu.</p>}

        <section className="panel prose__section">
          <h2 className="panel__title">Log</h2>
          <ul className="social-log">
            {data.log
              .slice(-10)
              .reverse()
              .map((l, i) => (
                <LogItem key={i} at={l.at} level={l.level} text={l.text} />
              ))}
            {!data.log.length && <li className="muted">Intet endnu.</li>}
          </ul>
          {data.log.length > 10 && (
            <details className="social-guide social-pad">
              <summary>Vis {Math.min(data.log.length, 60) - 10} ældre linjer</summary>
              <ul className="social-log">
                {data.log
                  .slice(-60, -10)
                  .reverse()
                  .map((l, i) => (
                    <LogItem key={i} at={l.at} level={l.level} text={l.text} />
                  ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
  )
}
