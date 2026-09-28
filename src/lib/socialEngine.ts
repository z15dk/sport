import 'server-only'
import { createHmac } from 'node:crypto'
import { pickMatches, picksFor } from './social'
import { captionFor, contentFor, linkFor, titleFor, type PostSpec } from './socialContent'
import { renderPost } from './socialRender'
import { connected, fetchMetrics, imageUrl, platformCaption, publishTo, refreshThreadsToken } from './socialPlatforms'
import { mailReady, sendMail } from './mail'
import {
  KIND_NAMES,
  PLATFORM_NAMES,
  STORY_PLATFORMS,
  findPost,
  logLine,
  needsApproval,
  readPosts,
  socialConfig,
  socialSecrets,
  updatePosts,
  type Platform,
  type PublishResult,
  type SocialPost,
  type Surface,
} from './socialStore'
import { addDays, danishTime, formatLong, formatTime, isoDate } from './time'
import { SITE_URL } from './site'

// The social media engine, run every minute from src/instrumentation.ts:
//
//   06:00  the day's plan: the matches (priorities from the admin, or picked by
//          hand) and the posts: the day's matches (07–08), the day's topic
//          (10–11) and a story an hour before each kick-off time
//   then   the cards are made into pictures and, while posts need approval, a
//          mail with a link to approve them is sent
//   later  each post goes out at its time once approved (or at once when
//          approved late but still in time); a post not approved in time expires
//   after  30 minutes after the last picked match: the results post
//
// All times are Danish (src/lib/time.ts) and every step can be redone from
// /admin/sociale.

const MIN = 60_000
const HOUR = 60 * MIN

// ---------------------------------------------------------------- planning

const endOfDay = (date: string) => danishTime(date, '23:59').getTime()

interface Planned extends PostSpec {
  id: string
  scheduledAt: number
  expiresAt: number
}

/** The posts a day gets, with their times (results come later, when the matches are over) */
function daySpecs(date: string, ids: string[], now: number): Planned[] {
  const cfg = socialConfig()
  const picks = picksFor(date, now, ids)
  const out: Planned[] = []
  if (cfg.kinds.programme.enabled && picks.length) {
    const at = danishTime(date, cfg.times.programme).getTime()
    const first = Math.min(...picks.map((p) => p.fixture.kickoff.getTime()))
    out.push({ id: `${date}-programme`, kind: 'programme', date, matchIds: ids, scheduledAt: at, expiresAt: first > at + HOUR ? first : at + 3 * HOUR })
  }
  const topic = cfg.topics[String(new Date(`${date}T12:00:00Z`).getUTCDay())]
  if (cfg.kinds.topic.enabled && topic && topic !== 'none')
    out.push({ id: `${date}-topic`, kind: 'topic', topic, date, matchIds: ids, scheduledAt: danishTime(date, cfg.times.topic).getTime(), expiresAt: endOfDay(date) })
  if (cfg.kinds.story.enabled) {
    const slots = new Map<string, number>()
    for (const p of picks) if (!p.finished) slots.set(formatTime(p.fixture.kickoff), p.fixture.kickoff.getTime())
    for (const [slot, kickoff] of slots) {
      if (kickoff < now) continue
      out.push({ id: `${date}-story-${slot.replace(/\D/g, '')}`, kind: 'story', slot, date, matchIds: ids, scheduledAt: kickoff - cfg.times.storyBefore * MIN, expiresAt: kickoff + 10 * MIN })
    }
  }
  return out
}

function newPost(p: Planned, now: number): SocialPost {
  const content = contentFor(p, now)
  return {
    id: p.id,
    date: p.date,
    kind: p.kind,
    topic: p.topic,
    slot: p.slot,
    matchIds: p.matchIds,
    title: titleFor(p),
    caption: content ? captionFor(content) : '',
    link: content ? linkFor(content) : SITE_URL,
    images: [],
    scheduledAt: p.scheduledAt,
    expiresAt: p.expiresAt,
    status: content ? 'waiting' : 'empty',
    note: content ? undefined : p.kind === 'topic' ? 'Ingen data, der er gode nok til emnet i dag' : 'Ingen kampe',
    approval: needsApproval(p.date) ? 'pending' : 'auto',
    results: {},
    createdAt: now,
  }
}

/** Keeps what is out (or going out); everything else of the day is made again */
const keep = (p: SocialPost) => p.status === 'published' || p.status === 'partly' || p.status === 'publishing'

/** Plans a day: the matches and its posts. `force` makes the plan again (after a change in the admin) */
export function planDay(date: string, now = Date.now(), force = false) {
  const cfg = socialConfig()
  if (readPosts().days[date] && !force) return
  const ids = cfg.manual[date]?.length ? cfg.manual[date] : pickMatches(date, now).map((p) => p.fixture.id)
  const posts = daySpecs(date, ids, now).map((p) => newPost(p, now))
  updatePosts((d) => {
    const kept = d.posts.filter((p) => p.date === date && (keep(p) || p.kind === 'results'))
    d.posts = [...d.posts.filter((p) => p.date !== date), ...kept, ...posts.filter((p) => !kept.some((k) => k.id === p.id))]
    d.days[date] = { date, matchIds: ids, plannedAt: now, allFinishedAt: force ? undefined : d.days[date]?.allFinishedAt }
    d.log.push({ at: now, level: 'info', text: `${formatLong(date)} planlagt: ${ids.length} kampe, ${posts.filter((p) => p.status !== 'empty').length} opslag` })
  })
}

/** The results post, when every picked match is over (or 4 hours after the last kick-off) */
function checkResults(date: string, now: number) {
  const cfg = socialConfig()
  const data = readPosts()
  const plan = data.days[date]
  if (!plan || !cfg.kinds.results.enabled || data.posts.some((p) => p.id === `${date}-results`)) return
  const picks = picksFor(date, now, plan.matchIds)
  if (!picks.length) return
  const last = Math.max(...picks.map((p) => p.fixture.kickoff.getTime()))
  if (!picks.every((p) => p.finished) && now < last + 4 * HOUR) return
  if (!picks.some((p) => p.finished)) return
  if (!plan.allFinishedAt) {
    updatePosts((d) => {
      d.days[date].allFinishedAt = now
    })
    return
  }
  // A few minutes before its time, so the last scorers are in and the pictures are ready
  const at = plan.allFinishedAt + cfg.times.resultsAfter * MIN
  if (now < at - 5 * MIN) return
  const post = newPost({ id: `${date}-results`, kind: 'results', date, matchIds: plan.matchIds, scheduledAt: at, expiresAt: danishTime(addDays(date, 1), '12:00').getTime() }, now)
  updatePosts((d) => {
    if (!d.posts.some((p) => p.id === post.id)) d.posts.push(post)
  })
}

// ---------------------------------------------------------------- pictures

function patch(id: string, change: (p: SocialPost) => void) {
  updatePosts((d) => {
    const p = d.posts.find((x) => x.id === id)
    if (p) change(p)
  })
}

/** Makes (or makes again) a post's pictures, and its text unless it was edited by hand */
export async function renderOne(id: string): Promise<'ok' | 'empty' | 'error'> {
  const post = findPost(id)
  if (!post) throw new Error('Ukendt opslag')
  const content = contentFor(post, Date.now())
  if (!content) {
    patch(id, (p) => {
      p.status = 'empty'
      p.note = 'Ingen data at lave kort af'
    })
    return 'empty'
  }
  try {
    const images = await renderPost(id)
    patch(id, (p) => {
      p.images = images
      p.renderedAt = Date.now()
      p.renderError = undefined
      if (!p.captionEdited) p.caption = captionFor(content)
      p.link = linkFor(content)
      if (p.status === 'empty') p.status = 'waiting'
    })
    return 'ok'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    patch(id, (p) => {
      p.renderError = msg
      p.renderTries = (p.renderTries ?? 0) + 1
    })
    logLine(`Billeder til "${post.title}" (${post.date}) fejlede: ${msg}`, 'error')
    return 'error'
  }
}

async function renderPending(now: number) {
  for (const p of readPosts().posts) {
    if (p.status !== 'waiting' || p.images.length || (p.renderTries ?? 0) >= 3 || now > p.expiresAt) continue
    await renderOne(p.id)
  }
}

// ---------------------------------------------------------------- approval

/** The key in an approval mail's link (signed, so the link works without logging in) */
export const approvalToken = (batch: string) => createHmac('sha256', socialSecrets().approvalKey).update(`batch:${batch}`).digest('base64url').slice(0, 32)

export function validApproval(batch: string, token: string | undefined) {
  const want = approvalToken(batch)
  return !!token && token.length === want.length && token === want && !!readPosts().batches[batch]
}

export const approvalLink = (batch: string) => `${SITE_URL}/admin/sociale/godkend/${batch}?t=${approvalToken(batch)}`

const when = (p: SocialPost) => `${formatLong(new Date(p.scheduledAt))} kl. ${formatTime(new Date(p.scheduledAt))}`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** One mail with every post that waits for approval and hasn't been mailed */
async function mailPending() {
  const posts = readPosts().posts.filter((p) => p.approval === 'pending' && p.status === 'waiting' && p.images.length && !p.mailedAt)
  if (!posts.length) return
  if (!mailReady()) {
    if (!readPosts().log.some((l) => l.text.startsWith('Mail er ikke sat op') && l.at > Date.now() - 12 * HOUR))
      logLine('Mail er ikke sat op: opslagene venter på godkendelse på /admin/sociale', 'error')
    return
  }
  const batch = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  updatePosts((d) => {
    d.batches[batch] = { ids: posts.map((p) => p.id), at: Date.now() }
  })
  const link = approvalLink(batch)
  const cfg = socialConfig()
  const platformsOf = (p: SocialPost) =>
    cfg.kinds[p.kind].platforms
      .filter((x) => cfg.platforms[x])
      .map((x) => PLATFORM_NAMES[x])
      .join(', ') || 'ingen platforme slået til'
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px">
<h2 style="margin:0 0 8px">${posts.length} opslag venter på godkendelse</h2>
<p><a href="${link}" style="display:inline-block;background:#16181a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Se og godkend opslagene</a></p>
${posts
  .map(
    (p) => `<hr style="border:0;border-top:1px solid #ddd;margin:20px 0">
<h3 style="margin:0">${esc(p.title)}</h3>
<p style="margin:4px 0;color:#555">${esc(when(p))} · ${esc(platformsOf(p))}</p>
<div>${p.images.map((i) => `<img src="${imageUrl(i.file)}" width="${i.surface === 'story' ? 120 : 160}" style="margin:4px 4px 0 0;border-radius:4px" alt="">`).join('')}</div>
${p.caption ? `<pre style="white-space:pre-wrap;font-family:inherit;background:#f5f5f2;padding:10px;border-radius:6px">${esc(p.caption)}</pre>` : ''}`,
  )
  .join('\n')}
<p style="color:#777;font-size:13px;margin-top:24px">Opslag, der ikke er godkendt, når tiden er gået, bliver ikke postet. Du kan også godkende i admin: ${SITE_URL}/admin/sociale</p>
</div>`
  const text = `${posts.length} opslag venter på godkendelse:\n\n${posts.map((p) => `- ${p.title}, ${when(p)}`).join('\n')}\n\nGodkend: ${link}`
  const day = formatLong(posts[0].date)
  try {
    await sendMail(`Matchly: ${posts.length} opslag venter på godkendelse (${day})`, html, text)
    updatePosts((d) => {
      for (const p of d.posts) if (posts.some((x) => x.id === p.id)) p.mailedAt = Date.now()
      d.log.push({ at: Date.now(), level: 'info', text: `Mail sendt: ${posts.length} opslag til godkendelse` })
    })
  } catch (e) {
    logLine(`Mail kunne ikke sendes: ${e instanceof Error ? e.message : e}`, 'error')
  }
}

/** Approves posts (from the admin or an approval mail); a post whose time has passed goes out on the next round */
export function approve(ids: string[]) {
  updatePosts((d) => {
    for (const p of d.posts)
      if (ids.includes(p.id) && p.approval === 'pending') {
        p.approval = 'approved'
        p.approvedAt = Date.now()
      }
  })
}

export function skip(ids: string[]) {
  updatePosts((d) => {
    for (const p of d.posts) if (ids.includes(p.id) && !keep(p)) p.status = 'skipped'
  })
}

export function unskip(id: string) {
  patch(id, (p) => {
    if (p.status === 'skipped') p.status = 'waiting'
  })
}

export function setCaption(id: string, caption: string) {
  patch(id, (p) => {
    p.caption = caption.slice(0, 2000)
    p.captionEdited = true
  })
}

// ---------------------------------------------------------------- posting

/** Where a post goes: each platform switched on for its kind, feed and/or story */
export function targetsOf(p: SocialPost): { platform: Platform; surface: Surface }[] {
  const cfg = socialConfig()
  const s = socialSecrets()
  const chosen = cfg.kinds[p.kind].platforms.filter((x) => cfg.platforms[x] && (cfg.dryRun || connected(x, s)))
  const surfaces: Surface[] = p.kind === 'programme' ? ['feed', 'story'] : p.kind === 'story' ? ['story'] : ['feed']
  return surfaces.flatMap((surface) => chosen.filter((x) => surface === 'feed' || STORY_PLATFORMS.includes(x)).map((platform) => ({ platform, surface })))
}

const busy = new Set<string>()

/** Posts it on every platform it goes to (only where it isn't out already) */
export async function publishOne(id: string) {
  if (busy.has(id)) return
  busy.add(id)
  try {
    const post = findPost(id)
    if (!post || !post.images.length) throw new Error('Opslaget har ingen billeder endnu')
    const cfg = socialConfig()
    const targets = targetsOf(post)
    if (!targets.length) {
      patch(id, (p) => {
        p.status = 'failed'
        p.note = 'Ingen platforme er slået til og forbundet for denne type opslag'
      })
      return
    }
    patch(id, (p) => {
      p.status = 'publishing'
    })
    for (const t of targets) {
      const key = `${t.platform}:${t.surface}`
      if (post.results[key]?.status === 'ok') continue
      const files = post.images.filter((i) => i.surface === t.surface).map((i) => i.file)
      let result: PublishResult
      if (!files.length) continue
      if (cfg.dryRun) result = { platform: t.platform, surface: t.surface, status: 'dry', at: Date.now() }
      else {
        try {
          const text = t.surface === 'story' ? '' : platformCaption(t.platform, post.caption, post.link, cfg.hashtags)
          const r = await publishTo(t.platform, t.surface, files, text)
          result = { platform: t.platform, surface: t.surface, status: 'ok', id: r.id, url: r.url, at: Date.now() }
        } catch (e) {
          result = { platform: t.platform, surface: t.surface, status: 'error', error: e instanceof Error ? e.message : String(e), at: Date.now() }
          logLine(`${PLATFORM_NAMES[t.platform]} (${t.surface === 'story' ? 'story' : 'feed'}): "${post.title}" fejlede: ${result.error}`, 'error')
        }
      }
      patch(id, (p) => {
        p.results[key] = result
      })
    }
    patch(id, (p) => {
      const rs = Object.values(p.results)
      const ok = rs.filter((r) => r.status !== 'error').length
      p.status = ok === rs.length && ok > 0 ? 'published' : ok > 0 ? 'partly' : 'failed'
      p.publishedAt = Date.now()
      if (p.approval === 'pending') {
        p.approval = 'approved'
        p.approvedAt = Date.now()
      }
    })
    const done = findPost(id)
    logLine(`${KIND_NAMES[post.kind]} "${post.title}" ${cfg.dryRun ? 'tør-kørt' : 'postet'}: ${Object.values(done?.results ?? {}).map((r) => `${PLATFORM_NAMES[r.platform]}${r.surface === 'story' ? ' story' : ''} ${r.status === 'error' ? 'fejl' : r.status === 'dry' ? '(tør)' : 'ok'}`).join(', ')}`)
  } finally {
    busy.delete(id)
  }
}

async function publishDue(now: number) {
  for (const p of readPosts().posts) {
    if (p.status !== 'waiting' || !p.images.length || p.approval === 'pending') continue
    if (now >= p.scheduledAt && now < p.expiresAt) await publishOne(p.id)
  }
}

function expire(now: number) {
  const late = readPosts().posts.filter((p) => p.status === 'waiting' && now >= p.expiresAt)
  if (!late.length) return
  updatePosts((d) => {
    for (const p of d.posts)
      if (late.some((x) => x.id === p.id)) {
        p.status = 'expired'
        p.note = p.approval === 'pending' ? 'Ikke godkendt i tide' : !p.images.length ? 'Ingen billeder i tide' : 'Tiden gik'
      }
  })
}

// ---------------------------------------------------------------- numbers

/** The numbers of the last two weeks' posts, every 3 hours */
async function updateMetrics(now: number) {
  if (now - (readPosts().metricsAt ?? 0) < 3 * HOUR) return
  updatePosts((d) => {
    d.metricsAt = now
  })
  for (const p of readPosts().posts) {
    if (!p.publishedAt || now - p.publishedAt > 14 * 86_400_000) continue
    for (const [key, r] of Object.entries(p.results)) {
      if (r.status !== 'ok' || !r.id) continue
      // Stories are gone after a day
      if (r.surface === 'story' && now - r.at > 26 * HOUR) continue
      try {
        const metrics = await fetchMetrics(r.platform, r.surface, r.id)
        if (metrics)
          patch(p.id, (x) => {
            x.results[key] = { ...x.results[key], metrics, metricsAt: Date.now() }
          })
      } catch {
        // numbers are a bonus: tried again in 3 hours
      }
    }
  }
}

// ---------------------------------------------------------------- the round

let running = false
let started = false

export async function socialTick(now = Date.now()) {
  const cfg = socialConfig()
  if (!cfg.enabled || running) return
  running = true
  try {
    const today = isoDate(now)
    if (now >= danishTime(today, cfg.times.draft).getTime()) planDay(today, now)
    checkResults(addDays(today, -1), now)
    checkResults(today, now)
    await renderPending(now)
    await mailPending()
    await publishDue(Date.now())
    expire(Date.now())
    await updateMetrics(Date.now())
    await refreshThreadsToken().catch((e) => logLine(`Threads-token kunne ikke fornys: ${e instanceof Error ? e.message : e}`, 'error'))
  } catch (e) {
    logLine(`Motoren fejlede: ${e instanceof Error ? e.message : e}`, 'error')
  } finally {
    running = false
  }
}

/** Starts the engine (every minute; it does nothing until it is switched on in the admin) */
export function startSocialEngine() {
  if (started || process.env.SOCIAL === 'off') return
  started = true
  setTimeout(() => void socialTick(), 90_000).unref?.()
  setInterval(() => void socialTick(), MIN).unref?.()
}
