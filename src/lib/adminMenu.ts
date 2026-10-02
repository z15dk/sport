// The admin's menu (sections and their sub-pages), shown as dropdowns in the
// admin bar (AdminBar) at the top of every page while logged in.
// Settings holds the status pages for data, data quality and the logo job; the
// social media engine, the photo system, the visitors (the site's own and the
// widget's) and the ads (our placements and our own ad for other sites) have their own.

export interface AdminMenuItem {
  href: string
  label: string
  children?: { href: string; label: string }[]
}

const SETTINGS = [
  { href: '/admin/indstillinger', label: 'Generelt' },
  { href: '/admin/data', label: 'Data & API' },
  { href: '/admin/kvalitet', label: 'Datakvalitet' },
  { href: '/admin/logoer', label: 'Logo-job' },
]
const SOCIAL = [
  { href: '/admin/sociale', label: 'Plan og kø' },
  { href: '/admin/sociale/historik', label: 'Historik og tal' },
  { href: '/admin/sociale/tags', label: 'Tags' },
  { href: '/admin/sociale/indstillinger', label: 'Indstillinger' },
  { href: '/admin/sociale/skabeloner', label: 'Skabeloner' },
]
const PHOTOS = [
  { href: '/admin/billeder', label: 'Søg' },
  { href: '/admin/billeder/gennemgang', label: 'Gennemgang' },
  { href: '/admin/billeder/kampe', label: 'Kampe og opslag' },
  { href: '/admin/billeder/delinger', label: 'Delinger' },
  { href: '/admin/billeder/trupper', label: 'Trupper' },
]
const VISITORS = [
  { href: '/admin/besoegende', label: 'Siden' },
  { href: '/admin/widget', label: 'Widget' },
]
const ADS = [
  { href: '/admin/reklamer', label: 'Reklamepladser' },
  { href: '/admin/annonce', label: 'Matchly-annoncen' },
]
export const ADMIN_MENU: AdminMenuItem[] = [
  { href: '/admin/besoegende', label: 'Besøgende', children: VISITORS },
  { href: '/admin/indstillinger', label: 'Indstillinger', children: SETTINGS },
  { href: '/admin/artikler', label: 'Artikler' },
  { href: '/admin/klubber', label: 'Klubber' },
  { href: '/admin/ligaer', label: 'Ligaer' },
  { href: '/admin/kanaler', label: 'Kanaler' },
  { href: '/admin/billetter', label: 'Billetter' },
  { href: '/admin/kvindesport', label: 'Kvindesport' },
  { href: '/admin/reklamer', label: 'Reklamer', children: ADS },
  { href: '/admin/sociale', label: 'Sociale medier', children: SOCIAL },
  { href: '/admin/billeder', label: 'Billeder', children: PHOTOS },
]


/** The section a path belongs to: its own page or one of its sub-pages (longest match) */
export function adminSection(path: string): { section?: AdminMenuItem; page?: string } {
  let best: { section?: AdminMenuItem; page?: string; len: number } = { len: 0 }
  for (const s of ADMIN_MENU)
    for (const h of [s.href, ...(s.children ?? []).map((c) => c.href)])
      if ((path === h || path.startsWith(`${h}/`)) && h.length > best.len) best = { section: s, page: h, len: h.length }
  return best
}
