export function FormChips({ form }: { form: ('V' | 'U' | 'T')[] }) {
  return (
    <span className="form">
      {form.slice(-5).map((f, k) => (
        <span key={k} className={`form__chip form__chip--${f}`} title={f === 'V' ? 'Sejr' : f === 'U' ? 'Uafgjort' : 'Tab'}>
          {f}
        </span>
      ))}
    </span>
  )
}
