'use client'

import { useGoalAlerts } from '../hooks/useGoalAlerts'

/** "Målalarm": push messages when the followed teams score, kick off and finish */
export function GoalAlertToggle({ compact = false }: { compact?: boolean }) {
  const { state, error, enable, disable } = useGoalAlerts()
  if (state === 'loading') return null
  if (state === 'insecure' || state === 'unsupported') {
    if (compact) return null
    return (
      <p className="goal-alert__hint">
        {state === 'insecure'
          ? '🔕 Målalarm kræver en sikker forbindelse (https) og kommer, når siden kører på matchly.dk.'
          : '🔕 Denne browser kan ikke vise målalarm. Prøv Chrome, Edge, Firefox eller Safari.'}
      </p>
    )
  }
  if (state === 'ios-install') {
    if (compact) return null
    return (
      <p className="goal-alert__hint">
        🔔 Målalarm på iPhone: tryk på <strong>Del</strong> → <strong>Føj til hjemmeskærm</strong>, åbn Matchly derfra og slå målalarm til.
      </p>
    )
  }
  if (state === 'denied') {
    return compact ? null : <p className="goal-alert__hint">🔕 Målalarm er blokeret i browseren. Tillad notifikationer for siden for at slå den til.</p>
  }
  const on = state === 'on'
  return (
    <span className="goal-alert">
      <button
        type="button"
        className={`goal-alert__btn${on ? ' is-on' : ''}`}
        aria-pressed={on}
        onClick={on ? disable : enable}
        title={on ? 'Slå målalarm fra' : 'Få besked når dine hold scorer, og når kampene starter og slutter'}
      >
        {on ? '🔔 Målalarm til' : '🔕 Slå målalarm til'}
      </button>
      {error && (
        <span className="unverified" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
