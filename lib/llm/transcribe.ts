/**
 * Abstracción de transcripción de audio (STT) para el soporte de notas de voz.
 * Usa un endpoint compatible con OpenAI /audio/transcriptions.
 */

/**
 * Transcribe audio desde un buffer usando el proveedor STT configurado.
 * Usa el endpoint compatible con OpenAI /audio/transcriptions.
 * El proveedor y la clave provienen del env var STT_PROVIDER_KEY.
 * Si STT_PROVIDER_KEY no está configurado, se omite la transcripción.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<string | null> {
  const sttKey = process.env.STT_PROVIDER_KEY
  if (!sttKey) {
    console.warn(
      '[transcribe] STT_PROVIDER_KEY not configured, skipping transcription'
    )
    return null
  }

  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
  const ext = mimeToExt(mimeType)
  const fname = filename || `audio.${ext}`

  const formData = new FormData()
  const bytes = new Uint8Array(audioBuffer)
  formData.append('file', new Blob([bytes], { type: mimeType }), fname)
  formData.append('model', 'whisper-1')
  formData.append('language', 'es')

  try {
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sttKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      console.error(
        `[transcribe] STT error ${response.status}: ${await response.text()}`
      )
      return null
    }

    const data = await response.json()
    return data.text || null
  } catch (error) {
    console.error('[transcribe] Failed:', error)
    return null
  }
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/amr': 'amr',
    'audio/aac': 'aac',
  }
  return map[mime] || 'ogg'
}
