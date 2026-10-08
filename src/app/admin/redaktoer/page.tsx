import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import { articleById } from '../../../lib/articles'
import { readQuality } from '../../../lib/articleQuality'
import { readEditorRules } from '../../../lib/editorRules'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Redaktør', robots: { index: false, follow: false } }

// The Claude writer (deploy/claude-editor): the owner's standing rules, added to its instructions on every run,
// and its latest work – the automatic previews and match reports with its verdict and the owner's messages.

const time = (ms: number) => new Date(ms).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ gemt?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const { gemt } = await searchParams
  const rules = readEditorRules()
  const latest = Object.entries(readQuality())
    .map(([id, m]) => ({ id: Number(id), m, a: articleById(Number(id)) }))
    .filter((x) => x.a)
    .sort((x, y) => (y.m.editor?.at ?? y.m.at) - (x.m.editor?.at ?? x.m.at))
    .slice(0, 20)
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/redaktoer" />
        <h1 className="feed__title">Redaktør</h1>
        <p className="muted">
          Claude skriver de automatiske optakter og referater om som sportsjournalistik. Her står dine faste regler, som Claude følger i hver artikel. En besked til én bestemt artikel skriver du på artiklen (&quot;Besked til Claude&quot;).
        </p>
        <section className="panel pad">
          <h2 className="panel__title">Faste regler</h2>
          {gemt && <p className="social-msg is-ok">Gemt – Claude følger dem fra næste artikel.</p>}
          <form method="post" action="/api/admin/redaktor" className="claude-note__form">
            <textarea name="regler" rows={8} maxLength={4000} defaultValue={rules.text} placeholder={'Én regel pr. linje, fx:\nSkriv "Brøndby" og ikke "Brøndby IF" efter første omtale.\nIngen udråbstegn i rubrikker.\nNævn altid tilskuertallet, når det findes.'} />
            <button type="submit" className="pill is-active">
              Gem regler
            </button>
            {rules.at > 0 && <small className="muted">Senest ændret {time(rules.at)}</small>}
          </form>
        </section>
        <section className="panel pad">
          <h2 className="panel__title">Claudes seneste arbejde</h2>
          {latest.length ? (
            <ul className="quality__checks">
              {latest.map(({ id, m, a }) => (
                <li key={id} className={`quality__check ${m.editor?.ok === false || m.level !== 'green' ? 'quality__check--warn' : 'quality__check--ok'}`}>
                  <span className="quality__mark">{m.note?.pending ? '…' : m.editor?.ok === false ? '!' : '✓'}</span>
                  <span>
                    <Link href={`/admin/artikler/${id}`}>
                      <strong>{a!.title}</strong>
                    </Link>{' '}
                    <span className="muted small">({a!.status === 'published' ? 'udgivet' : 'kladde'})</span>
                    {m.note?.pending && <span className="small"> – arbejder på din besked: “{m.note.text}”</span>}
                    {!m.note?.pending && m.editor && <span className="small"> – {m.editor.verdict}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Ingen automatiske artikler endnu.</p>
          )}
        </section>
      </div>
    </div>
  )
}
