import 'server-only'
import { cache } from 'react'
import { findMatch } from '../data/matches'
import { findPastMatch } from './pastMatch'
import { dateFromMatchSlug } from './slug'

// A match page's match, looked up once per request: the layout (real 404 before
// the page streams), the metadata and the page all use it.

/** The match in the live data */
export const loadMatch = cache((slug: string) => {
  const date = dateFromMatchSlug(slug)
  const now = Date.now()
  const match = date ? findMatch(slug, date, now) : undefined
  return match && date ? { match, date, now } : undefined
})

/** An older match the live data no longer has (match database and statistics bank) */
export const loadPastMatch = cache((slug: string) => findPastMatch(slug))
