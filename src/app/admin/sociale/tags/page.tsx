import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { TagsAdmin, type TagRow } from '../../../../components/admin/SocialAdmin'
import { isAdmin } from '../../../../lib/admin'
import { PLATFORM_NAMES, socialHandles } from '../../../../lib/socialStore'
import { shownDivisions } from '../../../../data/leagues'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Tags · Sociale medier', robots: { index: false, follow: false } }

// The clubs' and leagues' own profiles on each platform. When a post names a
// club, the first mention becomes its @name on the platform it goes to
// (`withTags` in src/lib/socialPlatforms.ts); a platform without a tag keeps the name.

export default async function SocialTags() {
  if (!(await isAdmin())) redirect('/admin')
  const handles = socialHandles()
  const seen = new Set<string>()
  const row = (name: string, group: string): TagRow => {
    seen.add(name)
    return { name, group, handles: { ...handles[name] } as Record<string, string> }
  }
  const divisions = shownDivisions()
  const rows: TagRow[] = [
    ...divisions.map((d) => row(d.name, 'Ligaer')),
    ...divisions.flatMap((d) => d.clubs.filter((c) => !seen.has(c.name)).map((c) => row(c.name, d.name))),
  ]
  // Names typed in by hand (clubs outside our leagues, tournaments)
  for (const name of Object.keys(handles)) if (!seen.has(name)) rows.unshift(row(name, 'Andre navne'))
  const tagged = Object.keys(handles).length
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/sociale/tags" />
        <h1 className="feed__title">Tags</h1>
        <p>
          Skriv klubbernes navne på hver platform (uden @). Når et opslag nævner klubben, bliver første gang, navnet står i teksten, byttet ud med klubbens tag på den
          platform, opslaget går til. En platform uden tag beholder navnet. {tagged} navne har tags.
        </p>
        <p className="muted small">
          Instagram, Threads og X: brugernavnet, fx brondbyif – de bliver rigtige tags. Facebook: sidens brugernavn står som @navn i teksten, men Facebooks API
          gør det ikke til et link. Et rigtigt tag på Facebook kræver sidens id-nummer og at Meta har givet appen adgang til at nævne sider (Page Mentions); skriv
          kun id-nummeret, hvis den adgang er på plads. Stories har ingen tekst, så de tagges ikke.
        </p>
        <TagsAdmin rows={rows} platforms={PLATFORM_NAMES} />
      </div>
    </div>
  )
}
