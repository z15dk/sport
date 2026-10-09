import 'server-only'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'
import { getBadges } from './badges'
import { nationalTeams } from './nationalTeams'
import { mOutline, ogFonts } from './ogImage'
import { cacheDir } from './tsdb'
import { clubLogoAndColor } from './vsGraphic'

// "Gæt klubben" – a quiz series for Reels (1080×1920, at most 25 seconds). Each episode opens with what the game is
// (three clues, guess in the comments, the answer next time), then the answer to the one before ("Svaret fra afsnit N-1"), asks a new club with three text clues from hard to easy, and ends without the
// answer ("Svaret kommer i næste afsnit") – so the answer is the hook of the next one. James (deploy/claude-editor/
// QUIZ.md) picks the club and writes the clues three times a week through /api/redaktor/quiz; the owner sees the
// videos on /admin/sociale/quiz and posts them. Drawn in Matchly's light look (the page's grey, white cards, lime, the M) by
// the share pictures' renderer, put together by ffmpeg. The series in data/quiz/serie.json, the videos next to it.

const exec = promisify(execFile)
const W = 1080
const H = 1920
const BG = '#eceee7'
const INK = '#0f110c'
const LIME = '#c6f135'
const MUTED = '#5c6157'
const ORANGE = '#ff4a1f'

export type QuizLevel = 'nem' | 'mellem' | 'svær'
export interface QuizEpisode {
  n: number
  /** The club as the site names it (its logo), e.g. "Hvidovre IF" */
  club: string
  level: QuizLevel
  /** Three clues, hardest first */
  clues: [string, string, string]
  /** The post's text (without the answer) */
  caption: string
  /** A line under the club's name when it is revealed in the next episode ("Fører Betinia Ligaen …") */
  answerNote?: string
  by: 'claude' | 'admin'
  createdAt: number
  /** Posted by the owner (the next episode reveals this one) */
  postedAt?: number
}

const dir = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'quiz')
const file = () => path.join(dir(), 'serie.json')
export const videoFile = (n: number) => path.join(dir(), `afsnit-${n}.mp4`)

export function readSeries(): QuizEpisode[] {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as QuizEpisode[]
  } catch {
    return []
  }
}

function saveSeries(list: QuizEpisode[]) {
  mkdirSync(dir(), { recursive: true })
  writeFileSync(`${file()}.tmp`, JSON.stringify(list, null, 2))
  renameSync(`${file()}.tmp`, file())
}

export const hasVideo = (n: number) => {
  try {
    return statSync(videoFile(n)).size > 0
  } catch {
    return false
  }
}

/** What James needs: the episodes so far (clubs used, the levels), the next number and whose answer it will open with */
export async function seriesBrief() {
  const list = readSeries()
  const names = [...new Set([...Object.keys(await getBadges()), ...Object.keys(nationalTeams())])]
  return {
    next: (list.at(-1)?.n ?? 0) + 1,
    revealsInNext: list.at(-1) ? { n: list.at(-1)!.n, club: list.at(-1)!.club } : null,
    episodes: list.map((e) => ({ n: e.n, club: e.club, level: e.level, at: new Date(e.createdAt).toISOString(), posted: !!e.postedAt })),
    clubsWithLogo: names.length,
  }
}

// ---------------------------------------------------------------- drawing

const background = (base: string, dot: string, glow?: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><pattern id="d" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="15" cy="15" r="2.6" fill="${dot}"/></pattern>
<radialGradient id="f" cx="${W}" cy="0" r="${H * 0.95}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="${W}" height="${H}" fill="url(#f)"/></mask>
${glow ? `<radialGradient id="g" cx="${W / 2}" cy="${H * 0.4}" r="${W * 0.75}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${glow}" stop-opacity="0.45"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>` : ''}</defs>
<rect width="${W}" height="${H}" fill="${base}"/><rect width="${W}" height="${H}" fill="url(#d)" mask="url(#m)"/>${glow ? `<rect width="${W}" height="${H}" fill="url(#g)"/>` : ''}</svg>`).toString('base64')}`

function Frame({ theme, glow, children }: { theme: 'lime' | 'light'; glow?: string; children: React.ReactNode }) {
  return (
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', position: 'relative', background: theme === 'lime' ? LIME : BG, color: INK, fontFamily: 'Barlow' }}>
      <img src={theme === 'lime' ? background(LIME, 'rgba(15,17,12,0.16)') : background(BG, 'rgba(111,143,0,0.28)', glow)} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
      <img src={mOutline(theme === 'lime' ? 'rgba(15,17,12,0.14)' : 'rgba(111,143,0,0.22)', 0.5)} width={1300} height={936} alt="" style={{ position: 'absolute', left: 260, top: 1180 }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 200, gap: 40 }}>{children}</div>
      <div style={{ position: 'absolute', left: 0, bottom: 90, width: '100%', display: 'flex', justifyContent: 'center', fontSize: 64, fontWeight: 800, fontStyle: 'italic' }}>
        MATCHLY<span style={{ color: ORANGE }}>.</span>
      </div>
    </div>
  )
}

const Title = ({ text, size }: { text: string; size: number }) => (
  <div style={{ display: 'flex', fontSize: size, fontWeight: 800, fontStyle: 'italic', lineHeight: 0.92, textTransform: 'uppercase', textAlign: 'center', justifyContent: 'center' }}>{text}</div>
)
const Pill = ({ text }: { text: string }) => (
  <div style={{ display: 'flex', padding: '14px 30px', borderRadius: 999, background: INK, color: LIME, fontSize: 34, fontWeight: 700, letterSpacing: 4 }}>{text.toUpperCase()}</div>
)
const Sub = ({ text, color = MUTED }: { text: string; color?: string }) => (
  <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, color, textAlign: 'center', justifyContent: 'center', padding: '0 60px' }}>{text}</div>
)
const Bar = ({ step }: { step: number }) => (
  <div style={{ display: 'flex', gap: 14 }}>
    {[1, 2, 3].map((i) => (
      <div key={i} style={{ width: 120, height: 16, borderRadius: 8, background: i <= step ? INK : 'rgba(15,17,12,0.15)' }} />
    ))}
  </div>
)

/** The logo's strongest colour (the most common saturated one), for the glow behind it: a white club colour would vanish on the light page */
async function logoGlow(logo: string | undefined, fallback: string): Promise<string> {
  if (!logo) return fallback
  try {
    const { data } = await sharp(Buffer.from(logo.split(',')[1], 'base64')).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const count = new Map<string, number>()
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a < 200 || Math.max(r, g, b) - Math.min(r, g, b) < 70) continue
      const key = [r, g, b].map((v) => Math.min(255, Math.round(v / 32) * 32)).join(',')
      count.set(key, (count.get(key) ?? 0) + 1)
    }
    const best = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]
    return best ? `rgb(${best})` : fallback
  } catch {
    return fallback
  }
}

async function png(el: React.ReactElement): Promise<Buffer> {
  const res = new ImageResponse(el, { width: W, height: H, fonts: ogFonts() })
  return Buffer.from(await res.arrayBuffer())
}

/** The episode's pictures in order, with how long each is shown and how it moves */
async function episodeFrames(e: QuizEpisode, previous?: QuizEpisode): Promise<{ png: Buffer; seconds: number; zoom: number; flash?: boolean }[]> {
  const out: { png: Buffer; seconds: number; zoom: number; flash?: boolean }[] = []
  // First what this is, so a new viewer understands the game before anything else
  const Step = ({ n, text }: { n: number; text: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28, width: 900, padding: '26px 34px', borderRadius: 32, background: '#ffffff' }}>
      <div style={{ display: 'flex', width: 92, height: 92, borderRadius: 999, background: INK, color: LIME, alignItems: 'center', justifyContent: 'center', fontSize: 64, fontWeight: 800, fontStyle: 'italic' }}>{String(n)}</div>
      <div style={{ display: 'flex', fontSize: 50, fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase', lineHeight: 1 }}>{text}</div>
    </div>
  )
  out.push({
    png: await png(
      <Frame theme="lime">
        <Pill text={`Afsnit ${e.n} · ${e.level}`} />
        <Title text="Gæt klubben" size={175} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 50 }}>
          <Step n={1} text="3 ledetråde – fra svær til nem" />
          <Step n={2} text="Skriv dit gæt i kommentarerne" />
          <Step n={3} text="Svaret kommer i næste afsnit" />
        </div>
      </Frame>,
    ),
    seconds: 3.5,
    zoom: 1.03,
  })
  if (previous) {
    // A breath before last time's answer, then the answer
    out.push({
      png: await png(
        <Frame theme="light">
          <Pill text={`Afsnit ${previous.n}`} />
          <div style={{ display: 'flex', marginTop: 260 }}>
            <Title text="Fik du den" size={170} />
          </div>
          <Title text="sidste gang?" size={170} />
          <Sub text="Her er svaret" />
        </Frame>,
      ),
      seconds: 1.2,
      zoom: 1.06,
    })
    const { logo, color, flag } = await clubLogoAndColor(previous.club, 720)
    const glow = await logoGlow(logo, color)
    out.push({
      png: await png(
        <Frame theme="light" glow={glow}>
          <Pill text={`Svaret fra afsnit ${previous.n}`} />
          {logo && (flag ? <img src={logo} width={660} height={440} alt="" style={{ marginTop: 80, borderRadius: 30 }} /> : <img src={logo} width={700} height={700} alt="" style={{ marginTop: 40 }} />)}
          <Title text={previous.club} size={previous.club.length > 14 ? 130 : 170} />
          {previous.answerNote && <Sub text={previous.answerNote} />}
        </Frame>,
      ),
      seconds: 2.8,
      zoom: 1.05,
      flash: true,
    })
  }
  const levels = ['svær', 'mellem', 'nem']
  for (let i = 0; i < 3; i++) {
    const text = e.clues[i]
    out.push({
      png: await png(
        <Frame theme="light">
          <Pill text={`Ledetråd ${i + 1} · ${levels[i]}`} />
          <Bar step={i + 1} />
          <div style={{ display: 'flex', position: 'relative', marginTop: 110, width: 920, minHeight: 640, alignItems: 'center', justifyContent: 'center', padding: '80px 64px 64px', borderRadius: 48, background: '#ffffff', boxShadow: '0 30px 60px rgba(15,17,12,0.12)' }}>
            <div style={{ position: 'absolute', top: -70, left: 380, width: 160, height: 160, borderRadius: 999, background: LIME, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 110, fontWeight: 800, fontStyle: 'italic', border: `8px solid ${BG}` }}>{String(i + 1)}</div>
            <div style={{ display: 'flex', fontSize: text.length > 80 ? 66 : text.length > 60 ? 78 : 90, fontWeight: 800, fontStyle: 'italic', lineHeight: 1.06, textAlign: 'center', textTransform: 'uppercase' }}>{text}</div>
          </div>
          <div style={{ display: 'flex', marginTop: 30 }}>
            <Sub text="Ved du det? Skriv det i kommentarerne" />
          </div>
        </Frame>,
      ),
      seconds: 4,
      zoom: 1.05,
    })
  }
  out.push({
    png: await png(
      <Frame theme="lime">
        <Pill text={`Afsnit ${e.n}`} />
        <Title text="Hvem er det?" size={160} />
        <div style={{ display: 'flex', marginTop: 50, padding: '26px 44px', borderRadius: 28, background: INK, color: LIME, fontSize: 58, fontWeight: 800, fontStyle: 'italic' }}>SKRIV DIT GÆT I KOMMENTARERNE</div>
        <div style={{ display: 'flex', marginTop: 80 }}>
          <Title text="Svaret kommer" size={110} />
        </div>
        <Title text="i næste afsnit" size={110} />
        <Sub text="Følg Matchly, så du ikke misser det" color={INK} />
      </Frame>,
    ),
    seconds: 3,
    zoom: 1.04,
  })
  // Reels in this series are at most 25 seconds
  const total = out.reduce((t, f) => t + f.seconds, 0)
  if (total > 25) throw new Error(`Afsnittet ville vare ${total} sekunder – højst 25`)
  return out
}

/** The episode's video: each picture slowly zooming, hard cuts, a white flash on the answer from last time */
async function renderVideo(e: QuizEpisode, previous?: QuizEpisode): Promise<void> {
  const frames = await episodeFrames(e, previous)
  const tmp = mkdtempSync(path.join(tmpdir(), 'matchly-quiz-'))
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'
  try {
    const list: string[] = []
    for (const [i, f] of frames.entries()) {
      const pic = path.join(tmp, `${i}.png`)
      const clip = path.join(tmp, `${i}.mp4`)
      writeFileSync(pic, f.png)
      const count = Math.round(f.seconds * 30)
      const vf = [`scale=2160:3840`, `zoompan=z='1+(${f.zoom}-1)*on/${count}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${count}:s=${W}x${H}:fps=30`, ...(f.flash ? ['fade=t=in:st=0:d=0.35:color=white'] : []), 'format=yuv420p'].join(',')
      await exec(ffmpeg, ['-y', '-loglevel', 'error', '-loop', '1', '-i', pic, '-vf', vf, '-frames:v', String(count), '-c:v', 'libx264', '-r', '30', clip], { timeout: 120_000 })
      list.push(`file '${clip}'`)
    }
    writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'))
    mkdirSync(dir(), { recursive: true })
    const target = videoFile(e.n)
    await exec(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', `${target}.tmp.mp4`], { timeout: 120_000 })
    renameSync(`${target}.tmp.mp4`, target)
  } catch (err) {
    const code = (err as { code?: string }).code
    throw new Error(code === 'ENOENT' ? 'ffmpeg findes ikke på serveren – installér det (apt-get install ffmpeg)' : `Videoen kunne ikke laves: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- making an episode

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** A new episode: checks the club and the clues, makes the video and keeps it in the series */
export async function makeEpisode(input: { club: unknown; level: unknown; clues: unknown; caption: unknown; answerNote?: unknown }, by: QuizEpisode['by']): Promise<{ episode?: QuizEpisode; error?: string }> {
  const club = clean(input.club, 60)
  const names = new Set([...Object.keys(await getBadges()), ...Object.keys(nationalTeams())])
  if (!names.has(club)) return { error: `"${club}" har intet logo på Matchly – brug navnet præcis som på sitet (matchly-api soeg)` }
  const list = readSeries()
  if (list.slice(-30).some((e) => e.club === club)) return { error: `${club} har været med inden for de seneste 30 afsnit – vælg en anden klub` }
  const level = (['nem', 'mellem', 'svær'] as const).find((l) => l === input.level)
  if (!level) return { error: 'level skal være "nem", "mellem" eller "svær"' }
  const clues = Array.isArray(input.clues) ? input.clues.map((c) => clean(c, 110)) : []
  if (clues.length !== 3 || clues.some((c) => c.length < 10)) return { error: 'clues skal være tre ledetråde (10–110 tegn), den sværeste først' }
  const lower = club.toLowerCase().replace(/\s+(fc|if|bk|ik|fb)$/i, '')
  if (clues.some((c) => c.toLowerCase().includes(lower))) return { error: 'En ledetråd nævner klubbens navn' }
  const caption = clean(input.caption, 600)
  if (!caption) return { error: 'caption (opslagets tekst) mangler' }
  if (caption.toLowerCase().includes(lower)) return { error: 'Opslagets tekst afslører klubben' }
  const episode: QuizEpisode = { n: (list.at(-1)?.n ?? 0) + 1, club, level, clues: clues as [string, string, string], caption, answerNote: clean(input.answerNote, 90) || undefined, by, createdAt: Date.now() }
  await renderVideo(episode, list.at(-1))
  saveSeries([...list, episode])
  return { episode }
}

/** Marks an episode as posted (or not) */
export function setPosted(n: number, posted: boolean): { error?: string } {
  const list = readSeries()
  const e = list.find((x) => x.n === n)
  if (!e) return { error: 'Afsnittet findes ikke' }
  e.postedAt = posted ? Date.now() : undefined
  saveSeries(list)
  return {}
}

/** Removes the newest episode (to make it again), never an older one: the next episode reveals it */
export function removeNewest(n: number): { error?: string } {
  const list = readSeries()
  if (list.at(-1)?.n !== n) return { error: 'Kun det nyeste afsnit kan slettes' }
  if (list.at(-1)?.postedAt) return { error: 'Afsnittet er lagt op – det kan ikke slettes' }
  saveSeries(list.slice(0, -1))
  rmSync(videoFile(n), { force: true })
  return {}
}
