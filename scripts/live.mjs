// Runs the Next.js dev server and keeps the checkout on the newest pushed commit.
// The page on http://localhost:5173 reloads by itself when files change.
// Usage: npm run live            (follows the current branch)
//        npm run live -- <branch> (switches to and follows <branch>)
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INTERVAL_MS = 15_000
const RESTART_FILES = ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', '.env', '.env.local']

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
const log = (msg) => console.log(`\x1b[32m[live ${new Date().toLocaleTimeString('da-DK')}]\x1b[0m ${msg}`)

const wanted = process.argv[2]
if (wanted && git('rev-parse', '--abbrev-ref', 'HEAD') !== wanted) {
  git('fetch', '--quiet', 'origin', wanted)
  git('checkout', wanted)
}
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')

function npmInstall() {
  log('Installerer afhængigheder (npm install) …')
  spawnSync('npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: true })
}

let server
function startServer() {
  const bin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  server = spawn(process.execPath, [bin, 'dev', '-p', '5173'], { cwd: ROOT, stdio: 'inherit' })
}
function restartServer() {
  if (!server) return
  log('Genstarter serveren …')
  server.once('exit', startServer)
  server.kill()
}

function update() {
  try {
    git('fetch', '--quiet', 'origin', branch)
    const local = git('rev-parse', 'HEAD')
    const remote = git('rev-parse', `origin/${branch}`)
    if (local === remote) return
    if (git('status', '--porcelain', '--untracked-files=no')) {
      log('Der er lokale ændringer – springer opdatering over, indtil de er committet eller fjernet.')
      return
    }
    git('merge', '--ff-only', '--quiet', `origin/${branch}`)
    const changed = git('diff', '--name-only', local, remote).split('\n')
    log(`Opdateret til ${git('log', '-1', '--format=%h %s')}`)
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) npmInstall()
    if (changed.some((f) => RESTART_FILES.includes(f))) restartServer()
  } catch (err) {
    log(`Kunne ikke opdatere: ${err.message.split('\n')[0]}`)
  }
}

if (!existsSync(path.join(ROOT, 'node_modules'))) npmInstall()
log(`Følger origin/${branch} – tjekker for nye ændringer hvert ${INTERVAL_MS / 1000}. sekund`)
update()
startServer()
const timer = setInterval(update, INTERVAL_MS)

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    clearInterval(timer)
    server.kill()
    process.exit(0)
  })
}
