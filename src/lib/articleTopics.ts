import 'server-only'
import { shownDivisions, type Club, type Division } from '../data/leagues'
import { publishedArticles, type Article } from './articles'
import { articleSubjects } from './news'

// Articles and the leagues and clubs they are tagged with:
//  - the tags decide what an article is about (its side column follows the first club tag,
//    else the first league tag); the text is only used when no tag names one
//  - league and club pages list the articles tagged with them (a league page also those
//    tagged with one of its clubs)
//  - the editor's tag menu offers every league and club

export interface Subject {
  division: Division
  club?: Club
}

/**
 * An article about women's football (A-Liga, B-Liga, Kvindeliga, a women's team "(K)"): our leagues' clubs are the
 * men's, so such an article is never about them – "ASA Aarhus" in an A-Liga report is the women's team
 */
export function isWomenArticle(a: { tags: string[]; title?: string; category?: string }): boolean {
  return /\b(a-liga|b-liga|kvindeliga|kvindefodbold|kvindeholdet|kvinder|women)\b|\(k\)|a-ligaen|b-ligaen/i.test([...a.tags, a.title ?? '', a.category ?? ''].join(' | '))
}
const WOMEN_DIVISION = /kvinde|women|dame/i

function clubInShown(id: string): Subject | undefined {
  return shownDivisions().flatMap((d) => d.clubs.filter((c) => c.id === id).map((c) => ({ division: d, club: c })))[0]
}

/** The first club tag (with its league), else the first league tag */
export function subjectFromTags(tags: string[]): Subject | undefined {
  const found = tags.map((t) => articleSubjects('', t))
  for (const f of found) for (const id of f.clubs) {
    const hit = clubInShown(id)
    if (hit) return hit
  }
  for (const f of found) for (const id of f.leagues) {
    const division = shownDivisions().find((d) => d.id === id)
    if (division) return { division }
  }
  return undefined
}

/** Published articles tagged with the club, or with the league or one of its clubs; newest first */
export function articlesAbout(about: { division?: Division; club?: Club }, limit = 6): Article[] {
  const clubIds = new Set(about.club ? [about.club.id] : (about.division?.clubs ?? []).map((c) => c.id))
  return publishedArticles({ limit: 300 })
    .articles.filter((a) => {
      // A women's football article is not about the men's club or league of the same name
      if (isWomenArticle(a) && !WOMEN_DIVISION.test(about.division?.name ?? '') && !about.club?.name.match(/\(k\)/i)) return false
      const s = articleSubjects('', a.tags.join(', '))
      return s.clubs.some((id) => clubIds.has(id)) || (!about.club && !!about.division && s.leagues.includes(about.division.id))
    })
    .slice(0, limit)
}

/** The editor's tag menu: every league we show, and its clubs */
export function tagOptions(): { league: string; clubs: string[] }[] {
  return shownDivisions().map((d) => ({ league: d.name, clubs: d.clubs.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'da')) }))
}
