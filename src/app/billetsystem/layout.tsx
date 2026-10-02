// The ticket system's own styles load only under /billetsystem (its forms use the widget page's buttons, wg-btn)
import '../widget/widget.css'
import './billetsystem.css'

export default function TicketSystemLayout({ children }: { children: React.ReactNode }) {
  return children
}
