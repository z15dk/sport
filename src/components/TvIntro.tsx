/** James' text about the day's football on TV (src/lib/tvText.ts), above the list */
export function TvIntro({ html }: { html?: string }) {
  if (!html) return null
  return <div className="panel tv-intro" dangerouslySetInnerHTML={{ __html: html }} />
}
