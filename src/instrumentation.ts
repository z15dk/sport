export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Only when the server runs, not while `next build` prerenders pages
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  // A failing background job must never take the whole site down
  const { guardProcess } = await import('./lib/guards')
  guardProcess()
  const { startLagMonitor } = await import('./lib/slow')
  startLagMonitor()
  const [{ startIndexNow }, { startLogoSync }, { startRealDataSync }] = await Promise.all([
    import('./lib/indexnow'),
    import('./lib/badges'),
    import('./lib/realdata'),
  ])
  const { startApiSportsSync } = await import('./lib/apisports')
  startApiSportsSync()
  // API-Sports' "image not available" logos, found by downloading each logo once
  const [{ startLogoCheck }, { apiSportsLogoUrls }] = [await import('./lib/logoCheck'), await import('./lib/apisports')]
  startLogoCheck(apiSportsLogoUrls)
  const { startTvSync } = await import('./lib/channels')
  startTvSync()
  const { startNewsSync } = await import('./lib/news')
  startNewsSync()
  // Logos and photos made ready ahead, so no page waits for a source
  const { warmKnownPictures } = await import('./lib/imageProxy')
  warmKnownPictures()
  startIndexNow()
  // The sitemap's match list, worked out ahead so /sitemap.xml answers at once
  const { startSitemapWarm } = await import('./lib/sitemaps')
  startSitemapWarm()
  startRealDataSync()
  startLogoSync()
  // Social media posts (does nothing until it is switched on in /admin/sociale)
  const { startSocialEngine } = await import('./lib/socialEngine')
  startSocialEngine()
}
