import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

// The Claude editor's own key (EDITOR_TOKEN in the server's env): it opens /api/redaktor only – the automatic
// drafts and their quality marks – never the admin pages. Sent as "Authorization: Bearer <token>". Without the
// variable the editor's API is closed.

const digest = (s: string) => createHash('sha256').update(s).digest()

export function editorAllowed(request: Request): boolean {
  const token = process.env.EDITOR_TOKEN?.trim()
  if (!token || token.length < 32) return false
  const sent = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim()
  return !!sent && timingSafeEqual(digest(sent), digest(token))
}
