import { calendarLinks } from '../lib/calendar'
import { genitive } from '../lib/faq'

/** "Add the matches to your calendar": subscribe on the phone (webcal), in Google Calendar, or download the file */
export function CalendarButton({ kind, slug, name }: { kind: 'klub' | 'turnering'; slug: string; name: string }) {
  const links = calendarLinks(kind, slug)
  return (
    <div className="calendar-cta">
      <span className="calendar-cta__icon" aria-hidden>
        📅
      </span>
      <span className="calendar-cta__text">
        <strong>Få {genitive(name)} kampe i din kalender</strong>
        <em>Tidspunkt, TV-kanal og resultat – opdateres af sig selv</em>
      </span>
      <span className="calendar-cta__links">
        <a className="calendar-cta__main" href={links.webcal}>
          Tilføj til kalender
        </a>
        <a href={links.google} target="_blank" rel="noopener">
          Google Kalender
        </a>
      </span>
    </div>
  )
}
