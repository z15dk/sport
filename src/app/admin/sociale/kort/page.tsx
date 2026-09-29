import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isAdmin } from '../../../../lib/admin'
import { contentFor, logosFor } from '../../../../lib/socialContent'
import { findPost } from '../../../../lib/socialStore'
import { PostCards } from '../cards'
import { FitRows } from '../FitRows'
import s from '../sociale.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kort', robots: { index: false, follow: false } }

// One post's cards, alone and 540 px wide: the engine's Chromium opens this
// page and takes a picture of each card (src/lib/socialRender.ts).

export default async function CardsForPost({ searchParams }: { searchParams: Promise<{ post?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const { post: id } = await searchParams
  const post = id ? findPost(id) : undefined
  if (!post) notFound()
  const content = contentFor(post, Date.now())
  if (!content) notFound()
  return (
    <div className={s.render}>
      <FitRows />
      <PostCards content={content} logos={await logosFor(content)} />
    </div>
  )
}
