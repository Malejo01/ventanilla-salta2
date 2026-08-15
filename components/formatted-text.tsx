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

// Un ítem de lista y a qué profundidad venía escrito. `nivel` es 0 o 1: la
// sangría del texto del modelo se conservaba perdida hasta ahora porque el
// parser hacía trim() antes de mirarla, y los sub-ítems terminaban como
// hermanos de sus padres. Se veía en la respuesta de catálogo: "Licencia de
// conducir" y "Taxis y remises", que el modelo escribe con sangría adentro de
// "Automotor", se renderizaban como dos áreas más de primer nivel, y la lista
// parecía contar los mismos trámites dos veces.
type Item = { texto: string; nivel: number }

type Block =
  | { type: "p"; text: string }
  | { type: "ol"; items: Item[] }
  | { type: "ul"; items: Item[] }

// Un solo nivel de anidamiento. Más profundidad en una respuesta de chat se lee
// peor que ninguna, y el modelo no la produce: la instrucción de catálogo pide
// explícitamente un solo nivel.
const NIVEL_MAX = 1
// Dos espacios alcanzan para considerar que hay sangría. El modelo suele usar
// cuatro, pero conviene no depender del número exacto.
const SANGRIA_MINIMA = 2

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
    // La sangría se mide ANTES del trim, que es lo que faltaba.
    const sangria = raw.length - raw.trimStart().length
    const nivel = Math.min(sangria >= SANGRIA_MINIMA ? 1 : 0, NIVEL_MAX)

    const olMatch = line.match(/^(\d+)[.)]\s+(.*)$/)
    const ulMatch = line.match(/^[-*•]\s+(.*)$/)

    if (olMatch) {
      if (current?.type !== "ol") {
        flush()
        current = { type: "ol", items: [] }
      }
      current.items.push({ texto: olMatch[2], nivel })
    } else if (ulMatch) {
      if (current?.type !== "ul") {
        flush()
        current = { type: "ul", items: [] }
      }
      current.items.push({ texto: ulMatch[1], nivel })
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

// Agrupa la lista plana en árbol de un nivel: cada ítem con nivel 1 cuelga del
// último de nivel 0. Un nivel 1 sin padre (el modelo abrió con sangría) se
// promueve a nivel 0 en vez de descartarse.
type Nodo = { item: Item; hijos: Item[] }

function anidar(items: Item[]): Nodo[] {
  const nodos: Nodo[] = []
  for (const item of items) {
    if (item.nivel === 0 || nodos.length === 0) {
      nodos.push({ item: { ...item, nivel: 0 }, hijos: [] })
    } else {
      nodos[nodos.length - 1].hijos.push(item)
    }
  }
  return nodos
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
  items: Item[]
  kind: "ol" | "ul"
  keyPrefix: string
  plegable: boolean
}) {
  const [expandida, setExpandida] = useState(false)

  // El plegado cuenta ítems de primer nivel: un sub-ítem no es "un punto más",
  // es parte del punto que tiene arriba. Si se contaran todos, "Ver 2 puntos
  // más" podría estar escondiendo un solo tema.
  const nodos = anidar(items)
  const ocultos = plegable ? Math.max(0, nodos.length - ITEMS_VISIBLES) : 0
  const visibles = expandida || !plegable ? nodos : nodos.slice(0, ITEMS_VISIBLES)

  return (
    <div className="space-y-2 rounded-xl bg-secondary/35 p-3">
      {kind === "ol" ? (
        visibles.map((n, j) => (
          <div key={j} className="space-y-1">
            <p className="text-pretty text-[0.98rem] leading-relaxed">
              {renderInline(`Paso ${j + 1}: ${n.item.texto.trim()}`, `${keyPrefix}-${j}`)}
            </p>
            {n.hijos.length > 0 && (
              <ul className="list-disc space-y-1 pl-9 marker:text-muted-foreground">
                {n.hijos.map((h, k) => (
                  <li key={k} className="text-pretty text-[0.94rem] leading-relaxed">
                    {renderInline(h.texto.trim(), `${keyPrefix}-${j}-${k}`)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
          {visibles.map((n, j) => (
            <li key={j} className="text-pretty text-[0.98rem] leading-relaxed">
              {renderInline(n.item.texto.trim(), `${keyPrefix}-${j}`)}
              {n.hijos.length > 0 && (
                // <ul> anidado de verdad, no sangría con padding: así el lector
                // de pantalla anuncia la jerarquía en vez de leer todo plano.
                <ul className="mt-1.5 list-[circle] space-y-1 pl-5 marker:text-muted-foreground">
                  {n.hijos.map((h, k) => (
                    <li key={k} className="text-pretty text-[0.94rem] leading-relaxed">
                      {renderInline(h.texto.trim(), `${keyPrefix}-${j}-${k}`)}
                    </li>
                  ))}
                </ul>
              )}
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
