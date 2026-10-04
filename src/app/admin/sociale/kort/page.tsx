import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isAdmin } from '../../../../lib/admin'
import { contentFor, logosFor, type PostSpec } from '../../../../lib/socialContent'
import { KINDS, findPost, isTopic } from '../../../../lib/socialStore'
import { isValidIsoDate } from '../../../../lib/time'
import { loadFocusHeadToHead } from '../../../../lib/social'
import { PostCards } from '../cards'
import { FitRows } from '../FitRows'
import s from '../sociale.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kort', robots: { index: false, follow: false } }

// One post's cards, alone and 540 px wide: the engine's Chromium opens this
// page and takes a picture of each card (src/lib/socialRender.ts).

/** A template asked for by its spec (an own post made from a template), checked field by field */
function specOf(raw?: string): PostSpec | undefined {
  try {
    const v = JSON.parse(Buffer.from(raw ?? '', 'base64url').toString('utf8')) as Record<string, unknown>
    if (!KINDS.includes(v.kind as PostSpec['kind']) || !isValidIsoDate(v.date as string)) return undefined
    return {
      kind: v.kind as PostSpec['kind'],
      date: v.date as string,
      topic: isTopic(v.topic) ? v.topic : undefined,
      slot: typeof v.slot === 'string' ? v.slot : undefined,
      league: typeof v.league === 'string' ? v.league : undefined,
      matchIds: Array.isArray(v.matchIds) ? v.matchIds.filter((x): x is string => typeof x === 'string') : [],
      // A focus match picked by hand, and women's football
      focus: typeof v.focus === 'string' ? v.focus : undefined,
      women: v.women === true ? true : undefined,
    }
  } catch {
    return undefined
  }
}

export default async function CardsForPost({ searchParams }: { searchParams: Promise<{ post?: string; spec?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const { post: id, spec: raw } = await searchParams
  const post = id ? findPost(id) : undefined
  // An own post has its own pictures, no cards
  const spec = raw ? specOf(raw) : post && post.kind !== 'own' ? { ...post, kind: post.kind } : undefined
  if (!spec) notFound()
  // A focus match's meetings from the partner (women's and foreign games), before the cards are drawn
  if (spec.focus) await loadFocusHeadToHead(spec.focus)
  const content = contentFor(spec, Date.now())
  if (!content) notFound()
  return (
    <div className={s.render}>
      <FitRows />
      <PostCards content={content} logos={await logosFor(content)} />
    </div>
  )
}
