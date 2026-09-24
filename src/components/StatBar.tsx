interface Props {
  label: string
  home: number
  away: number
  homeText?: string
  awayText?: string
  lowerIsBetter?: boolean
  /** Neither side is highlighted */
  neutral?: boolean
}

/** Two-sided comparison row: home value, label, away value, and a split bar. */
export function StatBar({ label, home, away, homeText, awayText, lowerIsBetter, neutral }: Props) {
  const total = home + away
  // When lower is better the bar is inverted, so the better side still gets the longer bar
  const homeShare = total === 0 ? 50 : ((lowerIsBetter ? away : home) / total) * 100
  const homeBetter = !neutral && (lowerIsBetter ? home < away : home > away)
  const awayBetter = !neutral && (lowerIsBetter ? away < home : away > home)

  return (
    <div className="statbar">
      <div className="statbar__values">
        <span className={homeBetter ? 'is-better' : ''}>{homeText ?? home}</span>
        <span className="statbar__label">{label}</span>
        <span className={awayBetter ? 'is-better is-away' : ''}>{awayText ?? away}</span>
      </div>
      <div className="statbar__track" aria-hidden>
        <span className={`statbar__home${homeBetter ? ' is-better' : ''}`} style={{ width: `${homeShare}%` }} />
        <span className={`statbar__away${awayBetter ? ' is-better' : ''}`} style={{ width: `${100 - homeShare}%` }} />
      </div>
    </div>
  )
}
