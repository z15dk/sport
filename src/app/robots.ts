import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/site'
import { indexable } from '../lib/settings'

// Read the setting on every request instead of freezing it at build time
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  // Block all crawlers until indexing is switched on (/admin/indstillinger or SITE_INDEXABLE)
  // The sitemap is named also while the site is closed, so tools can find it
  if (!indexable()) return { rules: { userAgent: '*', disallow: '/' }, sitemap: `${SITE_URL}/sitemap.xml` }
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/status/'] }, sitemap: `${SITE_URL}/sitemap.xml` }
}
