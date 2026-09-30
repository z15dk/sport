import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Google Drive through its REST API with a service account (a signed JWT from
// node:crypto – no googleapis package). The photos live in a shared drive where
// the service account is Content manager, so it may move and trash files.

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  md5Checksum?: string
  size?: string
  createdTime?: string
  /** Folder names from the photo folder down to the file, file name last */
  parts: string[]
}

export class DriveError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const FOLDER = 'application/vnd.google-apps.folder'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export function driveClient(serviceAccountFile: string, driveId: string) {
  const key = JSON.parse(readFileSync(serviceAccountFile, 'utf8')) as { client_email: string; private_key: string; token_uri?: string }
  let token: { value: string; until: number } | undefined

  async function accessToken() {
    if (token && Date.now() < token.until) return token.value
    const now = Math.floor(Date.now() / 1000)
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const aud = key.token_uri ?? 'https://oauth2.googleapis.com/token'
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/drive', aud, iat: now, exp: now + 3600 })}`
    const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url')
    const res = await fetch(aud, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string }
    if (!res.ok || !data.access_token) throw new DriveError(`Servicekontoen kunne ikke logge ind: ${data.error_description ?? res.status}`, res.status)
    token = { value: data.access_token, until: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000 }
    return token.value
  }

  /** A Drive call; 429/5xx are retried a few times with growing waits */
  async function call(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(timeoutMs) })
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
        continue
      }
      if (!res.ok) throw new DriveError(`Drive ${init.method ?? 'GET'} ${url.split('?')[0].replace(API, '')}: ${res.status} ${(await res.text()).slice(0, 300)}`, res.status)
      return res
    }
  }

  const common = `supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${encodeURIComponent(driveId)}`

  async function children(folderId: string, extraQ = ''): Promise<Omit<DriveFile, 'parts'>[]> {
    const out: Omit<DriveFile, 'parts'>[] = []
    let page: string | undefined
    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false${extraQ}`)
      const url = `${API}/files?${common}&q=${q}&pageSize=1000&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,md5Checksum,size,createdTime)')}${page ? `&pageToken=${page}` : ''}`
      const data = (await (await call(url)).json()) as { files: Omit<DriveFile, 'parts'>[]; nextPageToken?: string }
      out.push(...data.files)
      page = data.nextPageToken
    } while (page)
    return out
  }

  return {
    /** Every file under the photo folder, skipping the system's own folders (names starting with "_") */
    async listTree(rootId: string, maxDepth = 4): Promise<DriveFile[]> {
      // Drive answers a search in a drive the account cannot see with an empty list, not an error:
      // check the drive and the folder first, so missing access never looks like "no photos"
      try {
        await call(`${API}/drives/${encodeURIComponent(driveId)}?fields=id`)
        await call(`${API}/files/${encodeURIComponent(rootId)}?supportsAllDrives=true&fields=id`)
      } catch (e) {
        if (e instanceof DriveError && e.status === 404) throw new DriveError(`Servicekontoen ${key.client_email} har ikke adgang til det fælles drev eller mappen (tilføj den som Indholdsadministrator, tjek PHOTOS_DRIVE_ID/PHOTOS_FOLDER_ID)`, 404)
        throw e
      }
      const files: DriveFile[] = []
      const queue: { id: string; parts: string[] }[] = [{ id: rootId, parts: [] }]
      while (queue.length) {
        const dir = queue.shift()!
        for (const f of await children(dir.id)) {
          if (f.mimeType === FOLDER) {
            if (!f.name.startsWith('_') && dir.parts.length < maxDepth) queue.push({ id: f.id, parts: [...dir.parts, f.name] })
          } else {
            files.push({ ...f, parts: [...dir.parts, f.name] })
          }
        }
      }
      return files
    },

    async download(fileId: string): Promise<Buffer> {
      const res = await call(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`, {}, 180_000)
      return Buffer.from(await res.arrayBuffer())
    },

    /** The folder's id, created when missing */
    async ensureFolder(name: string, parentId: string): Promise<string> {
      const found = (await children(parentId, ` and name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER}'`))[0]
      if (found) return found.id
      const res = await call(`${API}/files?supportsAllDrives=true&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) })
      return ((await res.json()) as { id: string }).id
    },

    /** Uploads a file, replacing the content of one with the same name in the folder (so a retried run makes no duplicates) */
    async put(name: string, parentId: string, bytes: Buffer, mimeType: string): Promise<string> {
      const existing = (await children(parentId, ` and name = '${name.replace(/'/g, "\\'")}'`))[0]
      if (existing) {
        await call(`${UPLOAD}/files/${existing.id}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: new Uint8Array(bytes) }, 120_000)
        return existing.id
      }
      const boundary = `matchly${Date.now()}`
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ])
      const res = await call(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) }, 120_000)
      return ((await res.json()) as { id: string }).id
    },
  }
}

export type DriveClient = ReturnType<typeof driveClient>
