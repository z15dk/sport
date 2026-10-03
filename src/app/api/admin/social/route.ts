import { adminDenied } from '../../../../lib/admin'
import {
  KINDS,
  PLATFORMS,
  STATUS_NAMES,
  cleanHandle,
  findPost,
  saveHandles,
  type Handles,
  isTopic,
  saveConfig,
  saveSecrets,
  socialConfig,
  type Platform,
  type SocialConfig,
} from '../../../../lib/socialStore'
import { connectMeta, connectThreads, connectX, testPlatform } from '../../../../lib/socialPlatforms'
import { approve, createOwnPost, deleteOwnPost, ownTemplate, shareArticle, planDay, publishOne, renderOne, setCaption, skip, socialTick, unskip } from '../../../../lib/socialEngine'
import { sendMail } from '../../../../lib/mail'
import { danishTime, isValidIsoDate } from '../../../../lib/time'
import { focusCandidates } from '../../../../lib/social'

// Everything on /admin/sociale: settings, accounts, tests and the posts.

type Body = Record<string, unknown> & { action?: string }

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const time = (v: unknown, fallback: string) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback)
const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const isPlatform = (v: unknown): v is Platform => PLATFORMS.includes(v as Platform)
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [])

/** The settings as sent, checked field by field over the saved ones */
function merged(input: Partial<SocialConfig>, c: SocialConfig): SocialConfig {
  const out = structuredClone(c)
  if (typeof input.enabled === 'boolean') out.enabled = input.enabled
  if (typeof input.dryRun === 'boolean') out.dryRun = input.dryRun
  // Sharing articles switched on: only articles that go live from now on are shared
  if (typeof input.articles?.enabled === 'boolean') out.articles = { enabled: input.articles.enabled, since: input.articles.enabled ? (c.articles.enabled ? c.articles.since : Date.now()) : undefined }
  if (input.approval) {
    if (typeof input.approval.always === 'boolean') out.approval.always = input.approval.always
    if ('until' in input.approval) out.approval.until = isValidIsoDate(input.approval.until) ? input.approval.until : undefined
  }
  if (input.email) {
    const e = input.email
    out.email = {
      to: str(e.to ?? c.email.to, 200),
      from: str(e.from ?? c.email.from, 200),
      host: str(e.host ?? c.email.host, 200),
      user: str(e.user ?? c.email.user, 200),
      port: int(e.port ?? c.email.port, 587, 1, 65535),
      secure: typeof e.secure === 'boolean' ? e.secure : c.email.secure,
    }
  }
  if (input.platforms) for (const p of PLATFORMS) if (typeof input.platforms[p] === 'boolean') out.platforms[p] = input.platforms[p]
  if (input.kinds)
    for (const k of KINDS) {
      const x = input.kinds[k]
      if (!x) continue
      if (typeof x.enabled === 'boolean') out.kinds[k].enabled = x.enabled
      if (Array.isArray(x.platforms)) out.kinds[k].platforms = PLATFORMS.filter((p) => x.platforms.includes(p))
    }
  if (input.times) {
    const t = input.times
    out.times = {
      draft: time(t.draft, c.times.draft),
      programme: time(t.programme, c.times.programme),
      topic: time(t.topic, c.times.topic),
      storyBefore: int(t.storyBefore ?? c.times.storyBefore, 60, 5, 240),
      resultsAfter: int(t.resultsAfter ?? c.times.resultsAfter, 30, 0, 240),
    }
  }
  if (input.matches !== undefined) out.matches = int(input.matches, 5, 1, 10)
  if (input.weights && typeof input.weights === 'object') {
    out.weights = {}
    for (const [k, v] of Object.entries(input.weights)) if (/^[a-z0-9-]{1,40}$/.test(k) && v !== null && String(v) !== '' && Number.isFinite(Number(v))) out.weights[k] = int(v, 0, 0, 500)
  }
  if (Array.isArray(input.favorites)) out.favorites = input.favorites.map((f) => str(f, 80)).filter(Boolean).slice(0, 40)
  if (input.topics) for (const [d, t] of Object.entries(input.topics)) if (/^[0-6]$/.test(d) && (t === 'none' || isTopic(t))) out.topics[d] = t
  if (typeof input.topicLeague === 'string') out.topicLeague = str(input.topicLeague, 40)
  if (typeof input.hashtags === 'string') out.hashtags = str(input.hashtags, 300)
  return out
}

async function act(b: Body): Promise<{ message?: string; data?: unknown }> {
  switch (b.action) {
    case 'config': {
      const c = socialConfig()
      const next = merged((b.config ?? {}) as Partial<SocialConfig>, c)
      // Switched on for the first time: the posts wait for approval the first two weeks
      if (next.enabled && !c.enabled && !next.approval.until && !next.approval.always) {
        const d = new Date(Date.now() + 13 * 86_400_000)
        next.approval.until = d.toISOString().slice(0, 10)
      }
      saveConfig(next)
      return { message: 'Gemt' }
    }
    case 'meta': {
      const r = await connectMeta({ appId: str(b.appId, 40), appSecret: str(b.appSecret, 100), userToken: str(b.userToken, 1000), pageId: str(b.pageId, 40) || undefined })
      if ('choose' in r) return { message: 'Vælg siden', data: r }
      return { message: `Forbundet til ${r.page}${r.instagram ? ` og @${r.instagram}` : ' (ingen Instagram-konto koblet til siden)'}` }
    }
    case 'metaManual': {
      saveSecrets((s) => {
        s.meta = { ...s.meta, pageId: str(b.pageId, 40) || s.meta.pageId, pageToken: str(b.pageToken, 1000) || s.meta.pageToken, igUserId: str(b.igUserId, 40) || s.meta.igUserId }
      })
      return { message: 'Gemt' }
    }
    case 'make': {
      // The scenario's webhook: https://hook.<region>.make.com/<key>
      const url = str(b.url, 300)
      if (url && !/^https:\/\/hook\.[a-z0-9]+\.make\.com\/[A-Za-z0-9_-]+$/.test(url)) throw new Error('Det ligner ikke en Make-webhook (https://hook.eu1.make.com/…)')
      saveSecrets((s) => {
        s.make = url ? { url } : {}
      })
      return { message: url ? 'Make-webhooken er gemt' : 'Make-forbindelsen er fjernet' }
    }
    case 'threads': {
      const r = await connectThreads(str(b.token, 1000))
      return { message: `Forbundet til @${r.username}` }
    }
    case 'x': {
      const r = await connectX({ apiKey: str(b.apiKey, 100), apiSecret: str(b.apiSecret, 100), accessToken: str(b.accessToken, 200), accessSecret: str(b.accessSecret, 100) })
      return { message: `Forbundet til @${r.username}` }
    }
    case 'disconnect': {
      if (!isPlatform(b.platform)) throw new Error('Ukendt platform')
      saveSecrets((s) => {
        if (b.platform === 'facebook') {
          s.meta = {}
          s.make = {}
        } else if (b.platform === 'instagram') s.meta = {}
        else if (b.platform === 'threads') s.threads = {}
        else s.x = {}
      })
      return { message: 'Forbindelsen er fjernet' }
    }
    case 'smtp':
      saveSecrets((s) => {
        s.smtp.pass = str(b.pass, 300) || undefined
      })
      return { message: 'Adgangskoden er gemt' }
    case 'test':
      if (!isPlatform(b.platform)) throw new Error('Ukendt platform')
      return { message: await testPlatform(b.platform) }
    case 'testMail':
      const sent = await sendMail('Matchly: testmail', '<p>Mailen virker. Godkendelser af opslag kommer herfra.</p>', 'Mailen virker. Godkendelser af opslag kommer herfra.')
      return { message: `Sendt til ${sent.to} fra ${sent.from}${sent.rejected.length ? ` · afvist: ${sent.rejected.join(', ')}` : ''}${sent.response ? ` · serveren svarede: ${sent.response}` : ''}` }
    case 'approve':
      approve(ids(b.ids))
      return { message: 'Godkendt' }
    case 'skip':
      skip(ids(b.ids))
      return { message: 'Sprunget over' }
    case 'unskip':
      unskip(str(b.id, 80))
      return { message: 'Med igen' }
    case 'caption':
      setCaption(str(b.id, 80), typeof b.caption === 'string' ? b.caption : '')
      return { message: 'Teksten er gemt' }
    case 'render': {
      const r = await renderOne(str(b.id, 80))
      if (r === 'error') throw new Error('Billederne kunne ikke laves – se loggen')
      return { message: r === 'empty' ? 'Ingen data at lave kort af' : 'Billederne er lavet' }
    }
    case 'publish': {
      const id = str(b.id, 80)
      await publishOne(id, b.again === true)
      const p = findPost(id)
      return { message: p ? STATUS_NAMES[p.status] : 'Postet' }
    }
    case 'plan': {
      const date = str(b.date, 10)
      if (!isValidIsoDate(date)) throw new Error('Ugyldig dato')
      planDay(date, Date.now(), true)
      return { message: 'Dagen er planlagt igen' }
    }
    case 'manual': {
      const date = str(b.date, 10)
      if (!isValidIsoDate(date)) throw new Error('Ugyldig dato')
      const c = socialConfig()
      const list = ids(b.ids)
      const manual = { ...c.manual }
      if (list.length) manual[date] = list
      else delete manual[date]
      saveConfig({ ...c, manual })
      planDay(date, Date.now(), true)
      return { message: list.length ? 'Kampene er valgt, og dagen er planlagt igen' : 'Automatisk valg igen' }
    }
    case 'handles': {
      const name = str(b.name, 80)
      if (!name) throw new Error('Navnet mangler')
      const h = (b.handles ?? {}) as Record<string, unknown>
      const bad = PLATFORMS.filter((p) => typeof h[p] === 'string' && (h[p] as string).trim() && !cleanHandle(p, h[p]))
      if (bad.length) throw new Error(`Ugyldigt navn på ${bad.join(', ')}`)
      saveHandles(name, Object.fromEntries(PLATFORMS.map((p) => [p, h[p]])) as Handles)
      return { message: 'Gemt' }
    }
    case 'own': {
      // An own post: text, pictures (data URLs), platforms and a time ("YYYY-MM-DDTHH:MM", Danish time) or now
      const images = Array.isArray(b.images) ? b.images.filter((x): x is string => typeof x === 'string').slice(0, 10) : []
      const platforms = Array.isArray(b.platforms) ? b.platforms.filter(isPlatform) : []
      const when = str(b.at, 16)
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(when)
      const at = m ? danishTime(m[1], m[2]).getTime() : NaN
      if (!b.now && !m) throw new Error('Vælg dato og klokkeslæt')
      // A template made at the post's time: { kind, topic, league, appendList }
      const t = (b.template ?? undefined) as Record<string, unknown> | undefined
      const tKind = t && KINDS.find((k) => k === t.kind && k !== 'story')
      const template = tKind
        ? { kind: tKind, topic: isTopic(t!.topic) ? t!.topic : undefined, league: str(t!.league, 100) || undefined, focus: str(t!.focus, 100) || undefined, women: t!.women === true, appendList: t!.appendList === true, date: isValidIsoDate(str(t!.date, 10)) ? str(t!.date, 10) : undefined }
        : undefined
      const post = await createOwnPost({ text: str(b.text, 5000), link: str(b.link, 500), images, storyImage: str(b.storyImage, 200), platforms, story: b.story === true, at, now: b.now === true, template })
      return { message: b.now ? (post ? STATUS_NAMES[post.status] : 'Udgivet') : 'Opslaget er planlagt', data: { id: post?.id } }
    }
    case 'ownTemplate': {
      // A template's cards and text as the start of an own post
      const kind = KINDS.find((k) => k === b.kind)
      if (!kind || kind === 'story') throw new Error('Vælg en skabelon')
      const date = str(b.date, 10)
      if (!isValidIsoDate(date)) throw new Error('Ugyldig dato')
      const r = await ownTemplate({ kind, topic: isTopic(b.topic) ? b.topic : undefined, league: str(b.league, 100), focus: str(b.focus, 100) || undefined, women: b.women === true, date })
      return { message: `${r.title}: ${r.images.length} billeder`, data: r }
    }
    case 'shareArticle': {
      const post = await shareArticle(int(b.id, 0, 0, 1e9))
      return { message: post ? `${STATUS_NAMES[post.status]}: ${Object.values(post.results).map((r) => (r.status === 'error' ? `fejl – ${r.error}` : r.status === 'dry' ? 'tør-kørt' : 'sendt')).join(', ')}` : 'Delt' }
    }
    case 'focusMatches': {
      // The matches to pick a focus match from (the day and the next three)
      const date = str(b.date, 10)
      if (!isValidIsoDate(date)) throw new Error('Ugyldig dato')
      return { data: focusCandidates(date, Date.now(), str(b.q, 80)) }
    }
    case 'ownDelete':
      deleteOwnPost(str(b.id, 80))
      return { message: 'Opslaget er slettet' }
    case 'tick':
      await socialTick()
      return { message: 'Motoren har kørt en runde' }
  }
  throw new Error('Ukendt handling')
}

export async function POST(request: Request) {
  const denied = await adminDenied(request)
  if (denied) return Response.json({ error: denied }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Body
  try {
    return Response.json({ ok: true, ...(await act(body)) })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
