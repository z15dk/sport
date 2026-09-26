export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Only when the server runs, not while `next build` prerenders pages
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  // A failing background job must never take the whole site down
  const { guardProcess } = await import('./lib/guards')
  guardProcess()
  const [{ startIndexNow }, { startLogoSync }, { startRealDataSync }] = await Promise.all([
    import('./lib/indexnow'),
    import('./lib/badges'),
    import('./lib/realdata'),
  ])
  const { startApiSportsSync } = await import('./lib/apisports')
  startApiSportsSync()
  const { startTvSync } = await import('./lib/channels')
  startTvSync()
  startIndexNow()
  startRealDataSync()
  startLogoSync()
}
