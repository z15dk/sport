import 'server-only'
import { COOKIE, sessionToken } from './admin'
import { chromiumPath } from './socialRender'
import { saveUpload } from './uploads'
import { withPhotoDb } from './photos/server'
import { registerArticleUpload } from './photos/store'

// The VS graphic for an article: the server's Chromium opens /admin/grafik/vs (logged in with a fresh
// admin cookie), takes a picture of the 1200×630 card and saves it as an upload (WebP, in the photo
// archive as a graphic credited Matchly.dk), ready as the article's picture.

const selfUrl = () => `http://127.0.0.1:${process.env.PORT || 3000}`

export async function makeVsGraphic(input: { home: string; away: string; top?: string; bg?: string }): Promise<{ url: string }> {
  const home = input.home.trim()
  const away = input.away.trim()
  if (!home || !away) throw new Error('Vælg begge klubber')
  const executablePath = chromiumPath()
  if (!executablePath) throw new Error('Chromium er ikke installeret på serveren')
  const q = new URLSearchParams({ h: home, a: away, ...(input.top?.trim() && { top: input.top.trim() }), ...(input.bg && { bg: input.bg }) })
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  let png: Buffer
  try {
    const context = await browser.newContext({ viewport: { width: 1300, height: 800 }, deviceScaleFactor: 1 })
    await context.addCookies([{ name: COOKIE, value: sessionToken(), url: selfUrl() }])
    const page = await context.newPage()
    const res = await page.goto(`${selfUrl()}/admin/grafik/vs?${q}`, { waitUntil: 'networkidle', timeout: 60_000 })
    if (!res?.ok()) throw new Error(`Grafiksiden svarede ${res?.status() ?? 'intet'}`)
    await page.addStyleTag({ content: '.consent, .adminbar, [role="dialog"] { display: none !important; }' })
    // Only the graphic's own pictures, and at most a quarter of a minute (the page's footer has flags that never load by themselves)
    await page.evaluate(async () => {
      await document.fonts.ready
      const pictures = Array.from(document.querySelectorAll<HTMLImageElement>('[data-card] img'))
      for (const img of pictures) img.loading = 'eager'
      await Promise.race([
        Promise.all(pictures.map((img) => (img.complete ? undefined : new Promise((r) => ((img.onload = r), (img.onerror = r)))))),
        new Promise((r) => setTimeout(r, 15_000)),
      ])
    })
    await page.waitForTimeout(300)
    png = await page.locator('[data-card]').screenshot({ type: 'png' })
  } finally {
    await browser.close()
  }
  const saved = await saveUpload(png, 1200)
  if (saved.error || !saved.url) throw new Error(saved.error ?? 'Grafikken kunne ikke gemmes')
  try {
    const name = saved.url.replace('/uploads/', '')
    withPhotoDb((db) => {
      const id = registerArticleUpload(db, name)
      db.prepare(`UPDATE photos SET kind = 'grafik', kind_manual = 1, credit = 'Matchly.dk', metadata_done = 1, title = ? WHERE id = ?`).run(`${home} vs ${away}`, id)
    })
  } catch {
    // the article still gets its picture
  }
  return { url: saved.url }
}
