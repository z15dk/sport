export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Only when the server runs, not while `next build` prerenders pages
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const [{ startIndexNow }, { startLogoSync }, { startRealDataSync }] = await Promise.all([
    import('./lib/indexnow'),
    import('./lib/badges'),
    import('./lib/realdata'),
  ])
  startIndexNow()
  startRealDataSync()
  startLogoSync()
}
