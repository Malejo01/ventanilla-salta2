// Test end-to-end del camino v2 SIN levantar Next: replica el pipeline de
// app/api/chat/route.ts con USAR_CORPUS_V2=true (embedding RETRIEVAL_QUERY ->
// RPC -> contexto -> Gemini), usando el SYSTEM_PROMPT real, que se lee del
// propio route.ts para no desincronizarse.
//
// Más lento y más caro que qa/test-retrieval-v2.mjs (una llamada de generación
// por consulta): usar aquel para regresión rápida y este para revisar respuestas.
//
// Uso: node qa/test-generacion-v2.mjs [n]     (n = cuántas consultas, default todas)
import { TODAS_LAS_CONSULTAS as CONSULTAS, recuperar, construirContexto, construirFuentes, tituloChunk, generar } from './lib-corpus.mjs'

const cuantas = Number(process.argv[2]) || CONSULTAS.length

// Marcadores de enlace que `tuki-corpus` inserta en `texto_display` para que el
// cliente los reemplace por un enlace tocable. El modelo los copiaba literales a
// la respuesta ("[[0]](https://…)"), que es lo que ve el ciudadano cuando el
// cliente no los sustituye. La regla 13 del SYSTEM_PROMPT se lo prohíbe, y acá
// se controla que la regla efectivamente agarre.
//
// El control cuenta las dos cosas: cuántas consultas RECIBIERON marcadores en el
// contexto y cuántas los DEVOLVIERON. Sin lo primero, "0 respuestas con
// marcadores" no prueba nada — podría ser que ninguna consulta los haya visto.
const RE_MARCADOR = /\[\[\d+\]\]/g
const cuenta = (t) => (t.match(RE_MARCADOR) ?? []).length

let conMarcadoresEnContexto = 0
let conMarcadoresEnRespuesta = 0
const infractoras = []

for (const [i, consulta] of CONSULTAS.slice(0, cuantas).entries()) {
  // recuperar() aplica el tope de chunks por trámite, igual que recuperarV2().
  const { chunks } = await recuperar(consulta)
  const contexto = construirContexto(chunks)
  const respuesta = await generar(consulta, contexto)
  const noSabe = /no tengo informaci[oó]n oficial/i.test(respuesta)
  const fuentes = noSabe ? [] : construirFuentes(chunks)

  const enContexto = cuenta(contexto)
  const enRespuesta = cuenta(respuesta)
  if (enContexto > 0) conMarcadoresEnContexto += 1
  if (enRespuesta > 0) {
    conMarcadoresEnRespuesta += 1
    infractoras.push({ consulta, enContexto, enRespuesta })
  }

  console.log('='.repeat(78))
  console.log(`[${i + 1}/${cuantas}] ${consulta}`)
  console.log(`top-1: ${tituloChunk(chunks[0])}  (sim ${chunks[0].similarity.toFixed(4)})`)
  console.log(`trámites en el contexto: ${[...new Set(chunks.map((c) => c.slug))].join(', ')}`)
  console.log(`noSabe=${noSabe}  palabras=${respuesta.split(/\s+/).length}  fuentes=${fuentes.length}`)
  console.log(`marcadores [[n]]: ${enContexto} en el contexto -> ${enRespuesta} en la respuesta${enRespuesta ? '  <-- FALLA' : ''}`)
  console.log('-'.repeat(78))
  console.log(respuesta)
  console.log()
}

console.log('='.repeat(78))
console.log('MARCADORES DE ENLACE [[n]] (regla 13)')
console.log('='.repeat(78))
console.log(`  consultas con marcadores en el CONTEXTO  : ${conMarcadoresEnContexto}/${cuantas}`)
console.log(`  consultas con marcadores en la RESPUESTA : ${conMarcadoresEnRespuesta}/${cuantas} (esperado 0)`)
for (const f of infractoras) {
  console.log(`    FALLA  "${f.consulta}" (${f.enContexto} en contexto, ${f.enRespuesta} en respuesta)`)
}
if (conMarcadoresEnContexto === 0) {
  console.log('  AVISO: ninguna consulta recibió marcadores, así que este control no probó nada.')
}
process.exitCode = conMarcadoresEnRespuesta === 0 && conMarcadoresEnContexto > 0 ? 0 : 1
