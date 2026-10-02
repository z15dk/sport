import Link from 'next/link'
import { AdminBarFlag } from '../AdminBar'

// The admin pages' menu. Settings holds its own sub-pages (general settings
// and the status pages for data, data quality and the logo job), and so does
// the social media engine (plan, history, settings and templates) and the
// photo system (search, review queue, squads), the visitors (the site's own and the widget's)
// and the ads (the placements on our pages, and our own ad for other sites).

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
const PAGES = [
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

/** The admin pages' shared menu, with the current page marked */
export function AdminNav({ current }: { current: string }) {
  const active = PAGES.find((p) => p.href === current || p.children?.some((c) => c.href === current))
  return (
    <div className="admin-nav-wrap">
      <AdminBarFlag />
      <nav className="admin-nav" aria-label="Admin">
        <div className="filter-bar">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className={`pill${p === active ? ' is-active' : ''}`} aria-current={p === active ? 'page' : undefined}>
              {p.label}
            </Link>
          ))}
        </div>
        <form method="post" action="/api/admin/logout">
          <button className="text-btn" type="submit">
            Log ud
          </button>
        </form>
      </nav>
      {active?.children && (
        <nav className="admin-subnav" aria-label={active.label}>
          {active.children.map((c) => (
            <Link key={c.href} href={c.href} className={c.href === current ? 'is-active' : undefined} aria-current={c.href === current ? 'page' : undefined}>
              {c.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
