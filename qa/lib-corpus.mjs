// Helpers compartidos por los scripts de qa del corpus v2.
// Sin dependencias: fetch nativo contra Gemini y contra PostgREST.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

// Busca .env.local / .env subiendo desde qa/. Sirve tanto en el checkout
// principal como en un worktree (donde el .env suele vivir en el repo padre).
export function cargarEnv() {
  const candidatos = []
  let dir = AQUI
  for (let i = 0; i < 6; i += 1) {
    candidatos.push(path.join(dir, '.env.local'), path.join(dir, '.env'))
    const padre = path.dirname(dir)
    if (padre === dir) break
    dir = padre
  }
  const env = {}
  for (const f of candidatos.reverse()) {
    if (!fs.existsSync(f)) continue
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  const faltan = ['GEMINI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k])
  if (faltan.length) {
    throw new Error(`Faltan variables (${faltan.join(', ')}). Buscadas en .env.local/.env desde ${AQUI} hacia arriba.`)
  }
  return env
}

export const env = cargarEnv()

const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }

export const sb = (tabla, query = '') =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tabla}?${query}`, { headers: H }).then((r) => r.json())

export const sbHeaders = H

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// taskType importa: las consultas van con RETRIEVAL_QUERY y los documentos con
// RETRIEVAL_DOCUMENT. Son espacios distintos (coseno ~0.83 entre uno y otro).
export async function embed(texto, taskType = 'RETRIEVAL_QUERY') {
  for (let intento = 1; intento <= 4; intento += 1) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: texto }] },
          outputDimensionality: 768,
          ...(taskType ? { taskType } : {}),
        }),
      },
    )
    if (res.ok) {
      const v = (await res.json()).embedding.values
      if (!Array.isArray(v) || v.length !== 768) throw new Error(`embedding con dims ${v?.length}`)
      return v
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`embed ${res.status}: ${await res.text()}`)
    await sleep(500 * intento)
  }
  throw new Error('embed: reintentos agotados')
}

export async function rpcMatch(queryEmbedding, { matchCount = 5, filtroCategoria = null, excluirInstitucional = true } = {}) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/match_tramite_chunks_v2`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filtro_categoria: filtroCategoria,
      excluir_institucional: excluirInstitucional,
    }),
  })
  if (!res.ok) throw new Error(`rpc ${res.status}: ${await res.text()}`)
  return res.json()
}

export function slugToNombre(slug) {
  const s = String(slug ?? '').replace(/-/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Espejo de diversificarPorTramite() en app/api/chat/route.ts
export const POOL_COUNT = 30
export const MAX_CHUNKS_POR_TRAMITE = 2
export const DELTA_COMPETENCIA = 0.05

export function diversificarPorTramite(chunks, maxPorTramite = MAX_CHUNKS_POR_TRAMITE, limite = 5) {
  const top = chunks[0]
  if (!top) return []
  // El tope se aplica solo si otro trámite compite con el del top-1.
  const hayCompetencia = chunks.some(
    (c) => c.slug !== top.slug && c.similarity >= top.similarity - DELTA_COMPETENCIA,
  )
  if (!hayCompetencia) return chunks.slice(0, limite)

  const cuenta = new Map()
  const elegidos = []
  for (const c of chunks) {
    if (elegidos.length >= limite) break
    const clave = c.slug ?? '' // solo slug, igual que route.ts
    const vistos = cuenta.get(clave) ?? 0
    if (vistos >= maxPorTramite) continue
    cuenta.set(clave, vistos + 1)
    elegidos.push(c)
  }
  return elegidos
}

// Pipeline de retrieval completo del camino v2, igual que recuperarV2().
// Devuelve también el pool crudo para poder diagnosticar qué quedó afuera.
export async function recuperar(consulta, { limite = 5 } = {}) {
  const pool = await rpcMatch(await embed(consulta, 'RETRIEVAL_QUERY'), { matchCount: POOL_COUNT })
  return { pool, chunks: diversificarPorTramite(pool, MAX_CHUNKS_POR_TRAMITE, limite) }
}

// Espejo de tituloChunkV2() en app/api/chat/route.ts
export function tituloChunk(c) {
  const titulo = c.titulo_tramite?.trim() || slugToNombre(c.slug ?? '')
  const sub = c.subtramite?.trim()
  return sub ? `${titulo} — ${sub}` : titulo
}

// Espejo del dedup de recuperarV2() en app/api/chat/route.ts: slug + subtrámite.
export function construirFuentes(chunks) {
  const vistos = new Set()
  const fuentes = []
  for (const c of chunks) {
    const slug = c.slug?.trim() ?? ''
    const subtramite = c.subtramite?.trim() || null
    const clave = `${slug}|${subtramite ?? ''}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    fuentes.push({
      tramite: c.titulo_tramite?.trim() || slugToNombre(slug),
      subtramite,
      slug,
      url: c.url_origen ?? '',
      categoria: c.categorias?.[0] ?? 'general',
      ultima_verificacion: c.fecha_scraping ?? null,
    })
  }
  return fuentes
}

// Espejo del armado de contexto de recuperarV2()
export function construirContexto(chunks) {
  return chunks
    .map((c) => `[Fuente: ${tituloChunk(c)} | ${c.url_origen ?? ''}]\n${c.texto_display ?? ''}\n---`)
    .join('\n')
}

// Lee el SYSTEM_PROMPT del propio route.ts para no desincronizarse de la app.
export function systemPrompt() {
  const ruta = path.join(AQUI, '..', 'app', 'api', 'chat', 'route.ts')
  const m = fs.readFileSync(ruta, 'utf8').match(/const SYSTEM_PROMPT = `([\s\S]*?)`\r?\n/)
  if (!m) throw new Error('No pude extraer SYSTEM_PROMPT de app/api/chat/route.ts')
  return m[1]
}

export async function generar(pregunta, contexto) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents: [{ role: 'user', parts: [{ text: `CONTEXTO:\n${contexto}\n\nPREGUNTA DEL CIUDADANO:\n${pregunta}` }] }],
        generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  )
  if (!res.ok) throw new Error(`generateContent ${res.status}: ${await res.text()}`)
  const d = await res.json()
  return (d?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim()
}

// Las 13 consultas del test de regresión: 4 de las cards de la home, 6 típicas
// de otras categorías, y 3 que cubren el contenido migrado desde v1.
export const CONSULTAS = [
  'Quiero abrir un foodtruck, ¿qué necesito?',
  '¿Cómo saco la licencia de conducir por primera vez?',
  'Soy jubilado, ¿puedo no pagar el impuesto inmobiliario?',
  '¿Dónde tramito el certificado de discapacidad?',
  '¿Cómo pago la tasa municipal?',
  '¿Qué necesito para habilitar un local comercial?',
  '¿Cómo hago la libreta sanitaria?',
  '¿Dónde saco el libre deuda de mi auto?',
  '¿Cómo pido la poda de un árbol en la vereda?',
  '¿Qué tengo que hacer para inscribir a mi hijo en una colonia municipal?',
  'quiero poner un foodtruck, qué necesito',
  'dónde queda el CIC más cercano',
]

export const MIN_SIMILARITY = 0.5
