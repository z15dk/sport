import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { isAdmin } from '../../../../lib/admin'
import { qualityOf } from '../../../../lib/articleQuality'
import { ClaudeNote } from '../../../../components/admin/ClaudeNote'
import { articleById, categories } from '../../../../lib/articles'
import { AdminNav } from '../../../../components/admin/AdminNav'
import { ArticleEditor, type EditorArticle } from '../../../../components/admin/ArticleEditor'
import { tagOptions } from '../../../../lib/articleTopics'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Rediger artikel · Admin', robots: { index: false, follow: false } }

/** Write a new article (/admin/artikler/ny) or edit one */
export default async function EditArticle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ claude?: string; fejl?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const { id } = await params
  const { claude, fejl } = await searchParams
  const found = id === 'ny' ? undefined : articleById(Number(id))
  if (id !== 'ny' && !found) notFound()
  const initial: EditorArticle = found
    ? {
        id: found.id,
        slug: found.slug,
        title: found.title,
        excerpt: found.excerpt,
        content: found.content,
        featuredImage: found.featuredImage,
        featuredAlt: found.featuredAlt,
        category: found.category,
        tags: found.tags,
        focusKeyword: found.focusKeyword,
        seoTitle: found.seoTitle,
        metaDescription: found.metaDescription,
        author: found.author,
        status: found.status,
        publishedAt: found.publishedAt,
        noSocial: found.noSocial,
      }
    : { slug: '', title: '', excerpt: '', content: '', tags: [], author: 'Matchly', status: 'draft' }
  // An automatic preview or report that isn't live yet: "Besked til Claude"
  const mark = found ? qualityOf(found.id) : undefined
  const live = !!found && found.status === 'published' && !!found.publishedAt && Date.parse(found.publishedAt) <= Date.now()
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/artikler" />
        <p className="small">
          <Link className="text-btn" href="/admin/artikler">
            ← Alle artikler
          </Link>
        </p>
        <h1 className="feed__title">{found ? 'Rediger artikel' : 'Tilføj ny artikel'}</h1>
        {fejl && <p className="social-msg is-error">{fejl}</p>}
        {mark && !live && <ClaudeNote id={found!.id} mark={mark} from="editor" sent={claude === '1'} />}
        <ArticleEditor key={found?.id ?? 'ny'} initial={initial} categories={categories()} tagOptions={tagOptions()} />
      </div>
    </div>
  )
}
