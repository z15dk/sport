import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { loadFocusHeadToHead, pickMatches, picksFor } from './social'
import { captionFor, captionList, captionVariants, contentFor, linkFor, titleFor, type PostSpec } from './socialContent'
import { renderPost, renderSpec } from './socialRender'
import { connected, facebookLinkComment, fetchMetrics, imageUrl, platformCaption, publishTo, refreshThreadsToken, storyOk } from './socialPlatforms'
import { mailReady, sendMail } from './mail'
import {
  KIND_NAMES,
  PLATFORM_NAMES,
  findPost,
  imageDir,
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
import { SITE_URL, paths } from './site'
import { publishedArticles } from './articles'
import { readUpload } from './uploads'

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
    // Posts already out, the results post, and the admin's own posts are never planned away
    const kept = d.posts.filter((p) => p.date === date && (keep(p) || p.kind === 'results' || p.kind === 'own'))
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
  // An own post brings its own pictures
  if (post.kind === 'own') return post.images.length ? 'ok' : 'empty'
  const content = contentFor({ ...post, kind: post.kind }, Date.now())
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
    (p.kind === 'own' ? (p.own?.platforms ?? []) : cfg.kinds[p.kind].platforms)
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
  // An own post goes where the admin chose (every connected platform it names), the engine's by its kind's settings
  if (p.kind === 'own') {
    const own = (p.own?.platforms ?? []).filter((x) => cfg.dryRun || connected(x, s))
    const surfaces: Surface[] = p.own?.story ? ['feed', 'story'] : ['feed']
    return surfaces.flatMap((surface) => own.filter((x) => surface === 'feed' || storyOk(x, s)).map((platform) => ({ platform, surface })))
  }
  const chosen = cfg.kinds[p.kind].platforms.filter((x) => cfg.platforms[x] && (cfg.dryRun || connected(x, s)))
  const surfaces: Surface[] = p.kind === 'programme' ? ['feed', 'story'] : p.kind === 'story' ? ['story'] : ['feed']
  return surfaces.flatMap((surface) => chosen.filter((x) => surface === 'feed' || storyOk(x, s)).map((platform) => ({ platform, surface })))
}

const busy = new Set<string>()

/** Posts it on every platform it goes to (only where it isn't out already) */
export async function publishOne(id: string, again = false) {
  if (busy.has(id)) return
  busy.add(id)
  try {
    // Sent again (an own post after a fix in Make): every platform once more
    if (again)
      patch(id, (p) => {
        p.results = {}
      })
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
          // Facebook also gets the text without the link and the link as a comment, for Make to post the link in the comments
          const fb = t.platform === 'facebook' && t.surface !== 'story' && post.link ? facebookLinkComment(post.caption, post.link, cfg.hashtags, post.article !== undefined) : undefined
          const ig = t.platform === 'facebook' && t.surface !== 'story' ? platformCaption('instagram', post.caption, post.link, cfg.hashtags) : undefined
          const r = await publishTo(t.platform, t.surface, files, text, ig ? { link: post.link, textNoLink: fb?.text, comment: fb?.comment, textInstagram: ig } : undefined)
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

async function publishDue(now: number, ownOnly = false) {
  for (const p of readPosts().posts) {
    // An own post made from a template at its time has no pictures until then
    const later = p.kind === 'own' && !!p.own?.template && !p.images.length
    if (p.status !== 'waiting' || (!p.images.length && !later) || p.approval === 'pending') continue
    if (ownOnly && p.kind !== 'own') continue
    if (now < p.scheduledAt || now >= p.expiresAt) continue
    if (later && !(await makeTemplatePictures(p.id))) continue
    await publishOne(p.id)
  }
}

/**
 * An own post planned with a template made at its time: the template's cards made now (with the
 * results as they are), and its list put under the admin's text when asked for. False when there is
 * nothing to show (the post then fails with a note).
 */
async function makeTemplatePictures(id: string): Promise<boolean> {
  const p = findPost(id)
  const t = p?.own?.template
  if (!p || !t) return false
  const spec = templateSpec(t, Date.now())
  if (spec.focus) await loadFocusHeadToHead(spec.focus)
  const content = contentFor(spec, Date.now())
  if (!content) {
    patch(id, (x) => {
      x.status = 'failed'
      x.note = 'Skabelonen havde ingen data, da opslaget skulle ud'
    })
    logLine(`Eget opslag "${p.title}": skabelonen havde ingen data`, 'error')
    return false
  }
  try {
    const made = await renderSpec(`tpl-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`, spec)
    const feed = made.filter((i) => i.surface === 'feed').slice(0, OWN_MAX_IMAGES)
    const story = made.find((i) => i.surface === 'story')
    patch(id, (x) => {
      const images: SocialPost['images'] = [...feed]
      // The story: the template's story card, else the first picture
      const st = story ?? feed[0]
      if (x.own?.story && st) images.push({ file: st.file, surface: 'story' })
      x.images = images
      if (t.appendList) x.caption = [x.caption.trim(), captionList(content)].filter(Boolean).join('\n\n')
      if (!x.link) x.link = linkFor(content)
      x.renderedAt = Date.now()
    })
    return true
  } catch (e) {
    patch(id, (x) => {
      x.renderError = e instanceof Error ? e.message : String(e)
      x.renderTries = (x.renderTries ?? 0) + 1
    })
    return false
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
  if (running) return
  running = true
  // With the engine off, only the admin's own scheduled posts go out (nothing is planned or made by itself)
  if (!cfg.enabled) {
    try {
      await shareNewArticles(now)
      await publishDue(now, true)
    } catch (e) {
      logLine(`Egne opslag fejlede: ${e instanceof Error ? e.message : e}`, 'error')
    } finally {
      running = false
    }
    return
  }
  try {
    const today = isoDate(now)
    if (now >= danishTime(today, cfg.times.draft).getTime()) planDay(today, now)
    checkResults(addDays(today, -1), now)
    checkResults(today, now)
    await shareNewArticles(now)
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

// ---------------------------------------------------------------- own posts

/** At most this many pictures in one own post (a carousel) */
export const OWN_MAX_IMAGES = 10

/**
 * A post the admin writes: text, a link, 1–10 pictures (sent as data URLs, saved as JPEG for every
 * platform), the platforms and the time. It is approved by being written, so it goes out at its time
 * (or at once with `now`), also while the engine is switched off.
 */
export async function createOwnPost(input: {
  text: string
  link?: string
  images: string[]
  storyImage?: string
  platforms: Platform[]
  story: boolean
  at: number
  now?: boolean
  /** Make the pictures from this template at the post's time (fresh results) */
  template?: { kind: PostSpec['kind']; topic?: PostSpec['topic']; league?: string; focus?: string; women?: boolean; appendList: boolean; date?: string }
}) {
  const text = input.text.trim()
  if (!text) throw new Error('Skriv en tekst')
  if (!input.images.length && !input.template) throw new Error('Vælg mindst ét billede (Facebook og Instagram poster billeder)')
  if (!input.platforms.length) throw new Error('Vælg mindst én platform')
  const s = socialSecrets()
  const missing = input.platforms.filter((p) => !connected(p, s))
  if (missing.length && !socialConfig().dryRun) throw new Error(`Ikke forbundet: ${missing.map((p) => PLATFORM_NAMES[p]).join(', ')}`)
  const at = input.now ? Date.now() : input.at
  if (!input.now && (!Number.isFinite(at) || at < Date.now() - MIN)) throw new Error('Tidspunktet er passeret')
  const id = `own-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
  mkdirSync(imageDir(), { recursive: true })
  const images: SocialPost['images'] = []
  for (const [i, url] of input.images.slice(0, OWN_MAX_IMAGES).entries()) {
    // A template's card, already made on the server
    const made = templateFile(url)
    if (made) {
      images.push({ file: made, surface: 'feed' })
      continue
    }
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(url)
    if (!m) throw new Error(`Billede ${i + 1} kan ikke læses`)
    // Upright, at most 2048 px, as JPEG (Instagram takes nothing else)
    const jpeg = await sharp(Buffer.from(m[2], 'base64')).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer()
    const file = `${id}-${i + 1}.jpg`
    writeFileSync(path.join(imageDir(), file), jpeg)
    images.push({ file, surface: 'feed' })
  }
  // The story: the template's own story card when it has one, else the first picture
  if (input.story && images.length) images.push({ file: templateFile(input.storyImage ?? '') ?? images[0].file, surface: 'story' })
  const post: SocialPost = {
    id,
    date: isoDate(at),
    kind: 'own',
    own: {
      platforms: input.platforms,
      story: input.story,
      // The template's day: the one chosen (up to a week ahead), else the post's day (the results of that evening)
      ...(input.template && { template: { ...input.template, date: input.template.date ?? isoDate(at) } }),
    },
    matchIds: [],
    title: text.split('\n')[0].slice(0, 70),
    caption: text,
    captionEdited: true,
    link: input.link?.trim() ?? '',
    images,
    scheduledAt: at,
    // A day to get out (a server restart or a platform that is down for a while)
    expiresAt: at + 24 * 60 * MIN,
    status: 'waiting',
    approval: 'approved',
    approvedAt: Date.now(),
    results: {},
    createdAt: Date.now(),
  }
  updatePosts((d) => {
    d.posts.push(post)
  })
  logLine(`Eget opslag "${post.title}" ${input.now ? 'udgives nu' : `planlagt til ${formatLong(post.date)} kl. ${formatTime(new Date(at))}`}`)
  if (input.now) {
    if (input.template && !images.length && !(await makeTemplatePictures(id))) return findPost(id)
    await publishOne(id)
  }
  return findPost(id)
}

/** Removes an own post that has not gone out, with its pictures */
export function deleteOwnPost(id: string) {
  const p = findPost(id)
  if (!p || p.kind !== 'own') throw new Error('Ukendt opslag')
  if (p.status === 'published' || p.status === 'partly' || p.status === 'publishing') throw new Error('Opslaget er allerede udgivet')
  updatePosts((d) => {
    d.posts = d.posts.filter((x) => x.id !== id)
  })
  for (const i of p.images) {
    try {
      unlinkSync(path.join(imageDir(), i.file))
    } catch {
      // already gone (the story uses the first picture too)
    }
  }
}

/** "file:<name>" for a template's card made by ownTemplate (only those names, and only when the file is there) */
function templateFile(ref: string): string | undefined {
  const m = /^file:(tpl-[a-z0-9-]+\.jpg)$/i.exec(ref)
  return m && existsSync(path.join(imageDir(), m[1])) ? m[1] : undefined
}

/**
 * One of the engine's templates as the start of an own post: its cards made into pictures now,
 * with its text and link. The admin edits the text and adds pictures before planning it.
 */
/** A template's spec for an own post: a league (or more), a focus match, or women's football */
function templateSpec(t: { kind: PostSpec['kind']; topic?: PostSpec['topic']; league?: string; focus?: string; women?: boolean; date: string }, now: number): PostSpec {
  const women = !!t.women
  // A focus match's result (posted after the match): the results template for that one match
  if (t.focus && t.kind === 'results') return { kind: 'results', date: t.date, matchIds: [t.focus], focus: t.focus, women: women || undefined }
  return {
    kind: t.focus ? 'topic' : t.kind,
    topic: t.focus ? 'bigmatch' : t.kind === 'topic' ? t.topic : undefined,
    date: t.date,
    league: women ? undefined : t.league || undefined,
    focus: t.focus || undefined,
    women: women || undefined,
    // Women's football: its own pick of the day's women's games; else the day's matches as planned, or as the engine would pick them now
    matchIds: women
      ? pickMatches(t.date, now, () => true, socialConfig().matches || 5, true).map((p) => p.fixture.id)
      : (readPosts().days[t.date]?.matchIds ?? pickMatches(t.date, now).map((p) => p.fixture.id)),
  }
}

/**
 * The results post to a programme made from a template: the same leagues (or the same picked matches) that
 * day, 2½ hours after the last kick-off, its pictures made then (the final scores) with the list under the text
 */
export async function scheduleProgrammeResults(input: { league?: string; women?: boolean; date: string; text: string; platforms: Platform[] }) {
  const now = Date.now()
  const c = contentFor(templateSpec({ kind: 'programme', league: input.league, women: input.women, date: input.date }, now), now)
  if (!c || c.kind !== 'programme' || !c.picks.length) throw new Error('Ingen kampe den dag – resultaterne blev ikke planlagt')
  const at = Math.max(...c.picks.map((p) => p.fixture.kickoff.getTime())) + 150 * MIN
  if (at < now) throw new Error('Kampene er allerede spillet – resultaterne blev ikke planlagt')
  return createOwnPost({
    text: input.text.trim() || 'Dagens resultater ⚽',
    link: '',
    images: [],
    platforms: input.platforms,
    story: false,
    at,
    template: { kind: 'results', league: input.league, women: input.women, date: input.date, appendList: true },
  })
}

export async function ownTemplate(input: { kind: PostSpec['kind']; topic?: PostSpec['topic']; league?: string; focus?: string; women?: boolean; date: string; now?: number }) {
  const now = input.now ?? Date.now()
  const spec = templateSpec(input, now)
  if (spec.focus) await loadFocusHeadToHead(spec.focus)
  const content = contentFor(spec, now)
  if (!content) throw new Error('Skabelonen har ingen data den dag (prøv en anden liga eller dato)')
  dropUnusedTemplates()
  const images = await renderSpec(`tpl-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`, spec)
  return { images, caption: captionFor(content), captions: captionVariants(content), link: linkFor(content), title: titleFor(spec) }
}

/** Template pictures made but never used in a post, after two days */
function dropUnusedTemplates() {
  const used = new Set(readPosts().posts.flatMap((p) => p.images.map((i) => i.file)))
  try {
    for (const f of readdirSync(imageDir())) {
      if (!f.startsWith('tpl-') || used.has(f)) continue
      const full = path.join(imageDir(), f)
      if (Date.now() - statSync(full).mtimeMs > 2 * 86_400_000) unlinkSync(full)
    }
  } catch {
    // no pictures yet
  }
}

// ---------------------------------------------------------------- new articles

/** Openings for a shared article, one each (by the article's id, so each article keeps its own) */
const ARTICLE_INTROS = [
  'Ny artikel på Matchly 📰',
  'Frisk fra redaktionen ✍️',
  'Læs med 👇',
  'Den her skal du ikke gå glip af 👀',
  'Nyt på matchly.dk ⚽',
  'Klar til lidt læsning? 📖',
  'Vi har dykket ned i det 🤓',
  'Netop udgivet 🔥',
  'Til dig, der vil vide mere ⚽',
  'Kaffepause? Her er noget at læse ☕',
  'Ny læsning på Matchly 📰',
  'Lige udkommet på matchly.dk 🆕',
  'Dagens læsning er klar 📖',
  'Sådan ser det ud 👇',
  'Her er historien 👇',
  'Nyt fra Matchly ⚽',
  'Varm fra tasterne ⌨️',
  'Så er den ude 🚀',
  'Har du styr på den her? 🤔',
  'Vidste du det? 💡',
  'Det her skal du vide 👀',
  'Hvad siger du til den her? 🗣️',
  'Er du enig? 🤔',
  'Hvem havde set den komme? 😮',
  'Spændende læsning forude 👀',
  'Bliv klogere på 2 minutter ⏱️',
  'Sofa, kaffe og fodbold ☕',
  'Læsning til togturen 🚆',
  'Noget at læse, mens du venter ⏳',
  'Weekendlæsning til dig 🛋️',
  'Fem minutter med fodbold? ⚽',
  'Sæt dig godt til rette 📖',
  'Del den med en, der skal læse den 🔁',
  'Til dig, der følger med ⚽',
  'Til alle fodboldnørder derude 🤓',
  'Send den til din fodboldven 📲',
  'Klar til at diskutere den her? 💬',
  'Tag den med i omklædningsrummet 🧦',
  'Fodboldsnak til middagsbordet 🍽️',
  'Vi har gravet i det 🔍',
  'Vi har set nærmere på det 🔎',
  'Redaktionen anbefaler 👌',
  'Matchly har kigget nærmere 🔍',
  'Ugens læsning fra os ✍️',
]

/**
 * A new article out on the platforms by itself: when an article goes live (also a scheduled one at its
 * time), an own post is made with its picture, title, intro and link and goes out like the admin's own
 * posts (also while the engine is off). Only articles that went live after sharing was switched on, and
 * within the last day; each article once.
 */
async function shareNewArticles(now: number) {
  const cfg = socialConfig()
  if (!cfg.articles.enabled) return
  const platforms = articlePlatforms()
  if (!platforms.length) return
  const shared = new Set(readPosts().posts.map((p) => p.article).filter((x): x is number => x !== undefined))
  for (const a of publishedArticles({ limit: 10 }).articles) {
    const at = Date.parse(a.publishedAt ?? '')
    if (!Number.isFinite(at) || a.noSocial || shared.has(a.id) || at < (cfg.articles.since ?? now) || now - at > 24 * HOUR) continue
    await queueArticle(a, platforms, now, `art-${a.id}`)
  }
}

function articlePost(a: { id: number; title: string; excerpt: string; slug: string }, images: SocialPost['images'], now: number, status: SocialPost['status'], note?: string): SocialPost {
  const intro = ARTICLE_INTROS[a.id % ARTICLE_INTROS.length]
  return {
    id: `art-${a.id}`,
    date: isoDate(now),
    kind: 'own',
    article: a.id,
    matchIds: [],
    title: a.title,
    caption: [intro, '', a.title, ...(a.excerpt ? ['', a.excerpt] : [])].join('\n'),
    captionEdited: true,
    link: `${SITE_URL}${paths.article(a.slug)}`,
    images,
    scheduledAt: now,
    expiresAt: now + 24 * HOUR,
    status,
    note,
    // The admin wrote and published the article: sharing it needs no approval of its own
    approval: 'approved',
    approvedAt: now,
    results: {},
    createdAt: now,
  }
}

/** The platforms an article goes to: those switched on and connected */
function articlePlatforms(): Platform[] {
  const cfg = socialConfig()
  const s = socialSecrets()
  return (['facebook', 'instagram', 'threads', 'x'] as Platform[]).filter((p) => cfg.platforms[p] && (cfg.dryRun || connected(p, s)))
}

/** An article made into a post (its picture as a JPEG) and put in the queue; undefined when it has no picture */
async function queueArticle(a: { id: number; title: string; excerpt: string; slug: string; featuredImage?: string }, platforms: Platform[], now: number, id: string) {
  const upload = /^\/uploads\/([a-f0-9]{24}\.webp)$/.exec(a.featuredImage ?? '')
  const src = upload ? readUpload(upload[1]) : undefined
  if (!src) {
    logLine(`Artiklen "${a.title}" blev ikke delt: den har intet billede`, 'error')
    updatePosts((d) => {
      if (!d.posts.some((p) => p.id === id)) d.posts.push({ ...articlePost(a, [], now, 'empty', 'Intet billede at dele'), id })
    })
    return undefined
  }
  mkdirSync(imageDir(), { recursive: true })
  const file = `art-${a.id}-${Date.now().toString(36)}.jpg`
  const jpeg = await sharp(src).resize({ width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#0f110c' }).jpeg({ quality: 88 }).toBuffer()
  writeFileSync(path.join(imageDir(), file), jpeg)
  const post = { ...articlePost(a, [{ file, surface: 'feed' }], now, 'waiting'), id, own: { platforms, story: false } }
  updatePosts((d) => {
    d.posts.push(post)
  })
  logLine(`Artiklen "${a.title}" sendes til ${platforms.map((p) => PLATFORM_NAMES[p]).join(', ')}`)
  return post
}

/** Shares a published article now, by hand (also an old one, and again) */
export async function shareArticle(articleId: number) {
  const a = publishedArticles().articles.find((x) => x.id === articleId)
  if (!a) throw new Error('Artiklen er ikke udgivet')
  const platforms = articlePlatforms()
  if (!platforms.length) throw new Error('Ingen platforme er slået til og forbundet (Sociale medier → Plan og kø)')
  const post = await queueArticle(a, platforms, Date.now(), `art-${a.id}-${Date.now().toString(36)}`)
  if (!post) throw new Error('Artiklen har intet hovedbillede at dele')
  await publishOne(post.id)
  return findPost(post.id)
}
