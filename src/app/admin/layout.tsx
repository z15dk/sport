// The admin pages' own styles (src/app/admin/admin.css) load only under /admin, not on the public pages
import './admin.css'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
