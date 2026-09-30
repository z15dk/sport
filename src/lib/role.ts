// Which part this server process plays. Normally one process does everything
// ('all'): pages and the background jobs. With SCORELINE_WORKER=on in the
// server's env the site process starts a second process for the jobs
// ('worker': fetching, merging, statistics bank, sitemaps, social media) and
// only serves pages itself ('web'), reading what the jobs make from the data
// files – so no page ever waits for the background work.

export type Role = 'all' | 'web' | 'worker'

export function role(): Role {
  const r = process.env.SCORELINE_ROLE
  return r === 'web' || r === 'worker' ? r : 'all'
}

/** Whether this process runs the background jobs (and may write their data files) */
export const runsJobs = () => role() !== 'web'
