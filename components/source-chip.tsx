"use client"

import { motion } from "framer-motion"
import { ExternalLink } from "lucide-react"
import { type Fuente, CATEGORIA_LABEL, formatFecha } from "@/lib/types"

export function SourceChip({ fuente, index }: { fuente: Fuente; index: number }) {
  const fecha = formatFecha(fuente.ultima_verificacion)
  const url = fuente.url?.trim()

  // 16 de los 133 trámites del corpus no tienen categorías cargadas y caen al
  // fallback "general", que como badge no aporta nada y encima se ve en
  // minúscula al lado de títulos capitalizados. En esos casos no se muestra.
  const categoriaCruda = fuente.categoria?.trim() ?? ""
  const hayCategoria = categoriaCruda !== "" && categoriaCruda.toLowerCase() !== "general"
  const categoria = CATEGORIA_LABEL[categoriaCruda] ?? categoriaCruda

  // Dos subtrámites del mismo trámite comparten título y URL: sin el subtrámite
  // se veían como dos chips duplicados, uno al lado del otro.
  const titulo = fuente.subtramite ? `${fuente.tramite} — ${fuente.subtramite}` : fuente.tramite

  const animacion = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.15 + index * 0.08, duration: 0.3, ease: "easeOut" as const },
  }

  const clasesBase = "group flex flex-col gap-1.5 rounded-xl border border-border bg-background px-4 py-3 text-left"

  const contenido = (
    <>
      {(hayCategoria || url) && (
        <div className="flex items-center gap-2">
          {hayCategoria && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{categoria}</span>
          )}
          {url && (
            <ExternalLink
              className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          )}
        </div>
      )}
      <span className="font-medium leading-snug text-foreground">{titulo}</span>
      {fecha && <span className="text-sm text-muted-foreground">verificado el {fecha}</span>}
    </>
  )

  // Parte del corpus curado no tiene URL oficial. Sin ella no hay nada que
  // abrir: se renderiza como bloque, no como enlace, para no ofrecer una
  // navegación que no existe.
  if (!url) {
    return (
      <motion.div {...animacion} className={clasesBase}>
        {contenido}
      </motion.div>
    )
  }

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      // El aviso de "pestaña nueva" va en el nombre accesible y no como texto
      // dentro del chip: antes era un <span className="sr-only"> que terminaba
      // leyéndose en pantalla.
      aria-label={`${titulo}. Abre la fuente oficial en una pestaña nueva.`}
      {...animacion}
      className={`${clasesBase} transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
    >
      {contenido}
    </motion.a>
  )
}
