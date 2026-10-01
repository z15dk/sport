import Link from 'next/link'

interface Props {
  /** A wide banner (league and match pages) instead of the side column's card */
  wide?: boolean
  kicker?: string
  title?: [string, string]
  text?: string
  href?: string
  cta?: string
}

/**
 * The advert for our free widgets (/widget): on the front page under "Kamp i
 * fokus", and wide on league and match pages. A small table drawn without
 * names or numbers (no made-up data), whose highlighted row climbs.
 */
export function WidgetPromo({
  wide,
  kicker = 'Gratis · til din hjemmeside',
  title = ['Ligatabellen', 'på din side.'],
  text = 'Stilling og kampprogram til klubber, fanklubber og blogs – opdateres live.',
  href = '/widget',
  cta = 'Lav din widget →',
}: Props) {
  return (
    <Link href={href} className={`wpromo${wide ? ' wpromo--wide' : ''}`} prefetch={false}>
      <span className="wpromo__m" aria-hidden>
        M
      </span>
      <span className="wpromo__copy">
        <span className="wpromo__kicker">{kicker}</span>
        <strong className="wpromo__title">
          {title[0]}
          <br />
          <em>{title[1]}</em>
        </strong>
        <span className="wpromo__text">{text}</span>
        <span className="wpromo__cta">{cta}</span>
      </span>
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
    </Link>
  )
}
