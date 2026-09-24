import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="page">
      <div className="panel empty">
        <h1 className="feed__title">Siden findes ikke</h1>
        <p>
          Kampen, klubben eller turneringen kunne ikke findes. <Link href="/">Se dagens kampe</Link>.
        </p>
      </div>
    </div>
  )
}
