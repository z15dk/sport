import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { isAdmin } from '../../../../lib/admin'
import { KIND_NAMES, PLATFORMS, PLATFORM_NAMES, STATUS_NAMES, readPosts, type Metrics, type PublishResult, type SocialPost } from '../../../../lib/socialStore'
import { addDays, formatLong, formatTime, isoDate } from '../../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Historik · Sociale medier', robots: { index: false, follow: false } }

type SearchParams = Promise<{ dage?: string }>

// What has been posted where and when, with the platforms' numbers (fetched
// every 3 hours for two weeks after a post; stories for a day).

const KEYS = ['views', 'reach', 'likes', 'comments', 'shares', 'saves'] as const
const NAMES: Record<(typeof KEYS)[number], string> = { views: 'Visninger', reach: 'Rækkevidde', likes: 'Likes', comments: 'Kommentarer', shares: 'Delinger', saves: 'Gemt' }

const n = (v?: number) => (v === undefined ? '–' : v.toLocaleString('da-DK'))

function sum(results: PublishResult[]) {
  const out: Metrics & { posts: number } = { posts: results.length }
  for (const r of results) for (const k of KEYS) if (r.metrics?.[k] !== undefined) out[k] = (out[k] ?? 0) + r.metrics[k]!
  return out
}

/** Monday of a date's week */
const weekOf = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))

function Totals({ title, rows }: { title: string; rows: { label: string; results: PublishResult[] }[] }) {
  const shown = rows.filter((r) => r.results.length)
  if (!shown.length) return null
  return (
    <section className="panel prose__section">
      <h2 className="panel__title">{title}</h2>
      <div className="social-scroll social-pad">
        <table className="table social-table">
          <thead>
            <tr>
              <th />
              <th>Opslag</th>
              {KEYS.map((k) => (
                <th key={k}>{NAMES[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const t = sum(r.results)
              return (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>{t.posts}</td>
                  {KEYS.map((k) => (
                    <td key={k}>{n(t[k])}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default async function SocialHistory({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const { dage } = await searchParams
  const days = Math.max(7, Math.min(183, Number(dage) || 30))
  const from = Date.now() - days * 86_400_000
  const posts = readPosts()
    .posts.filter((p) => p.publishedAt && p.publishedAt > from)
    .sort((a, b) => b.publishedAt! - a.publishedAt!)
  const real = (p: SocialPost) => Object.values(p.results).filter((r) => r.status === 'ok')
  const all = posts.flatMap(real)
  const weeks = [...new Set(posts.map((p) => weekOf(isoDate(p.publishedAt!))))]
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/sociale/historik" />
        <h1 className="feed__title">Historik og tal</h1>
        <p className="filter-bar">
          {[7, 30, 90, 183].map((d) => (
            <Link key={d} className={`pill${d === days ? ' is-active' : ''}`} href={`/admin/sociale/historik?dage=${d}`}>
              {d === 183 ? 'Et halvt år' : `${d} dage`}
            </Link>
          ))}
        </p>
        <p className="muted small">
          Tallene hentes hos platformene hver 3. time i to uger efter et opslag (stories i et døgn). Hvad der kan hentes, afhænger af platformen: X giver kun tal på en
          betalt API-plan. Tør-kørte opslag tælles ikke med.
        </p>
        <Totals title="Pr. platform" rows={PLATFORMS.map((p) => ({ label: PLATFORM_NAMES[p], results: all.filter((r) => r.platform === p) }))} />
        <Totals
          title="Pr. type opslag"
          rows={(['programme', 'topic', 'story', 'results'] as const).map((k) => ({ label: KIND_NAMES[k], results: posts.filter((p) => p.kind === k).flatMap(real) }))}
        />
        <Totals title="Pr. uge" rows={weeks.map((w) => ({ label: `Uge fra ${formatLong(w)}`, results: posts.filter((p) => weekOf(isoDate(p.publishedAt!)) === w).flatMap(real) }))} />

        <section className="panel prose__section">
          <h2 className="panel__title">Alle opslag</h2>
          <div className="social-scroll social-pad">
            <table className="table social-table">
              <thead>
                <tr>
                  <th>Postet</th>
                  <th>Opslag</th>
                  <th>Platform</th>
                  <th>Status</th>
                  {KEYS.map((k) => (
                    <th key={k}>{NAMES[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posts.flatMap((p) =>
                  Object.values(p.results).map((r, i) => (
                    <tr key={`${p.id}-${r.platform}-${r.surface}`}>
                      <td>{i === 0 ? `${formatLong(new Date(p.publishedAt!))} ${formatTime(new Date(p.publishedAt!))}` : ''}</td>
                      <td>{i === 0 ? <Link href={`/admin/sociale?dato=${p.date}`}>{p.title}</Link> : ''}</td>
                      <td>
                        {PLATFORM_NAMES[r.platform]}
                        {r.surface === 'story' ? ' story' : ''}
                      </td>
                      <td>
                        {r.status === 'ok' ? (
                          r.url ? (
                            <a href={r.url} target="_blank" rel="noreferrer">
                              Se opslaget
                            </a>
                          ) : (
                            'Postet'
                          )
                        ) : r.status === 'dry' ? (
                          'Tør-kørt'
                        ) : (
                          <span className="social-msg is-error" title={r.error}>
                            Fejl
                          </span>
                        )}
                      </td>
                      {KEYS.map((k) => (
                        <td key={k}>{n(r.metrics?.[k])}</td>
                      ))}
                    </tr>
                  )),
                )}
                {!posts.length && (
                  <tr>
                    <td colSpan={4 + KEYS.length} className="muted">
                      Intet postet i perioden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small social-pad">Status for opslag, der ikke kom ud: {Object.values(STATUS_NAMES).join(', ')} – se dem under Plan og kø.</p>
        </section>
      </div>
    </div>
  )
}
