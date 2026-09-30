import { FatalError, PhotoError, PROMPT, QuotaError, TransientError, parseVisionJson, type VisionProvider, type VisionResult } from './vision.ts'

// Gemini (Google AI Studio's free tier). The key goes in a header, never in the
// URL, so it cannot end up in a log.

export function geminiProvider(apiKey: string, model: string, timeoutMs = 90_000): VisionProvider {
  return {
    name: 'gemini',
    async analyze(jpeg: Buffer): Promise<VisionResult> {
      const body = {
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: jpeg.toString('base64') } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }
      let res: Response
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (e) {
        throw new TransientError(`Gemini svarede ikke: ${(e as Error).message}`)
      }
      const text = await res.text()
      if (res.status === 429 || /RESOURCE_EXHAUSTED/.test(text)) throw new QuotaError(`Gemini-kvoten er brugt (${res.status}): ${message(text)}`)
      if (res.status === 401 || res.status === 403) throw new FatalError(`Gemini afviste nøglen (${res.status}): ${message(text)}`)
      if (res.status === 404) throw new FatalError(`Gemini-modellen "${model}" kan ikke bruges (404) – ret GEMINI_MODEL: ${message(text)}`)
      if (res.status >= 500) throw new TransientError(`Gemini-fejl ${res.status}: ${message(text)}`)
      if (!res.ok) throw new PhotoError(`Gemini afviste billedet (${res.status}): ${message(text)}`)
      let data: { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } }
      try {
        data = JSON.parse(text)
      } catch {
        throw new TransientError('Gemini sendte et svar, der ikke kunne læses')
      }
      if (data.promptFeedback?.blockReason) throw new PhotoError(`Gemini ville ikke se billedet (${data.promptFeedback.blockReason})`)
      const cand = data.candidates?.[0]
      const out = cand?.content?.parts?.map((p) => p.text ?? '').join('')
      if (!out) throw new PhotoError(`Gemini gav intet svar (${cand?.finishReason ?? 'ukendt grund'})`)
      return parseVisionJson(out, model)
    },
  }
}

function message(text: string) {
  try {
    return String((JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text).slice(0, 300)
  } catch {
    return text.slice(0, 300)
  }
}
