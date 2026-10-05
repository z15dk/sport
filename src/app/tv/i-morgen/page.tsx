import type { Metadata } from 'next'
import { TvPeriodPage, tvPeriodMetadata } from '../../../components/TvPeriodPage'

export const dynamic = 'force-dynamic'

export const generateMetadata = async (): Promise<Metadata> => tvPeriodMetadata('i-morgen')

export default function Page() {
  return <TvPeriodPage period="i-morgen" />
}
