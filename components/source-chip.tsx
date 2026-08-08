"use client"

import { motion } from "framer-motion"
import { ExternalLink } from "lucide-react"
import { type Fuente, CATEGORIA_LABEL, formatFecha } from "@/lib/types"

export function SourceChip({ fuente, index }: { fuente: Fuente; index: number }) {
  const fecha = formatFecha(fuente.ultima_verificacion)
  const categoria = CATEGORIA_LABEL[fuente.categoria] ?? fuente.categoria

  return (
    <motion.a
      href={fuente.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.08, duration: 0.3, ease: "easeOut" }}
      className="group flex flex-col gap-1 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{categoria}</span>
        <ExternalLink
          className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
      <span className="font-medium leading-snug text-foreground">{fuente.tramite}</span>
      {fecha && <span className="text-sm text-muted-foreground">verificado el {fecha}</span>}
      <span className="sr-only">Abrir fuente oficial en una pestaña nueva</span>
    </motion.a>
  )
}
