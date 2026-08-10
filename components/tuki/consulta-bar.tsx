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
