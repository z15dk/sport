import { sitemapFile, xmlResponse } from '../../lib/sitemaps'

// The sitemap index (the address given in robots.txt and Search Console), as made in the background
export const dynamic = 'force-dynamic'

export async function GET() {
  const xml = await sitemapFile('sitemap.xml')
  return xml ? xmlResponse(xml) : new Response('Not found', { status: 404 })
}
