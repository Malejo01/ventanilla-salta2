export type Fuente = {
  tramite: string
  // Opcional: hay trámites del corpus curado sin URL oficial (por ejemplo
  // `salta-activa-plataformas`). En esos casos la clave se omite del JSON en
  // vez de mandar string vacío, que renderizaba un <a href=""> apuntando a la
  // propia página.
  url?: string
  categoria: string
  ultima_verificacion: string | null
  // Solo se pueblan con el corpus v2 (USAR_CORPUS_V2). Opcionales para que el
  // camino viejo siga tipando y para no romper clientes que no los esperan.
  subtramite?: string | null
  slug?: string
}

export type ChatMessage = {
  id: string
  role: "user" | "bot"
  pregunta?: string // solo para asociar la consulta original en respuestas del bot
  texto: string
  fuentes?: Fuente[]
  estado?: "error" | "rate_limit" | "ok"
  // Qué camino del backend produjo la respuesta. Ausente = el camino normal de
  // retrieval. "catalogo" son las respuestas a "¿qué trámites puedo hacer?", que
  // se arman con el listado completo de áreas en vez de con chunks recuperados
  // (por eso vienen sin fuentes) y que la interfaz no debe plegar: ahí la lista
  // ES la respuesta. Campo aditivo — un cliente que no lo conozca lo ignora y
  // sigue funcionando igual que antes.
  modo?: "catalogo"
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
