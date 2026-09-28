import { indexXml, sitemapFiles, xmlResponse } from '../../lib/sitemaps'

// The sitemap index (the address given in robots.txt and Search Console)
export const dynamic = 'force-dynamic'

export function GET() {
  return xmlResponse(indexXml(sitemapFiles()))
}
