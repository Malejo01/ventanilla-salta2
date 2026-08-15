"use client"

import { Fragment, useState } from "react"

// Renderiza texto plano del modelo con soporte para:
// - listas numeradas (1. 2. 3.)
// - listas con viñetas (- o *)
// - negrita **texto**
// - párrafos
// No usamos una librería de markdown para mantener el control tipográfico y la accesibilidad.

// Cuántos ítems se muestran antes de plegar el resto detrás de "Ver más".
const ITEMS_VISIBLES = 3

function renderInline(text: string, keyPrefix: string) {
  // Divide por **negrita**
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>
  })
}

type Block =
  | { type: "p"; text: string }
  | { type: "ol"; items: string[] }
  | { type: "ul"; items: string[] }

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n")
  const blocks: Block[] = []
  let current: Block | null = null

  const flush = () => {
    if (current) {
      blocks.push(current)
      current = null
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === "") {
      flush()
      continue
    }
    const olMatch = line.match(/^(\d+)[.)]\s+(.*)$/)
    const ulMatch = line.match(/^[-*•]\s+(.*)$/)

    if (olMatch) {
      if (current?.type !== "ol") {
        flush()
        current = { type: "ol", items: [] }
      }
      current.items.push(olMatch[2])
    } else if (ulMatch) {
      if (current?.type !== "ul") {
        flush()
        current = { type: "ul", items: [] }
      }
      current.items.push(ulMatch[1])
    } else {
      if (current?.type !== "p") {
        flush()
        current = { type: "p", text: line }
      } else {
        current.text += " " + line
      }
    }
  }
  flush()
  return blocks
}

// Lista con los ítems que exceden ITEMS_VISIBLES plegados detrás de un botón.
//
// Antes el resto se ocultaba con el texto "Hay N punto(s) más. Si querés, te los
// detallo.", que se leía como si lo estuviera diciendo Tuki: la persona
// respondía que sí y no pasaba nada, porque era la interfaz truncando, no el
// asistente ofreciendo. Ahora es un control de interfaz explícito.
function ListaPlegable({
  items,
  kind,
  keyPrefix,
  plegable,
}: {
  items: string[]
  kind: "ol" | "ul"
  keyPrefix: string
  plegable: boolean
}) {
  const [expandida, setExpandida] = useState(false)
  const ocultos = plegable ? Math.max(0, items.length - ITEMS_VISIBLES) : 0
  const visibles = expandida || !plegable ? items : items.slice(0, ITEMS_VISIBLES)

  return (
    <div className="space-y-2 rounded-xl bg-secondary/35 p-3">
      {kind === "ol" ? (
        visibles.map((item, j) => (
          <p key={j} className="text-pretty text-[0.98rem] leading-relaxed">
            {renderInline(`Paso ${j + 1}: ${item.trim()}`, `${keyPrefix}-${j}`)}
          </p>
        ))
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
          {visibles.map((item, j) => (
            <li key={j} className="text-pretty text-[0.98rem] leading-relaxed">
              {renderInline(item.trim(), `${keyPrefix}-${j}`)}
            </li>
          ))}
        </ul>
      )}

      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setExpandida((v) => !v)}
          aria-expanded={expandida}
          className="rounded text-sm font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expandida ? "Ver menos" : `Ver ${ocultos} ${ocultos === 1 ? "punto" : "puntos"} más`}
        </button>
      )}
    </div>
  )
}

// `plegable` en false apaga el plegado de listas. Lo usa la respuesta de
// catálogo ("¿qué trámites puedo hacer?"): ahí la lista de áreas no es un anexo
// de la respuesta, ES la respuesta, y mostrar 3 de 16 detrás de "Ver 13 puntos
// más" contesta justo lo contrario de lo que se preguntó.
export function FormattedText({ text, plegable = true }: { text: string; plegable?: boolean }) {
  const blocks = parseBlocks(text)

  return (
    <div className="space-y-4 leading-relaxed text-foreground">
      {blocks.map((block, i) => {
        if (block.type === "p") {
          return (
            <p key={i} className="text-pretty">
              {renderInline(block.text, `p-${i}`)}
            </p>
          )
        }
        return (
          <ListaPlegable
            key={i}
            items={block.items}
            kind={block.type}
            keyPrefix={`${block.type}-${i}`}
            plegable={plegable}
          />
        )
      })}
    </div>
  )
}
