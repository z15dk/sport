import { rssXml } from '../../../lib/articleFeed'

// RSS feed of the latest articles (for Google News Publisher Center, Feedly and other readers)
export const dynamic = 'force-dynamic'

export function GET() {
  return new Response(rssXml(), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  })
}
