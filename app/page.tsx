"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { ChatMessage } from "@/lib/types"
import { ExampleCards } from "@/components/example-cards"
import { UserMessage } from "@/components/user-message"
import { BotMessage } from "@/components/bot-message"
import { ThinkingIndicator } from "@/components/thinking-indicator"
import { ChatInput } from "@/components/chat-input"
import { FichaPrint } from "@/components/ficha-print"
import { Header } from "@/components/header"
import { ArrowDown } from "lucide-react"

let idCounter = 0
const nextId = () => `m-${Date.now()}-${idCounter++}`

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [printMessage, setPrintMessage] = useState<ChatMessage | null>(null)
  const [showFab, setShowFab] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isEmpty = messages.length === 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  // Lógica del botón flotante para volver abajo
  useEffect(() => {
    const div = scrollRef.current
    if (!div) return

    const handleScroll = () => {
      // Mostrar el FAB si el usuario scrollea hacia arriba (más de 150px desde el fondo)
      const distanceFromBottom = div.scrollHeight - div.scrollTop - div.clientHeight
      setShowFab(distanceFromBottom > 150)
    }

    div.addEventListener("scroll", handleScroll)
    return () => div.removeEventListener("scroll", handleScroll)
  }, [])

  const handleNewChat = useCallback(() => {
    setMessages([])
    setLoading(false)
  }, [])

  const enviar = useCallback(
    async (pregunta: string) => {
      if (loading) return
      const userMsg: ChatMessage = { id: nextId(), role: "user", texto: pregunta }
      setMessages((prev) => [...prev, userMsg])
      setLoading(true)

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta }),
        })
        const data = await res.json().catch(() => ({}))

        if (res.status === 429) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "bot",
              texto: data?.respuesta ?? "Esperá un momento antes de la próxima consulta.",
              estado: "rate_limit",
            },
          ])
          return
        }

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "bot",
              texto:
                data?.respuesta ??
                "Tuvimos un problema procesando tu consulta. Probá de nuevo en un momento.",
              estado: "error",
            },
          ])
          return
        }

        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "bot",
            pregunta,
            texto: data.respuesta ?? "",
            fuentes: data.fuentes ?? [],
            estado: "ok",
          },
        ])
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "bot",
            texto:
              "No pudimos conectarnos. Revisá tu conexión a internet y volvé a intentar en un momento.",
            estado: "error",
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
    <div className="flex h-dvh flex-col bg-background">
      <Header onNewChat={handleNewChat} />

      {/* Conversación */}
      <div ref={scrollRef} className="no-print flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {isEmpty ? (
            <div className="flex min-h-[calc(100dvh-16rem)] items-center justify-center">
              <ExampleCards onPick={enviar} />
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} texto={m.texto} />
                ) : (
                  <BotMessage key={m.id} message={m} onDownload={handleDownload} />
                ),
              )}
              <AnimatePresence>{loading && <ThinkingIndicator />}</AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <AnimatePresence>
        {showFab && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
            }}
            className="fixed bottom-24 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-28 sm:right-8"
            aria-label="Volver abajo"
          >
            <ArrowDown className="size-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input fijo */}
      <div className="no-print border-t border-border bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          <ChatInput onSubmit={enviar} disabled={loading} />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Ventanilla responde solo con información oficial cargada. Verificá siempre en la fuente citada.
          </p>
        </div>
      </div>

      {/* Vista imprimible (oculta en pantalla) */}
      <FichaPrint message={printMessage} />
    </div>
  )
}
