import { sitemapFile, xmlResponse } from '../../../lib/sitemaps'

// One file of the sitemap: sider.xml or kampe-<n>.xml, as made in the background (src/lib/sitemaps.ts)
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = (await params).file
  if (file === 'sitemap.xml') return new Response('Not found', { status: 404 })
  const xml = await sitemapFile(file)
  return xml ? xmlResponse(xml) : new Response('Not found', { status: 404 })
}
