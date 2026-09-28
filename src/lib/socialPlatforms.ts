import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SITE_URL } from './site'
import { imageDir, saveSecrets, socialSecrets, type Metrics, type Platform, type SocialSecrets, type Surface } from './socialStore'

// Posting to Facebook (a Page), Instagram (a Business/Creator account linked to
// the Page), Threads and X through their official APIs, with the keys typed in
// on /admin/sociale/indstillinger. Instagram and Threads fetch the pictures
// themselves from our address (/sociale-billeder/<file>), so SITE_URL must be
// the public https address.

const GRAPH = 'https://graph.facebook.com/v23.0'
const THREADS = 'https://graph.threads.net/v1.0'
const X_API = 'https://api.x.com'

export const imageUrl = (file: string) => `${SITE_URL}/sociale-billeder/${file}`

class ApiError extends Error {}

async function call<T>(url: string, init?: RequestInit, timeout = 60_000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout), cache: 'no-store' })
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = undefined
  }
  if (!res.ok) {
    const e = body as { error?: { message?: string; error_user_msg?: string }; detail?: string; title?: string; errors?: { message?: string }[] } | undefined
    const msg = e?.error?.error_user_msg || e?.error?.message || e?.detail || e?.errors?.[0]?.message || e?.title || text.slice(0, 200) || res.statusText
    throw new ApiError(`${res.status}: ${msg}`)
  }
  return (body ?? {}) as T
}

const form = (params: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v))
  return p
}
const get = <T>(base: string, params: Record<string, string | undefined>) => call<T>(`${base}?${form(params)}`)
const post = <T>(url: string, params: Record<string, string | number | boolean | undefined>) => call<T>(url, { method: 'POST', body: form(params) })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- captions

/** The post's text as each platform takes it: the link, "link i profilen" on Instagram, hashtags and X's 280 characters */
export function platformCaption(platform: Platform, caption: string, link: string, hashtags: string): string {
  const tags = hashtags.trim()
  switch (platform) {
    case 'instagram':
      return [caption, 'Alle kampe, tabeller og tal: link i profilen.', tags].filter(Boolean).join('\n\n').slice(0, 2200)
    case 'facebook':
      return [caption, link, tags].filter(Boolean).join('\n\n')
    case 'threads': {
      const end = `\n\n${link}`
      return caption.length + end.length <= 500 ? caption + end : `${cut(caption, 500 - end.length)}${end}`
    }
    case 'x': {
      // A link always counts as 23 characters on X
      const room = 280 - 2 - 23
      return `${caption.length <= room ? caption : cut(caption, room)}\n\n${link}`
    }
  }
}

/** A text shortened to whole lines (or words) with "…" */
function cut(text: string, max: number) {
  if (text.length <= max) return text
  const lines = text.split('\n')
  let out = ''
  for (const l of lines) {
    if ((out ? out.length + 1 : 0) + l.length > max - 1) break
    out = out ? `${out}\n${l}` : l
  }
  if (!out) out = text.slice(0, max - 1).replace(/\s+\S*$/, '')
  return `${out}…`
}

// ---------------------------------------------------------------- Facebook

async function facebook(s: SocialSecrets, surface: Surface, files: string[], caption: string) {
  const { pageId, pageToken } = s.meta
  if (!pageId || !pageToken) throw new ApiError('Facebook-siden er ikke forbundet')
  const photo = (file: string, published: boolean, message?: string) =>
    post<{ id: string; post_id?: string }>(`${GRAPH}/${pageId}/photos`, { url: imageUrl(file), published, message, access_token: pageToken })
  if (surface === 'story') {
    const { id } = await photo(files[0], false)
    const r = await post<{ post_id?: string; success?: boolean }>(`${GRAPH}/${pageId}/photo_stories`, { photo_id: id, access_token: pageToken })
    return { id: r.post_id ?? id, url: `https://www.facebook.com/${pageId}` }
  }
  let postId: string
  if (files.length === 1) {
    const r = await photo(files[0], true, caption)
    postId = r.post_id ?? r.id
  } else {
    const ids: string[] = []
    for (const f of files) ids.push((await photo(f, false)).id)
    const r = await post<{ id: string }>(`${GRAPH}/${pageId}/feed`, {
      message: caption,
      attached_media: JSON.stringify(ids.map((media_fbid) => ({ media_fbid }))),
      access_token: pageToken,
    })
    postId = r.id
  }
  const link = await get<{ permalink_url?: string }>(`${GRAPH}/${postId}`, { fields: 'permalink_url', access_token: pageToken }).catch(() => undefined)
  return { id: postId, url: link?.permalink_url }
}

// ---------------------------------------------------------------- Instagram

async function instagram(s: SocialSecrets, surface: Surface, files: string[], caption: string) {
  const { igUserId, pageToken } = s.meta
  if (!igUserId || !pageToken) throw new ApiError('Instagram-kontoen er ikke forbundet')
  const container = (params: Record<string, string | boolean | undefined>) => post<{ id: string }>(`${GRAPH}/${igUserId}/media`, { ...params, access_token: pageToken })
  const ready = async (id: string) => {
    for (let i = 0; i < 30; i++) {
      const st = await get<{ status_code?: string }>(`${GRAPH}/${id}`, { fields: 'status_code', access_token: pageToken })
      if (st.status_code === 'FINISHED' || !st.status_code) return
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new ApiError(`Instagram kunne ikke hente billedet (${st.status_code})`)
      await sleep(2000)
    }
    throw new ApiError('Instagram blev ikke færdig med billedet')
  }
  let creation: string
  if (surface === 'story') creation = (await container({ image_url: imageUrl(files[0]), media_type: 'STORIES' })).id
  else if (files.length === 1) creation = (await container({ image_url: imageUrl(files[0]), caption })).id
  else {
    const children: string[] = []
    for (const f of files.slice(0, 10)) children.push((await container({ image_url: imageUrl(f), is_carousel_item: true })).id)
    for (const c of children) await ready(c)
    creation = (await container({ media_type: 'CAROUSEL', children: children.join(','), caption })).id
  }
  await ready(creation)
  const { id } = await post<{ id: string }>(`${GRAPH}/${igUserId}/media_publish`, { creation_id: creation, access_token: pageToken })
  const link = await get<{ permalink?: string }>(`${GRAPH}/${id}`, { fields: 'permalink', access_token: pageToken }).catch(() => undefined)
  return { id, url: link?.permalink }
}

// ---------------------------------------------------------------- Threads

async function threads(s: SocialSecrets, files: string[], caption: string) {
  const { userId, token } = s.threads
  if (!userId || !token) throw new ApiError('Threads er ikke forbundet')
  const container = (params: Record<string, string | boolean | undefined>) => post<{ id: string }>(`${THREADS}/${userId}/threads`, { ...params, access_token: token })
  const ready = async (id: string) => {
    for (let i = 0; i < 30; i++) {
      const st = await get<{ status?: string; error_message?: string }>(`${THREADS}/${id}`, { fields: 'status,error_message', access_token: token })
      if (st.status === 'FINISHED' || !st.status) return
      if (st.status === 'ERROR' || st.status === 'EXPIRED') throw new ApiError(`Threads: ${st.error_message ?? st.status}`)
      await sleep(2000)
    }
    throw new ApiError('Threads blev ikke færdig med billedet')
  }
  let creation: string
  if (files.length === 1) creation = (await container({ media_type: 'IMAGE', image_url: imageUrl(files[0]), text: caption })).id
  else {
    const children: string[] = []
    for (const f of files.slice(0, 20)) children.push((await container({ media_type: 'IMAGE', image_url: imageUrl(f), is_carousel_item: true })).id)
    for (const c of children) await ready(c)
    creation = (await container({ media_type: 'CAROUSEL', children: children.join(','), text: caption })).id
  }
  await ready(creation)
  const { id } = await post<{ id: string }>(`${THREADS}/${userId}/threads_publish`, { creation_id: creation, access_token: token })
  const link = await get<{ permalink?: string }>(`${THREADS}/${id}`, { fields: 'permalink', access_token: token }).catch(() => undefined)
  return { id, url: link?.permalink }
}

// ---------------------------------------------------------------- X (OAuth 1.0a, the account's own keys)

const enc = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** The OAuth 1.0a header for a request (form fields in `params` are signed too; JSON and multipart bodies are not) */
function oauth(s: SocialSecrets, method: string, url: string, params: Record<string, string> = {}) {
  const { apiKey, apiSecret, accessToken, accessSecret } = s.x
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) throw new ApiError('X er ikke forbundet')
  const u = new URL(url)
  const o: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }
  const all = [...Object.entries(o), ...Object.entries(params), ...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(all.map(([k, v]) => `${k}=${v}`).join('&'))].join('&')
  o.oauth_signature = createHmac('sha1', `${enc(apiSecret)}&${enc(accessSecret)}`).update(base).digest('base64')
  return `OAuth ${Object.entries(o)
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
    .join(', ')}`
}

async function xUpload(s: SocialSecrets, file: string): Promise<string> {
  const bytes = readFileSync(path.join(/*turbopackIgnore: true*/ imageDir(), file))
  const body = () => {
    const f = new FormData()
    f.set('media', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), file)
    f.set('media_category', 'tweet_image')
    return f
  }
  try {
    const url = `${X_API}/2/media/upload`
    const r = await call<{ data?: { id?: string }; id?: string }>(url, { method: 'POST', headers: { authorization: oauth(s, 'POST', url) }, body: body() })
    const id = r.data?.id ?? r.id
    if (id) return id
    throw new ApiError('X gav intet billed-id')
  } catch (e) {
    // The older upload address, for accounts the new one doesn't take yet
    const url = 'https://upload.twitter.com/1.1/media/upload.json'
    const r = await call<{ media_id_string?: string }>(url, { method: 'POST', headers: { authorization: oauth(s, 'POST', url) }, body: body() }).catch(() => {
      throw e
    })
    if (!r.media_id_string) throw e
    return r.media_id_string
  }
}

async function x(s: SocialSecrets, files: string[], caption: string) {
  const media: string[] = []
  for (const f of files.slice(0, 4)) media.push(await xUpload(s, f))
  const url = `${X_API}/2/tweets`
  const r = await call<{ data: { id: string } }>(url, {
    method: 'POST',
    headers: { authorization: oauth(s, 'POST', url), 'content-type': 'application/json' },
    body: JSON.stringify({ text: caption, media: { media_ids: media } }),
  })
  return { id: r.data.id, url: `https://x.com/${s.x.username || 'i/web'}/status/${r.data.id}` }
}

// ---------------------------------------------------------------- posting

/** Posts the pictures with the text on one platform; stories only on Facebook and Instagram */
export async function publishTo(platform: Platform, surface: Surface, files: string[], caption: string): Promise<{ id: string; url?: string }> {
  const s = socialSecrets()
  if (!files.length) throw new ApiError('Ingen billeder')
  switch (platform) {
    case 'facebook':
      return facebook(s, surface, files, caption)
    case 'instagram':
      return instagram(s, surface, files, caption)
    case 'threads':
      return threads(s, files, caption)
    case 'x':
      return x(s, files, caption)
  }
}

// ---------------------------------------------------------------- numbers

const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

/** Insights as { name: value } (Meta and Threads send them in two shapes) */
function insights(data: { name: string; values?: { value: unknown }[]; total_value?: { value: unknown } }[] | undefined) {
  const out: Record<string, number> = {}
  for (const d of data ?? []) {
    const v = d.total_value?.value ?? d.values?.[0]?.value
    if (typeof v === 'number') out[d.name] = v
  }
  return out
}

/** Asks for a list of metrics, and for each one alone when the platform refuses the list (not every metric exists for every post) */
async function metricsOf(url: string, metrics: string[], token: string) {
  type R = { data?: { name: string; values?: { value: unknown }[]; total_value?: { value: unknown } }[] }
  try {
    return insights((await get<R>(url, { metric: metrics.join(','), access_token: token })).data)
  } catch {
    const out: Record<string, number> = {}
    for (const m of metrics) {
      const r = await get<R>(url, { metric: m, access_token: token }).catch(() => undefined)
      Object.assign(out, insights(r?.data))
    }
    return out
  }
}

/** The post's numbers so far (what the platform gives; X only on a paid API plan) */
export async function fetchMetrics(platform: Platform, surface: Surface, id: string): Promise<Metrics | undefined> {
  const s = socialSecrets()
  switch (platform) {
    case 'facebook': {
      const token = s.meta.pageToken
      if (!token || surface === 'story') return undefined
      const base = await get<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>(
        `${GRAPH}/${id}`,
        { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares', access_token: token },
      )
      const i = await metricsOf(`${GRAPH}/${id}/insights`, ['post_media_view', 'post_total_media_view_unique', 'post_impressions', 'post_impressions_unique', 'post_clicks'], token)
      return {
        likes: base.reactions?.summary?.total_count,
        comments: base.comments?.summary?.total_count,
        shares: base.shares?.count ?? 0,
        views: i.post_media_view ?? i.post_impressions,
        reach: i.post_total_media_view_unique ?? i.post_impressions_unique,
        clicks: i.post_clicks,
      }
    }
    case 'instagram': {
      const token = s.meta.pageToken
      if (!token) return undefined
      const i = await metricsOf(`${GRAPH}/${id}/insights`, surface === 'story' ? ['views', 'reach', 'replies', 'shares'] : ['views', 'reach', 'likes', 'comments', 'shares', 'saved'], token)
      if (surface !== 'story' && i.likes === undefined) {
        const b = await get<{ like_count?: number; comments_count?: number }>(`${GRAPH}/${id}`, { fields: 'like_count,comments_count', access_token: token }).catch(() => undefined)
        i.likes = b?.like_count ?? 0
        i.comments ??= b?.comments_count ?? 0
      }
      return { views: i.views, reach: i.reach, likes: i.likes, comments: i.comments ?? i.replies, shares: i.shares, saves: i.saved }
    }
    case 'threads': {
      const token = s.threads.token
      if (!token) return undefined
      const i = await metricsOf(`${THREADS}/${id}/insights`, ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'], token)
      return { views: i.views, likes: i.likes, comments: i.replies, shares: (i.reposts ?? 0) + (i.quotes ?? 0) + (i.shares ?? 0) }
    }
    case 'x': {
      const url = `${X_API}/2/tweets/${id}?tweet.fields=public_metrics`
      const r = await call<{ data?: { public_metrics?: Record<string, number> } }>(url, { headers: { authorization: oauth(s, 'GET', url) } })
      const m = r.data?.public_metrics
      if (!m) return undefined
      return { views: num(m.impression_count), likes: num(m.like_count), comments: num(m.reply_count), shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0), saves: num(m.bookmark_count) }
    }
  }
}

// ---------------------------------------------------------------- connecting

/**
 * Facebook and Instagram in one go: the app's id and secret and a short-lived
 * user token (from Graph API Explorer) become a long-lived token, and the
 * Page's token (which never expires) and its linked Instagram account are
 * saved. With more than one Page, `pageId` picks it.
 */
export async function connectMeta(input: { appId: string; appSecret: string; userToken: string; pageId?: string }) {
  const long = await get<{ access_token: string }>(`${GRAPH}/oauth/access_token`, {
    grant_type: 'fb_exchange_token',
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: input.userToken,
  })
  const pages = await get<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(`${GRAPH}/me/accounts`, {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: long.access_token,
  })
  const list = pages.data ?? []
  if (!list.length) throw new ApiError('Tokenet giver ikke adgang til nogen Facebook-side (husk rettigheden pages_show_list og at vælge siden)')
  const page = input.pageId ? list.find((p) => p.id === input.pageId) : list.length === 1 ? list[0] : undefined
  if (!page) return { choose: list.map((p) => ({ id: p.id, name: p.name })) }
  saveSecrets((s) => {
    s.meta = {
      appId: input.appId,
      appSecret: input.appSecret,
      pageId: page.id,
      pageName: page.name,
      pageToken: page.access_token,
      igUserId: page.instagram_business_account?.id,
      igUsername: page.instagram_business_account?.username,
    }
  })
  return { page: page.name, instagram: page.instagram_business_account?.username }
}

/** Threads: the long-lived token (from the Threads app's token generator) and the account it belongs to */
export async function connectThreads(token: string) {
  const me = await get<{ id: string; username?: string }>(`${THREADS}/me`, { fields: 'id,username', access_token: token })
  saveSecrets((s) => {
    s.threads = { userId: me.id, username: me.username, token, refreshedAt: Date.now() }
  })
  return { username: me.username }
}

/** Threads' long-lived tokens last 60 days: renewed when a week old */
export async function refreshThreadsToken() {
  const s = socialSecrets()
  if (!s.threads.token || Date.now() - (s.threads.refreshedAt ?? 0) < 7 * 86_400_000) return false
  const r = await get<{ access_token: string }>(`${THREADS.replace('/v1.0', '')}/refresh_access_token`, { grant_type: 'th_refresh_token', access_token: s.threads.token })
  saveSecrets((x) => {
    x.threads.token = r.access_token
    x.threads.refreshedAt = Date.now()
  })
  return true
}

/** X: the app's API key and secret and the account's access token and secret (with read and write rights) */
export async function connectX(keys: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }) {
  const s: SocialSecrets = { ...socialSecrets(), x: keys }
  const url = `${X_API}/2/users/me`
  const r = await call<{ data?: { username?: string } }>(url, { headers: { authorization: oauth(s, 'GET', url) } })
  saveSecrets((x) => {
    x.x = { ...keys, username: r.data?.username }
  })
  return { username: r.data?.username }
}

/** Checks that a platform's keys still work */
export async function testPlatform(platform: Platform): Promise<string> {
  const s = socialSecrets()
  switch (platform) {
    case 'facebook': {
      if (!s.meta.pageToken) throw new ApiError('Ikke forbundet')
      const r = await get<{ name: string }>(`${GRAPH}/${s.meta.pageId}`, { fields: 'name', access_token: s.meta.pageToken })
      return `Forbundet til siden ${r.name}`
    }
    case 'instagram': {
      if (!s.meta.pageToken || !s.meta.igUserId) throw new ApiError('Ikke forbundet (Instagram-kontoen skal være koblet til Facebook-siden)')
      const r = await get<{ username: string }>(`${GRAPH}/${s.meta.igUserId}`, { fields: 'username', access_token: s.meta.pageToken })
      return `Forbundet til @${r.username}`
    }
    case 'threads': {
      if (!s.threads.token) throw new ApiError('Ikke forbundet')
      const r = await get<{ username: string }>(`${THREADS}/me`, { fields: 'username', access_token: s.threads.token })
      return `Forbundet til @${r.username}`
    }
    case 'x': {
      const url = `${X_API}/2/users/me`
      const r = await call<{ data?: { username?: string } }>(url, { headers: { authorization: oauth(s, 'GET', url) } })
      return `Forbundet til @${r.data?.username}`
    }
  }
}

/** Whether a platform has its keys */
export function connected(platform: Platform, s = socialSecrets()): boolean {
  switch (platform) {
    case 'facebook':
      return !!(s.meta.pageId && s.meta.pageToken)
    case 'instagram':
      return !!(s.meta.igUserId && s.meta.pageToken)
    case 'threads':
      return !!(s.threads.userId && s.threads.token)
    case 'x':
      return !!(s.x.apiKey && s.x.apiSecret && s.x.accessToken && s.x.accessSecret)
  }
}
