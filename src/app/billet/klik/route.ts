import { findMatch } from '../../../data/matches'
import { findClub } from '../../../data/matchInsights'
import { seasonClubs } from '../../../data/season'
import { clubTicketUrl, matchTicketUrl, noteTicketClick, withPartnerCode } from '../../../lib/tickets'
import { SITE_URL, paths } from '../../../lib/site'

// A "Køb billetter" button (src/lib/tickets.ts): ?kamp=<match slug> or ?klub=<club id>. The click is
// counted and the visitor sent on to the ticket shop we have for it – never to an address from the
// query itself, so the route can't be used to send people anywhere else.

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const ua = request.headers.get('user-agent')
  const now = Date.now()
  const slug = q.get('kamp')
  if (slug) {
    const date = /(\d{4}-\d{2}-\d{2})$/.exec(slug)?.[1]
    const match = date ? findMatch(slug, date, now) : undefined
    const url = match && matchTicketUrl(match)
    if (match && url) {
      noteTicketClick(findClub(match.home.name)?.club.id ?? '', slug, ua)
      return Response.redirect(withPartnerCode(url), 302)
    }
    return Response.redirect(new URL(paths.match(slug), SITE_URL).toString(), 302)
  }
  const id = q.get('klub') ?? ''
  const club = seasonClubs().find((x) => x.club.id === id)?.club
  const url = club && clubTicketUrl(club.id)
  if (club && url) {
    noteTicketClick(club.id, '', ua)
    return Response.redirect(withPartnerCode(url), 302)
  }
  return Response.redirect(new URL(club ? paths.club(club.slug) : '/', SITE_URL).toString(), 302)
}
