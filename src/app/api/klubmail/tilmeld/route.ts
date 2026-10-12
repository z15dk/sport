import { formLimited, readSmallJson } from '../../../../lib/formGuard'
import { klubmailSignUp } from '../../../../lib/klubmail/server'

// "Få <klub> i din indbakke" (ClubMailSignup on the club pages and in Mine hold): {email, club} or {email, clubs: []}
// → a pending sign-up and the confirmation mail (double opt-in, src/lib/klubmail/server.ts). A hidden field only
// robots fill in, a few sign-ups per visitor (formGuard) and at most 3 confirmation mails per address a day.

export async function POST(request: Request) {
  const b = await readSmallJson(request)
  if (!b) return Response.json({ error: 'Noget gik galt – prøv igen' }, { status: 400 })
  // The field people don't see: filled in by robots only (they get the same answer as a person)
  if (typeof b.website === 'string' && b.website) return Response.json({ ok: true })
  if (formLimited(request)) return Response.json({ error: 'Du har prøvet flere gange lige nu – vent lidt, og prøv igen.' }, { status: 429 })
  const email = typeof b.email === 'string' ? b.email.slice(0, 300) : ''
  const clubs = (Array.isArray(b.clubs) ? b.clubs : [b.club]).filter((c): c is string => typeof c === 'string').slice(0, 10)
  const r = await klubmailSignUp(email, clubs)
  return 'error' in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json({ ok: true })
}
