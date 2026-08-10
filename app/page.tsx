'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ChatMessage } from '@/lib/types'
import { UserMessage } from '@/components/user-message'
import { BotMessage } from '@/components/bot-message'
import { FichaPrint } from '@/components/ficha-print'
import { TukiHeader } from '@/components/tuki/tuki-header'
import { TukiHero } from '@/components/tuki/tuki-hero'
import { ConsultaBar } from '@/components/tuki/consulta-bar'
import { ConsultasFrecuentes } from '@/components/tuki/consultas-frecuentes'
import { PanelBeneficios } from '@/components/tuki/panel-beneficios'
import { BandaSeguridad } from '@/components/tuki/banda-seguridad'

let idCounter = 0
const nextId = () => `m-${Date.now()}-${idCounter++}`

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [chatSessionId, setChatSessionId] = useState(0)
  const [printMessage, setPrintMessage] = useState<ChatMessage | null>(null)
  const conversacionRef = useRef<HTMLDivElement>(null)
  const audioBienvenidaRef = useRef<HTMLAudioElement>(null)
  const ultimoAudioMensajeBotIdRef = useRef<string | null>(null)
  const reduceMotion = useReducedMotion()

  const hayConversacion = messages.length > 0

  // Al llegar una respuesta nueva, llevamos la vista al final de la conversación.
  useEffect(() => {
    if (!hayConversacion) return
    conversacionRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [messages, loading, hayConversacion, reduceMotion])

  // Reproduce audio cada vez que entra una respuesta nueva del bot.
  useEffect(() => {
    const ultimoMensaje = messages[messages.length - 1]
    if (!ultimoMensaje || ultimoMensaje.role !== 'bot') return
    if (ultimoMensaje.estado !== 'ok') return
    if (ultimoAudioMensajeBotIdRef.current === ultimoMensaje.id) return

    ultimoAudioMensajeBotIdRef.current = ultimoMensaje.id

    const audio = audioBienvenidaRef.current
    if (!audio) return

    const playRespuesta = async () => {
      try {
        audio.currentTime = 0
        await audio.play()
      } catch {
        // Si el navegador bloquea audio, fallamos silenciosamente.
      }
    }

    void playRespuesta()
  }, [messages])

  const handleNewChat = useCallback(() => {
    setMessages([])
    setLoading(false)
    setChatSessionId((prev) => prev + 1)
  }, [])

  const enviar = useCallback(
    async (pregunta: string) => {
      if (loading) return
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', texto: pregunta }])
      setLoading(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pregunta }),
        })
        const data = await res.json().catch(() => ({}))

        if (res.status === 429) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'bot',
              texto: data?.respuesta ?? 'Esperá un momento antes de la próxima consulta.',
              estado: 'rate_limit',
            },
          ])
          return
        }

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'bot',
              texto:
                data?.respuesta ??
                'Tuvimos un problema procesando tu consulta. Probá de nuevo en un momento.',
              estado: 'error',
            },
          ])
          return
        }

        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'bot',
            pregunta,
            texto: data.respuesta ?? '',
            fuentes: data.fuentes ?? [],
            estado: 'ok',
          },
        ])
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'bot',
            texto:
              'No pudimos conectarnos. Revisá tu conexión a internet y volvé a intentar en un momento.',
            estado: 'error',
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [loading],
  )

  const handleDownload = useCallback((message: ChatMessage) => {
    setPrintMessage(message)
    // Esperamos a que la ficha se renderice antes de imprimir
    setTimeout(() => window.print(), 60)
  }, [])

  return (
    <div className="tuki-canvas text-tuki-fg min-h-dvh px-[clamp(14px,3vw,34px)] pb-[34px]">
      <audio ref={audioBienvenidaRef} src="/tuki/SonidoBienvenida.ogg" preload="auto" aria-hidden />

      <TukiHeader onNewChat={handleNewChat} />

      <div className="no-print mx-auto flex w-full max-w-[1560px] flex-wrap items-start gap-[clamp(16px,2vw,26px)]">
        <main className="flex min-w-[min(100%,320px)] flex-1 basis-[620px] flex-col gap-[clamp(18px,2vw,26px)]">
          <TukiHero pensando={loading} />

          <ConsultaBar key={chatSessionId} onSubmit={enviar} disabled={loading} />

          {/* Conversación inline: solo aparece cuando hay una consulta enviada.
              La región aria-live va en este wrapper, que está SIEMPRE montado: un
              live region que entra al DOM junto con su contenido no se anuncia. */}
          <div aria-live="polite">
            <AnimatePresence initial={false}>
              {hayConversacion && (
                <motion.div
                  ref={conversacionRef}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="bg-tuki-panel2 border-tuki-line flex flex-col gap-3 rounded-[26px] border px-[22px] py-5"
                >
                  {messages.map((m) =>
                    m.role === 'user' ? (
                      <UserMessage key={m.id} texto={m.texto} />
                    ) : (
                      <BotMessage key={m.id} message={m} onDownload={handleDownload} />
                    ),
                  )}

                  {loading && (
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1.5" aria-hidden>
                        {[0, 0.18, 0.36].map((delay) => (
                          <span
                            key={delay}
                            className="tuki-dot bg-tuki-accent size-2 rounded-full"
                            style={{ animationDelay: `${delay}s` }}
                          />
                        ))}
                      </span>
                      <span className="text-tuki-dim text-[15px] font-semibold">
                        Tuki está pensando…
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <ConsultasFrecuentes onPick={enviar} disabled={loading} />

          <p className="text-tuki-dim text-sm">
            Tuki responde solo con información oficial cargada. Verificá siempre en la fuente citada.
          </p>
        </main>

        <div className="min-w-[min(100%,300px)] flex-1 basis-[340px]">
          <PanelBeneficios />
        </div>
      </div>

      <div className="no-print">
        <BandaSeguridad />
      </div>

      {/* Vista imprimible (oculta en pantalla) */}
      <FichaPrint message={printMessage} />
    </div>
  )
}
