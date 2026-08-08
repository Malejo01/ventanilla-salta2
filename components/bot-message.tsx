"use client"

import { motion } from "framer-motion"
import { AlertTriangle, Download, ShieldCheck } from "lucide-react"
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
  const tieneFuentes = message.fuentes && message.fuentes.length > 0
  const esError = message.estado === "error" || message.estado === "rate_limit"

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
        <span className="text-sm font-medium text-muted-foreground">Respuesta oficial de Ventanilla</span>
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
                <SourceChip key={`${fuente.url}-${i}`} fuente={fuente} index={i} />
              ))}
            </div>

            <div className="mt-5 flex">
              <button
                type="button"
                onClick={() => onDownload(message)}
                className="no-print inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Download className="size-4" aria-hidden="true" />
                Descargar ficha
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
