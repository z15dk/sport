import { searchHits } from '../../../lib/search'

/** Clubs and tournaments for the menu's search box */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 60)
  return Response.json(searchHits(q), { headers: { 'cache-control': 'public, max-age=60' } })
}
