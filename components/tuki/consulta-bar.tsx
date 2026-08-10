'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Send, Square } from 'lucide-react'

const MAX_LEN = 1000

// Tipos mínimos para la Web Speech API (no está en los tipos estándar del DOM)
type SpeechRecognitionResult = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: (e: SpeechRecognitionResult) => void
  onend: () => void
  onerror: () => void
}

/**
 * Barra de consulta del rediseño: pill clara sobre el fondo oscuro,
 * con dictado por voz y botón de envío naranja.
 * El foco se muestra en el contenedor (:focus-within), no en el input.
 */
export function ConsultaBar({
  onSubmit,
  disabled,
}: {
  onSubmit: (pregunta: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const [micSupported, setMicSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
      SpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return

    setMicSupported(true)
    const recognition = new Ctor()
    recognition.lang = 'es-AR'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      setValue((prev) => (prev ? prev + ' ' : '') + transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition

    return () => {
      try {
        recognition.stop()
      } catch {
        // ignorar
      }
    }
  }, [])

  const toggleMic = () => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
      return
    }
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="bg-tuki-field border-tuki-line flex items-center gap-2.5 rounded-full border py-2.5 pl-[clamp(18px,2vw,28px)] pr-2.5 shadow-[0_18px_44px_rgba(0,0,0,.25)] focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-[3px] focus-within:outline-[var(--tuki-focus)]"
      >
        <label htmlFor="consulta" className="sr-only">
          Escribí tu consulta
        </label>
        <input
          id="consulta"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          placeholder="Escribí tu consulta..."
          autoComplete="off"
          disabled={disabled}
          className="text-tuki-field-fg placeholder:text-tuki-field-ph min-w-0 flex-1 bg-transparent text-[clamp(16px,1.3vw,20px)] font-medium outline-none disabled:opacity-60"
        />

        <a
          href="https://wa.me/?text=Hola%2C%20quiero%20consultar%20sobre%20un%20tr%C3%A1mite%20en%20Salta"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contactar por WhatsApp"
          className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-colors hover:bg-[#20bd5a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tuki-focus)]"
          title="Contactar por WhatsApp"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
          </svg>
        </a>

        {micSupported && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={disabled}
            aria-label={listening ? 'Detener dictado por voz' : 'Dictar consulta por voz'}
            aria-pressed={listening}
            className={`relative flex size-[46px] shrink-0 items-center justify-center rounded-full border border-[rgba(11,18,36,.15)] transition-colors disabled:opacity-40 ${
              listening
                ? 'bg-red-500/15 text-red-700'
                : 'text-tuki-field-fg hover:bg-[rgba(11,18,36,.06)]'
            }`}
          >
            {listening && (
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500/20" aria-hidden />
            )}
            {listening ? (
              <Square className="relative z-10 size-4 fill-current" aria-hidden />
            ) : (
              <Mic className="size-5" strokeWidth={1.9} aria-hidden />
            )}
          </button>
        )}

        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label="Enviar consulta"
          className="text-tuki-ink flex size-[52px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FF9440,#F0760F)] shadow-[0_8px_20px_#F5811F55] transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="size-5 fill-current" strokeWidth={0} aria-hidden />
        </button>
      </form>

      {value.length > MAX_LEN - 100 && (
        <p className="text-tuki-dim mt-1.5 pr-4 text-right text-xs">
          {value.length}/{MAX_LEN}
        </p>
      )}
    </div>
  )
}
