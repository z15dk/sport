import { useEffect, useState } from 'react'

export type Route = 'matches' | 'clubs'

const parse = (): Route => (window.location.hash === '#klubber' ? 'clubs' : 'matches')

/** Minimal hash router: "#klubber" shows the clubs page, anything else the matches. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
