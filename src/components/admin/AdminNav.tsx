import Link from 'next/link'

const PAGES = [
  { href: '/admin/indstillinger', label: 'Indstillinger' },
  { href: '/admin/klubber', label: 'Klubber' },
  { href: '/admin/ligaer', label: 'Ligaer' },
  { href: '/admin/kanaler', label: 'Kanaler' },
  { href: '/admin/data', label: 'Data & API' },
  { href: '/admin/kvalitet', label: 'Datakvalitet' },
  { href: '/admin/logoer', label: 'Logo-job' },
]

/** The admin pages' shared menu, with the current page marked */
export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="admin-nav" aria-label="Admin">
      <div className="filter-bar">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} className={`pill${p.href === current ? ' is-active' : ''}`} aria-current={p.href === current ? 'page' : undefined}>
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
  )
}
