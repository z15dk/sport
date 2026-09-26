import { permanentRedirect } from 'next/navigation'

/** Moved into the admin pages */
export default function OldStatusPage() {
  permanentRedirect('/admin/kvalitet')
}
