import { cookies } from 'next/headers'
import { COOKIE, checkPassword, cookieOptions, sameOrigin, sessionToken, tooManyAttempts } from '../../../../lib/admin'

export async function POST(request: Request) {
  const back = (path: string) => new Response(null, { status: 303, headers: { Location: path } })
  if (!sameOrigin(request)) return back('/admin?fejl=1')
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'lokal'
  if (tooManyAttempts(ip)) return back('/admin?fejl=vent')
  const form = await request.formData()
  if (!checkPassword(String(form.get('password') ?? ''))) return back('/admin?fejl=1')
  ;(await cookies()).set(COOKIE, sessionToken(), cookieOptions)
  return back('/admin/klubber')
}
