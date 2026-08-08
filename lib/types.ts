export type Fuente = {
  tramite: string
  url: string
  categoria: string
  ultima_verificacion: string | null
}

export type ChatMessage = {
  id: string
  role: "user" | "bot"
  pregunta?: string // solo para asociar la consulta original en respuestas del bot
  texto: string
  fuentes?: Fuente[]
  estado?: "error" | "rate_limit" | "ok"
}

export const CATEGORIA_LABEL: Record<string, string> = {
  comercial: "Comercial",
  social: "Social",
  transito: "Tránsito",
  infraestructura: "Infraestructura",
}

export function formatFecha(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
}
