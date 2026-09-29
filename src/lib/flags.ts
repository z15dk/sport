import { proxyImage } from './imageProxy'
import { flagCode } from '../data/flagCodes'

// A national team's flag when its source has no logo: API-Sports often has
// only "image not available" for youth, women's and Olympic teams ("France U21",
// "Denmark W"). The country's flag from flagcdn.com, by its English name
// (src/data/flagCodes.ts, the same list the browser uses in TeamBadge).

/**
 * The flag for a national team's name, or nothing. With `national` the
 * senior team's plain country name also counts (its games are between
 * national teams); otherwise only youth, women's and Olympic teams.
 */
export function nationalFlag(name: string, national = false): string | undefined {
  const code = flagCode(name, national)
  return code ? proxyImage(flagSource(code)) : undefined
}

/** The flag's original at flagcdn.com */
export const flagSource = (code: string) => `https://flagcdn.com/w160/${code}.png`
