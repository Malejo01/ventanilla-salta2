// Evaluación de la memoria conversacional: las 6 conversaciones multi-turno,
// corridas cuatro veces cada una para poder comparar antes y después.
//
//   main        historial vacío en cada turno = el backend de hoy.
//   off         historial completo en la generación, SIN reformular la búsqueda.
//               Aísla cuánto aporta la memoria por sí sola.
//   heuristica  camino (a): tema anterior + pregunta, sin llamadas extra.
//   modelo      camino (b): una llamada corta que reescribe la consulta.
//
// Cada turno se replica con el historial REAL de ese arm — las respuestas que el
// propio arm fue dando — porque un arm que contesta distinto cambia el historial
// del turno siguiente, y comparar contra un historial prestado mediría otra cosa.
//
// Uso: node qa/test-memoria.mjs [arm[,arm...]]
//      node qa/test-memoria.mjs main,heuristica
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { responder, saludaDeMas, diceNoSabe } from './lib-memoria.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SALIDA = path.join(AQUI, 'salida-memoria.json')

const ARMS = (process.argv[2] ?? 'main,off,heuristica,modelo').split(',')

// Las 6 conversaciones del pedido. `prohibidos` son slugs que NO tienen que
// aparecer en el retrieval de ese turno: es el arrastre de contexto que la rama
// existe para evitar.
const CONVERSACIONES = [
  {
    id: 1,
    titulo: 'kiosco: repregunta de costo y de lugar',
    turnos: [
      { pregunta: 'cómo habilito un kiosco' },
      { pregunta: 'y cuánto cuesta?', esperaTema: 'habilitac' },
      { pregunta: 'dónde lo hago?', esperaTema: 'habilitac' },
    ],
  },
  {
    id: 2,
    titulo: 'foodtruck: acepta la oferta de la regla 9',
    turnos: [
      { pregunta: 'quiero abrir un foodtruck' },
      { pregunta: 'sí, contame del carnet', esperaTema: 'manipulacion' },
    ],
  },
  {
    id: 3,
    titulo: 'fuera de dominio: el caso que rompió en producción',
    turnos: [
      { pregunta: 'usás pañales?' },
      // Después de un "no sé" no hay tema que arrastrar: cualquier trámite que
      // aparezca acá es el bug.
      { pregunta: 'osea que sí usás', esperaNoSabe: true },
    ],
  },
  {
    id: 4,
    titulo: 'catálogo y referencia ordinal',
    turnos: [{ pregunta: 'qué trámites hay' }, { pregunta: 'el segundo' }],
  },
  {
    id: 5,
    titulo: 'licencia: repregunta que acota',
    turnos: [
      { pregunta: 'licencia de conducir' },
      { pregunta: 'y para profesionales?', esperaTema: 'licencia' },
    ],
  },
  {
    id: 6,
    titulo: 'cierre cortés y cambio de tema',
    turnos: [
      { pregunta: 'cómo saco el CUD' },
      { pregunta: 'gracias' },
      { pregunta: 'otra cosa: libre deuda', prohibidos: ['discapacidad', 'cud'] },
    ],
  },
]

const resultados = []

for (const arm of ARMS) {
  for (const conv of CONVERSACIONES) {
    const historial = []
    console.log('\n' + '='.repeat(78))
    console.log(`[${arm}] conversación ${conv.id} — ${conv.titulo}`)
    console.log('='.repeat(78))

    for (const [i, turno] of conv.turnos.entries()) {
      const r = await responder(
        turno.pregunta,
        arm === 'main' ? [] : historial,
        { modo: arm === 'main' ? 'off' : arm },
      )

      const saludo = saludaDeMas(r.respuesta)
      const noSabe = diceNoSabe(r.respuesta) || r.camino === 'bajo-umbral'
      const arrastre = (turno.prohibidos ?? []).filter((p) =>
        r.slugs.some((s) => (s ?? '').includes(p)),
      )
      const temaOk = turno.esperaTema ? r.slugs.some((s) => (s ?? '').includes(turno.esperaTema)) : null

      console.log(`\n  turno ${i + 1}: "${turno.pregunta}"`)
      console.log(`    camino        : ${r.camino}   motivo: ${r.motivo}`)
      if (r.consultaBusqueda !== turno.pregunta.trim()) {
        console.log(`    se buscó con  : "${r.consultaBusqueda}"`)
      }
      console.log(`    chunks        : ${r.slugs.join(', ') || '(ninguno)'}`)
      console.log(`    similitud     : ${r.mejorSimilitud === null ? '—' : r.mejorSimilitud.toFixed(4)}`)
      console.log(
        `    señales       : saluda=${saludo ? 'SÍ' : 'no'} noSabe=${noSabe ? 'sí' : 'no'}` +
          (temaOk === null ? '' : ` temaEsperado=${temaOk ? 'sí' : 'NO'}`) +
          (arrastre.length ? ` ARRASTRE=${arrastre.join(',')}` : ''),
      )
      console.log(
        `    costo         : ${r.tokensEntrada ?? 0} tok entrada / ${r.tokensSalida ?? 0} salida` +
          `${r.tokensReescritura ? ` (+${r.tokensReescritura} de reescritura)` : ''}` +
          `   ${r.msTotal} ms${r.msReescritura ? ` (${r.msReescritura} de reescritura)` : ''}`,
      )
      console.log('    ' + '-'.repeat(70))
      console.log(r.respuesta.split('\n').map((l) => `    | ${l}`).join('\n'))

      resultados.push({
        arm,
        conversacion: conv.id,
        turno: i + 1,
        pregunta: turno.pregunta,
        ...r,
        chunks: undefined, // no van al JSON: son los textos completos
        saludaDeMas: saludo,
        noSabe,
        arrastre,
        temaOk,
      })

      historial.push({ rol: 'usuario', texto: turno.pregunta })
      historial.push({ rol: 'asistente', texto: r.respuesta })
    }
  }
}

// --- Arm extra: el parche del cliente móvil sobre main ------------------------
//
// El móvil antepone "Sobre <trámite>: <pregunta>" a las preguntas cortas para
// simular contexto. Es lo que produjo el caso real: tras un "no tengo
// información oficial", "Osea que si usas" se contestó con datos de un trámite
// que nunca se había pedido. Se reproduce acá para que el antes/después de la
// conversación 3 muestre el bug y no solo su ausencia.
if (ARMS.includes('main')) {
  console.log('\n' + '='.repeat(78))
  console.log('[main+parche-movil] conversación 3 — con el prefijo "Sobre <trámite>:"')
  console.log('='.repeat(78))

  const t1 = await responder('usás pañales?', [], { modo: 'off' })
  // El móvil no tiene fuentes que citar tras un "no sé", así que usa el último
  // trámite que conoce. Se toma el top-1 del pool, que es lo que el retrieval
  // devolvió aunque no llegara al umbral.
  const tramite = t1.chunks[0]?.titulo_tramite ?? t1.slugs[0] ?? 'Trámite'
  const conParche = `Sobre ${tramite}: osea que sí usás`
  console.log(`  turno 1: "usás pañales?" -> ${t1.camino} (top-1 del pool: ${tramite})`)
  const t2 = await responder(conParche, [], { modo: 'off' })
  console.log(`\n  turno 2 (tal como lo manda el móvil): "${conParche}"`)
  console.log(`    camino        : ${t2.camino}`)
  console.log(`    chunks        : ${t2.slugs.join(', ') || '(ninguno)'}`)
  console.log(`    similitud     : ${t2.mejorSimilitud === null ? '—' : t2.mejorSimilitud.toFixed(4)}`)
  console.log(`    noSabe        : ${diceNoSabe(t2.respuesta) || t2.camino === 'bajo-umbral' ? 'sí' : 'NO — contestó con datos de un trámite'}`)
  console.log(t2.respuesta.split('\n').map((l) => `    | ${l}`).join('\n'))

  resultados.push({
    arm: 'main+parche-movil',
    conversacion: 3,
    turno: 2,
    pregunta: conParche,
    ...t2,
    chunks: undefined,
    saludaDeMas: saludaDeMas(t2.respuesta),
    noSabe: diceNoSabe(t2.respuesta) || t2.camino === 'bajo-umbral',
  })
}

// --- Resumen -----------------------------------------------------------------

console.log('\n' + '='.repeat(78))
console.log('RESUMEN POR ARM')
console.log('='.repeat(78))

const resumen = []
for (const arm of [...new Set(resultados.map((r) => r.arm))]) {
  const rs = resultados.filter((r) => r.arm === arm)
  const seguimiento = rs.filter((r) => r.turno > 1)
  resumen.push({
    arm,
    turnos: rs.length,
    'saluda de más (turnos 2+)': seguimiento.filter((r) => r.saludaDeMas).length,
    'tema esperado ok': `${rs.filter((r) => r.temaOk === true).length}/${rs.filter((r) => r.temaOk !== null && r.temaOk !== undefined).length}`,
    'arrastre indebido': rs.filter((r) => (r.arrastre ?? []).length > 0).length,
    'no sé': rs.filter((r) => r.noSabe).length,
    'tok entrada (prom)': Math.round(rs.reduce((n, r) => n + (r.tokensEntrada ?? 0) + (r.tokensReescritura ?? 0), 0) / rs.length),
    'ms total (prom)': Math.round(rs.reduce((n, r) => n + r.msTotal, 0) / rs.length),
    'ms reescritura (prom)': Math.round(rs.reduce((n, r) => n + (r.msReescritura ?? 0), 0) / rs.length),
  })
}
console.table(resumen)

fs.writeFileSync(SALIDA, JSON.stringify(resultados, null, 2))
console.log(`\nDetalle completo en ${path.relative(process.cwd(), SALIDA)}`)
