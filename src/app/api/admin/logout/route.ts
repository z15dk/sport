import { cookies } from 'next/headers'
import { BAR_COOKIE, COOKIE } from '../../../../lib/admin'

export async function POST() {
  const jar = await cookies()
  jar.delete(COOKIE)
  jar.delete(BAR_COOKIE)
  return new Response(null, { status: 303, headers: { Location: '/admin' } })
}
