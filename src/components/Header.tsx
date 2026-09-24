interface Props {
  query: string
  onQueryChange: (q: string) => void
  liveCount: number
  onShowLive: () => void
}

export function Header({ query, onQueryChange, liveCount, onShowLive }: Props) {
  return (
    <header className="header">
      <a className="logo" href="/">
        Scoreline<span className="logo__dot">.</span>
      </a>
      <label className="search">
        <span className="visually-hidden">Søg efter hold eller turnering</span>
        <svg viewBox="0 0 24 24" aria-hidden className="search__icon">
          <path d="M10.5 3a7.5 7.5 0 015.96 12.06l4.24 4.24-1.4 1.4-4.24-4.24A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" />
        </svg>
        <input
          id="search"
          type="search"
          placeholder="Søg hold eller turnering"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>
      <button className="live-chip" onClick={onShowLive} disabled={liveCount === 0}>
        <span className="live-dot" aria-hidden />
        {liveCount} live
      </button>
    </header>
  )
}
