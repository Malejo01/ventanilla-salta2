"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Send, Square } from "lucide-react"

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

export function ChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (pregunta: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState("")
  const [listening, setListening] = useState(false)
  const [micSupported, setMicSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
      SpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return

    setMicSupported(true)
    const recognition = new Ctor()
    recognition.lang = "es-AR"
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ""
      setValue((prev) => (prev ? prev + " " : "") + transcript)
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

  // Auto-resize del textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [value])

  const toggleMic = () => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      try {
        rec.start()
        setListening(true)
      } catch {
        setListening(false)
      }
    }
  }

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue("")
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-2 shadow-lg shadow-black/5 focus-within:border-primary/40">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            // Enviar con Enter, respetando composición de IMEs
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              (e.nativeEvent as unknown as { keyCode?: number }).keyCode !== 229
            ) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="Escribí tu consulta sobre trámites de Salta…"
          aria-label="Escribí tu consulta"
          className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none"
        />

        {micSupported && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={disabled}
            aria-label={listening ? "Detener dictado por voz" : "Dictar por voz"}
            aria-pressed={listening}
            className={`relative flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 ${
              listening
                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                : "bg-secondary text-foreground hover:bg-secondary/70"
            }`}
          >
            {listening && (
              <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping opacity-75" />
            )}
            {listening ? <Square className="relative z-10 size-4 fill-current" /> : <Mic className="size-5" />}
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Enviar consulta"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        >
          <Send className="size-5" />
        </button>
      </div>

      {value.length > MAX_LEN - 100 && (
        <p className="px-3 pb-1 pt-0.5 text-right text-xs text-muted-foreground">{value.length}/{MAX_LEN}</p>
      )}
    </div>
  )
}
