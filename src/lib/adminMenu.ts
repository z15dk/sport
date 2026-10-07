// The admin's menu (sections and their sub-pages), shown as dropdowns in the
// admin bar (AdminBar) at the top of every page while logged in.
// Settings gathers the general dashboard (visitors and the site's switches), the
// widget's visitors, the status pages for data, data quality and the logo job, and
// tickets, ads and the photo system, each under its own heading in the dropdown;
// articles and the social media engine have their own.

export interface AdminMenuItem {
  href: string
  label: string
  /** `group` is a heading in the dropdown; the items of one group stand together */
  children?: { href: string; label: string; group?: string }[]
}

const SETTINGS = [
  { href: '/admin/indstillinger', label: 'Generelt og besøgende', group: 'Siden' },
  { href: '/admin/widget', label: 'Widget', group: 'Siden' },
  { href: '/admin/data', label: 'Data & API', group: 'Siden' },
  { href: '/admin/kvalitet', label: 'Datakvalitet', group: 'Siden' },
  { href: '/admin/datavagt', label: 'Datavagt', group: 'Siden' },
  { href: '/admin/logoer', label: 'Logo-job', group: 'Siden' },
  { href: '/admin/billetter', label: 'Billetter', group: 'Billetter og reklamer' },
  { href: '/admin/reklamer', label: 'Reklamepladser', group: 'Billetter og reklamer' },
  { href: '/admin/annonce', label: 'Matchly-annoncen', group: 'Billetter og reklamer' },
  { href: '/admin/billeder', label: 'Søg', group: 'Billeder' },
  { href: '/admin/billeder/gennemgang', label: 'Gennemgang', group: 'Billeder' },
  { href: '/admin/billeder/kampe', label: 'Kampe og opslag', group: 'Billeder' },
  { href: '/admin/billeder/delinger', label: 'Delinger', group: 'Billeder' },
  { href: '/admin/billeder/trupper', label: 'Trupper', group: 'Billeder' },
]
const SOCIAL = [
  { href: '/admin/sociale', label: 'Plan og kø' },
  { href: '/admin/sociale/historik', label: 'Historik og tal' },
  { href: '/admin/sociale/tags', label: 'Tags' },
  { href: '/admin/sociale/indstillinger', label: 'Indstillinger' },
  { href: '/admin/sociale/skabeloner', label: 'Skabeloner' },
]
const ARTICLES = [
  { href: '/admin/artikler', label: 'Alle artikler' },
  { href: '/admin/artikler/optakter', label: 'Optakter' },
  { href: '/admin/artikler/superliga', label: 'Superliga-artikler' },
]
export const ADMIN_MENU: AdminMenuItem[] = [
  { href: '/admin/indstillinger', label: 'Indstillinger', children: SETTINGS },
  { href: '/admin/artikler', label: 'Artikler', children: ARTICLES },
  // The way to 10,000 page views a day: the numbers and the week's task as a checklist
  { href: '/admin/vaekst', label: 'Vækst' },
  { href: '/admin/klubber', label: 'Klubber' },
  { href: '/admin/ligaer', label: 'Ligaer' },
  { href: '/admin/kanaler', label: 'Kanaler' },
  { href: '/admin/kvindesport', label: 'Kvindesport' },
  { href: '/admin/sociale', label: 'Sociale medier', children: SOCIAL },
]


/** The section a path belongs to: its own page or one of its sub-pages (longest match) */
export function adminSection(path: string): { section?: AdminMenuItem; page?: string } {
  let best: { section?: AdminMenuItem; page?: string; len: number } = { len: 0 }
  for (const s of ADMIN_MENU)
    for (const h of [s.href, ...(s.children ?? []).map((c) => c.href)])
      if ((path === h || path.startsWith(`${h}/`)) && h.length > best.len) best = { section: s, page: h, len: h.length }
  return best
}
