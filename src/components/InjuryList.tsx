import Link from 'next/link'
import { injuryReason, type Injury } from '../data/teamStats'
import { playerPath } from '../data/player'
import { sizedImage } from '../lib/imageSize'

/** Injured and suspended players: out or doubtful, with the reason */
export function InjuryList({ list, compact = false }: { list: Injury[]; compact?: boolean }) {
  return (
    <ul className={`injuries${compact ? ' injuries--compact' : ''}`}>
      {list.map((i) => (
        <li key={`${i.playerId ?? i.player}-${i.fixtureId}`}>
          {i.photo ? <img className="injuries__photo" src={sizedImage(i.photo, 32)} alt="" width={32} height={32} loading="lazy" /> : <span className="injuries__photo" />}
          <span className="injuries__who">
            {i.playerId ? <Link href={playerPath(i.playerId, i.player)}>{i.player}</Link> : i.player}
            <em>{injuryReason(i.reason)}</em>
          </span>
          <span className={`injuries__type${i.type === 'Questionable' ? ' is-doubt' : ''}`}>{i.type === 'Questionable' ? 'Tvivlsom' : 'Ude'}</span>
        </li>
      ))}
    </ul>
  )
}
