/** Shown at once while a match page loads: the shape of the page, so a tap feels instant */
export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-label="Henter kampen">
      <div className="skeleton skeleton--hero" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--panel" />
      <div className="skeleton skeleton--panel" />
    </div>
  )
}
