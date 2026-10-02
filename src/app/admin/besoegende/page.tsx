import { permanentRedirect } from 'next/navigation'

// The visitors are now the top of the general dashboard (/admin/indstillinger)
export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const { periode } = await searchParams
  permanentRedirect(periode ? `/admin/indstillinger?periode=${encodeURIComponent(periode)}` : '/admin/indstillinger')
}
