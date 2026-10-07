import 'server-only'
import path from 'node:path'
import { openPhotoDb, type Db } from '../photos/db'
import { dataDir } from '../photos/config'

// The women's leagues read from DBU (the A-Liga first, 2026-10-08) are kept in their own database,
// data/dbu-kvinder.db, never in the photo system's billeder.db: DBU names the women's teams like the men's
// ("Brøndby IF"), and the photo system merges clubs by name – the women's players would land in the men's
// squads, their coaches and grounds on the men's pages. Same tables, same DBU reader (src/lib/photos/dbu.ts).

const file = () => process.env.WOMEN_DB ?? path.join(dataDir(), 'dbu-kvinder.db')

export function withWomenDb<T>(fn: (db: Db) => T): T {
  const db = openPhotoDb(file())
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

export async function withWomenDbAsync<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = openPhotoDb(file())
  try {
    return await fn(db)
  } finally {
    db.close()
  }
}

/** A women's club as Matchly shows it: the name in the text, its club page, its name in our match addresses, and the logo's name */
export interface WomenClub {
  name: string
  slug: string
  /** The team's part of our match page address (/kamp/<home>-<away>-<date>), from the source's team name ("koege-w") */
  match: string
  /** The club name the logo is kept under (the men's club's logo is the club's) */
  logo: string
}

/** The A-Liga 2026/27 at DBU (pool 508850), by DBU's name; next season's clubs are added here */
export const A_LIGA_CLUBS: Record<string, WomenClub> = {
  AGF: { name: 'AGF', slug: 'agf-a-liga', match: 'agf-w', logo: 'AGF' },
  'ASA, Aarhus': { name: 'ASA Aarhus', slug: 'asa-aarhus-a-liga', match: 'asa-aarhus-w', logo: 'ASA Aarhus' },
  'Brøndby IF': { name: 'Brøndby IF', slug: 'broendby-if-a-liga', match: 'broendby-w', logo: 'Brøndby IF' },
  'F.C. København': { name: 'F.C. København', slug: 'f-c-koebenhavn-a-liga', match: 'fc-copenhagen-w', logo: 'F.C. København' },
  'FC Midtjylland': { name: 'FC Midtjylland', slug: 'fc-midtjylland-a-liga', match: 'midtjylland-w', logo: 'FC Midtjylland' },
  'FC Nordsjælland': { name: 'FC Nordsjælland', slug: 'fc-nordsjaelland-a-liga', match: 'nordsjaelland-w', logo: 'FC Nordsjælland' },
  'Fortuna Hjørring': { name: 'Fortuna Hjørring', slug: 'fortuna-hjoerring', match: 'fortuna-hjoerring-w', logo: 'Fortuna Hjørring' },
  'HB Køge Women': { name: 'HB Køge', slug: 'hb-koege-women-a-liga', match: 'koege-w', logo: 'HB Køge' },
  'Kolding IF': { name: 'Kolding IF', slug: 'kolding-if-a-liga', match: 'koldingq-w', logo: 'Kolding IF' },
  'OB Q': { name: 'OB Q', slug: 'ob-q', match: 'odense-q-w', logo: 'OB' },
}

export const womenClub = (dbuName: string): WomenClub | undefined => A_LIGA_CLUBS[dbuName.trim()]
