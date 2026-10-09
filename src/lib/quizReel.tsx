import 'server-only'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'
import { ogFonts } from './ogImage'
import { cacheDir } from './tsdb'
import { clubLogoAndColor, namesWithLogo } from './vsGraphic'

// "Gæt klubben" – a quiz series for Reels (1080×1920, at most 25 seconds). Each episode opens with what the game is
// (three clues, guess in the comments, the answer next time), then the answer to the one before ("Svaret fra afsnit N-1"), asks a new club with three text clues from hard to easy, and ends without the
// answer ("Svaret kommer i næste afsnit") – so the answer is the hook of the next one. James (deploy/claude-editor/
// QUIZ.md) picks the club and writes the clues three times a week through /api/redaktor/quiz; the owner sees the
// videos on /admin/sociale/quiz and posts them. Drawn as a sports poster in Matchly's colours (lime, ink, paper, the club's colour) by
// the share pictures' renderer, put together by ffmpeg. The series in data/quiz/serie.json, the videos next to it.

const exec = promisify(execFile)
const W = 1080
const H = 1920
const INK = '#0f110c'
const LIME = '#c6f135'
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
  /** The day it is planned to go out (YYYY-MM-DD): Monday, Wednesday or Friday, in order */
  plannedFor?: string
}

const dir = () => path.join(/*turbopackIgnore: true*/ cacheDir(), 'data', 'quiz')
const file = () => path.join(dir(), 'serie.json')
export const videoFile = (n: number) => path.join(dir(), `afsnit-${n}.mp4`)
/** The series' sound (the owner's own track), put on every episode: the same length and cuts in all of them */
export const soundFile = () => path.join(dir(), 'lyd.m4a')
/** Every episode's length in seconds (see episodeFrames) */
export const EPISODE_SECONDS = 24

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

/** Episodes James keeps ready ahead: two weeks at three a week */
export const AHEAD = 6
const QUIZ_DAYS = new Set([1, 3, 5])

/** The next quiz day (Monday, Wednesday, Friday) after a day (YYYY-MM-DD), or from tomorrow */
function nextQuizDay(after?: string): string {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }))
  const d = after ? new Date(`${after}T12:00:00Z`) : new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12))
  do d.setUTCDate(d.getUTCDate() + 1)
  while (!QUIZ_DAYS.has(d.getUTCDay()))
  return d.toISOString().slice(0, 10)
}

/** What James needs: the episodes so far (clubs used, the levels), the next number and whose answer it will open with */
export async function seriesBrief() {
  const list = readSeries()
  const names = [...(await namesWithLogo())]
  const ready = list.filter((e) => !e.postedAt).length
  return {
    next: (list.at(-1)?.n ?? 0) + 1,
    // How many are made and not posted yet, and how many more to make now to be two weeks ahead
    ready,
    toMake: Math.max(0, AHEAD - ready),
    revealsInNext: list.at(-1) ? { n: list.at(-1)!.n, club: list.at(-1)!.club } : null,
    episodes: list.map((e) => ({ n: e.n, club: e.club, level: e.level, plannedFor: e.plannedFor, posted: !!e.postedAt })),
    clubsWithLogo: names.length,
  }
}

// ---------------------------------------------------------------- drawing

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

/** Black or white text on a club's colour, whichever reads */
const onColour = (rgb: string) => {
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(rgb) ?? /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(rgb)
  if (!m) return '#ffffff'
  const [r, g, b] = m.slice(1, 4).map((v) => (v.length === 2 && /[a-f]/i.test(v) ? parseInt(v, 16) : Number(v.length === 2 && !/^\d+$/.test(v) ? parseInt(v, 16) : v)))
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? INK : '#ffffff'
}

const PAPER = '#f4f4ef'
/** The paper's halftone dots */
const paper = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><pattern id="d" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="3.2" fill="rgba(15,17,12,0.12)"/></pattern></defs><rect width="${W}" height="${H}" fill="${PAPER}"/><rect width="${W}" height="${H}" fill="url(#d)"/></svg>`).toString('base64')}`

const Big = ({ children, size, color, style }: { children: React.ReactNode; size: number; color: string; style?: React.CSSProperties }) => (
  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', fontSize: size, fontWeight: 800, fontStyle: 'italic', lineHeight: 0.84, textTransform: 'uppercase', color, ...style }}>{children}</div>
)
const Small = ({ text, color, style }: { text: string; color: string; style?: React.CSSProperties }) => (
  <div style={{ position: 'absolute', display: 'flex', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 46, letterSpacing: 6, color, ...style }}>{text.toUpperCase()}</div>
)
/** A strip of tape across the picture, its words repeated, tilted */
const Tape = ({ text, top, angle, bg, fg }: { text: string; top: number; angle: number; bg: string; fg: string }) => (
  <div style={{ position: 'absolute', left: -220, top, width: W + 440, display: 'flex', padding: '22px 0', background: bg, color: fg, fontSize: 70, fontWeight: 800, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', transform: `rotate(${angle}deg)` }}>
    {Array.from({ length: 6 }, () => `${text.toUpperCase()}  •  `).join('')}
  </div>
)
const Mark = ({ color, dot = ORANGE, style }: { color: string; dot?: string; style?: React.CSSProperties }) => (
  <div style={{ position: 'absolute', left: 65, bottom: 70, display: 'flex', fontSize: 86, fontWeight: 800, fontStyle: 'italic', color, ...style }}>
    MATCHLY<span style={{ color: dot }}>.</span>
  </div>
)
/** A clue's words, those in **…** with a lime marker stroke behind */
const clueWords = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).flatMap((part, i) => {
    const marked = part.startsWith('**')
    return part
      .replace(/\*\*/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w, j) => (
        <span key={`${i}-${j}`} style={{ marginRight: '0.22em', ...(marked && { padding: '0 8px', backgroundImage: 'linear-gradient(180deg, rgba(198,241,53,0) 18%, rgba(198,241,53,1) 18%, rgba(198,241,53,1) 90%, rgba(198,241,53,0) 90%)' }) }}>
          {w}
        </span>
      ))
  })
const plain = (text: string) => text.replace(/\*\*/g, '')

/** The episode's pictures in order, with how long each is shown and how it moves – in the look of a sports poster */
async function episodeFrames(e: QuizEpisode, previous?: QuizEpisode): Promise<{ png: Buffer; seconds: number; zoom: number; flash?: boolean }[]> {
  const out: { png: Buffer; seconds: number; zoom: number; flash?: boolean }[] = []
  const no = String(e.n).padStart(2, '0')
  const shell = (bg: string, children: React.ReactNode, image?: string) => (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', overflow: 'hidden', background: bg, fontFamily: 'Barlow' }}>
      {image && <img src={image} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />}
      {children}
    </div>
  )
  // What the game is, first, so a new viewer understands it
  out.push({
    png: await png(
      shell(
        LIME,
        <>
          <Big size={400} color={INK} style={{ left: 60, top: 150 }}>
            <span>Gæt</span>
            <span>klub-</span>
            <span>ben</span>
          </Big>
          <Tape text={`Afsnit ${no} • Svær`} top={1270} angle={-7} bg={INK} fg={LIME} />
          <div style={{ position: 'absolute', left: 65, top: 1500, width: W - 130, display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 58, lineHeight: 1.35, color: INK }}>
            <span>3 ledetråde.</span>
            <span>Dit gæt i kommentarerne.</span>
            <span>Svaret i næste afsnit.</span>
          </div>
          <Mark color={INK} />
        </>,
      ),
    ),
    seconds: 4,
    zoom: 1.03,
  })
  // The same two slots in every episode (the answer from last time, or for the first one what the series is), so every
  // episode has the same length and cuts at the same moments – one sound for all
  if (!previous) {
    out.push({
      png: await png(
        shell(
          PAPER,
          <>
            <Small text="Ny serie" color={INK} style={{ left: 65, top: 90 }} />
            <Big size={300} color={INK} style={{ left: 60, top: 300 }}>
              <span>Første</span>
              <span>afsnit</span>
            </Big>
            <Tape text="Gæt klubben • Ny serie" top={1330} angle={6} bg={LIME} fg={INK} />
            <Mark color={INK} />
          </>,
          paper,
        ),
      ),
      seconds: 2,
      zoom: 1.06,
    })
    out.push({
      png: await png(
        shell(
          INK,
          <>
            <Small text="Hver uge" color={LIME} style={{ left: 65, top: 90 }} />
            <Big size={250} color={LIME} style={{ left: 60, top: 330 }}>
              <span>Ny klub</span>
              <span>mandag,</span>
              <span>onsdag og</span>
              <span>fredag</span>
            </Big>
            <Mark color="#ffffff" />
          </>,
        ),
      ),
      seconds: 4,
      zoom: 1.05,
      flash: true,
    })
  }
  if (previous) {
    const prevNo = String(previous.n).padStart(2, '0')
    out.push({
      png: await png(
        shell(
          PAPER,
          <>
            <Small text={`Afsnit ${prevNo}`} color={INK} style={{ left: 65, top: 90 }} />
            <Big size={250} color={INK} style={{ left: 60, top: 320, width: W - 120 }}>
              <span>Fik du</span>
              <span>den sid-</span>
              <span>ste gang?</span>
            </Big>
            <Tape text={`Svaret fra afsnit ${prevNo}`} top={1330} angle={6} bg={LIME} fg={INK} />
            <Mark color={INK} />
          </>,
          paper,
        ),
      ),
      seconds: 2,
      zoom: 1.06,
    })
    const { logo, color, flag } = await clubLogoAndColor(previous.club, 900)
    const glow = await logoGlow(logo, color)
    const fg = onColour(glow)
    const name = previous.club
    out.push({
      png: await png(
        shell(
          glow,
          <>
            <Small text={`Svaret fra afsnit ${prevNo}`} color={fg} style={{ left: 65, top: 90 }} />
            {logo && (flag ? <img src={logo} width={900} height={600} alt="" style={{ position: 'absolute', left: 380, top: 300, borderRadius: 30, transform: 'rotate(-8deg)' }} /> : <img src={logo} width={980} height={980} alt="" style={{ position: 'absolute', left: 340, top: 190, transform: 'rotate(-8deg)' }} />)}
            <div style={{ position: 'absolute', left: 60, top: 1180, width: W - 120, display: 'flex', flexDirection: 'column', gap: 30 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: name.length > 16 ? 150 : name.length > 10 ? 190 : 250, fontWeight: 800, fontStyle: 'italic', lineHeight: 0.86, textTransform: 'uppercase', color: fg }}>{name}</div>
              {previous.answerNote && <div style={{ display: 'flex', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 50, color: fg }}>{previous.answerNote}</div>}
            </div>
            <Mark color={fg} dot={fg === INK ? ORANGE : INK} />
          </>,
        ),
      ),
      seconds: 4,
      zoom: 1.05,
      flash: true,
    })
  }
  for (let i = 0; i < 3; i++) {
    const text = e.clues[i]
    const len = plain(text).length
    out.push({
      png: await png(
        shell(
          PAPER,
          <>
            <div style={{ position: 'absolute', left: -110, top: -160, display: 'flex', fontSize: 1250, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, color: 'rgba(198,241,53,0.55)' }}>{String(i + 1)}</div>
            <Small text={`Ledetråd ${i + 1} / 3`} color={INK} style={{ left: 65, top: 90 }} />
            <div style={{ position: 'absolute', left: 65, top: 600, width: W - 120, display: 'flex', flexWrap: 'wrap', fontSize: len > 85 ? 112 : len > 65 ? 128 : 146, fontWeight: 800, fontStyle: 'italic', lineHeight: 0.98, textTransform: 'uppercase', color: INK }}>{clueWords(text)}</div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, display: 'flex', gap: 16 }}>
              {[0, 1, 2].map((k) => (
                <div key={k} style={{ flex: 1, background: k <= i ? INK : '#d9dccf' }} />
              ))}
            </div>
            <Mark color={INK} style={{ bottom: 100 }} />
          </>,
          paper,
        ),
      ),
      seconds: 4,
      zoom: 1.05,
    })
  }
  out.push({
    png: await png(
      shell(
        INK,
        <>
          <Big size={330} color={LIME} style={{ left: 60, top: 200 }}>
            <span>Hvem</span>
            <span>er</span>
            <span>det?</span>
          </Big>
          <Tape text="Svaret i næste afsnit • Følg Matchly" top={1270} angle={5} bg={LIME} fg={INK} />
          <div style={{ position: 'absolute', left: 65, top: 1520, width: W - 130, display: 'flex', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 58, color: '#ffffff' }}>Skriv dit gæt i kommentarerne</div>
          <Mark color="#ffffff" />
        </>,
      ),
    ),
    seconds: 2,
    zoom: 1.04,
  })
  // Every episode the same 24 seconds with every cut on a bar of 120 BPM (2 seconds a bar: 2+1+2+2+2+2+1 bars) – one
  // sound for the whole series, made to the bars (Suno), fits every episode
  const total = Math.round(out.reduce((t, f) => t + f.seconds, 0) * 10) / 10
  if (total !== EPISODE_SECONDS || out.length !== 7) throw new Error(`Afsnittet har en anden tidsplan (${total} sek., ${out.length} billeder) end serien`)
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
    // The series' sound on it, when the owner has given one
    if (hasSound()) {
      await exec(ffmpeg, ['-y', '-loglevel', 'error', '-i', `${target}.tmp.mp4`, '-i', soundFile(), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', `${target}.lyd.mp4`], { timeout: 120_000 })
      renameSync(`${target}.lyd.mp4`, `${target}.tmp.mp4`)
    }
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
  const names = await namesWithLogo()
  if (!names.has(club)) return { error: `"${club}" har intet logo på Matchly – brug navnet præcis som på sitet (matchly-api soeg)` }
  const list = readSeries()
  if (list.slice(-30).some((e) => e.club === club)) return { error: `${club} har været med inden for de seneste 30 afsnit – vælg en anden klub` }
  const level = (['nem', 'mellem', 'svær'] as const).find((l) => l === input.level)
  if (!level) return { error: 'level skal være "nem", "mellem" eller "svær"' }
  const clues = Array.isArray(input.clues) ? input.clues.map((c) => clean(c, 114)) : []
  if (clues.length !== 3 || clues.some((c) => c.length < 10)) return { error: 'clues skal være tre ledetråde (10–110 tegn), den sværeste først' }
  const lower = club.toLowerCase().replace(/\s+(fc|if|bk|ik|fb)$/i, '')
  if (clues.some((c) => c.toLowerCase().includes(lower))) return { error: 'En ledetråd nævner klubbens navn' }
  const caption = clean(input.caption, 600)
  if (!caption) return { error: 'caption (opslagets tekst) mangler' }
  if (caption.toLowerCase().includes(lower)) return { error: 'Opslagets tekst afslører klubben' }
  if (list.filter((e) => !e.postedAt).length >= AHEAD + 3) return { error: `Der ligger allerede ${AHEAD + 3} afsnit klar – vent til nogle er lagt op` }
  // Planned for the quiz day after the last one planned (or posted), never in the past
  const last = list.at(-1)?.plannedFor
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' })
  const plannedFor = last && last >= today ? nextQuizDay(last) : nextQuizDay()
  const episode: QuizEpisode = { n: (list.at(-1)?.n ?? 0) + 1, club, level, clues: clues as [string, string, string], caption, answerNote: clean(input.answerNote, 90) || undefined, by, createdAt: Date.now(), plannedFor }
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

// ---------------------------------------------------------------- the sound

export const hasSound = () => {
  try {
    return statSync(soundFile()).size > 0
  } catch {
    return false
  }
}

/** The owner's track as the series' sound: made exactly one episode long (cut with a short fade, or silence after it), AAC */
export async function saveSound(bytes: Buffer): Promise<{ error?: string }> {
  if (bytes.length > 25 * 1024 * 1024) return { error: 'Lydfilen må højst fylde 25 MB' }
  const tmp = mkdtempSync(path.join(tmpdir(), 'matchly-lyd-'))
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'
  try {
    const input = path.join(tmp, 'ind')
    writeFileSync(input, bytes)
    mkdirSync(dir(), { recursive: true })
    const fade = EPISODE_SECONDS - 0.4
    await exec(ffmpeg, ['-y', '-loglevel', 'error', '-i', input, '-vn', '-af', `apad=whole_dur=${EPISODE_SECONDS},afade=t=out:st=${fade}:d=0.4`, '-t', String(EPISODE_SECONDS), '-c:a', 'aac', '-b:a', '192k', `${soundFile()}.tmp.m4a`], { timeout: 60_000 })
    renameSync(`${soundFile()}.tmp.m4a`, soundFile())
    return {}
  } catch (err) {
    const code = (err as { code?: string }).code
    return { error: code === 'ENOENT' ? 'ffmpeg findes ikke på serveren – installér det (apt-get install ffmpeg)' : 'Filen kunne ikke læses som lyd (brug mp3, m4a eller wav)' }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export function removeSound() {
  rmSync(soundFile(), { force: true })
}

/** The series' sound put on (or replacing the sound of) every episode's video so far; without a sound, they are left */
export async function soundOnAll(): Promise<{ done: number; error?: string }> {
  if (!hasSound()) return { done: 0, error: 'Der er ingen lyd endnu' }
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'
  let done = 0
  for (const e of readSeries()) {
    if (!hasVideo(e.n)) continue
    const target = videoFile(e.n)
    await exec(ffmpeg, ['-y', '-loglevel', 'error', '-i', target, '-i', soundFile(), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', `${target}.lyd.mp4`], { timeout: 120_000 })
    renameSync(`${target}.lyd.mp4`, target)
    done++
  }
  return { done }
}

/** The unposted episodes' videos made again from their clues (after a change to the look or the timing), in order */
export async function rerenderUnposted(): Promise<number> {
  const list = readSeries()
  let done = 0
  for (const [i, e] of list.entries()) {
    if (e.postedAt) continue
    await renderVideo(e, list[i - 1])
    done++
  }
  return done
}
