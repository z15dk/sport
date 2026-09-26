import 'server-only'

let guarded = false

/** A failing background job (a rejected promise nobody waits for) is logged, and the server carries on */
export function guardProcess() {
  if (guarded) return
  guarded = true
  process.on('unhandledRejection', (err) => console.error('Baggrundsjob fejlede:', err))
}
