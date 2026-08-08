import { Fragment } from "react"

// Renderiza texto plano del modelo con soporte para:
// - listas numeradas (1. 2. 3.)
// - listas con viñetas (- o *)
// - negrita **texto**
// - párrafos
// No usamos una librería de markdown para mantener el control tipográfico y la accesibilidad.

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

export function FormattedText({ text }: { text: string }) {
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
        if (block.type === "ol") {
          return (
            <ol key={i} className="space-y-2.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {j + 1}
                  </span>
                  <span className="pt-0.5">{renderInline(item, `ol-${i}-${j}`)}</span>
                </li>
              ))}
            </ol>
          )
        }
        return (
          <ul key={i} className="space-y-2">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{renderInline(item, `ul-${i}-${j}`)}</span>
              </li>
            ))}
          </ul>
        )
      })}
    </div>
  )
}
