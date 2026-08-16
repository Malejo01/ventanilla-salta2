// Pipeline de /api/chat CON memoria conversacional, sin levantar Next.
//
// Mismo criterio que lib-corpus.mjs: replica lo que hace la ruta para poder
// medirlo barato y en lote. La diferencia importante es que acá la LÓGICA no se
// duplica — `lib/historial.ts` se importa tal cual con el type-stripping nativo
// de Node, igual que hace qa/test-catalogo.mjs con el clasificador de catálogo.
// Lo único que se espeja a mano es el armado del body de Gemini, que son 15
// líneas sin decisiones adentro.
//
// El arm "sin historial" de este módulo ES el comportamiento de main: cuando
// `historial` está vacío, `reformularHeuristica` devuelve la pregunta intacta y
// el body sale sin turnos previos y sin instrucción extra, que es exactamente el
// body que arma main. Por eso el antes/después de EVALUACION-MEMORIA.md se puede
// medir con un solo arnés.
import {
  esCierreCortes,
  INSTRUCCION_CIERRE,
  INSTRUCCION_MEMORIA,
  INSTRUCCION_REESCRITURA,
  largoHistorial,
  limpiarReescritura,
  parseHistorial,
  promptDeReescritura,
  recortarHistorial,
  reformularHeuristica,
} from '../lib/historial.ts'
import {
  esPreguntaDeCatalogo,
  agruparCatalogo,
  construirContextoCatalogo,
  INSTRUCCION_CATALOGO,
} from '../lib/catalogo.ts'
import {
  env,
  sb,
  embed,
  recuperar,
  construirContexto,
  construirFuentes,
  systemPrompt,
  MIN_SIMILARITY,
} from './lib-corpus.mjs'

const GEN_MODEL = 'gemini-2.5-flash'

const ahora = () => Number(process.hrtime.bigint() / 1_000_000n)

// --- Generación (espejo de generarRespuesta en route.ts) ---------------------

// Separado de la llamada para que qa/test-retro-memoria.mjs pueda comparar el
// body byte a byte contra el que arma main, sin gastar una request.
export function construirBodyGeneracion(pregunta, contexto, { instruccionExtra, historial = [] } = {}) {
  const turnosPrevios = historial.map((t) => ({
    role: t.rol === 'usuario' ? 'user' : 'model',
    parts: [{ text: t.texto }],
  }))

  return {
    systemInstruction: {
      parts: [{ text: systemPrompt() }, ...(instruccionExtra ? [{ text: instruccionExtra }] : [])],
    },
    contents: [
      ...turnosPrevios,
      { role: 'user', parts: [{ text: `CONTEXTO:\n${contexto}\n\nPREGUNTA DEL CIUDADANO:\n${pregunta}` }] },
    ],
    generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
  }
}

export async function generarConHistorial(pregunta, contexto, opciones = {}) {
  const body = construirBodyGeneracion(pregunta, contexto, opciones)
  const t0 = ahora()

  // Reintentos ante 429/5xx: una evaluación de 56 generaciones seguidas roza el
  // límite por minuto de la API y una corrida a medias no sirve para comparar.
  let res
  for (let intento = 1; intento <= 4; intento += 1) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (res.ok || (res.status !== 429 && res.status < 500) || intento === 4) break
    await new Promise((r) => setTimeout(r, 2000 * intento))
  }
  if (!res.ok) throw new Error(`generateContent ${res.status}: ${await res.text()}`)
  const d = await res.json()
  return {
    texto: (d?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim(),
    ms: ahora() - t0,
    tokensEntrada: d?.usageMetadata?.promptTokenCount ?? null,
    tokensSalida: d?.usageMetadata?.candidatesTokenCount ?? null,
    bodyBytes: Buffer.byteLength(JSON.stringify(body)),
    // Se devuelve el body para poder compararlo byte a byte contra el de main.
    body,
  }
}

// --- Camino (b): reescritura con el modelo (espejo de route.ts) --------------

export async function reescribirConsultaConModelo(pregunta, historial) {
  const body = {
    systemInstruction: { parts: [{ text: INSTRUCCION_REESCRITURA }] },
    contents: [{ role: 'user', parts: [{ text: promptDeReescritura(pregunta, historial) }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 40, thinkingConfig: { thinkingBudget: 0 } },
  }
  const t0 = ahora()
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (!res.ok) return { consulta: null, ms: ahora() - t0, tokensEntrada: null, error: `HTTP ${res.status}` }
    const d = await res.json()
    const salida = d?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    return {
      consulta: limpiarReescritura(salida, pregunta),
      ms: ahora() - t0,
      tokensEntrada: d?.usageMetadata?.promptTokenCount ?? null,
      tokensSalida: d?.usageMetadata?.candidatesTokenCount ?? null,
    }
  } catch (err) {
    return { consulta: null, ms: ahora() - t0, tokensEntrada: null, error: String(err) }
  }
}

// --- Catálogo ----------------------------------------------------------------

let catalogoCache = null
async function cargarCatalogo() {
  if (catalogoCache) return catalogoCache
  const filas = await sb(
    'tramite_chunks_v2',
    'select=slug,titulo_tramite,categorias,es_mas_consultado&tipo_contenido=neq.institucional&limit=5000',
  )
  catalogoCache = agruparCatalogo(filas)
  return catalogoCache
}

// --- Turno completo ----------------------------------------------------------

// `modo`: 'off' (= main, no reformula), 'heuristica' o 'modelo'.
// `historial`: [] reproduce exactamente el comportamiento de main.
export async function responder(pregunta, historialCrudo = [], { modo = 'heuristica' } = {}) {
  const t0 = ahora()
  const historial = recortarHistorial(parseHistorial(historialCrudo))
  const instruccionMemoria = historial.length > 0 ? INSTRUCCION_MEMORIA : undefined
  const limpia = pregunta.trim()

  const traza = {
    pregunta: limpia,
    modo,
    turnosHistorial: historial.length,
    charsHistorial: largoHistorial(historial),
    camino: 'retrieval',
    consultaBusqueda: limpia,
    motivo: 'sin-historial',
    msReescritura: 0,
    tokensReescritura: 0,
  }

  // PASO 0 — catálogo
  if (esPreguntaDeCatalogo(limpia)) {
    const catalogo = await cargarCatalogo()
    if (catalogo.areas.length > 0) {
      const gen = await generarConHistorial(limpia, construirContextoCatalogo(catalogo), {
        instruccionExtra: [INSTRUCCION_CATALOGO, instruccionMemoria].filter(Boolean).join('\n\n'),
        historial,
      })
      return {
        ...traza,
        camino: 'catalogo',
        respuesta: gen.texto,
        fuentes: [],
        chunks: [],
        slugs: [],
        mejorSimilitud: null,
        tokensEntrada: gen.tokensEntrada,
        tokensSalida: gen.tokensSalida,
        msGeneracion: gen.ms,
        msTotal: ahora() - t0,
      }
    }
  }

  // PASO 0.5 — cierre cortés (solo con historial)
  if (historial.length > 0 && esCierreCortes(limpia)) {
    const gen = await generarConHistorial(limpia, '(sin datos: es un cierre de charla)', {
      instruccionExtra: [INSTRUCCION_MEMORIA, INSTRUCCION_CIERRE].join('\n\n'),
      historial,
    })
    return {
      ...traza,
      camino: 'cierre',
      respuesta: gen.texto,
      fuentes: [],
      chunks: [],
      slugs: [],
      mejorSimilitud: null,
      tokensEntrada: gen.tokensEntrada,
      tokensSalida: gen.tokensSalida,
      msGeneracion: gen.ms,
      msTotal: ahora() - t0,
    }
  }

  // PASO 1 — consulta de búsqueda
  const heuristica = reformularHeuristica(limpia, historial)
  traza.motivo = heuristica.motivo
  if (modo === 'off') {
    traza.consultaBusqueda = limpia
  } else if (modo === 'heuristica') {
    traza.consultaBusqueda = heuristica.consulta
  } else {
    if (heuristica.motivo === 'oferta' || heuristica.motivo === 'tema-previo') {
      const r = await reescribirConsultaConModelo(limpia, historial)
      traza.msReescritura = r.ms
      traza.tokensReescritura = (r.tokensEntrada ?? 0) + (r.tokensSalida ?? 0)
      traza.consultaBusqueda = r.consulta ?? heuristica.consulta
      if (!r.consulta) traza.motivo = `${heuristica.motivo} (reescritura falló, cayó a heurística)`
    } else {
      traza.consultaBusqueda = heuristica.consulta
    }
  }

  // PASO 2 — retrieval
  const tRet = ahora()
  const { chunks } = await recuperar(traza.consultaBusqueda)
  const msRetrieval = ahora() - tRet
  const mejorSimilitud = chunks[0]?.similarity ?? 0

  if (mejorSimilitud < MIN_SIMILARITY) {
    return {
      ...traza,
      camino: 'bajo-umbral',
      respuesta: 'No tengo información oficial cargada sobre eso todavía.',
      fuentes: [],
      chunks,
      slugs: [...new Set(chunks.map((c) => c.slug))],
      mejorSimilitud,
      tokensEntrada: 0,
      tokensSalida: 0,
      msRetrieval,
      msGeneracion: 0,
      msTotal: ahora() - t0,
    }
  }

  // PASO 3 — generación (pregunta ORIGINAL, no la reformulada)
  const contexto = construirContexto(chunks)
  const gen = await generarConHistorial(limpia, contexto, {
    instruccionExtra: instruccionMemoria,
    historial,
  })
  const noSabe = /no tengo informaci[oó]n oficial/i.test(gen.texto)

  return {
    ...traza,
    respuesta: gen.texto,
    fuentes: noSabe ? [] : construirFuentes(chunks),
    chunks,
    slugs: [...new Set(chunks.map((c) => c.slug))],
    mejorSimilitud,
    noSabe,
    tokensEntrada: gen.tokensEntrada,
    tokensSalida: gen.tokensSalida,
    bodyBytes: gen.bodyBytes,
    msRetrieval,
    msGeneracion: gen.ms,
    msTotal: ahora() - t0,
  }
}

// --- Señales que se miden en cada respuesta ----------------------------------

// "¡Hola!", "Hola!", "Buenas", "Hola, soy Tuki" al principio de la respuesta.
export function saludaDeMas(texto) {
  return /^\s*[¡!]*\s*(hola|buenas|buen d[ií]a|buenas tardes|buenas noches)\b/i.test(texto)
}

export function diceNoSabe(texto) {
  return /no tengo informaci[oó]n oficial/i.test(texto)
}
