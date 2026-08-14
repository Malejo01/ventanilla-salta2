// Compara estrategias de tope por trámite contra el pool real de la RPC.
//
// El tope decide cuánto contexto se lleva cada trámite. Calibrarlo a ojo no
// funciona: arreglar una consulta rompe otra. Este script trae el pool una vez
// por consulta y evalúa todas las variantes offline sobre los mismos datos, así
// la comparación es justa y no cuesta un embedding por variante.
//
// Uso: node qa/medir-topes.mjs
import { CONSULTAS, embed, rpcMatch, POOL_COUNT } from './lib-corpus.mjs'

const EXTRA = ['soy celíaco, hay algún programa?']
const TODAS = [...CONSULTAS, ...EXTRA]

// --- estrategias ---
const capPor = (clave, max) => (pool, limite) => {
  const cuenta = new Map()
  const out = []
  for (const c of pool) {
    if (out.length >= limite) break
    const k = clave(c)
    const n = cuenta.get(k) ?? 0
    if (n >= max) continue
    cuenta.set(k, n + 1)
    out.push(c)
  }
  return out
}

const porSlug = (c) => c.slug ?? ''
const porSlugSub = (c) => `${c.slug ?? ''}|${c.subtramite?.trim() ?? ''}`
// Opción A del pedido: slug+subtramite cuando hay subtrámite, slug cuando no.
const mixto = (c) => (c.subtramite?.trim() ? `${c.slug}|${c.subtramite.trim()}` : c.slug ?? '')

// Opción C: al trámite del top-1 se le garantiza un mínimo de lugares.
const minGarantizado = (minTop, maxOtros) => (pool, limite) => {
  const topSlug = pool[0]?.slug
  const cuenta = new Map()
  const out = []
  for (const c of pool) {
    if (out.length >= limite) break
    const k = c.slug ?? ''
    const max = k === topSlug ? minTop : maxOtros
    const n = cuenta.get(k) ?? 0
    if (n >= max) continue
    cuenta.set(k, n + 1)
    out.push(c)
  }
  return out
}

// Propuesta: el tope solo tiene sentido si hay otro trámite que compita con el
// primero. Si el segundo trámite está muy por debajo, no hay nada que
// diversificar y conviene dejar que el trámite del top-1 llene el contexto.
const conCompetencia = (delta, max) => (pool, limite) => {
  const top = pool[0]
  if (!top) return []
  const hayCompetidor = pool.some((c) => c.slug !== top.slug && c.similarity >= top.similarity - delta)
  if (!hayCompetidor) return pool.slice(0, limite)
  return capPor(porSlug, max)(pool, limite)
}

const ESTRATEGIAS = {
  'actual (slug, max 2)': capPor(porSlug, 2),
  'A: mixto slug/slug+sub': capPor(mixto, 2),
  'B: slug, max 3': capPor(porSlug, 3),
  'C: top-1 hasta 4, otros 2': minGarantizado(4, 2),
  'D: competencia d=0.03': conCompetencia(0.03, 2),
  'D: competencia d=0.05': conCompetencia(0.05, 2),
  'D: competencia d=0.08': conCompetencia(0.08, 2),
  'sin tope (top-5 plano)': (pool, limite) => pool.slice(0, limite),
}

// Cobertura que no se puede romper.
const COBERTURA = {
  'Quiero abrir un foodtruck, ¿qué necesito?': ['venta-via-publica-foodtrucks', 'habilitaciones-comerciales', 'curso-manipulacion-alimentos'],
  'quiero poner un foodtruck, qué necesito': ['venta-via-publica-foodtrucks', 'habilitaciones-comerciales', 'curso-manipulacion-alimentos'],
  '¿Cómo hago la libreta sanitaria?': ['curso-manipulacion-alimentos'],
  'dónde queda el CIC más cercano': ['cics-centros-comunitarios'],
}

const pools = new Map()
for (const q of TODAS) {
  pools.set(q, await rpcMatch(await embed(q, 'RETRIEVAL_QUERY'), { matchCount: POOL_COUNT }))
}
console.log(`pools traídos: ${pools.size} consultas x ${POOL_COUNT} candidatos\n`)

const filas = []
for (const [nombre, fn] of Object.entries(ESTRATEGIAS)) {
  let fallasCobertura = 0
  const detalleFallas = []
  let celiacosChunks = 0
  let foodtruckTramites = 0
  let totalTramites = 0

  for (const q of TODAS) {
    const chunks = fn(pools.get(q), 5)
    const slugs = [...new Set(chunks.map((c) => c.slug))]
    totalTramites += slugs.length

    if (COBERTURA[q]) {
      const faltan = COBERTURA[q].filter((s) => !slugs.includes(s))
      if (faltan.length) {
        fallasCobertura += 1
        detalleFallas.push(`${q.slice(0, 28)}… faltan ${faltan.join(',')}`)
      }
    }
    if (q === 'soy celíaco, hay algún programa?') {
      celiacosChunks = chunks.filter((c) => c.subtramite === 'Programa Celíacos').length
    }
    if (q === 'Quiero abrir un foodtruck, ¿qué necesito?') foodtruckTramites = slugs.length
  }

  filas.push({
    estrategia: nombre,
    'celiacos: chunks Prog.Celíacos': celiacosChunks,
    'foodtruck: tramites': foodtruckTramites,
    'fallas cobertura': fallasCobertura,
    'tramites promedio': (totalTramites / TODAS.length).toFixed(2),
  })
  if (detalleFallas.length) console.log(`  ${nombre}: ${detalleFallas.join(' | ')}`)
}

console.log()
console.table(filas)

console.log('\nDetalle por estrategia de las dos consultas críticas:')
for (const q of ['Quiero abrir un foodtruck, ¿qué necesito?', 'soy celíaco, hay algún programa?']) {
  console.log(`\n"${q}"`)
  for (const [nombre, fn] of Object.entries(ESTRATEGIAS)) {
    const chunks = fn(pools.get(q), 5)
    const desc = chunks.map((c) => `${c.slug.slice(0, 18)}${c.subtramite ? '/' + c.subtramite.slice(0, 14) : ''}`).join(' + ')
    console.log(`  ${nombre.padEnd(26)} ${desc}`)
  }
}
