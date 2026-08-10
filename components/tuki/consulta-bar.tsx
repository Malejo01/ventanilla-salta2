'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Send, Square } from 'lucide-react'

const MAX_LEN = 1000

// Dictado por voz apagado: con micrófono real sigue sin enviarse la consulta.
// Hay un fix aplicado (ver docs/dictado-por-voz.md) que corrige una causa
// confirmada, pero no alcanzó, así que falta al menos una causa más. Se apaga la
// entrada por voz hasta poder diagnosticarla con un micrófono de verdad; la
// consulta por texto no está afectada. Poner en true para retomar el diagnóstico.
const VOZ_HABILITADA = false

// Tipos mínimos para la Web Speech API (no está en los tipos estándar del DOM)
type SpeechRecognitionResult = {
  // `results` acumula TODOS los tramos de la sesión, no solo el nuevo; `resultIndex`
  // marca desde dónde empieza lo que todavía no leímos.
  results: ArrayLike<ArrayLike<{ transcript: string }>>
  resultIndex?: number
}
type SpeechRecognitionError = {
  error?: string
}
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: (e: SpeechRecognitionResult) => void
  onend: () => void
  onerror: (e: SpeechRecognitionError) => void
}

/**
 * El navegador pide permiso de micrófono solo al llamar a start(); si el usuario
 * lo rechaza (o el sitio no está en HTTPS) el fallo llega por onerror y hay que
 * contarlo, porque si no el botón se apaga sin explicación.
 */
function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'No pudimos usar el micrófono. Revisá los permisos del navegador para este sitio.'
    case 'no-speech':
      return 'No llegamos a escucharte. Probá de nuevo.'
    case 'audio-capture':
      return 'No encontramos un micrófono conectado.'
    case 'network':
      return 'El dictado por voz necesita conexión a internet.'
    default:
      return 'No pudimos completar el dictado por voz. Probá de nuevo o escribí tu consulta.'
  }
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
  const [micError, setMicError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // El objeto de reconocimiento se crea una sola vez, así que sus handlers verían
  // siempre las props del primer render. Estos refs les dan acceso a los valores
  // actuales; valueRef además evita depender de que React haya vuelto a renderizar
  // entre onresult y onend, que llegan uno detrás del otro.
  const valueRef = useRef(value)
  const onSubmitRef = useRef(onSubmit)
  const disabledRef = useRef(disabled)
  const dictadoPendienteRef = useRef('')

  useEffect(() => {
    onSubmitRef.current = onSubmit
    disabledRef.current = disabled
  })

  const actualizarValor = (siguiente: string) => {
    valueRef.current = siguiente
    setValue(siguiente)
  }

  useEffect(() => {
    if (!VOZ_HABILITADA) return
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
      let transcript = ''
      for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
        transcript += e.results[i]?.[0]?.transcript ?? ''
      }
      if (!transcript.trim()) return
      // Si antes avisamos que no escuchábamos, el texto que llega desmiente el aviso.
      setMicError(null)
      const combinado = (valueRef.current ? valueRef.current + ' ' : '') + transcript
      actualizarValor(combinado)
      dictadoPendienteRef.current = combinado
    }

    // Al soltar el micrófono (por silencio o por el botón de stop) mandamos lo
    // dictado sin pedir un click extra, que es el punto del dictado por voz.
    recognition.onend = () => {
      setListening(false)
      const pendiente = dictadoPendienteRef.current.trim()
      dictadoPendienteRef.current = ''
      if (!pendiente || disabledRef.current) return
      actualizarValor('')
      onSubmitRef.current(pendiente)
    }

    recognition.onerror = (e) => {
      const codigo = e?.error
      // Chrome emite 'aborted' y 'no-speech' como parte del flujo normal: el primero
      // al cortar el reconocimiento (incluso después de haber entregado el texto), el
      // segundo ante cualquier pausa. Tratarlos como fatales era lo que apagaba la
      // animación a mitad de la frase y descartaba el dictado sin enviarlo.
      if (codigo === 'aborted') return
      if (codigo === 'no-speech') {
        // Solo avisamos si de verdad no llegó nada; de apagar `listening` se encarga
        // onend, que siempre llega después.
        if (!dictadoPendienteRef.current) setMicError(mensajeDeError(codigo))
        return
      }
      dictadoPendienteRef.current = ''
      setListening(false)
      setMicError(mensajeDeError(codigo))
    }

    recognitionRef.current = recognition

    return () => {
      // Desconectamos los handlers antes de frenar: si no, el stop() del desmontaje
      // dispararía onend y enviaría la consulta sobre un componente que ya no está.
      recognition.onresult = () => {}
      recognition.onend = () => {}
      recognition.onerror = () => {}
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
      return
    }
    setMicError(null)
    dictadoPendienteRef.current = ''
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const submit = () => {
    const trimmed = valueRef.current.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    actualizarValor('')
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
          onChange={(e) => actualizarValor(e.target.value.slice(0, MAX_LEN))}
          placeholder={listening ? 'Escuchando... hablá y lo enviamos solo' : 'Escribí tu consulta...'}
          autoComplete="off"
          disabled={disabled}
          className="text-tuki-field-fg placeholder:text-tuki-field-ph min-w-0 flex-1 bg-transparent text-[clamp(16px,1.3vw,20px)] font-medium outline-none disabled:opacity-60"
        />

        {VOZ_HABILITADA && micSupported && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={disabled}
            aria-label={listening ? 'Detener dictado y enviar' : 'Dictar consulta por voz'}
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

      {VOZ_HABILITADA && (
        <p aria-live="polite" className="min-h-0">
          {micError && <span className="mt-1.5 block pl-4 text-xs text-red-500">{micError}</span>}
          {!micError && listening && (
            <span className="text-tuki-dim mt-1.5 block pl-4 text-xs">
              Escuchando... cuando termines de hablar enviamos tu consulta.
            </span>
          )}
        </p>
      )}

      {value.length > MAX_LEN - 100 && (
        <p className="text-tuki-dim mt-1.5 pr-4 text-right text-xs">
          {value.length}/{MAX_LEN}
        </p>
      )}
    </div>
  )
}
