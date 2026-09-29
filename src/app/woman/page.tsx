import { permanentRedirect } from 'next/navigation'

// The page's English name leads to the Danish address
export default function Woman() {
  permanentRedirect('/kvindesport')
}
