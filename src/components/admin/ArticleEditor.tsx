'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { slugify } from '../../lib/slug'
import { seoChecks, type SeoCheck } from '../../lib/seoChecks'
import { ArchivePicker, PhotoMetaDialog } from './ArticlePhotos'

// The article editor in /admin/artikler, laid out like WordPress: title,
// permalink and text in the middle, and boxes on the side for publishing, the
// featured image, category, tags, excerpt and SEO (focus keyword, SEO title,
// meta description, a Google preview and a checklist).

export interface EditorArticle {
  id?: number
  slug: string
  title: string
  excerpt: string
  content: string
  featuredImage?: string
  featuredAlt?: string
  category?: string
  tags: string[]
  focusKeyword?: string
  seoTitle?: string
  metaDescription?: string
  author: string
  status: 'draft' | 'published'
  publishedAt?: string
}

async function upload(file: File): Promise<{ url?: string; photoId?: number; error?: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/admin/upload', { method: 'POST', body: form }).catch(() => undefined)
  if (!res) return { error: 'Ingen forbindelse' }
  return (await res.json().catch(() => ({ error: 'Upload fejlede' }))) as { url?: string; photoId?: number; error?: string }
}

/** Picks a picture file and uploads it (it also goes into the photo archive) */
function pickPicture(onDone: (url: string, photoId?: number) => void, onError: (e: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const { url, photoId, error } = await upload(file)
    if (url) onDone(url, photoId)
    else onError(error ?? 'Upload fejlede')
  }
  input.click()
}

/** "2026-09-28T09:30" for a datetime-local field, in the browser's time zone */
const localInput = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Toolbar({ editor, onImage, onArchive }: { editor: Editor; onImage: () => void; onArchive: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
    }),
  })
  const btn = (label: string, title: string, active: boolean, run: () => void, disabled = false) => (
    <button type="button" className={`ed-tool${active ? ' is-on' : ''}`} title={title} aria-label={title} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  )
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link (fx https://matchly.dk/klub/fc-koebenhavn eller /klub/fc-koebenhavn)', prev ?? '')
    if (url === null) return
    if (!url.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  return (
    <div className="ed-toolbar" role="toolbar" aria-label="Formatering">
      <select
        className="ed-block"
        value={state.block}
        aria-label="Afsnitstype"
        onChange={(e) => {
          const v = e.target.value
          const c = editor.chain().focus()
          if (v === 'p') c.setParagraph().run()
          else c.toggleHeading({ level: v === 'h2' ? 2 : 3 }).run()
        }}
      >
        <option value="p">Afsnit</option>
        <option value="h2">Overskrift 2</option>
        <option value="h3">Overskrift 3</option>
      </select>
      <span className="ed-sep" />
      {btn('B', 'Fed (Ctrl+B)', state.bold, () => editor.chain().focus().toggleBold().run())}
      {btn('I', 'Kursiv (Ctrl+I)', state.italic, () => editor.chain().focus().toggleItalic().run())}
      {btn('U', 'Understreget (Ctrl+U)', state.underline, () => editor.chain().focus().toggleUnderline().run())}
      {btn('S', 'Gennemstreget', state.strike, () => editor.chain().focus().toggleStrike().run())}
      {btn('🔗', 'Link', state.link, setLink)}
      <span className="ed-sep" />
      {btn('•', 'Punktliste', state.bullet, () => editor.chain().focus().toggleBulletList().run())}
      {btn('1.', 'Nummereret liste', state.ordered, () => editor.chain().focus().toggleOrderedList().run())}
      {btn('❝', 'Citat', state.quote, () => editor.chain().focus().toggleBlockquote().run())}
      {btn('―', 'Vandret linje', false, () => editor.chain().focus().setHorizontalRule().run())}
      {btn('🖼', 'Upload billede', false, onImage)}
      {btn('🗂', 'Vælg fra billedarkivet', false, onArchive)}
      <span className="ed-sep" />
      {btn('↶', 'Fortryd (Ctrl+Z)', false, () => editor.chain().focus().undo().run())}
      {btn('↷', 'Gentag (Ctrl+Y)', false, () => editor.chain().focus().redo().run())}
    </div>
  )
}

function Box({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="ed-box" open={open}>
      <summary>{title}</summary>
      <div className="ed-box__body">{children}</div>
    </details>
  )
}

const CHECK_ICON: Record<SeoCheck['level'], string> = { good: '🟢', ok: '🟠', bad: '🔴' }

export function ArticleEditor({
  initial,
  categories: initialCategories,
  tagOptions = [],
}: {
  initial: EditorArticle
  categories: { slug: string; name: string }[]
  /** Leagues and their clubs for the tag menu; the first club (else league) tag sets the article's side column */
  tagOptions?: { league: string; clubs: string[] }[]
}) {
  const router = useRouter()
  const [a, setA] = useState<EditorArticle>(initial)
  const [slugTouched, setSlugTouched] = useState(!!initial.id)
  const [categories, setCategories] = useState(initialCategories)
  const [newCategory, setNewCategory] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()
  const [dirty, setDirty] = useState(false)
  const saved = useRef(JSON.stringify(initial))
  // Pictures: after an upload the archive asks for its metadata; or a photo is taken from the archive
  const [photoFlow, setPhotoFlow] = useState<{ kind: 'meta'; url: string; photoId?: number; target: 'inline' | 'featured' } | { kind: 'archive'; target: 'inline' | 'featured' }>()

  const set = <K extends keyof EditorArticle>(key: K, value: EditorArticle[K]) =>
    setA((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'title' && !slugTouched) next.slug = slugify(String(value))
      return next
    })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Skriv din artikel her …' }),
    ],
    content: initial.content,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'article-body ed-content' } },
    onUpdate: ({ editor: e }) => setA((prev) => ({ ...prev, content: e.getHTML() })),
  })

  useEffect(() => {
    setDirty(JSON.stringify(a) !== saved.current) // eslint-disable-line react-hooks/set-state-in-effect -- follows the article
  }, [a])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const checks = useMemo(() => seoChecks(a), [a])
  const score = checks.filter((c) => c.level === 'good').length / Math.max(1, checks.length)

  async function save(status: EditorArticle['status']) {
    setBusy(true)
    setMessage(undefined)
    const body = { article: { ...a, status, publishedAt: a.publishedAt || (status === 'published' ? new Date().toISOString() : undefined) } }
    const res = await fetch('/api/admin/articles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined)
    setBusy(false)
    const json = (await res?.json().catch(() => ({}))) as { article?: EditorArticle; error?: string } | undefined
    if (!res?.ok || !json?.article) {
      setMessage({ text: json?.error ?? 'Kunne ikke gemme', error: true })
      return
    }
    const next = { ...a, ...json.article }
    saved.current = JSON.stringify(next)
    setA(next)
    setSlugTouched(true)
    const scheduled = next.status === 'published' && next.publishedAt && Date.parse(next.publishedAt) > Date.now()
    setMessage({ text: next.status === 'draft' ? 'Kladden er gemt' : scheduled ? 'Artiklen er planlagt' : 'Artiklen er udgivet' })
    if (!a.id && json.article.id) router.replace(`/admin/artikler/${json.article.id}`)
    router.refresh()
  }

  async function remove() {
    if (!a.id || !window.confirm(`Slet "${a.title}"? Det kan ikke fortrydes.`)) return
    await fetch('/api/admin/articles', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: a.id }) })
    saved.current = JSON.stringify(a)
    setDirty(false)
    router.push('/admin/artikler')
  }

  async function createCategory() {
    const name = newCategory.trim()
    if (!name) return
    const res = await fetch('/api/admin/articles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: name }) })
    const json = (await res.json().catch(() => ({}))) as { category?: { slug: string; name: string }; error?: string }
    if (json.category) {
      setCategories((prev) => (prev.some((c) => c.slug === json.category!.slug) ? prev : [...prev, json.category!].sort((x, y) => x.name.localeCompare(y.name, 'da'))))
      set('category', json.category.slug)
      setNewCategory('')
    } else setMessage({ text: json.error ?? 'Kunne ikke oprette kategorien', error: true })
  }

  const addTags = (raw: string) => {
    const add = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (add.length) set('tags', [...new Set([...a.tags, ...add])])
    setTagInput('')
  }

  const onError = (e: string) => setMessage({ text: e, error: true })
  const uploadFor = (target: 'inline' | 'featured') => pickPicture((url, photoId) => setPhotoFlow({ kind: 'meta', url, photoId, target }), onError)
  const placePicture = (target: 'inline' | 'featured', url: string, alt: string) => {
    if (target === 'featured') {
      setA((prev) => ({ ...prev, featuredImage: url, featuredAlt: alt }))
      return
    }
    // The photographer is shown in the picture's corner on the site (from the photo archive)
    editor?.chain().focus().setImage({ src: url, alt }).run()
  }

  const published = a.status === 'published'
  const future = !!a.publishedAt && Date.parse(a.publishedAt) > Date.now()
  const seoTitle = a.seoTitle || a.title
  const description = a.metaDescription || a.excerpt

  return (
    <div className="ed">
      <div className="ed-main">
        <input className="ed-title" value={a.title} onChange={(e) => set('title', e.target.value)} placeholder="Tilføj titel" aria-label="Titel" />
        <label className="ed-permalink">
          <span>Permalink: matchly.dk/artikler/</span>
          <input
            value={a.slug}
            onChange={(e) => {
              setSlugTouched(true)
              set('slug', slugify(e.target.value))
            }}
            aria-label="Permalink"
          />
        </label>
        <div className="ed-editor">
          {editor && <Toolbar editor={editor} onImage={() => uploadFor('inline')} onArchive={() => setPhotoFlow({ kind: 'archive', target: 'inline' })} />}
          <EditorContent editor={editor} />
        </div>
      </div>

      <aside className="ed-side">
        <Box title="Udgiv">
          <p className="ed-status">
            Status: <strong>{published ? (future ? 'Planlagt' : 'Udgivet') : 'Kladde'}</strong>
            {dirty && <em> · ikke gemt</em>}
          </p>
          <label className="ed-field">
            <span>Udgivelsestidspunkt</span>
            <input type="datetime-local" value={localInput(a.publishedAt)} onChange={(e) => set('publishedAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
            <small>Tomt = nu. Et tidspunkt frem i tiden planlægger artiklen.</small>
          </label>
          <label className="ed-field">
            <span>Forfatter</span>
            <input value={a.author} onChange={(e) => set('author', e.target.value)} />
          </label>
          <div className="ed-actions">
            <button type="button" className="pill" disabled={busy} onClick={() => save('draft')}>
              {published ? 'Gør til kladde' : 'Gem kladde'}
            </button>
            <button type="button" className="pill is-active" disabled={busy} onClick={() => save('published')}>
              {published ? 'Opdater' : future ? 'Planlæg' : 'Udgiv'}
            </button>
          </div>
          {published && !future && a.slug && (
            <a className="text-btn" href={`/artikler/${a.slug}`} target="_blank" rel="noopener">
              Se artiklen ↗
            </a>
          )}
          {a.id && (
            <button type="button" className="text-btn ed-delete" onClick={remove}>
              Flyt til papirkurven
            </button>
          )}
          {message && (
            <p className={message.error ? 'unverified' : 'ed-ok'} role="status">
              {message.text}
            </p>
          )}
        </Box>

        <Box title="Udvalgt billede">
          {a.featuredImage ? (
            <>
              <img className="ed-featured" src={a.featuredImage} alt={a.featuredAlt ?? ''} />
              <label className="ed-field">
                <span>Alt-tekst</span>
                <input value={a.featuredAlt ?? ''} onChange={(e) => set('featuredAlt', e.target.value)} placeholder="Beskriv billedet" />
              </label>
              <div className="ed-actions">
                <button type="button" className="text-btn" onClick={() => uploadFor('featured')}>
                  Skift billede
                </button>
                <button type="button" className="text-btn" onClick={() => setPhotoFlow({ kind: 'archive', target: 'featured' })}>
                  Fra billedarkivet
                </button>
                <button type="button" className="text-btn" onClick={() => set('featuredImage', undefined)}>
                  Fjern
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="ed-dropzone" onClick={() => uploadFor('featured')}>
                Upload udvalgt billede
                <small>JPG, PNG, WebP eller GIF – gøres automatisk mindre og lægges i billedarkivet</small>
              </button>
              <button type="button" className="text-btn" onClick={() => setPhotoFlow({ kind: 'archive', target: 'featured' })}>
                Vælg fra billedarkivet
              </button>
            </>
          )}
        </Box>

        <Box title="Kategori">
          <div className="ed-cats">
            {categories.length === 0 && <p className="muted small">Ingen kategorier endnu.</p>}
            {categories.map((c) => (
              <label key={c.slug} className="ed-radio">
                <input type="radio" name="category" checked={a.category === c.slug} onChange={() => set('category', c.slug)} />
                {c.name}
              </label>
            ))}
            {a.category && (
              <button type="button" className="text-btn" onClick={() => set('category', undefined)}>
                Ingen kategori
              </button>
            )}
          </div>
          <div className="ed-inline">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ny kategori" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createCategory())} />
            <button type="button" className="pill" onClick={createCategory}>
              Tilføj
            </button>
          </div>
        </Box>

        <Box title="Tags">
          <select
            className="ed-tagpick"
            value=""
            aria-label="Tilføj klub eller liga"
            onChange={(e) => e.target.value && addTags(e.target.value)}
            style={{ width: '100%', font: 'inherit', fontSize: 14, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', marginBottom: 8 }}
          >
            <option value="">Vælg klub eller liga …</option>
            <optgroup label="Ligaer">
              {tagOptions.map((o) => (
                <option key={o.league} value={o.league} disabled={a.tags.includes(o.league)}>
                  {o.league}
                </option>
              ))}
            </optgroup>
            {tagOptions.map((o) => (
              <optgroup key={o.league} label={o.league}>
                {o.clubs.map((c) => (
                  <option key={c} value={c} disabled={a.tags.includes(c)}>
                    {c}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="ed-inline">
            <input
              value={tagInput}
              onChange={(e) => (e.target.value.includes(',') ? addTags(e.target.value) : setTagInput(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTags(tagInput))}
              placeholder="Fx FC København, Superliga"
            />
            <button type="button" className="pill" onClick={() => addTags(tagInput)}>
              Tilføj
            </button>
          </div>
          <small className="muted">Adskil med komma eller Enter. Det første klub-tag (ellers liga-tag) bestemmer stilling og kampe ved artiklen, og artiklen vises på klubbens og ligaens side.</small>
          <ul className="ed-tags">
            {a.tags.map((t) => (
              <li key={t}>
                {t}
                <button type="button" aria-label={`Fjern ${t}`} onClick={() => set('tags', a.tags.filter((x) => x !== t))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </Box>

        <Box title="Uddrag">
          <textarea className="ed-textarea" rows={3} value={a.excerpt} onChange={(e) => set('excerpt', e.target.value)} placeholder="Kort resumé vist i artikellisten og som underrubrik" />
        </Box>

        <Box title={`SEO ${score >= 0.8 ? '🟢' : score >= 0.5 ? '🟠' : '🔴'}`}>
          <label className="ed-field">
            <span>Fokus-søgeord</span>
            <input value={a.focusKeyword ?? ''} onChange={(e) => set('focusKeyword', e.target.value)} placeholder="Fx FC København transfer" />
          </label>
          <label className="ed-field">
            <span>SEO-titel</span>
            <input value={a.seoTitle ?? ''} onChange={(e) => set('seoTitle', e.target.value)} placeholder={a.title || 'Som titlen'} />
            <small className={seoTitle.length > 60 ? 'ed-warn' : undefined}>{seoTitle.length} / 60 tegn</small>
          </label>
          <label className="ed-field">
            <span>Metabeskrivelse</span>
            <textarea className="ed-textarea" rows={3} value={a.metaDescription ?? ''} onChange={(e) => set('metaDescription', e.target.value)} placeholder={a.excerpt || 'Det Google viser under titlen'} />
            <small className={description.length < 120 || description.length > 160 ? 'ed-warn' : undefined}>{description.length} tegn – bedst 120–160</small>
          </label>
          <div className="ed-google" aria-label="Sådan kan det se ud på Google">
            <span className="ed-google__url">matchly.dk › artikler › {a.slug || '…'}</span>
            <span className="ed-google__title">{(seoTitle || 'Titel').slice(0, 60)} | Matchly</span>
            <span className="ed-google__desc">{description.slice(0, 160) || 'Skriv en metabeskrivelse …'}</span>
          </div>
          <ul className="ed-checks">
            {checks.map((c) => (
              <li key={c.id}>
                <span aria-hidden="true">{CHECK_ICON[c.level]}</span> {c.text}
              </li>
            ))}
          </ul>
        </Box>
      </aside>
      {photoFlow?.kind === 'meta' && (
        <PhotoMetaDialog
          url={photoFlow.url}
          photoId={photoFlow.photoId}
          onDone={(alt) => {
            placePicture(photoFlow.target, photoFlow.url, alt)
            setPhotoFlow(undefined)
          }}
        />
      )}
      {photoFlow?.kind === 'archive' && (
        <ArchivePicker
          onClose={() => setPhotoFlow(undefined)}
          onPick={(p) => {
            // The archive suggests the alt text from the players and situation; it can be changed here
            const alt = window.prompt('Alt-tekst (beskriv billedet – vigtigt for Google og skærmlæsere)', p.alt) ?? p.alt
            placePicture(photoFlow.target, p.url, alt)
            setPhotoFlow(undefined)
          }}
        />
      )}
    </div>
  )
}
