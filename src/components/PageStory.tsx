/**
 * James' text on a club, league, player or head-to-head page (src/lib/seoOverrides.ts intro): a heading with the
 * search it answers and a few short paragraphs, in the page's own box (the panel and title of "Kampe" and "Stilling"), under its short line – what a reader (and Google) looking for
 * "Al-Nassr stillinger" wants to know, in words, beside the tables.
 */
export function PageStory({ story }: { story?: { heading: string; html: string }; eyebrow?: string }) {
  if (!story) return null
  return (
    <section className="panel page-story" aria-labelledby="page-story-title">
      <h2 id="page-story-title" className="panel__title page-story__title">
        {story.heading}
      </h2>
      <div className="page-story__body" dangerouslySetInnerHTML={{ __html: story.html }} />
    </section>
  )
}
