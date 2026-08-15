// Test del camino de catálogo ("¿qué trámites puedo hacer?").
//
// Dos partes, que se pueden correr por separado:
//
//   node qa/test-catalogo.mjs            clasificador + agregado (sin generación)
//   node qa/test-catalogo.mjs --generar  suma la respuesta real de Gemini
//
// El clasificador NO se replica acá: se importa el TypeScript de lib/catalogo.ts
// directo, con el type-stripping nativo de Node (>= 22.6). Es la diferencia con
// lib-corpus.mjs, que sí duplica `diversificarPorTramite` a mano: ahí no había
// forma de evitarlo, acá sí, y un clasificador duplicado que se desincroniza es
// un test que aprueba mientras producción falla.
import { esPreguntaDeCatalogo, agruparCatalogo, construirContextoCatalogo } from '../lib/catalogo.ts'
import { sb, generar, TODAS_LAS_CONSULTAS } from './lib-corpus.mjs'

const GENERAR = process.argv.includes('--generar')

let fallas = 0
const fallo = (msg) => {
  fallas += 1
  console.log(`  FALLA  ${msg}`)
}

// ---------------------------------------------------------------------------
// 1. Las 8 variantes de pregunta de catálogo tienen que entrar al camino.
//    Cada una en dos formas: con signos y voseo, y sin signos / con usted.
// ---------------------------------------------------------------------------
const VARIANTES_CATALOGO = [
  ['¿Qué trámites puedo hacer?', 'que tramites se pueden hacer'],
  ['¿Qué podés hacer?', 'que puede hacer usted'],
  ['¿En qué me podés ayudar?', 'en que me puede ayudar'],
  ['¿Qué sabés?', 'que sabe usted'],
  ['¿Qué hay disponible?', 'que hay disponible'],
  ['¿Para qué servís?', 'para que sirve'],
  ['¿Qué tipo de trámites hacés?', 'que tipos de tramites hay'],
  ['¿Qué trámites hay?', 'que tramites tenes disponibles'],
]

console.log('='.repeat(78))
console.log('1. VARIANTES DE CATÁLOGO (deben clasificar como catálogo)')
console.log('='.repeat(78))
for (const [conSignos, sinSignos] of VARIANTES_CATALOGO) {
  for (const q of [conSignos, sinSignos]) {
    const ok = esPreguntaDeCatalogo(q)
    console.log(`  ${ok ? 'ok   ' : 'FALLA'}  "${q}"`)
    if (!ok) fallas += 1
  }
}

// Ruido que la gente escribe alrededor y no debería romper la detección.
console.log('\n  (con saludo y cortesía alrededor)')
for (const q of [
  'Hola, ¿qué trámites puedo hacer?',
  'hola tuki en que me podes ayudar',
  '¿Qué trámites hay disponibles acá?',
  'qué podés hacer por favor',
  'mostrame los trámites',
]) {
  const ok = esPreguntaDeCatalogo(q)
  console.log(`  ${ok ? 'ok   ' : 'FALLA'}  "${q}"`)
  if (!ok) fallas += 1
}

// ---------------------------------------------------------------------------
// 1b. Cobertura en lenguaje de vecino.
//
// Las 8 variantes de arriba son las formas canónicas. Estas 30 son cómo la
// pregunta llega de verdad: con preámbulo ("sobre…", "una consulta:…"), sin
// tildes, con abreviaturas ("q") y con errores de tipeo. Salió de acá el
// falso negativo que se vio en producción: "sobre que tramites puedo consultar?"
// se iba por retrieval normal y contestaba con 4 áreas de 14.
//
// Antes de tolerar preámbulos entraban 17 de 30; ahora entran las 30. El piso
// queda clavado en 30 para que una regresión falle en vez de pasar inadvertida.
// Si algún día se agrega acá una formulación con un tipeo que un regex no puede
// cubrir sin volverse peligroso, se baja el piso A PROPÓSITO y se deja dicho por
// qué — no se afloja el clasificador para llegar al número.
// ---------------------------------------------------------------------------
const MIN_COBERTURA_VECINO = 30

const VECINO = [
  'que tramites puedo hacer',
  'sobre que tramites puedo consultar?',
  'hola, que tramites puedo hacer?',
  'buenas, en que me podes ayudar',
  'una consulta: que tramites hay',
  'queria saber que tramites puedo hacer',
  'me gustaria saber que tramites tienen',
  'de que tramites me podes hablar',
  'con que tramites me podes ayudar',
  'sobre que temas puedo preguntar',
  'q tramites puedo hacer',
  'que tramites se pueden hacer aca',
  'necesito saber que tramites hay',
  'decime que tramites puedo hacer',
  'para que servis?',
  'que podes hacer vos',
  'que sabes hacer',
  'en que me puede ayudar usted',
  'que tipo de tramites hay',
  'que tipos de tramite puedo consultar',
  'que cosas puedo averiguar aca',
  'sobre que puedo preguntarte',
  'que consultas puedo hacer',
  'hola tuki, que tramites tenes?',
  'che, que tramites puedo hacer',
  'que tramites puedo ver aca',
  'mostrame todos los tramites',
  'que gestiones puedo hacer',
  'disculpa, que tramites hay disponibles?',
  'que tramites puedo averiguar con vos',
]

console.log('\n' + '='.repeat(78))
console.log(`1b. LENGUAJE DE VECINO (${VECINO.length} formulaciones, informativo)`)
console.log('='.repeat(78))
const vecinoEntran = VECINO.filter((q) => esPreguntaDeCatalogo(q))
const vecinoFuera = VECINO.filter((q) => !esPreguntaDeCatalogo(q))
for (const q of VECINO) console.log(`  ${esPreguntaDeCatalogo(q) ? 'entra  ' : 'NO     '}  "${q}"`)
console.log(`\n  COBERTURA: ${vecinoEntran.length}/${VECINO.length} (piso: ${MIN_COBERTURA_VECINO})`)
if (vecinoFuera.length) {
  console.log('  quedan afuera:')
  for (const q of vecinoFuera) console.log(`    · "${q}"`)
}
if (vecinoEntran.length < MIN_COBERTURA_VECINO) {
  fallo(`cobertura de vecino ${vecinoEntran.length}/${VECINO.length}, por debajo del piso ${MIN_COBERTURA_VECINO}`)
}

// ---------------------------------------------------------------------------
// 2. Falsos positivos: el set de regresión no puede caer en este camino.
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(78))
console.log(`2. SET DE REGRESIÓN (${TODAS_LAS_CONSULTAS.length} consultas, ninguna es catálogo)`)
console.log('='.repeat(78))
for (const q of TODAS_LAS_CONSULTAS) {
  const esCat = esPreguntaDeCatalogo(q)
  console.log(`  ${esCat ? 'FALSO POSITIVO' : 'ok            '}  "${q}"`)
  if (esCat) fallas += 1
}

// ---------------------------------------------------------------------------
// 3. Casos borde: preguntas que EMPIEZAN como una de catálogo pero apuntan a un
//    trámite concreto. Son las que rompe un clasificador por subcadena.
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(78))
console.log('3. CASOS BORDE (NO deben clasificar como catálogo)')
console.log('='.repeat(78))
const BORDES = [
  'qué trámites de licencia hay',
  '¿Qué trámites de licencia hay?',
  'qué necesito para habilitar un local',
  'qué documentación piden',
  'qué trámites necesito para el foodtruck',
  'qué papeles hay que llevar',
  'en qué oficina me atienden',
  'qué puedo hacer si me secuestraron el auto',
  'para qué sirve la libreta sanitaria',
  'qué sabés sobre la licencia de conducir',
  'qué hay que hacer para la poda de un árbol',
  'qué tipo de licencia necesito',

  // --- Adversarios del preámbulo y de la cola ---
  // Estos son los que rompería aflojar el matcheo con un `.*` a cada lado. El
  // preámbulo libre se comería el tema por la izquierda y la cola libre por la
  // derecha, dejando en los dos casos una pregunta de catálogo aparente.
  // Todos tienen tema, así que todos van al retrieval normal.
  'para la licencia de conducir, qué trámites hay',
  'sobre la licencia de conducir, qué trámites hay',
  'una consulta sobre la licencia: qué trámites hay',
  'sobre el foodtruck, qué trámites hay',
  'de qué trámites de licencia me podés hablar',
  'sobre qué trámites de licencia puedo consultar',
  'q tramites de licencia hay',
  'qué trámites hay para la licencia',
  'qué trámites hay en cementerios',
  'qué puedo consultar sobre el foodtruck',
  'en qué me podés ayudar con la licencia',
  'de qué sirve la libreta sanitaria',
  'hola, qué necesito para habilitar un local',
  'queria saber qué documentación piden para el foodtruck',
]
for (const q of BORDES) {
  const esCat = esPreguntaDeCatalogo(q)
  console.log(`  ${esCat ? 'FALSO POSITIVO' : 'ok            '}  "${q}"`)
  if (esCat) fallas += 1
}

// ---------------------------------------------------------------------------
// 4. El agregado sobre el corpus.
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(78))
console.log('4. AGREGADO DEL CORPUS')
console.log('='.repeat(78))

const filas = await sb(
  'tramite_chunks_v2',
  'select=slug,titulo_tramite,categorias,es_mas_consultado&tipo_contenido=neq.institucional&limit=5000',
)
console.log(`  filas leídas (sin institucional): ${filas.length}`)

const catalogo = agruparCatalogo(filas)
console.log(`  áreas          : ${catalogo.areas.length}`)
console.log(`  total trámites : ${catalogo.totalTramites}`)
const suma = catalogo.areas.reduce((n, a) => n + a.cantidad, 0)
console.log(`  suma por área  : ${suma} (mayor que el total: hay trámites en más de una categoría)`)

if (catalogo.areas.length === 0) fallo('el catálogo salió vacío')
if (catalogo.totalTramites === 0) fallo('no se contó ningún trámite')
for (const a of catalogo.areas) {
  if (!a.ejemplos.length) fallo(`el área "${a.categoria}" quedó sin ejemplos`)
  if (a.cantidad <= 0) fallo(`el área "${a.categoria}" quedó en ${a.cantidad}`)
}
if (suma < catalogo.totalTramites) fallo('la suma por área quedó por debajo del total, revisá la agrupación')

// Subáreas: las que están enteras adentro de otra (ver detectarSubareas).
// Se re-verifica la contención contra los datos crudos, no contra lo que dijo
// la función: si el corpus cambia y una subárea deja de estar contenida, esto
// tiene que fallar en vez de seguir anidándola.
const slugsPorCategoria = new Map()
const yaVisto = new Set()
for (const f of filas) {
  if (yaVisto.has(f.slug)) continue
  yaVisto.add(f.slug)
  for (const c of f.categorias ?? []) {
    slugsPorCategoria.set(c, (slugsPorCategoria.get(c) ?? new Set()).add(f.slug))
  }
}

const subareas = catalogo.areas.filter((a) => a.subareaDe)
console.log(`\n  subáreas detectadas: ${subareas.length}`)
for (const s of subareas) {
  const hijos = slugsPorCategoria.get(s.categoria) ?? new Set()
  const padres = slugsPorCategoria.get(s.subareaDe) ?? new Set()
  const fuera = [...hijos].filter((x) => !padres.has(x))
  console.log(
    `    · ${s.categoria} (${s.cantidad}) dentro de ${s.subareaDe} (${padres.size}) — fuera del padre: ${fuera.length}`,
  )
  if (fuera.length) fallo(`"${s.categoria}" se marcó como subárea de "${s.subareaDe}" pero ${fuera.length} trámite(s) quedan afuera`)
  if (s.cantidad >= padres.size) fallo(`"${s.categoria}" no es más chica que "${s.subareaDe}"`)
  // Un solo nivel: el contenedor no puede ser a su vez subárea.
  const padre = catalogo.areas.find((a) => a.categoria === s.subareaDe)
  if (padre?.subareaDe) fallo(`anidamiento en cadena: ${s.categoria} -> ${s.subareaDe} -> ${padre.subareaDe}`)
}

// Ninguna categoría debe quedar con grafía descuidada (ver
// qa/normalizar-nombres-categorias.mjs).
for (const a of catalogo.areas) {
  if (a.categoria[0] !== a.categoria[0].toUpperCase()) fallo(`la categoría "${a.categoria}" arranca en minúscula`)
}

const contexto = construirContextoCatalogo(catalogo)
console.log(`\n  --- contexto que recibe Gemini (${contexto.length} chars) ---`)
console.log(contexto.split('\n').map((l) => `  | ${l}`).join('\n'))

// ---------------------------------------------------------------------------
// 5. Generación real (opcional): que la respuesta nombre TODAS las áreas y el
//    total. Es el único chequeo que cuesta plata, por eso va detrás del flag.
// ---------------------------------------------------------------------------
if (GENERAR) {
  console.log('\n' + '='.repeat(78))
  console.log('5. GENERACIÓN REAL')
  console.log('='.repeat(78))

  const { INSTRUCCION_CATALOGO } = await import('../lib/catalogo.ts')
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')

  for (const q of ['¿Qué trámites puedo hacer?', 'en que me podes ayudar']) {
    const respuesta = await generar(q, contexto, INSTRUCCION_CATALOGO)
    console.log(`\n  "${q}"  (${respuesta.split(/\s+/).length} palabras)`)
    console.log(respuesta.split('\n').map((l) => `    ${l}`).join('\n'))

    const r = norm(respuesta)

    // Áreas principales: se exige el nombre tal cual. Son el índice de la
    // respuesta y no hay motivo para que aparezcan deformadas.
    const principales = catalogo.areas.filter((a) => !a.subareaDe)
    const faltan = principales.filter((a) => !r.includes(norm(a.categoria)))
    if (faltan.length) fallo(`"${q}": no nombra ${faltan.length} área(s): ${faltan.map((a) => a.categoria).join(', ')}`)

    // Subáreas: la instrucción las deja plegar dentro de la línea del padre
    // ("Automotor … incluye Licencias de Conducir"), así que el nombre puede
    // venir flexionado. Se exige que estén todas sus palabras con contenido, no
    // la cadena exacta: pedir literal daba por ausente una respuesta correcta
    // que escribió "Licencias de Conducir" en vez de "Licencia de conducir".
    for (const s of catalogo.areas.filter((a) => a.subareaDe)) {
      const palabras = norm(s.categoria).split(/\s+/).filter((w) => w.length > 3)
      const faltantes = palabras.filter((w) => !r.includes(w))
      if (faltantes.length) fallo(`"${q}": no menciona la subárea ${s.categoria} (faltan: ${faltantes.join(', ')})`)
    }
    if (!respuesta.includes(String(catalogo.totalTramites))) {
      fallo(`"${q}": no menciona el total de ${catalogo.totalTramites} trámites`)
    }
    if (/fuente:/i.test(respuesta)) fallo(`"${q}": metió una cita de fuente en el cuerpo`)
  }
} else {
  console.log('\n(generación real omitida — corré con --generar para incluirla)')
}

console.log('\n' + '='.repeat(78))
console.log(fallas === 0 ? 'TODO OK' : `${fallas} falla(s)`)
process.exitCode = fallas === 0 ? 0 : 1
