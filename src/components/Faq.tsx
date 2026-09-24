import type { FaqItem } from '../lib/faq'

export function Faq({ items, title = 'Spørgsmål og svar' }: { items: FaqItem[]; title?: string }) {
  return (
    <section className="faq panel" aria-labelledby="faq-title">
      <h2 id="faq-title" className="panel__title">
        {title}
      </h2>
      <dl className="faq__list">
        {items.map((it) => (
          <div key={it.q} className="faq__item">
            <dt>{it.q}</dt>
            <dd>{it.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
