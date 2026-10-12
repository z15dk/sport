import { klubmailUnsubscribe } from '../../../../lib/klubmail/server'

// One-click unsubscribe from the mail program (RFC 8058: the List-Unsubscribe-Post header of every club mail points
// here). The address is deleted at once; an unknown link answers the same, so nothing can be learned from it.

export async function POST(request: Request) {
  klubmailUnsubscribe(new URL(request.url).searchParams.get('t') ?? '')
  return new Response('Du er afmeldt.', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}
