import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { loadMatch, loadPastMatch } from '../../../lib/matchLookup'

// The page has a loading screen (loading.tsx), so once it renders the answer has
// already gone out as 200: an unknown match would be a "soft 404". The layout is
// outside that boundary, so checking here gives a real 404 status.
export default async function MatchLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!loadMatch(slug) && !loadPastMatch(slug)) notFound()
  return children
}
