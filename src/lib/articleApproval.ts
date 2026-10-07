import 'server-only'
import { createHmac } from 'node:crypto'
import { articleById, saveArticle, type Article } from './articles'
import { sendMail } from './mail'
import { SITE_URL } from './site'
import { socialSecrets } from './socialStore'
import { TZ, danishTime } from './time'

// Approving an article from the phone: a mail lists the drafts, each with a signed link to
// /admin/artikler/godkend/<id>, where the article can be read and published now or at 07.00
// the next morning. The link's signature is the access (as with the social posts' approval
// mails), so it works without logging in – but only for that article, and only while it is a draft.

export const articleApprovalToken = (id: number) =>
  createHmac('sha256', socialSecrets().approvalKey).update(`article:${id}`).digest('base64url').slice(0, 32)

export function validArticleApproval(id: number, token: string | undefined) {
  const want = articleApprovalToken(id)
  return !!token && token.length === want.length && token === want
}

export const articleApprovalLink = (id: number) => `${SITE_URL}/admin/artikler/godkend/${id}?t=${articleApprovalToken(id)}`

/** Several drafts at once ("Udgiv alle"): one signature over the list */
export const articlesApprovalToken = (ids: number[]) =>
  createHmac('sha256', socialSecrets().approvalKey).update(`articles:${ids.join(',')}`).digest('base64url').slice(0, 32)

export function validArticlesApproval(ids: number[], token: string | undefined) {
  const want = articlesApprovalToken(ids)
  return ids.length > 0 && !!token && token.length === want.length && token === want
}

export const articlesApprovalLink = (ids: number[]) => `${SITE_URL}/admin/artikler/godkend/alle?ids=${ids.join(',')}&t=${articlesApprovalToken(ids)}`

/** "1,2,3" → [1, 2, 3] (whole numbers only) */
export const parseIds = (s: string | undefined) => (s ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 30)

const danishDay = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(ms))

/** The next 07.00 in Denmark (today's while it is more than five minutes away, else tomorrow's) */
export function nextMorning(now = Date.now()): Date {
  const today = danishTime(danishDay(now), '07:00')
  return today.getTime() > now + 5 * 60_000 ? today : danishTime(danishDay(now + 24 * 3600_000), '07:00')
}

/** Publishes a draft now or at the next 07.00 (a scheduled article goes live – and out on Facebook – at its time) */
export function publishDraft(id: number, when: 'now' | 'morning'): { article?: Article; error?: string } {
  const a = articleById(id)
  if (!a) return { error: 'Artiklen findes ikke' }
  if (a.status !== 'draft') return { error: 'Artiklen er allerede udgivet' }
  return saveArticle({ ...a, status: 'published', publishedAt: when === 'morning' ? nextMorning().toISOString() : new Date().toISOString() })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Mails the drafts with a "Læs og udgiv" link each (to the address on /admin/sociale/indstillinger) */
export async function sendArticleApprovalMail(ids: number[]) {
  const drafts = ids.map((id) => articleById(id)).filter((a): a is Article => !!a && a.status === 'draft')
  if (!drafts.length) throw new Error('Ingen kladder at sende')
  const n = drafts.length
  const items = drafts
    .map((a) => {
      const img = a.featuredImage ? `<img src="${esc(a.featuredImage.startsWith('/') ? SITE_URL + a.featuredImage : a.featuredImage)}" alt="" width="560" style="display:block;width:100%;max-width:560px;border-radius:10px;margin:0 0 10px">` : ''
      return `<div style="margin:0 0 28px">${img}<h3 style="margin:0 0 6px;font-size:18px">${esc(a.title)}</h3>${a.excerpt ? `<p style="margin:0 0 12px;color:#444">${esc(a.excerpt)}</p>` : ''}<a href="${articleApprovalLink(a.id)}" style="display:inline-block;background:#16181a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Læs og udgiv</a></div>`
    })
    .join('')
  const all =
    n > 1
      ? `<p style="margin:0 0 24px"><a href="${articlesApprovalLink(drafts.map((a) => a.id))}" style="display:inline-block;background:#c6f135;color:#16181a;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Se alle ${n} og udgiv dem samlet</a></p>`
      : ''
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
<h2 style="margin:0 0 16px">${n === 1 ? 'En artikel er klar' : `${n} artikler er klar`} til at blive udgivet</h2>
${all}${items}
<p style="color:#777;font-size:13px">Udgivne artikler deles automatisk på Facebook. Du kan også rette dem i admin: ${SITE_URL}/admin/artikler</p></div>`
  const text = `${n} artikler klar til udgivelse:\n\n${drafts.map((a) => `- ${a.title}\n  ${articleApprovalLink(a.id)}`).join('\n')}`
  return sendMail(`Matchly: ${n === 1 ? `"${drafts[0].title}" er klar` : `${n} artikler er klar`} til udgivelse`, html, text)
}
