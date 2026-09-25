'use client'

import { setRealData, type RealData } from '../data/real'

/**
 * Hands the server's real fixtures to the browser before any match list renders,
 * so server and browser build the same season.
 */
export function RealDataProvider({ data, children }: { data?: RealData; children: React.ReactNode }) {
  setRealData(data)
  return <>{children}</>
}
