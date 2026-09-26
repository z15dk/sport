import Link from 'next/link'

// The admin pages' menu. Settings holds its own sub-pages (general settings
// and the status pages for data, data quality and the logo job).

const SETTINGS = [
  { href: '/admin/indstillinger', label: 'Generelt' },
  { href: '/admin/data', label: 'Data & API' },
  { href: '/admin/kvalitet', label: 'Datakvalitet' },
  { href: '/admin/logoer', label: 'Logo-job' },
]
const PAGES = [
  { href: '/admin/indstillinger', label: 'Indstillinger', children: SETTINGS },
  { href: '/admin/klubber', label: 'Klubber' },
  { href: '/admin/ligaer', label: 'Ligaer' },
  { href: '/admin/kanaler', label: 'Kanaler' },
]

/** The admin pages' shared menu, with the current page marked */
export function AdminNav({ current }: { current: string }) {
  const active = PAGES.find((p) => p.href === current || p.children?.some((c) => c.href === current))
  return (
    <div className="admin-nav-wrap">
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
