import { isAdmin, sameOrigin } from '../../../../lib/admin'
import { photoConfig } from '../../../../lib/photos/config'
import { withPhotoDb } from '../../../../lib/photos/server'
import { addSquadRow, addTag, deleteSquadRow, deleteTag, setApproved, setMatch, setRights, updateClub, updateTag, type TagInput } from '../../../../lib/photos/store'

// Changes from the photo admin: JSON { action, … }.
//   approve { photo, approved }         add-tag { photo, number, name?, side? }
//   update-tag { tag, number?, name?, side? }   delete-tag { tag }
//   set-match { photo, clubId?, date?, opponentId? }
//   add-squad { club, number, name, validFrom?, validTo? }   delete-squad { id }
//   update-club { club, extraColors?, aliases? }
//   set-rights { photo, credit?, licenseUntil?, wholeMatch? }

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
  const result = withPhotoDb((db): { error?: string; name?: string | null; note?: string | null; count?: number } => {
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
      default:
        return { error: 'Ukendt handling' }
    }
  })
  return Response.json(result.error ? result : { ok: true, ...result }, { status: result.error ? 400 : 200 })
}
