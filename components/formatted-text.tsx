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

  const toFriendlyLines = (items: string[], kind: "ol" | "ul") => {
    const visible = items.slice(0, 3)
    return visible.map((item, idx) =>
      kind === "ol" ? `Paso ${idx + 1}: ${item.trim()}` : `Dato clave: ${item.trim()}`,
    )
  }

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
          const friendlyLines = toFriendlyLines(block.items, "ol")
          const hiddenCount = Math.max(0, block.items.length - friendlyLines.length)
          return (
            <div key={i} className="space-y-2 rounded-xl bg-secondary/35 p-3">
              {friendlyLines.map((line, j) => (
                <p key={j} className="text-pretty text-[0.98rem] leading-relaxed">
                  {renderInline(line, `ol-${i}-${j}`)}
                </p>
              ))}
              {hiddenCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  Hay {hiddenCount} punto(s) más. Si querés, te los detallo.
                </p>
              )}
            </div>
          )
        }
        const friendlyLines = toFriendlyLines(block.items, "ul")
        const hiddenCount = Math.max(0, block.items.length - friendlyLines.length)
        return (
          <div key={i} className="space-y-2 rounded-xl bg-secondary/35 p-3">
            {friendlyLines.map((line, j) => (
              <p key={j} className="text-pretty text-[0.98rem] leading-relaxed">
                {renderInline(line, `ul-${i}-${j}`)}
              </p>
            ))}
            {hiddenCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Hay {hiddenCount} punto(s) más. Si querés, te los detallo.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
