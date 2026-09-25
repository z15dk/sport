import type { MetadataRoute } from 'next'
import { INDEXABLE, SITE_URL } from '../lib/site'

// Read the setting on every request instead of freezing it at build time
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  // Block all crawlers while the site shows fictional results
  if (!INDEXABLE) return { rules: { userAgent: '*', disallow: '/' } }
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/status/'] }, sitemap: `${SITE_URL}/sitemap.xml` }
}
