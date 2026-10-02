import 'server-only'
import { socialConfig, socialSecrets } from './socialStore'

// Mails from the site (the social media engine's approval mails, the
// capacity warning), through the SMTP server typed in on
// /admin/sociale/indstillinger.

export function mailReady() {
  const { email } = socialConfig()
  return !!(email.host && email.to && (email.from || email.user))
}

export interface MailResult {
  from: string
  to: string
  /** The addresses the SMTP server took, and those it refused */
  accepted: string[]
  rejected: string[]
  /** The server's last reply (e.g. "250 2.0.0 OK queued as …") */
  response: string
  messageId: string
}

/** The SMTP error with the server's own words, for the admin pages */
export function mailErrorText(err: unknown) {
  if (!(err instanceof Error)) return 'Mailen kunne ikke sendes'
  const e = err as Error & { code?: string; response?: string; responseCode?: number; command?: string }
  const parts = [e.message]
  if (e.response && !e.message.includes(e.response)) parts.push(`Serveren svarede: ${e.response}`)
  if (e.code === 'ESOCKET' || e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT') parts.push('Ingen forbindelse til SMTP-serveren: tjek vært, port og om "SSL fra start" passer til porten (465 = til, 587 = fra).')
  if (e.code === 'EAUTH') parts.push('Brugernavn eller adgangskode blev afvist.')
  return parts.join(' · ')
}

export async function sendMail(subject: string, html: string, text: string): Promise<MailResult> {
  const { email } = socialConfig()
  if (!mailReady()) throw new Error('Mail er ikke sat op')
  const nodemailer = (await import('nodemailer')).default
  const transport = nodemailer.createTransport({
    host: email.host,
    port: email.port || 587,
    secure: email.secure || email.port === 465,
    auth: email.user ? { user: email.user, pass: socialSecrets().smtp.pass ?? '' } : undefined,
    // A server that does not answer must not hold an admin request for minutes
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  const from = email.from || email.user
  const info = await transport.sendMail({ from, to: email.to, subject, html, text })
  return {
    from,
    to: email.to,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: info.response ?? '',
    messageId: info.messageId ?? '',
  }
}
