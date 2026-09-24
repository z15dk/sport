import type { MetadataRoute } from 'next'
import { INDEXABLE, SITE_URL } from '../lib/site'

export default function robots(): MetadataRoute.Robots {
  // Block all crawlers while the site shows fictional results
  if (!INDEXABLE) return { rules: { userAgent: '*', disallow: '/' } }
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE_URL}/sitemap.xml` }
}
