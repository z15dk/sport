import { OG_SIZE, ogImage } from '../lib/ogImage'

// The share picture for every page that has none of its own
export const alt = 'Matchly – live resultater, kampprogram og stillinger'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return ogImage({ title: 'Live resultater og dagens kampe', sub: 'Fodbold, ishockey og basketball – resultater, stillinger og statistik' })
}
