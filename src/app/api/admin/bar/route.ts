import { cookies } from 'next/headers'
import { BAR_COOKIE, isAdmin } from '../../../../lib/admin'
import { visitStats } from '../../../../lib/visits'
import { articleBySlug } from '../../../../lib/articles'
import { clubBySlug } from '../../../../data/leagues'

// The admin bar on the public pages (AdminBar): today's visitors and links to
// edit what the page shows. Only asked for by browsers with the bar's flag
// cookie, so ordinary visitors never cost a request.

export const dynamic = 'force-dynamic'

let visits: { at: number; now: number; today: number } | undefined

function visitors() {
  if (!visits || Date.now() - visits.at > 30_000) {
    const s = visitStats(1)
    visits = { at: Date.now(), now: s?.now ?? 0, today: s?.today.visitors ?? 0 }
  }
  return visits
}

type Link = { label: string; href: string }

/** What this page lets the admin change */
function editLinks(path: string): Link[] {
  const [, a, b] = path.split('/')
  const slug = b ? decodeURIComponent(b) : ''
  if (a === 'klub' && slug) {
    const club = clubBySlug(slug)?.club
    return [
      { label: 'Ret klub (navn, logo)', href: `/admin/klubber?q=${encodeURIComponent(club?.name ?? slug)}` },
      { label: 'Billetlink', href: '/admin/billetter' },
    ]
  }
  if (a === 'turnering' && slug) return [{ label: 'Ret liga (navn, logo)', href: '/admin/ligaer' }]
  if (a === 'kamp' && slug) {
    const day = /\d{4}-\d{2}-\d{2}$/.exec(slug)?.[0]
    return [
      { label: 'TV-kanal for kampen', href: `/admin/kanaler${day ? `?dato=${day}` : ''}` },
      { label: 'Billetlink', href: '/admin/billetter' },
    ]
  }
  if (a === 'artikler' && slug && slug !== 'kategori' && slug !== 'tag') {
    const article = articleBySlug(slug)
    if (article) return [{ label: 'Rediger artikel', href: `/admin/artikler/${article.id}` }]
  }
  if (a === 'kvindesport' || a === 'kvindefodbold') return [{ label: 'Ret kvindesiden', href: '/admin/kvindesport' }]
  if (a === 'widget') return [{ label: 'Widget-statistik', href: '/admin/widget' }]
  if (a === 'billetsystem') return [{ label: 'Henvendelser', href: '/admin/billetter' }]
  if (a === 'tv') return [{ label: 'Kanaler', href: '/admin/kanaler' }]
  return []
}

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    ;(await cookies()).delete(BAR_COOKIE)
    return Response.json({ admin: false }, { status: 401, headers: { 'cache-control': 'no-store' } })
  }
  const path = new URL(request.url).searchParams.get('sti') ?? '/'
  const v = visitors()
  return Response.json({ admin: true, now: v.now, today: v.today, edit: editLinks(path) }, { headers: { 'cache-control': 'no-store' } })
}
