import { AdminBarFlag } from '../AdminBar'

// The admin pages' menu now lives in the admin bar at the top (AdminBar, menu in
// src/lib/adminMenu.ts); this keeps the bar's flag cookie set on the admin pages.

/** Kept on every admin page; `current` is no longer needed (the bar reads the address) */
export function AdminNav({ current }: { current?: string }) {
  void current
  return <AdminBarFlag />
}
