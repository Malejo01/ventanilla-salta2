/**
 * Corre el banco de `qa/banco-preguntas.json` contra un backend y puntúa las
 * respuestas. Es la regresión de calidad: se corre entera cada vez que se toca
 * el corpus o el prompt, y se compara contra la corrida anterior.
 *
 * SOLO LEE. Hace POST a /api/chat, que es la operación normal del chat. No
 * escribe en Supabase ni toca el corpus.
 *
 *   node qa/correr-banco.mjs                                  local :3000, 5 muestras
 *   node qa/correr-banco.mjs --puerto=57363 --muestras=3
 *   node qa/correr-banco.mjs --bloque=Formulario              un solo bloque
 *   node qa/correr-banco.mjs --salida=qa/salidas/post-fix.json
 *   node qa/correr-banco.mjs --comparar=qa/salidas/base.json  diff contra otra corrida
 *
 * Por qué 5 muestras y no 1: la varianza entre corridas es un resultado, no
 * ruido a promediar. Una pregunta que acierta 3 de 5 veces es un problema
 * distinto de una que falla las 5 — la primera es inestabilidad del retrieval o
 * de la generación, la segunda es un agujero en el corpus.
 *
 * NOTA sobre `x-forwarded-for`: se varía por request para no chocar con el rate
 * limiter en memoria del endpoint (20/min por IP), que no aporta nada a esta
 * medición. No altera el pipeline de RAG.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

const flag = (nombre, porDefecto) => {
  const f = process.argv.find((a) => a.startsWith(`--${nombre}=`))
  return f === undefined ? porDefecto : f.slice(nombre.length + 3)
}

const PUERTO = flag('puerto', '3000')
const MUESTRAS = Number(flag('muestras', '5'))
const BLOQUE = flag('bloque', null)
const SALIDA = flag('salida', null)
const COMPARAR = flag('comparar', null)

const banco = JSON.parse(fs.readFileSync(path.join(AQUI, 'banco-preguntas.json'), 'utf8'))
const preguntas = BLOQUE === null ? banco : banco.filter((q) => q.bloque === BLOQUE)
if (preguntas.length === 0) throw new Error(`No hay preguntas del bloque "${BLOQUE}"`)

// --------------------------------------------------------------------------
// Puntuación
//
// `tipo` dice qué clase de dato pide la pregunta. Sirve para separar los dos
// modos de falla que importan y que a simple vista se confunden:
//
//   INCOMPLETA — no dio ningún dato del tipo pedido. Promete y no entrega.
//   DESVIADA   — dio un dato DEL TIPO PEDIDO pero de otro trámite. Es peor:
//                no dice "no sé", contesta con confianza desde la ficha
//                equivocada, y el ciudadano no tiene cómo notarlo.

const TOKEN = {
  precio: /\$\s?[\d][\d.]{2,}/,
  url: /https?:\/\/[\w.-]+/,
  contacto: /[\w.+-]+@[\w-]+\.[\w.]+|int\.?\s*\d{3,}|\b\d{7,10}\b/,
  texto: null,
}
const NO_SE =
  /no tengo informaci[oó]n oficial|no cuento con informaci[oó]n|no dispongo de informaci[oó]n|no tengo datos|no figura|no se especifica|no est[aá] disponible/i

export function evaluar(q, r) {
  const txt = r.respuesta ?? ''
  const clave = new RegExp(q.clave, 'i').test(txt)
  const veneno = q.veneno === null ? false : new RegExp(q.veneno, 'i').test(txt)
  const token = TOKEN[q.tipo]
  const hayToken = token === null ? false : token.test(txt)

  let v
  if (clave && !veneno) v = 'CORRECTA'
  else if (clave && veneno) v = 'CORRECTA_CON_RUIDO'
  else if (veneno || hayToken) v = 'DESVIADA'
  else if (NO_SE.test(txt)) v = 'NO_SE'
  else v = 'INCOMPLETA'

  return {
    ...r,
    bloque: q.bloque,
    v,
    fuenteOk: r.fuentes.includes(q.tramite),
    sinFuentes: r.fuentes.length === 0,
  }
}

// --------------------------------------------------------------------------

const pedir = async (q, muestra) => {
  const t0 = Date.now()
  const res = await fetch(`http://localhost:${PUERTO}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `10.${muestra}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: JSON.stringify({ pregunta: q.pregunta }),
  })
  const j = await res.json()
  return {
    id: q.id,
    muestra,
    status: res.status,
    ms: Date.now() - t0,
    respuesta: j.respuesta ?? '',
    fuentes: (j.fuentes ?? []).map((f) => f.slug),
  }
}

// --------------------------------------------------------------------------
// La corrida va adentro de main(): importar este archivo (para re-puntuar una
// corrida guardada con `evaluar`, por ejemplo) no dispara ningún pedido.

export function resumir(preguntas, ev, muestras) {
  return preguntas.map((q) => {
    const g = ev.filter((e) => e.id === q.id)
    const cuenta = {}
    for (const e of g) cuenta[e.v] = (cuenta[e.v] ?? 0) + 1
    const ks = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])
    return {
      id: q.id,
      bloque: q.bloque,
      cuenta,
      varia: ks.length > 1,
      dominante: ks[0],
      fuenteOk: g.filter((e) => e.fuenteOk).length,
      sinFuentes: g.filter((e) => e.sinFuentes).length,
      muestras,
      ms: Math.round(g.reduce((a, e) => a + e.ms, 0) / g.length),
    }
  })
}

export function imprimir(preguntas, ev, filas) {
  const total = {}
  for (const e of ev) total[e.v] = (total[e.v] ?? 0) + 1
  console.log(`\n=== ${ev.length} respuestas ===`)
  console.log(Object.entries(total).map(([k, n]) => `${k}=${n}`).join('  '))
  console.log(`varían entre muestras: ${filas.filter((f) => f.varia).length}/${preguntas.length}`)
  console.log(`citan el trámite correcto: ${ev.filter((e) => e.fuenteOk).length}/${ev.length}`)
  console.log(`sin fuentes: ${ev.filter((e) => e.sinFuentes).length}/${ev.length}`)
  console.log(`latencia media: ${Math.round(ev.reduce((a, e) => a + e.ms, 0) / ev.length)} ms`)

  for (const b of [...new Set(preguntas.map((q) => q.bloque))]) {
    console.log(`\n--- ${b} ---`)
    for (const x of filas.filter((f) => f.bloque === b)) {
      const det = Object.entries(x.cuenta).map(([k, n]) => `${n}×${k}`).join(' + ')
      console.log(
        `  ${x.id} ${x.varia ? '⚠' : ' '} ${det.padEnd(36)} fuente_ok=${x.fuenteOk}/${x.muestras}` +
          `  sin_fuentes=${x.sinFuentes}/${x.muestras}  ${x.ms}ms`,
      )
    }
  }
}

async function main() {
  console.log(`banco: ${preguntas.length} preguntas × ${MUESTRAS} muestras contra localhost:${PUERTO}`)
  const crudas = []
  for (let m = 1; m <= MUESTRAS; m += 1) {
    process.stdout.write(`  muestra ${m}/${MUESTRAS} `)
    for (const q of preguntas) {
      crudas.push(await pedir(q, m))
      process.stdout.write('.')
    }
    process.stdout.write('\n')
  }

  const noOk = crudas.filter((r) => r.status !== 200)
  if (noOk.length > 0) console.log(`\nAVISO: ${noOk.length} respuestas con status != 200`)

  const porId = new Map(preguntas.map((q) => [q.id, q]))
  const ev = crudas.map((r) => evaluar(porId.get(r.id), r))
  const filas = resumir(preguntas, ev, MUESTRAS)
  imprimir(preguntas, ev, filas)

  if (SALIDA !== null) {
    fs.writeFileSync(SALIDA, JSON.stringify({ ev, filas }, null, 2) + '\n')
    console.log(`\nsalida: ${SALIDA}`)
  }

  if (COMPARAR !== null) {
    const previa = JSON.parse(fs.readFileSync(COMPARAR, 'utf8'))
    const antes = new Map(previa.filas.map((f) => [f.id, f]))
    const s = (f) => Object.entries(f.cuenta).map(([k, n]) => `${n}×${k}`).join('+')
    console.log(`\n=== contra ${COMPARAR} ===`)
    for (const f of filas) {
      const a = antes.get(f.id)
      if (a === undefined) continue
      if (s(a) === s(f) && a.fuenteOk === f.fuenteOk) continue
      console.log(`  ${f.id}  ${s(a)} -> ${s(f)}   fuente_ok ${a.fuenteOk} -> ${f.fuenteOk}`)
    }
  }
}

if (import.meta.filename === process.argv[1]) await main()
