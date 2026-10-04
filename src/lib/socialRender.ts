import 'server-only'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { COOKIE, sessionToken } from './admin'
import { imageDir, type Surface } from './socialStore'

// Takes the pictures of a post's cards: a headless Chromium opens the post's
// render page (/admin/sociale/kort?post=<id>, logged in with a fresh admin
// cookie) and saves each card as a 1080 px wide JPEG (Instagram only takes
// JPEG). Uses the same templates as the admin page, so the pictures are
// exactly what is shown there.
//
// Chromium: CHROMIUM_PATH, else the browsers deploy/update.sh installs in
// /opt/scoreline/browsers, else Playwright's own folders and the system's.

const WIDTH = 1080
/** The render page shows each card 540 px wide; twice that is the picture */
const SCALE = 2

function findIn(dir: string): string | undefined {
  try {
    for (const name of readdirSync(dir).sort().reverse()) {
      if (!name.startsWith('chromium')) continue
      for (const exe of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
        const p = path.join(/*turbopackIgnore: true*/ dir, name, exe)
        if (existsSync(p)) return p
      }
    }
  } catch {
    // no such folder
  }
  return undefined
}

/** Where Chromium is, when it is installed */
export function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/scoreline/browsers', '/opt/pw-browsers', path.join(/*turbopackIgnore: true*/ process.env.HOME ?? '/root', '.cache', 'ms-playwright')].filter(
    (d): d is string => !!d,
  )
  for (const d of dirs) {
    const p = findIn(d)
    if (p) return p
  }
  return ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find((p) => existsSync(p))
}

/** The address the server answers on itself */
const selfUrl = () => `http://127.0.0.1:${process.env.PORT || 3000}`

// One picture job at a time (Chromium takes a few hundred MB)
let queue: Promise<unknown> = Promise.resolve()

/** The post's cards as JPEG files in the images folder, in carousel order */
export function renderPost(postId: string): Promise<{ file: string; surface: Surface }[]> {
  const job = queue.then(() => render(postId, `post=${encodeURIComponent(postId)}`))
  queue = job.catch(() => undefined)
  return job
}

/** The longest a set of pictures may take to make */
const RENDER_MAX_MS = 120_000

/** A template's cards for an own post (kind, date, topic, league), saved as `<prefix>-…jpg` */
export function renderSpec(prefix: string, spec: object): Promise<{ file: string; surface: Surface }[]> {
  const job = queue.then(() => render(prefix, `spec=${Buffer.from(JSON.stringify(spec)).toString('base64url')}`))
  queue = job.catch(() => undefined)
  return job
}

async function render(postId: string, query: string): Promise<{ file: string; surface: Surface }[]> {
  const executablePath = chromiumPath()
  if (!executablePath) throw new Error('Chromium er ikke installeret på serveren (deploy/update.sh installerer det)')
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  // Never longer than two minutes: a page that hangs must not hold up every later picture and the engine with it
  // (closing the browser makes whatever is waiting fail, and the post is tried again)
  const giveUp = setTimeout(() => void browser.close().catch(() => undefined), RENDER_MAX_MS)
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: SCALE })
    await context.addCookies([{ name: COOKIE, value: sessionToken(), url: selfUrl() }])
    const page = await context.newPage()
    const res = await page.goto(`${selfUrl()}/admin/sociale/kort?${query}`, { waitUntil: 'networkidle', timeout: 60_000 })
    if (!res?.ok()) throw new Error(`Kortsiden svarede ${res?.status() ?? 'intet'}`)
    // The web fonts and every logo on the cards in, and the rows that don't fit hidden (FitRows). Only the cards' own
    // pictures, fetched now (not when they scroll into view), and at most a quarter of a minute: the rest of the page is
    // not on the pictures, and it has pictures that never load by themselves (the flags in the footer's folded list –
    // waiting for those once held every post back)
    await page.evaluate(async () => {
      await document.fonts.ready
      const pictures = Array.from(document.querySelectorAll<HTMLImageElement>('[data-card] img'))
      for (const img of pictures) img.loading = 'eager'
      await Promise.race([
        Promise.all(pictures.map((img) => (img.complete ? undefined : new Promise((r) => ((img.onload = r), (img.onerror = r)))))),
        new Promise((r) => setTimeout(r, 15_000)),
      ])
    })
    // Only the cards on the pictures: the cookie banner, the admin bar and anything else laid over the page are hidden
    await page.addStyleTag({ content: '.consent, .adminbar, [role="dialog"] { display: none !important; }' })
    await page.waitForTimeout(400)
    const cards = await page.locator('[data-card]').all()
    if (!cards.length) throw new Error('Ingen kort at tage billeder af')
    const sharp = (await import('sharp')).default
    mkdirSync(imageDir(), { recursive: true })
    const stamp = Date.now().toString(36)
    const out: { file: string; surface: Surface }[] = []
    for (const [i, card] of cards.entries()) {
      const surface = ((await card.getAttribute('data-surface')) ?? 'feed') as Surface
      const png = await card.screenshot({ type: 'png', animations: 'disabled' })
      const jpeg = await sharp(png)
        // Exactly 4:5 or 9:16 (Instagram refuses a feed picture even a hair narrower than 4:5)
        .resize({ width: WIDTH, height: surface === 'story' ? 1920 : 1350, fit: 'cover', position: 'top' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer()
      const file = `${postId}-${stamp}-${i + 1}.jpg`.replace(/[^a-z0-9.-]/gi, '-')
      writeFileSync(path.join(/*turbopackIgnore: true*/ imageDir(), file), jpeg)
      out.push({ file, surface })
    }
    return out
  } finally {
    clearTimeout(giveUp)
    await browser.close().catch(() => undefined)
  }
}
