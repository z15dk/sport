import type { Metadata } from 'next'
import { WomenLanding, womenMetadata, womenSport } from '../../components/WomenLanding'

// Women in sport: every sport's women's games (src/components/WomenLanding.tsx)

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ dato?: string; live?: string }>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { dato } = await searchParams
  return womenMetadata(womenSport()!, dato)
}

export default async function WomenSportPage({ searchParams }: { searchParams: SearchParams }) {
  const { dato, live } = await searchParams
  return <WomenLanding sport={womenSport()!} dato={dato} live={live} />
}
