/** A few paragraphs about a club or league, written from the data (see src/lib/seoText.ts) */
export function AboutText({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  if (!paragraphs.length) return null
  return (
    <section className="panel about-text">
      <h2 className="panel__title">{title}</h2>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </section>
  )
}
