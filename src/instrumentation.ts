export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Only when the server runs, not while `next build` prerenders pages
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  // A failing background job must never take the whole site down
  const { guardProcess } = await import('./lib/guards')
  guardProcess()
  const { startLagMonitor } = await import('./lib/slow')
  startLagMonitor()
  // SCORELINE_WORKER=on: the jobs run in a process of their own (src/lib/role.ts, src/lib/worker.ts); this one only serves pages
  if (process.env.SCORELINE_WORKER === 'on' && process.env.SCORELINE_ROLE !== 'worker') {
    process.env.SCORELINE_ROLE = 'web'
    const { startWorker } = await import('./lib/worker')
    startWorker()
    // What every page needs, built before the first visitor (the data, the history, the season)
    try {
      const [{ loadRealData }, { warmHistory }, { seasonClubs }] = await Promise.all([import('./lib/realdata'), import('./lib/history'), import('./data/season')])
      loadRealData()
      warmHistory()
      seasonClubs()
    } catch {
      // Built by the first page instead
    }
    return
  }
  const [{ startIndexNow }, { startLogoSync }, { startRealDataSync, startSnapshotWriter }] = await Promise.all([
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
  // The background process: the merged data and its own status for the site process
  if (process.env.SCORELINE_ROLE === 'worker') {
    startSnapshotWriter()
    const [{ startWorkerStatus }, { realDataJobStatus }, { archiveJobStatus }] = await Promise.all([import('./lib/workerStatus'), import('./lib/realdata'), import('./lib/archive')])
    startWorkerStatus(() => ({ realData: realDataJobStatus(), archive: archiveJobStatus() }))
  }
}
