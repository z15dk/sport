import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { photoConfig } from '../../../../lib/photos/config'
import { deletePhotos, publishForArticle, requestSync, withPhotoDb } from '../../../../lib/photos/server'
import { addSquadRow, addTag, clubList, createShare, filterOptions, pickerPhotos, setArticleMetadata, setInfo, deleteSquadRow, deleteTag, revokeShare, setApproved, setMatch, setRights, updateClub, updateTag, type TagInput } from '../../../../lib/photos/store'

// Changes from the photo admin: JSON { action, … }.
//   approve { photo, approved }         add-tag { photo, number, name?, side? }
//   update-tag { tag, number?, name?, side? }   delete-tag { tag }
//   set-match { photo, clubId?, date?, opponentId? }
//   add-squad { club, number, name, validFrom?, validTo? }   delete-squad { id }
//   update-club { club, extraColors?, aliases? }
//   set-rights { photo, credit?, licenseUntil?, wholeMatch? }
//   sync {}                               (run the job now)
//   bulk { ids, op: approve|unapprove|rights|match|delete, credit?, licenseUntil?, clubId?, date?, opponentId? }
//   share { ids, days, title }   revoke-share { id }
//   set-info { photo, kind?, title?, tags? }   bulk op 'info' { kind?, addTags? }
//   article-metadata { photo, credit?, licenseUntil?, clubId?, opponentId?, date? }   publish { photo } (copy for an article)
// GET ?q=&klub=&modstander=&situation=&spiller=&status= – the editor's archive picker

type Body = Record<string, unknown>

const num = (v: unknown) => (v === '' || v == null ? null : Number(v))
const tagInput = (b: Body): TagInput => ({
  number: 'number' in b ? num(b.number) : undefined,
  name: 'name' in b ? String(b.name ?? '') : undefined,
  side: b.side ? (String(b.side) as TagInput['side']) : undefined,
})
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : undefined)

export async function POST(request: Request) {
  if (!(await isAdmin()) || !sameOrigin(request)) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as Body
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500) : []
  if (b.action === 'bulk' && b.op === 'delete') {
    if (!ids.length) return Response.json({ error: 'Vælg billeder først' }, { status: 400 })
    const r = await deletePhotos(ids)
    return Response.json(r.errors.length ? { error: `${r.deleted} slettet, ${r.errors.length} fejl: ${r.errors.slice(0, 3).join(' | ')}`, count: r.deleted } : { ok: true, count: r.deleted }, { status: r.errors.length ? 502 : 200 })
  }
  if (b.action === 'publish') {
    const r = await publishForArticle(Number(b.photo))
    return Response.json(r.error ? r : { ok: true, ...r }, { status: r.error ? 400 : 200 })
  }
  if (b.action === 'sync') {
    const r = requestSync()
    return Response.json(r.started ? { ok: true } : { error: r.reason }, { status: r.started ? 200 : 409 })
  }
  const result = withPhotoDb((db): { error?: string; name?: string | null; note?: string | null; count?: number; token?: string; skipped?: number; expires?: string } => {
    switch (b.action) {
      case 'approve':
        return setApproved(db, Number(b.photo), b.approved !== false)
      case 'add-tag':
        return addTag(db, Number(b.photo), tagInput(b))
      case 'update-tag':
        return updateTag(db, Number(b.tag), tagInput(b))
      case 'delete-tag':
        return deleteTag(db, Number(b.tag))
      case 'set-match':
        return setMatch(db, Number(b.photo), { clubId: b.clubId ? String(b.clubId) : undefined, date: b.date ? String(b.date) : undefined, opponentId: b.opponentId ? String(b.opponentId) : undefined }, photoConfig().minConfidence)
      case 'add-squad':
        return addSquadRow(db, String(b.club), { number: Number(b.number), name: String(b.name ?? ''), validFrom: b.validFrom ? String(b.validFrom) : undefined, validTo: b.validTo ? String(b.validTo) : undefined })
      case 'delete-squad':
        return deleteSquadRow(db, Number(b.id))
      case 'update-club':
        return updateClub(db, String(b.club), { extraColors: list(b.extraColors), aliases: list(b.aliases) })
      case 'set-rights':
        return setRights(db, Number(b.photo), { credit: String(b.credit ?? ''), licenseUntil: String(b.licenseUntil ?? ''), wholeMatch: b.wholeMatch === true })
      case 'bulk': {
        if (!ids.length) return { error: 'Vælg billeder først' }
        const minConf = photoConfig().minConfidence
        let count = 0
        for (const id of ids) {
          const r =
            b.op === 'approve' ? setApproved(db, id, true)
            : b.op === 'unapprove' ? setApproved(db, id, false)
            : b.op === 'rights' ? setRights(db, id, { credit: String(b.credit ?? ''), licenseUntil: String(b.licenseUntil ?? '') })
            : b.op === 'info' ? (() => {
                // Type for all, and tags added to each picture's own
                const cur = db.prepare('SELECT user_tags FROM photos WHERE id = ?').get(id)
                const tags = b.addTags ? [...JSON.parse(String(cur?.user_tags ?? '[]')), ...(Array.isArray(b.addTags) ? b.addTags : String(b.addTags).split(','))] : undefined
                return setInfo(db, id, { kind: b.kind ? String(b.kind) : undefined, tags }, minConf)
              })()
            : b.op === 'match' ? setMatch(db, id, { clubId: b.clubId ? String(b.clubId) : undefined, date: b.date ? String(b.date) : undefined, opponentId: b.opponentId ? String(b.opponentId) : undefined }, minConf)
            : { error: 'Ukendt handling' }
          if (r.error && b.op !== 'approve') return { error: r.error, count }
          if (!r.error) count++
        }
        return { count }
      }
      case 'share':
        return createShare(db, ids, Number(b.days ?? 30), String(b.title ?? ''))
      case 'article-metadata':
        return setArticleMetadata(db, Number(b.photo), { credit: String(b.credit ?? ''), licenseUntil: String(b.licenseUntil ?? ''), clubId: b.clubId ? String(b.clubId) : undefined, opponentId: b.opponentId ? String(b.opponentId) : undefined, date: b.date ? String(b.date) : undefined, kind: b.kind ? String(b.kind) : undefined, title: b.title !== undefined ? String(b.title) : undefined, tags: b.tags }, photoConfig().minConfidence)
      case 'set-info':
        return setInfo(db, Number(b.photo), { kind: b.kind ? String(b.kind) : undefined, title: b.title !== undefined ? String(b.title) : undefined, tags: b.tags }, photoConfig().minConfidence)
      case 'revoke-share':
        return revokeShare(db, Number(b.id))
      default:
        return { error: 'Ukendt handling' }
    }
  })
  return Response.json(result.error ? result : { ok: true, ...result }, { status: result.error ? 400 : 200 })
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'Ikke logget ind' }, { status: 401 })
  const q = new URL(request.url).searchParams
  const get = (k: string) => q.get(k) ?? ''
  const cfg = photoConfig()
  return Response.json(
    withPhotoDb((db) => ({
      photos: pickerPhotos(db, get('q'), { clubId: get('klub'), opponentId: get('modstander'), situation: get('situation'), player: get('spiller'), from: get('fra'), to: get('til'), status: get('status'), kind: get('type'), tag: get('tag') }, cfg.defaultCredit),
      options: filterOptions(db, get('klub') || undefined),
      clubs: clubList(db).map((c) => ({ id: c.id, name: c.name })),
      defaultCredit: cfg.defaultCredit,
    })),
    { headers: { 'cache-control': 'private, no-store' } },
  )
}
