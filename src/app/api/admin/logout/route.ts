import { cookies } from 'next/headers'
import { COOKIE } from '../../../../lib/admin'

export async function POST() {
  ;(await cookies()).delete(COOKIE)
  return new Response(null, { status: 303, headers: { Location: '/admin' } })
}
