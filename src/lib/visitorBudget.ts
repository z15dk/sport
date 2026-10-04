import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { headers } from 'next/headers'

// API-Sports calls on a page are spent for people and the search engines that send them (Google, Bing),
// not for the other crawlers: SEO tools and Applebot opened thousands of match, club and player pages a
// day and used the day's lookups. A crawler still gets everything already saved. A page's data loading
// runs inside forVisitor; spendExtra (src/lib/apisports.ts) asks spendingBlocked.

/** Crawlers, previews and scripts */
export const ROBOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|embedly|whatsapp|telegram|curl|wget|python|axios|node-fetch|playwright|puppeteer/i
/** The search engines whose visits bring readers: they may spend, like a person */
const SEARCH_UA = /googlebot|bingbot/i

const store = new AsyncLocalStorage<{ spend: boolean }>()

/** True inside a crawler's page: new API calls are not made, saved answers are used */
export const spendingBlocked = () => store.getStore()?.spend === false

/** Runs a page's data loading with the visitor's right to spend API calls */
export async function forVisitor<T>(load: () => Promise<T>): Promise<T> {
  let ua = ''
  try {
    ua = (await headers()).get('user-agent') ?? ''
  } catch {
    // outside a request (a job): spend as before
    return load()
  }
  return store.run({ spend: !ROBOT_UA.test(ua) || SEARCH_UA.test(ua) }, load)
}
