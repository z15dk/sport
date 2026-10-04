'use client'

import { useState } from 'react'

/** A fact sheet as plain text with a button that copies it (to paste into the chat with the writer) */
export function FactSheet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="pill is-active"
          onClick={async () => {
            await navigator.clipboard?.writeText(text).catch(() => undefined)
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
          }}
        >
          {copied ? 'Kopieret ✓' : 'Kopiér faktaark'}
        </button>
        <span className="muted small">{text.split('\n').length} linjer · indsæt det i chatten og bed om artiklen</span>
      </span>
      <textarea readOnly value={text} rows={16} style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 10, border: '1px solid var(--line, #ddd)', borderRadius: 8 }} onFocus={(e) => e.currentTarget.select()} />
    </div>
  )
}
