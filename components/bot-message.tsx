"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Download, ShieldCheck, Copy, Check, Share2, ThumbsUp, ThumbsDown, Flag } from "lucide-react"
import type { ChatMessage } from "@/lib/types"
import { FormattedText } from "@/components/formatted-text"
import { SourceChip } from "@/components/source-chip"

export function BotMessage({
  message,
  onDownload,
}: {
  message: ChatMessage
  onDownload: (message: ChatMessage) => void
}) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null)

  const tieneFuentes = message.fuentes && message.fuentes.length > 0
  const esError = message.estado === "error" || message.estado === "rate_limit"

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.texto)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Error al copiar", err)
    }
  }

  const handleShare = async () => {
    const shareData = {
      title: "Respuesta de Tuki — Trámites de Salta",
      text: message.texto,
      url: window.location.href,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        // Fallback WhatsApp
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message.texto)}`, "_blank")
      }
    } catch (err) {
      console.error("Error compartiendo", err)
    }
  }

  if (esError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-5 py-4"
        role="alert"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <p className="leading-relaxed text-foreground">{message.texto}</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      {/* Encabezado de la ficha */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-5 py-3">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-muted-foreground">Respuesta oficial de Tuki</span>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <FormattedText text={message.texto} />

        {tieneFuentes && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Fuentes oficiales
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {message.fuentes!.map((fuente, i) => (
                <SourceChip key={`${fuente.slug ?? fuente.tramite}-${fuente.subtramite ?? ""}-${i}`} fuente={fuente} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barra de acciones (Toolbar) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/30 px-5 py-2.5 sm:px-6">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFeedback("up")}
            className={`flex size-8 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              feedback === "up" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            aria-label="Respuesta útil"
          >
            <ThumbsUp className="size-4" />
          </button>
          <button
            onClick={() => setFeedback("down")}
            className={`flex size-8 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              feedback === "down" ? "bg-destructive/20 text-destructive" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            aria-label="Respuesta no útil"
          >
            <ThumbsDown className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Copiar respuesta"
          >
            {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
          </button>
          <button
            onClick={handleShare}
            className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Compartir respuesta"
          >
            <Share2 className="size-3.5" />
            <span className="hidden sm:inline">Compartir</span>
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          <button
            onClick={() => onDownload(message)}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            title="Descargar ficha"
            aria-label="Descargar ficha"
          >
            <Download className="size-4" />
          </button>
          <button
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            title="Reportar información incorrecta"
            aria-label="Reportar información incorrecta"
          >
            <Flag className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
