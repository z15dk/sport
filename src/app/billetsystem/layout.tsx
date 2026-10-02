import { serif } from '../fonts'
// The ticket system's own styles load only under /billetsystem (its forms use the widget page's buttons, wg-btn).
// The pages have their own, more exclusive look (dark, gold, a serif for headlines): the theme lives on this wrapper.
import '../widget/widget.css'
import './billetsystem.css'

export default function TicketSystemLayout({ children }: { children: React.ReactNode }) {
  return <div className={`bs-theme ${serif.variable}`}>{children}</div>
}
