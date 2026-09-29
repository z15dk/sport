import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { WomenLanding, womenMetadata, womenSport } from '../../../components/WomenLanding'
import { paths } from '../../../lib/site'

// One sport's women's games: /kvindesport/haandbold (football is /kvindefodbold)

export const dynamic = 'force-dynamic'

type Params = Promise<{ sport: string }>
type SearchParams = Promise<{ dato?: string; live?: string }>

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const s = womenSport((await params).sport)
  if (!s) return {}
  return womenMetadata(s, (await searchParams).dato)
}

export default async function WomenOneSportPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { sport } = await params
  const { dato, live } = await searchParams
  if (sport === 'fodbold') permanentRedirect(paths.women({ sport, dato, live: !!live }))
  const s = womenSport(sport)
  if (!s) notFound()
  return <WomenLanding sport={s} dato={dato} live={live} />
}
