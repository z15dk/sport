import type { QualityMark } from '../../lib/articleQuality'

// "Besked til Claude" on an automatic draft: the writer's last verdict, the owner's message while it is being done,
// and a plain form that sends a new one (/api/articles/claude). On the mail's approval page (signed with its
// token, `t`) and in the article editor (`from="editor"`). Works without JavaScript.

const time = (ms: number) => new Date(ms).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function ClaudeNote({ id, mark, t, from = 'godkend', sent }: { id: number; mark: QualityMark; t?: string; from?: 'godkend' | 'editor'; sent?: boolean }) {
  const pending = mark.note?.pending
  return (
    <section className="claude-note">
      <h2>Claude-skribenten</h2>
      {mark.editor && !pending && (
        <p className={mark.editor.ok ? 'claude-note__verdict is-ok' : 'claude-note__verdict is-warn'}>
          <strong>{mark.editor.ok ? 'Klar' : 'Se på den'}:</strong> {mark.editor.verdict} <span className="muted small">({time(mark.editor.at)})</span>
        </p>
      )}
      {pending && (
        <p className="claude-note__pending">
          <strong>Claude arbejder på din besked</strong>: “{mark.note!.text}”. Det tager typisk 2–5 minutter – opdater siden bagefter.
        </p>
      )}
      {sent && !pending && <p className="claude-note__pending">Beskeden er sendt.</p>}
      <form method="post" action="/api/articles/claude" className="claude-note__form">
        <input type="hidden" name="id" value={id} />
        {t && <input type="hidden" name="t" value={t} />}
        <input type="hidden" name="fra" value={from} />
        <label htmlFor={`besked-${id}`}>Besked til Claude</label>
        <textarea id={`besked-${id}`} name="besked" rows={3} maxLength={1000} placeholder="Fx: Mere om Brøndbys stime, mindre om tabellen. Eller: Rubrikken skal handle om Nadim." required />
        <button type="submit" className="pill is-active" disabled={pending}>
          {pending ? 'Claude arbejder …' : 'Skriv om'}
        </button>
        <small className="muted">Claude skriver artiklen om efter din besked, men bruger stadig kun fakta fra kampdata og kilder. Dine faste regler står under Admin → Redaktør.</small>
      </form>
    </section>
  )
}
