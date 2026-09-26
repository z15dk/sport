import { redirect } from 'next/navigation'

/** The English-looking address leads to the test page for social media */
export default function SocialRedirect() {
  redirect('/admin/sociale')
}
