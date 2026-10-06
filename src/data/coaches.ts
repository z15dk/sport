// Head coaches we know better than the data: the club page takes the coach from the newest DBU match report, so a new
// coach only shows after his first match, and a few reports name the wrong person. A name here wins on the club page
// (header and "Hvem er … træner?"). Keep it short: remove a line once DBU's reports name the same coach.

export interface KnownCoach {
  name: string
  /** Leads the team until a new head coach is named ("Konstitueret cheftræner") */
  acting?: boolean
  /** Why the line is here, and when it was checked */
  why: string
}

export const KNOWN_COACHES: Record<string, KnownCoach> = {
  'esbjerg-fb': { name: 'Hjalte Bo Nørregaard', why: 'Ansat 23/9-2026 efter Sancheev Manoharan; første kamp 10/10 (tjekket 7/10-2026)' },
  'kolding-if': { name: 'Brian Clarhaut', acting: true, why: 'Jonas Kamper fyret 6/10-2026; assistenten leder holdet, ny cheftræner præsenteres snart (tjekket 7/10-2026)' },
  'nykoebing-fc': { name: 'Mikkel Thygesen', why: "DBU's kamprapporter nævner fodbolddirektør Claus Jensen; Thygesen har været cheftræner siden januar 2025 (tjekket 6/10-2026)" },
}

export const knownCoach = (slug: string): KnownCoach | undefined => KNOWN_COACHES[slug]
