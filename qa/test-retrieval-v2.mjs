// Test de regresión del corpus v2 (nivel retrieval, sin generación).
// Corre rápido y barato: sirve para chequear que un cambio en el corpus o en
// los embeddings no rompió el ranking. No levanta Next: replica el pipeline de
// app/api/chat/route.ts cuando USAR_CORPUS_V2=true, incluido el tope de chunks
// por trámite (pool de 30 -> máx 2 por trámite -> top 5).
//
// Uso: node qa/test-retrieval-v2.mjs
import {
  CONSULTAS,
  MIN_SIMILARITY,
  MAX_CHUNKS_POR_TRAMITE,
  recuperar,
  construirFuentes,
  tituloChunk,
} from './lib-corpus.mjs'

const resumen = []
let institucionales = 0
let sinSlug = 0
let bajoUmbral = 0
let violaTope = 0

for (const [i, consulta] of CONSULTAS.entries()) {
  const { pool, chunks } = await recuperar(consulta)
  const top = chunks[0]
  const fuentes = construirFuentes(chunks)

  if (!top || top.similarity < MIN_SIMILARITY) bajoUmbral += 1
  institucionales += chunks.filter((c) => c.tipo_contenido === 'institucional').length
  sinSlug += fuentes.filter((f) => !f.slug).length

  // El tope tiene que cumplirse siempre.
  const porGrupo = {}
  for (const c of chunks) {
    const k = c.slug
    porGrupo[k] = (porGrupo[k] ?? 0) + 1
  }
  if (Object.values(porGrupo).some((n) => n > MAX_CHUNKS_POR_TRAMITE)) violaTope += 1

  const tramitesTop5Plano = [...new Set(pool.slice(0, 5).map((c) => c.slug))].length
  const tramitesConTope = [...new Set(chunks.map((c) => c.slug))].length

  console.log('\n' + '='.repeat(78))
  console.log(`[${i + 1}/${CONSULTAS.length}] ${consulta}`)
  console.log('-'.repeat(78))
  console.log(`  top-1      : ${tituloChunk(top)}`)
  console.log(`  slug       : ${top?.slug ?? '(null)'}`)
  console.log(`  similarity : ${top?.similarity?.toFixed(4)}`)
  console.log(`  sims       : ${chunks.map((c) => c.similarity.toFixed(3)).join(', ')}`)
  console.log(`  trámites   : ${tramitesConTope} con tope (top-5 plano habría dado ${tramitesTop5Plano})`)
  console.log(`  fuentes (${fuentes.length}):`)
  for (const f of fuentes) {
    console.log(
      `    · ${f.tramite}${f.subtramite ? ` — ${f.subtramite}` : ''}` +
        `  [slug=${f.slug || '(VACIO)'}] [cat=${f.categoria}] [url=${f.url === undefined ? 'AUSENTE' : f.url.slice(0, 34)}]`,
    )
  }

  resumen.push({
    consulta: consulta.slice(0, 44),
    top: (top?.titulo_tramite ?? '').slice(0, 38),
    sim: Number((top?.similarity ?? 0).toFixed(4)),
    tramites: tramitesConTope,
    antes: tramitesTop5Plano,
    fuentes: fuentes.length,
  })
}

console.log('\n' + '='.repeat(78))
console.log('RESUMEN')
console.log('='.repeat(78))
console.table(resumen)
console.log(`chunks institucionales devueltos : ${institucionales} (esperado 0)`)
console.log(`fuentes sin slug                 : ${sinSlug} (esperado 0)`)
console.log(`consultas que violan el tope     : ${violaTope} (esperado 0)`)
console.log(`consultas bajo MIN_SIMILARITY    : ${bajoUmbral}/${CONSULTAS.length}`)

// Cobertura del contenido curado migrado desde v1, y del caso de demo del
// foodtruck, que necesita las tres patas del trámite en un solo contexto.
const esperado = [
  { consulta: '¿Cómo hago la libreta sanitaria?', slugs: ['curso-manipulacion-alimentos'] },
  { consulta: 'dónde queda el CIC más cercano', slugs: ['cics-centros-comunitarios'] },
  {
    consulta: 'Quiero abrir un foodtruck, ¿qué necesito?',
    slugs: ['venta-via-publica-foodtrucks', 'habilitaciones-comerciales', 'curso-manipulacion-alimentos'],
  },
  {
    consulta: 'quiero poner un foodtruck, qué necesito',
    slugs: ['venta-via-publica-foodtrucks', 'habilitaciones-comerciales', 'curso-manipulacion-alimentos'],
  },
]

console.log('\nCOBERTURA ESPERADA:')
let fallas = 0
for (const e of esperado) {
  const { chunks } = await recuperar(e.consulta)
  const slugs = [...new Set(chunks.map((c) => c.slug))]
  const faltan = e.slugs.filter((s) => !slugs.includes(s))
  if (faltan.length) fallas += 1
  console.log(`  ${faltan.length ? 'FALLA' : 'OK  '} "${e.consulta}"`)
  console.log(`        recuperado: ${slugs.join(', ')}`)
  if (faltan.length) console.log(`        FALTAN: ${faltan.join(', ')}`)
}
console.log(fallas === 0 ? '\nCobertura completa.' : `\n${fallas} falla(s) de cobertura.`)
process.exitCode = fallas === 0 && violaTope === 0 && institucionales === 0 && sinSlug === 0 ? 0 : 1
