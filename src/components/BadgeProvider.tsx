'use client'

import { createContext, useContext } from 'react'

const BadgeContext = createContext<Record<string, string>>({})

export function BadgeProvider({ badges, children }: { badges: Record<string, string>; children: React.ReactNode }) {
  return <BadgeContext.Provider value={badges}>{children}</BadgeContext.Provider>
}

export const useBadge = (name: string) => useContext(BadgeContext)[name]
