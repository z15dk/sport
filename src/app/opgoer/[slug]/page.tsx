import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { MIN_INDEXED, parseRivalry, rivalry, rivalryPath } from '../../../lib/rivalry'
import { clubStats } from '../../../data/matchInsights'
import { formatLong } from '../../../lib/time'
import { RivalryView, summary } from '../../../components/RivalryView'

// Head-to-head between two of our clubs (src/lib/rivalry.ts): the pair's data and the address; the page itself is
// src/components/RivalryView.tsx (the match page's design).

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

function load(slug: string) {
  const pair = parseRivalry(slug)
  if (!pair) return undefined
  const r = rivalry(pair[0], pair[1])
  return r && { r, canonical: rivalryPath(pair[0], pair[1]) }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = load((await params).slug)
  if (!found) return { title: 'Opgøret findes ikke' }
  const { r, canonical } = found
  const title = `${r.a.club.name} – ${r.b.club.name}: indbyrdes opgør, statistik og næste kamp`
  return {
    title: { absolute: `${title} | Matchly` },
    description: `${summary(r)}${r.next ? ` Næste kamp: ${formatLong(r.next.kickoff)}.` : ''}`.slice(0, 300),
    alternates: { canonical },
    robots: r.meetings.length >= MIN_INDEXED ? undefined : { index: false, follow: true },
  }
}

export default async function RivalryPage({ params }: { params: Params }) {
  const slug = (await params).slug
  const found = load(slug)
  if (!found) notFound()
  const { r, canonical } = found
  if (`/opgoer/${slug}` !== canonical) permanentRedirect(canonical)
  const now = Date.now()
  return <RivalryView r={r} canonical={canonical} now={now} sa={clubStats(r.a.club.name, now)} sb={clubStats(r.b.club.name, now)} />
}

