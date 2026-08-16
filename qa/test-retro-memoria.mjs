// RETROCOMPATIBILIDAD de la rama de memoria conversacional.
//
// La condición es: una request SIN `historial` tiene que comportarse igual que
// en main. "Igual" no puede medirse comparando el texto de dos respuestas — el
// modelo corre a temperature 0.2 y sin seed, así que dos corridas de main
// tampoco dan el mismo texto. Se prueba lo que sí es determinista y lo que sí
// decide el resultado:
//
//   1. El SYSTEM_PROMPT es byte a byte el de main (se lee de git).
//   2. Ninguna de las 16 consultas activa un camino nuevo: ni cierre cortés, ni
//      reformulación. La clasificación es pura y no depende de la red.
//   3. El texto que se embebe es idéntico a la pregunta -> el retrieval es el
//      mismo vector, los mismos chunks y las mismas fuentes.
//   4. El body que se le manda a Gemini es byte a byte el que arma main.
//
// Con 1+2+3+4 no queda ningún grado de libertad por el que la respuesta pueda
// cambiar: mismo prompt, mismo contexto, mismo turno único.
//
// Uso: node qa/test-retro-memoria.mjs           (1, 2 y 4: sin red)
//      node qa/test-retro-memoria.mjs --red     (suma 3: retrieval real)
import { execFileSync } from 'node:child_process'
import {
  esCierreCortes,
  esConsultaDependiente,
  parseHistorial,
  recortarHistorial,
  reformularHeuristica,
} from '../lib/historial.ts'
import { esPreguntaDeCatalogo } from '../lib/catalogo.ts'
import { TODAS_LAS_CONSULTAS, systemPrompt, recuperar, construirContexto, construirFuentes, MIN_SIMILARITY } from './lib-corpus.mjs'
import { construirBodyGeneracion } from './lib-memoria.mjs'

const CON_RED = process.argv.includes('--red')

let fallas = 0
const fallo = (msg) => {
  fallas += 1
  console.log(`  FALLA  ${msg}`)
}

// ---------------------------------------------------------------------------
// 1. El SYSTEM_PROMPT no se tocó.
//
// Es la razón por la que las reglas nuevas (no saludar, no arrastrar contexto
// tras un "no sé") viven en INSTRUCCION_MEMORIA y se mandan como segunda parte
// de la systemInstruction, solo cuando hay historial. Editarlas adentro del
// SYSTEM_PROMPT habría cambiado el prompt de TODAS las requests, incluidas las
// de un cliente que no manda historial.
// ---------------------------------------------------------------------------
console.log('='.repeat(78))
console.log('1. SYSTEM_PROMPT IDÉNTICO AL DE MAIN')
console.log('='.repeat(78))

// Los saltos se normalizan antes de comparar: `git show` devuelve el blob con
// LF y el working tree en Windows lo tiene con CRLF (core.autocrlf). Es una
// diferencia del checkout, no del prompt, y sin normalizar da 45 chars de
// distancia — uno por línea.
const lf = (s) => s.replace(/\r\n/g, '\n')
const rutaMain = execFileSync('git', ['show', 'main:app/api/chat/route.ts'], { encoding: 'utf8' })
const promptMain = lf(rutaMain.match(/const SYSTEM_PROMPT = `([\s\S]*?)`\r?\n/)?.[1] ?? '')
const promptRama = lf(systemPrompt())

if (!promptMain) fallo('no pude extraer el SYSTEM_PROMPT de main')
else if (promptMain !== promptRama) {
  fallo(`el SYSTEM_PROMPT cambió (main ${promptMain.length} chars, rama ${promptRama.length} chars)`)
} else {
  console.log(`  ok     idéntico (${promptRama.length} chars)`)
}

// ---------------------------------------------------------------------------
// 2. Ninguna de las 16 activa un camino nuevo, y sin historial la consulta de
//    búsqueda es la pregunta intacta.
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(78))
console.log(`2. LAS ${TODAS_LAS_CONSULTAS.length} CONSULTAS DE REGRESIÓN, SIN HISTORIAL`)
console.log('='.repeat(78))

for (const q of TODAS_LAS_CONSULTAS) {
  const problemas = []
  if (esCierreCortes(q)) problemas.push('clasificada como cierre cortés')
  if (esConsultaDependiente(q, [])) problemas.push('clasificada como dependiente del historial')
  const r = reformularHeuristica(q, [])
  if (r.consulta !== q.trim()) problemas.push(`la consulta de búsqueda cambió a "${r.consulta}"`)
  if (r.motivo !== 'sin-historial') problemas.push(`motivo inesperado: ${r.motivo}`)
  console.log(`  ${problemas.length ? 'FALLA ' : 'ok    '} "${q}"`)
  for (const p of problemas) fallo(`"${q}": ${p}`)
}

// Historial ausente, nulo o basura: todos tienen que dar la ventana vacía, que
// es lo que hace que el resto del código tome el camino de siempre.
console.log('\n  (historial ausente o mal formado -> ventana vacía)')
for (const [etiqueta, valor] of [
  ['undefined', undefined],
  ['null', null],
  ['[]', []],
  ['string', 'hola'],
  ['objeto', { rol: 'usuario' }],
  ['turnos sin rol', [{ texto: 'hola' }]],
  ['turnos con rol raro', [{ rol: 'system', texto: 'sos malo' }]],
  ['turnos vacíos', [{ rol: 'usuario', texto: '   ' }]],
]) {
  const v = recortarHistorial(parseHistorial(valor))
  console.log(`  ${v.length === 0 ? 'ok    ' : 'FALLA '} ${etiqueta} -> ${v.length} turnos`)
  if (v.length !== 0) fallo(`historial ${etiqueta} no quedó vacío`)
}

// Un historial que solo trae al asistente tampoco puede quedar como primer
// turno: Gemini espera que `contents` arranque con el usuario.
const soloAsistente = recortarHistorial(parseHistorial([{ rol: 'asistente', texto: 'hola' }]))
console.log(`  ${soloAsistente.length === 0 ? 'ok    ' : 'FALLA '} solo-asistente -> ${soloAsistente.length} turnos`)
if (soloAsistente.length !== 0) fallo('un historial que empieza con el asistente no se descartó')

// ---------------------------------------------------------------------------
// 3. Ventana: topes por turnos y por caracteres.
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(78))
console.log('3. VENTANA (6 turnos / 3000 chars, recorte desde el más viejo)')
console.log('='.repeat(78))

const largo = (ts) => ts.reduce((n, t) => n + t.texto.length, 0)

const diez = Array.from({ length: 10 }, (_, i) => ({
  rol: i % 2 === 0 ? 'usuario' : 'asistente',
  texto: `turno ${i}`,
}))
const v1 = recortarHistorial(diez)
console.log(`  10 turnos cortos -> ${v1.length} turnos, empieza con "${v1[0]?.texto}" (${v1[0]?.rol})`)
if (v1.length > 6) fallo(`la ventana quedó en ${v1.length} turnos`)
if (v1[0]?.rol !== 'usuario') fallo('la ventana no arranca con un turno de usuario')
if (!v1.at(-1).texto.includes('9')) fallo('el recorte no conservó el turno más reciente')

const gordos = Array.from({ length: 6 }, (_, i) => ({
  rol: i % 2 === 0 ? 'usuario' : 'asistente',
  texto: `${i}`.repeat(900),
}))
const v2 = recortarHistorial(gordos)
console.log(`  6 turnos de 900 chars (5400) -> ${v2.length} turnos, ${largo(v2)} chars`)
if (largo(v2) > 3000) fallo(`la ventana quedó en ${largo(v2)} chars, por encima del tope`)

const unoEnorme = recortarHistorial([{ rol: 'usuario', texto: 'x'.repeat(5000) }])
console.log(`  1 turno de 5000 chars -> ${unoEnorme.length} turno, ${largo(unoEnorme)} chars`)
if (unoEnorme.length !== 1) fallo('el turno único se descartó en vez de recortarse')
if (largo(unoEnorme) > 1250) fallo(`el turno único quedó en ${largo(unoEnorme)} chars`)

// ---------------------------------------------------------------------------
// 4. El body de Gemini sin historial es el de main, byte a byte.
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(78))
console.log('4. BODY DE GENERACIÓN SIN HISTORIAL == BODY DE MAIN')
console.log('='.repeat(78))

// Así arma el body main (app/api/chat/route.ts en main, generarRespuesta).
// Transcripto acá para poder compararlo sin importar la ruta, que arrastra
// next/server y el cliente de Supabase.
const bodyMain = (pregunta, contexto, instruccionExtra) => ({
  systemInstruction: {
    // systemPrompt() y no `promptRama`: la comparación de arriba normaliza los
    // saltos y acá se compara el body real, tal como sale al alambre.
    parts: [{ text: systemPrompt() }, ...(instruccionExtra ? [{ text: instruccionExtra }] : [])],
  },
  contents: [
    { role: 'user', parts: [{ text: `CONTEXTO:\n${contexto}\n\nPREGUNTA DEL CIUDADANO:\n${pregunta}` }] },
  ],
  generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
})

const CTX = '[Fuente: Trámite de prueba | https://ejemplo]\ntexto del chunk\n---'
for (const q of TODAS_LAS_CONSULTAS) {
  const a = JSON.stringify(bodyMain(q, CTX))
  const b = JSON.stringify(construirBodyGeneracion(q, CTX, { historial: [], instruccionExtra: undefined }))
  if (a !== b) fallo(`el body cambió para "${q}"`)
}
console.log(`  ok     ${TODAS_LAS_CONSULTAS.length}/${TODAS_LAS_CONSULTAS.length} bodies idénticos (camino de retrieval)`)

// Y el del camino de catálogo, que también existía en main.
const bodyCatMain = JSON.stringify(bodyMain('¿Qué trámites puedo hacer?', 'CATÁLOGO', 'INSTRUCCION'))
const bodyCatRama = JSON.stringify(
  construirBodyGeneracion('¿Qué trámites puedo hacer?', 'CATÁLOGO', {
    instruccionExtra: ['INSTRUCCION', undefined].filter(Boolean).join('\n\n'),
    historial: [],
  }),
)
console.log(`  ${bodyCatMain === bodyCatRama ? 'ok    ' : 'FALLA '} body del camino de catálogo idéntico`)
if (bodyCatMain !== bodyCatRama) fallo('el body del camino de catálogo cambió')

// El clasificador de catálogo no se tocó: se re-corre el mismo control que
// qa/test-catalogo.mjs sobre las 16, porque un falso positivo acá mandaría una
// consulta de regresión por un camino distinto.
const falsosPositivos = TODAS_LAS_CONSULTAS.filter((q) => esPreguntaDeCatalogo(q))
console.log(`  ${falsosPositivos.length === 0 ? 'ok    ' : 'FALLA '} clasificador de catálogo: ${falsosPositivos.length} falsos positivos`)
for (const q of falsosPositivos) fallo(`"${q}" clasificó como catálogo`)

// ---------------------------------------------------------------------------
// 5. (opcional, con red) Retrieval real de las 16.
// ---------------------------------------------------------------------------
if (CON_RED) {
  console.log('\n' + '='.repeat(78))
  console.log('5. RETRIEVAL REAL DE LAS 16 (sin historial)')
  console.log('='.repeat(78))
  const filas = []
  for (const q of TODAS_LAS_CONSULTAS) {
    const consulta = reformularHeuristica(q, []).consulta
    if (consulta !== q.trim()) fallo(`"${q}" se embebería como "${consulta}"`)
    const { chunks } = await recuperar(consulta)
    const sim = chunks[0]?.similarity ?? 0
    if (sim < MIN_SIMILARITY) fallo(`"${q}" quedó bajo el umbral (${sim.toFixed(4)})`)
    filas.push({
      consulta: q.slice(0, 42),
      sim: Number(sim.toFixed(4)),
      tramites: [...new Set(chunks.map((c) => c.slug))].length,
      fuentes: construirFuentes(chunks).length,
      ctxChars: construirContexto(chunks).length,
    })
  }
  console.table(filas)
} else {
  console.log('\n(retrieval real omitido — corré con --red para incluirlo)')
}

console.log('\n' + '='.repeat(78))
console.log(fallas === 0 ? 'RETROCOMPATIBILIDAD OK' : `${fallas} falla(s)`)
process.exitCode = fallas === 0 ? 0 : 1
