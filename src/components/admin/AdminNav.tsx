import { AdminBarFlag, AdminSubNav } from '../AdminBar'

// The admin pages' menu lives in the admin bar at the top (AdminBar, menu in
// src/lib/adminMenu.ts); this keeps the bar's flag cookie set on the admin pages
// and shows the current section's sub-pages as tabs above the page.

/** Kept on every admin page; `current` is no longer needed (the bar and the tabs read the address) */
export function AdminNav({ current }: { current?: string }) {
  void current
  return (
    <>
      <AdminBarFlag />
      <AdminSubNav />
    </>
  )
}
