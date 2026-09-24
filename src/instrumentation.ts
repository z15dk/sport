export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startIndexNow } = await import('./lib/indexnow')
  startIndexNow()
}
