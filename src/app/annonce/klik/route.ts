import { noteAdClick } from '../../../lib/adStats'
import { SITE_URL } from '../../../lib/site'

// A click on the full-page ad: counted per site and campaign (/admin/annonce), then
// the visitor is sent on to the page on Matchly (?til=/kamp/… – only our own paths),
// with the campaign in the address, so the visit statistics see where they came from.

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get('til') ?? '/'
  // Our own paths only: no other host, no protocol-relative address, no backslash (a browser reads "/\\x" as "//x")
  const path = /^\/(?![/\\])[^\s\\]*$/.test(raw) ? raw : '/'
  const campaign = url.searchParams.get('kampagne') ?? ''
  const preview = url.searchParams.get('id') === 'preview'
  noteAdClick({ page: url.searchParams.get('side'), referer: request.headers.get('referer'), campaign, ua: request.headers.get('user-agent'), preview, target: path.split('?')[0] })
  let to = new URL(path, SITE_URL)
  // Checked once more after parsing: the result must still be on our own site
  if (to.origin !== new URL(SITE_URL).origin) to = new URL('/', SITE_URL)
  if (!preview) {
    to.searchParams.set('utm_source', 'annonce')
    to.searchParams.set('utm_medium', 'helside')
    if (campaign) to.searchParams.set('utm_campaign', campaign)
  }
  return Response.redirect(to.toString(), 302)
}
