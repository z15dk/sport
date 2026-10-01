import Link from 'next/link'

/**
 * The front page's advert for our free widgets (/widget), under "Kamp i fokus":
 * a dark card with a small table drawn without names or numbers (no made-up
 * data), whose rows change places while the highlighted club climbs.
 */
export function WidgetPromo() {
  return (
    <Link href="/widget" className="wpromo" prefetch={false}>
      <span className="wpromo__m" aria-hidden>
        M
      </span>
      <span className="wpromo__kicker">Gratis · til din hjemmeside</span>
      <strong className="wpromo__title">
        Ligatabellen
        <br />
        <em>på din side.</em>
      </strong>
      <span className="wpromo__table" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <b key={`n${i}`} className="wpromo__pos" style={{ top: i * 33 }}>
            {i + 1}
          </b>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`wpromo__row wpromo__row--${i}`}>
            <i className="wpromo__badge" />
            <i className="wpromo__name" />
            <i className="wpromo__dots">
              <i />
              <i />
              <i />
            </i>
          </span>
        ))}
      </span>
      <span className="wpromo__text">Stilling og kampprogram til klubber, fanklubber og blogs – opdateres live.</span>
      <span className="wpromo__cta">Lav din widget →</span>
    </Link>
  )
}
