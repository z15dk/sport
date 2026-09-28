import 'server-only'
import { socialConfig, socialSecrets } from './socialStore'

// Mails from the site (the social media engine's approval mails), through the
// SMTP server typed in on /admin/sociale/indstillinger.

export function mailReady() {
  const { email } = socialConfig()
  return !!(email.host && email.to && (email.from || email.user))
}

export async function sendMail(subject: string, html: string, text: string) {
  const { email } = socialConfig()
  if (!mailReady()) throw new Error('Mail er ikke sat op')
  const nodemailer = (await import('nodemailer')).default
  const transport = nodemailer.createTransport({
    host: email.host,
    port: email.port || 587,
    secure: email.secure || email.port === 465,
    auth: email.user ? { user: email.user, pass: socialSecrets().smtp.pass ?? '' } : undefined,
  })
  await transport.sendMail({ from: email.from || email.user, to: email.to, subject, html, text })
}
