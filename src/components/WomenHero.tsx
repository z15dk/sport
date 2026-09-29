import Link from 'next/link'

// The women's sport pages' big top (WomenLanding), also the preview in
// /admin/kvindesport: a picture from the admin (or none), the heading's two
// lines, a text, the buttons and a few real numbers.

export interface WomenHeroProps {
  kicker: string
  title1: string
  title2: string
  lead: string
  image?: string
  position?: 'top' | 'center' | 'bottom'
  liveHref: string
  liveNow: number
  todayCount: number
  numbers: { label: string; value: number }[]
  /** The admin's preview: no heading element of the page's own */
  preview?: boolean
}

const n = (x: number) => x.toLocaleString('da-DK')

export function WomenHero({ kicker, title1, title2, lead, image, position = 'center', liveHref, liveNow, todayCount, numbers, preview }: WomenHeroProps) {
  const Title = preview ? 'p' : 'h1'
  return (
    <section
      className={`women-hero${image ? ' has-image' : ''}`}
      aria-labelledby={preview ? undefined : 'women-hero-title'}
      style={image ? ({ '--hero-image': `url("${image}")`, '--hero-position': `center ${position}` } as React.CSSProperties) : undefined}
    >
      <span className="women-hero__m" aria-hidden="true">
        M
      </span>
      <div className="women-hero__inner">
        <p className="women-hero__kicker">{kicker}</p>
        <Title id={preview ? undefined : 'women-hero-title'} className="women-hero__title">
          {title1}
          {title2 && (
            <>
              <br />
              <em>{title2}</em>
            </>
          )}
        </Title>
        <p className="women-hero__lead">{lead}</p>
        <div className="women-hero__cta">
          <Link className="women-hero__btn is-live" href={liveHref}>
            {liveNow > 0 && <span className="live-dot" aria-hidden="true" />} Følg kampene live
          </Link>
          <a className="women-hero__btn" href="#kampe">
            {todayCount ? `Dagens ${n(todayCount)} kampe` : 'Kampprogram'}
          </a>
        </div>
        <dl className="women-hero__numbers">
          {numbers.map((x) => (
            <div key={x.label}>
              <dt>{x.label}</dt>
              <dd>{n(x.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
