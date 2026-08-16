// ¿Cuándo se muestran los chips de fuente?
//
// El retrieval SIEMPRE devuelve algo: hay 133 trámites y el coseno contra
// cualquier frase da un número. Así que los chips no los decide la búsqueda,
// los decide lo que el modelo terminó contestando (ver lib/respuesta.ts).
//
// Dos partes:
//
//   1. Barrido offline sobre las respuestas ya guardadas en salida-memoria.json.
//      Sirve para buscar FALSOS POSITIVOS del detector contra 50 y pico de
//      respuestas reales, sin gastar una sola generación.
//   2. Corrida real de 16 + 4 consultas: las 16 de regresión tienen que seguir
//      trayendo fuentes, y las 4 fuera de dominio no pueden traer ninguna.
//
// Uso: node qa/test-fuentes.mjs            (las dos partes)
//      node qa/test-fuentes.mjs --offline  (solo la primera, sin red)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { debeOcultarFuentes, esNoSe, esRechazoFueraDeDominio, MAX_PALABRAS_RECHAZO } from '../lib/respuesta.ts'
import {
  TODAS_LAS_CONSULTAS,
  MIN_SIMILARITY,
  recuperar,
  construirContexto,
  construirFuentes,
  generar,
} from './lib-corpus.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SOLO_OFFLINE = process.argv.includes('--offline')

let fallas = 0
const fallo = (msg) => {
  fallas += 1
  console.log(`  FALLA  ${msg}`)
}

const palabras = (t) => t.trim().split(/\s+/).length

// ---------------------------------------------------------------------------
// 1. Barrido de falsos positivos sobre respuestas reales ya guardadas.
// ---------------------------------------------------------------------------
console.log('='.repeat(78))
console.log('1. BARRIDO SOBRE RESPUESTAS GUARDADAS (falsos positivos)')
console.log('='.repeat(78))

const ruta = path.join(AQUI, 'salida-memoria.json')
if (!fs.existsSync(ruta)) {
  console.log('  (no hay salida-memoria.json; corré antes `node qa/test-memoria.mjs`)')
} else {
  const guardadas = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  const marcadas = guardadas.filter((r) => debeOcultarFuentes(r.respuesta))
  const soloRegla4 = marcadas.filter((r) => !esNoSe(r.respuesta))

  console.log(`  respuestas analizadas          : ${guardadas.length}`)
  console.log(`  ocultarían fuentes             : ${marcadas.length}`)
  console.log(`  …por el rechazo de la regla 4  : ${soloRegla4.length} (las que antes se escapaban)`)

  console.log('\n  detectadas por la regla 4 (deben ser todas fuera de dominio):')
  for (const r of soloRegla4) {
    console.log(`    · [${r.arm}] conv ${r.conversacion} turno ${r.turno} — "${r.pregunta}" (${palabras(r.respuesta)} palabras)`)
    console.log(`      ${r.respuesta.split('\n')[0].slice(0, 100)}`)
  }

  // Ancla de regresión del caso reportado: cuando el modelo RECHAZA la pregunta
  // de los pañales, esa respuesta no puede salir con chips. Es la que citaba
  // CUD, Promoción Social, Subsecretaría de la Mujer y Adicciones.
  //
  // Se excluye el arm `main` del turno 2 a propósito, y la exclusión dice algo
  // importante sobre el alcance de esto: ahí el modelo NO rechaza nada, contesta
  // de verdad sobre la oblea de discapacidad. Es una respuesta equivocada, no un
  // rechazo, y un detector de rechazos no puede agarrarla — ni debería
  // intentarlo, porque para distinguirla de una respuesta correcta habría que
  // saber si la pregunta era de trámites, que es justo lo que no se sabe. Ese
  // caso lo arregla la memoria conversacional (no arrastrar contexto después de
  // un "no sé"), no este módulo. Sigue siendo alcanzable desde un cliente que
  // todavía no manda `historial`.
  const rechazosPanales = guardadas.filter(
    (r) => r.conversacion === 3 && r.arm !== 'main+parche-movil' && !(r.arm === 'main' && r.turno === 2),
  )
  const sueltos = rechazosPanales.filter((r) => !debeOcultarFuentes(r.respuesta))
  console.log(`\n  conversación 3 ("pañales"), respuestas que son rechazo: ${rechazosPanales.length - sueltos.length}/${rechazosPanales.length} sin chips`)
  for (const r of sueltos) {
    fallo(`conv 3 turno ${r.turno} [${r.arm}] seguiría mostrando chips: "${r.respuesta.split('\n')[0].slice(0, 90)}"`)
  }

  // Falsos positivos: una respuesta que dio datos de un trámite y aun así se
  // marcaría. Se usa `slugs` para saber que hubo retrieval detrás.
  //
  // Dos conjuntos caen acá y los dos están bien:
  //   · la conversación 3 entera, que es fuera de dominio;
  //   · el "gracias" de la conversación 6 contestado SIN historial, que hoy sale
  //     con 4 chips de trámites cualquiera (medidascomercio, solicitud de
  //     gráfica, Subsecretaría de la Mujer…) porque "gracias" da 0.64 de
  //     similitud contra cualquier cosa. Es el mismo bochorno que el de los
  //     pañales. Con historial ni llega acá: lo toma el camino de cierre cortés.
  const conDatos = guardadas.filter((r) => r.camino === 'retrieval' && !r.noSabe && (r.slugs ?? []).length > 0)
  const falsosPositivos = conDatos.filter((r) => debeOcultarFuentes(r.respuesta) && !esNoSe(r.respuesta))
  const esperado = (r) => r.conversacion === 3 || (r.conversacion === 6 && r.turno === 2)
  console.log(`\n  respuestas con datos de trámite: ${conDatos.length}`)
  console.log(`  de esas, marcadas por la regla 4: ${falsosPositivos.length}`)
  for (const r of falsosPositivos) {
    console.log(
      `    ${esperado(r) ? 'ok (no era una pregunta de trámites)' : 'REVISAR'}  ` +
        `[${r.arm}] conv ${r.conversacion} turno ${r.turno} — "${r.pregunta}"`,
    )
    if (!esperado(r)) fallo(`posible falso positivo: conv ${r.conversacion} turno ${r.turno} [${r.arm}] — "${r.pregunta}"`)
  }
}

// Casos sintéticos: el tope de palabras y las señales de datos son las dos
// compuertas que evitan que el detector se coma una respuesta buena.
console.log('\n  compuertas del detector:')
const SINTETICOS = [
  ['Solo puedo ayudarte con trámites de Salta.', true, 'rechazo pelado'],
  ['No, no uso pañales. Soy un programa de computadora y no tengo cuerpo. Si tenés una duda de trámites, decime.', true, 'rechazo con explicación'],
  ['No, no uso pañales. Soy un asistente de trámites de Salta.', true, 'rechazo corto y sin frase de alcance'],
  ['¡Hola! Soy Tuki, el asistente virtual de la Municipalidad. Para la licencia necesitás DNI y libre deuda.', false, 'se presenta pero contesta'],
  ['Soy un asistente virtual. El certificado se tramita en la Subsecretaría.', false, 'se presenta pero dice dónde se tramita'],
  ['Solo puedo ayudarte con trámites. El libre deuda se pide en Av. Paraguay 1240.', false, 'tiene dirección: está contestando'],
  ['Mi función es ayudarte con trámites. El certificado cuesta $2288.', false, 'tiene monto: está contestando'],
  ['Estoy acá para ayudarte con trámites. Entrá a https://municipalidadsalta.gob.ar', false, 'tiene URL: está contestando'],
  ['Para el libre deuda necesito saber de qué tipo es. ¿Automotor, inmueble o taxi?', false, 'repregunta legítima, sin frase de rechazo'],
]
for (const [texto, esperado, porque] of SINTETICOS) {
  const dio = esRechazoFueraDeDominio(texto)
  console.log(`    ${dio === esperado ? 'ok    ' : 'FALLA '} ${dio ? 'oculta' : 'muestra'} — ${porque}`)
  if (dio !== esperado) fallo(`sintético "${porque}": esperado ${esperado}, dio ${dio}`)
}
console.log(`    (tope de extensión del rechazo: ${MAX_PALABRAS_RECHAZO} palabras)`)

// ---------------------------------------------------------------------------
// 2. Corrida real.
// ---------------------------------------------------------------------------
const FUERA_DE_DOMINIO = ['usás pañales?', 'cuál es la colonia municipal', 'escribime un poema', 'cuánto es 2+2']

if (SOLO_OFFLINE) {
  console.log('\n(corrida real omitida — sacá --offline para incluirla)')
} else {
  // Espejo del final de POST en app/api/chat/route.ts.
  const responder = async (consulta) => {
    const { chunks } = await recuperar(consulta)
    const sim = chunks[0]?.similarity ?? 0
    if (sim < MIN_SIMILARITY) {
      return { sim, corte: 'umbral', respuesta: 'No tengo información oficial cargada sobre eso todavía.', fuentes: [] }
    }
    const respuesta = await generar(consulta, construirContexto(chunks))
    const oculta = debeOcultarFuentes(respuesta)
    return {
      sim,
      corte: oculta ? (esNoSe(respuesta) ? 'noSabe' : 'regla 4') : null,
      respuesta,
      fuentes: oculta ? [] : construirFuentes(chunks),
      candidatas: construirFuentes(chunks).length,
    }
  }

  console.log('\n' + '='.repeat(78))
  console.log(`2a. FUERA DE DOMINIO (${FUERA_DE_DOMINIO.length}): ninguna puede traer chips`)
  console.log('='.repeat(78))
  for (const q of FUERA_DE_DOMINIO) {
    const r = await responder(q)
    const ok = r.fuentes.length === 0
    console.log(`\n  ${ok ? 'ok    ' : 'FALLA '} "${q}"`)
    console.log(`         sim=${r.sim.toFixed(4)} corte=${r.corte ?? 'ninguno'} chips=${r.fuentes.length} (el retrieval había traído ${r.candidatas ?? 0})`)
    console.log(`         ${r.respuesta.split('\n').filter(Boolean)[0].slice(0, 120)}`)
    if (!ok) fallo(`"${q}" trajo ${r.fuentes.length} chips: ${r.fuentes.map((f) => f.slug).join(', ')}`)
  }

  // Una de las 16 no trae fuentes, y NO por este detector: el modelo contesta
  // "no tengo información oficial", así que la corta el `noSabe` de siempre.
  //
  // Verificado con el SYSTEM_PROMPT de bfa0b75 — el anterior a la memoria y a la
  // regla de los marcadores [[n]] —: 4 de 4 corridas dicen lo mismo. Es
  // preexistente, no una regresión.
  //
  // La causa es un hueco de corpus: la consulta recupera Becas Municipales,
  // Formulario 26, Carnet de Manipulación y Promoción Social — nada de colonias
  // — y el modelo hace lo correcto. Es de las 3 consultas que lib-corpus.mjs
  // declara como "contenido migrado desde v1", así que la migración la perdió y
  // la COBERTURA ESPERADA de test-retrieval-v2.mjs no la controla.
  //
  // Queda declarada para que el test siga siendo útil para las otras 15. Si
  // algún día contesta, el aviso dice que hay que sacarla de acá.
  const SIN_COBERTURA_EN_EL_CORPUS = ['¿Qué tengo que hacer para inscribir a mi hijo en una colonia municipal?']

  console.log('\n' + '='.repeat(78))
  console.log(`2b. LAS ${TODAS_LAS_CONSULTAS.length} DE REGRESIÓN: tienen que seguir trayendo fuentes`)
  console.log('='.repeat(78))
  const filas = []
  for (const q of TODAS_LAS_CONSULTAS) {
    const r = await responder(q)
    const declarada = SIN_COBERTURA_EN_EL_CORPUS.includes(q)
    filas.push({
      consulta: q.slice(0, 44),
      sim: Number(r.sim.toFixed(4)),
      palabras: palabras(r.respuesta),
      chips: r.fuentes.length,
      corte: r.corte ?? '—',
    })
    if (r.fuentes.length === 0 && !declarada) {
      fallo(`"${q}" se quedó sin fuentes (corte: ${r.corte ?? 'ninguno'})`)
    }
    if (r.fuentes.length > 0 && declarada) {
      console.log(`  AVISO: "${q}" ya trae fuentes; sacala de SIN_COBERTURA_EN_EL_CORPUS.`)
    }
  }
  console.table(filas)
  console.log(
    `  ${filas.filter((f) => f.chips > 0).length}/${filas.length} con chips ` +
      `(${SIN_COBERTURA_EN_EL_CORPUS.length} declarada sin cobertura en el corpus, ver comentario)`,
  )
}

console.log('\n' + '='.repeat(78))
console.log(fallas === 0 ? 'FUENTES OK' : `${fallas} falla(s)`)
process.exitCode = fallas === 0 ? 0 : 1
