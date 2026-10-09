import { readFileSync } from 'node:fs'
import { isAdmin } from '../../../../../../lib/admin'
import { hasVideo, videoFile } from '../../../../../../lib/quizReel'

export const dynamic = 'force-dynamic'

/** An episode's video for /admin/quiz (the player and "Download"): ?download=1 saves it as a file */
export async function GET(request: Request, { params }: { params: Promise<{ n: string }> }) {
  if (!(await isAdmin())) return new Response('Log ind', { status: 401 })
  const n = Number((await params).n)
  if (!Number.isInteger(n) || n < 1 || !hasVideo(n)) return new Response('Ikke fundet', { status: 404 })
  const download = new URL(request.url).searchParams.get('download')
  return new Response(new Uint8Array(readFileSync(videoFile(n))), {
    headers: { 'content-type': 'video/mp4', 'cache-control': 'private, no-store', ...(download && { 'content-disposition': `attachment; filename="matchly-gaet-klubben-afsnit-${n}.mp4"` }) },
  })
}
