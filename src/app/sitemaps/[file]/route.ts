import { matchFile, matchFileCount, pageEntries, urlsetXml, xmlResponse } from '../../../lib/sitemaps'

// One file of the sitemap: sider.xml or kampe-<n>.xml
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = (await params).file
  if (file === 'sider.xml') return xmlResponse(urlsetXml(pageEntries()))
  const n = Number(/^kampe-(\d+)\.xml$/.exec(file)?.[1])
  if (!n || n > matchFileCount()) return new Response('Not found', { status: 404 })
  return xmlResponse(urlsetXml(matchFile(n - 1)))
}
