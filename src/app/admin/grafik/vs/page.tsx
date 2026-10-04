import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../../lib/admin'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'VS-grafik', robots: { index: false, follow: false } }

// The VS graphic for an article (1200×630), drawn by src/lib/vsGraphic.tsx and served as a picture by
// /api/admin/vs/billede; this page shows it on its own: /admin/grafik/vs?h=<hjemme>&a=<ude>&top=&bg=

type Params = Promise<{ h?: string; a?: string; top?: string; bg?: string }>

export default async function VsGraphic({ searchParams }: { searchParams: Params }) {
  if (!(await isAdmin())) redirect('/admin')
  const { h = '', a = '', top = '', bg = '' } = await searchParams
  const q = new URLSearchParams({ h, a, ...(top && { top }), ...(bg && { bg }) })
  return (
    <div style={{ padding: 24 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the finished graphic */}
      <img src={`/api/admin/vs/billede?${q}`} alt={`${h} mod ${a}`} width={1200} height={630} style={{ maxWidth: '100%', height: 'auto', display: 'block', background: '#11130e' }} />
    </div>
  )
}
