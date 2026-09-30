const WORD = { V: 'Sejr', U: 'Uafgjort', T: 'Tab' } as const

/** The last five results: letters in boxes, or (in tables) dots, the latest on the right */
export function FormChips({ form, dots }: { form: ('V' | 'U' | 'T')[]; dots?: boolean }) {
  const last = form.slice(-5)
  if (dots) {
    return (
      <span className="form-dots" title={`Seneste ${last.length}: ${last.map((f) => WORD[f]).join(', ')}`}>
        {last.map((f, k) => (
          <i key={k} className={`form-dot form-dot--${f}${k === last.length - 1 ? ' is-last' : ''}`} />
        ))}
        <span className="sr-only">Seneste kampe: {last.map((f) => WORD[f]).join(', ')}</span>
      </span>
    )
  }
  return (
    <span className="form">
      {last.map((f, k) => (
        <span key={k} className={`form__chip form__chip--${f}`} title={WORD[f]}>
          {f}
        </span>
      ))}
    </span>
  )
}
