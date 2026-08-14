// Test end-to-end del camino v2 SIN levantar Next: replica el pipeline de
// app/api/chat/route.ts con USAR_CORPUS_V2=true (embedding RETRIEVAL_QUERY ->
// RPC -> contexto -> Gemini), usando el SYSTEM_PROMPT real, que se lee del
// propio route.ts para no desincronizarse.
//
// Más lento y más caro que qa/test-retrieval-v2.mjs (una llamada de generación
// por consulta): usar aquel para regresión rápida y este para revisar respuestas.
//
// Uso: node qa/test-generacion-v2.mjs [n]     (n = cuántas consultas, default todas)
import { CONSULTAS, embed, rpcMatch, construirContexto, construirFuentes, tituloChunk, generar } from './lib-corpus.mjs'

const cuantas = Number(process.argv[2]) || CONSULTAS.length

for (const [i, consulta] of CONSULTAS.slice(0, cuantas).entries()) {
  const chunks = await rpcMatch(await embed(consulta, 'RETRIEVAL_QUERY'))
  const respuesta = await generar(consulta, construirContexto(chunks))
  const noSabe = /no tengo informaci[oó]n oficial/i.test(respuesta)
  const fuentes = noSabe ? [] : construirFuentes(chunks)

  console.log('='.repeat(78))
  console.log(`[${i + 1}/${cuantas}] ${consulta}`)
  console.log(`top-1: ${tituloChunk(chunks[0])}  (sim ${chunks[0].similarity.toFixed(4)})`)
  console.log(`trámites en el contexto: ${[...new Set(chunks.map((c) => c.slug))].join(', ')}`)
  console.log(`noSabe=${noSabe}  palabras=${respuesta.split(/\s+/).length}  fuentes=${fuentes.length}`)
  console.log('-'.repeat(78))
  console.log(respuesta)
  console.log()
}
