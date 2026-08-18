// DETECCIÓN DE DATOS PERSONALES (`detectarDatosSensibles`, app/api/chat/route.ts).
//
// Qué cubre:
//   1. Teléfono (regla 4)   — 12 casos, incluido el borde de la rama `15`.
//   2. Dirección (regla 6)  — 18 casos, con y sin tipo de vía explícito.
//   3. Sonda de estabilidad — 6 llamadas seguidas con el mismo input.
//   4. Chequeos estructurales sobre los patrones (flags, uso de `.test()`).
//
// Uso: node qa/test-pii.mjs                  (contra el árbol de trabajo)
//      node qa/test-pii.mjs --ref=HEAD~1     (contra una versión de git: baseline)
//
// POR QUÉ SE EXTRAE LA FUNCIÓN EN VEZ DE IMPORTARLA
// `route.ts` es un route handler de Next: importarlo ejecuta su módulo entero
// (cliente de Supabase, env vars, caches). Y copiar la función acá sería peor:
// el harness pasaría en verde mientras producción tiene otra cosa, que es
// exactamente el modo de falla que estos tests existen para evitar. Así que se
// corta del fuente real por conteo de llaves y se ejecuta esa. Si alguien
// renombra o reordena las piezas, este archivo revienta en vez de mentir.
//
// ADVERTENCIA — `patronCalleSinTipo` lleva flag `g` y se usa SOLO con
// `matchAll`, nunca con `.test()`. Un regex global es stateful: `lastIndex`
// sobrevive entre llamadas, así que con `.test()` el mismo texto alternaría
// entre detectado y no detectado en llamadas sucesivas — una fuga intermitente
// e irreproducible. La sección 4 lo verifica sobre el fuente y la 3 sobre el
// comportamiento; si alguna vez se filtra a un `.test()`, las dos caen.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const RUTA = 'app/api/chat/route.ts'
const refArg = process.argv.find((a) => a.startsWith('--ref='))
const REF = refArg ? refArg.slice('--ref='.length) : null

const fuente = REF
  ? execFileSync('git', ['show', `${REF}:${RUTA}`], { encoding: 'utf8' })
  : readFileSync(RUTA, 'utf8')

let fallas = 0
const fallo = (msg) => {
  fallas += 1
  console.log(`  FALLA  ${msg}`)
}

// ---------------------------------------------------------------- extracción

// Cierre de la función por conteo de llaves, salteando strings, comentarios y
// literales de regex (que están llenos de llaves: {0,2}, {1,5}, {2,4}...).
function cortarFuncion(src, ancla) {
  const inicio = src.indexOf(ancla)
  if (inicio === -1) throw new Error(`no se encontró ${ancla} en ${RUTA}`)
  let nivel = 0
  let enRegex = false
  let enStr = null
  for (let i = src.indexOf('{', inicio); i < src.length; i++) {
    const c = src[i]
    const prev = src[i - 1]
    if (enStr) {
      if (c === enStr && prev !== '\\') enStr = null
      continue
    }
    if (enRegex) {
      if (c === '/' && prev !== '\\') enRegex = false
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      enStr = c
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i)
      continue
    }
    if (c === '/') {
      enRegex = true
      continue
    }
    if (c === '{') nivel++
    else if (c === '}' && --nivel === 0) return { inicio, fin: i }
  }
  throw new Error(`no se cerró ${ancla} en ${RUTA}`)
}

const ANCLA_FN = 'function detectarDatosSensibles'
const { inicio: inicioFn, fin: finFn } = cortarFuncion(fuente, ANCLA_FN)

// Preámbulo a nivel de módulo: patronCalleSinTipo + tieneCalleSinTipo. No
// existe en versiones anteriores a 746abd4, así que corriendo con --ref el
// harness sigue funcionando y esa sección queda marcada como ausente.
const inicioCalle = fuente.indexOf('const patronCalleSinTipo')
const HAY_CALLE_SIN_TIPO = inicioCalle !== -1 && inicioCalle < inicioFn
const preambulo = HAY_CALLE_SIN_TIPO ? fuente.slice(inicioCalle, inicioFn) : ''

const cuerpo = preambulo + fuente.slice(inicioFn, finFn + 1)
const js = cuerpo
  .replace('function detectarDatosSensibles(texto: string): boolean {', 'function detectarDatosSensibles(texto) {')
  .replace('function tieneCalleSinTipo(texto: string): boolean {', 'function tieneCalleSinTipo(texto) {')
if (js.includes(': string') || js.includes(': boolean')) {
  throw new Error('quedaron anotaciones de tipo sin destipar — ¿cambió alguna firma?')
}
const detectarDatosSensibles = new Function(`${js}; return detectarDatosSensibles`)()

// Aísla un literal de regex por nombre, para poder afirmar sobre una regla
// suelta y no solo sobre el veredicto final de la función.
function aislarRegex(nombre) {
  const m = cuerpo.match(new RegExp(`const ${nombre}\\s*=\\s*\\n?\\s*(/.*/)([a-z]*)\\s*$`, 'm'))
  if (!m) throw new Error(`no se pudo aislar ${nombre}`)
  return { re: new Function(`return ${m[1]}${m[2]}`)(), flags: m[2] }
}

console.log(`fuente: ${REF ? `git ${REF}:${RUTA}` : RUTA}`)
console.log(`patronCalleSinTipo presente: ${HAY_CALLE_SIN_TIPO}`)

// -------------------------------------------------------------------- casos

function correrTanda(titulo, casos) {
  console.log(`\n${titulo}`)
  for (const [texto, esperado, nota] of casos) {
    const real = detectarDatosSensibles(texto)
    if (real !== esperado) fallo(`esperado=${esperado} real=${real} | ${texto}`)
    else console.log(`  OK   ${String(esperado).padEnd(5)} | ${texto}`)
    if (nota) console.log(`         -> ${nota}`)
  }
}

// 1) TELÉFONO — regla 4.
const TELEFONO = [
  // El bug de 15a19ba: el \b iba delante del grupo, así que en la rama +54 se
  // evaluaba contra el "+", que no es carácter de palabra. Entre un espacio y
  // un "+" no hay límite de palabra, y la rama no matcheaba nunca.
  ['llamame al +54 9 387 4123456', true],
  ['mi celular es +54 387 4123456', true],
  // REGRESIÓN DOCUMENTADA — este caso daba true ANTES del fix del +54, pero por
  // patronTarjeta (13 dígitos seguidos), no por la regla de teléfono. O sea que
  // enmascaraba el bug: la tanda se veía verde con la rama +54 muerta. La
  // sección 4 lo desarma afirmando sobre cada patrón por separado.
  ['+5493874123456', true, 'ver sección 4: matchea tarjeta Y teléfono'],
  ['mi tel es 0387 4215566', true],
  // BORDE DE LA RAMA 15 — pide 8 dígitos después del "15" (\d{4}[\s-]?\d{4}).
  // Estos fijan los dos lados: "4215 5566" son 8 y entra; "15292" se queda en 3
  // y no llega. Con 7 dígitos ("15 4215 566") NO detecta, y está bien: no es un
  // teléfono argentino válido.
  ['llamame al 15 4215 5566', true],
  ['mi cel es 15-4215-5566', true],
  ['la ordenanza 15292 dice algo?', false],
  ['la ordenanza 15292 dice algo de esto?', false],
  ['el trámite sale $2288,00', false],
  ['atienden de 08:00 a 19:30?', false],
  ['necesito 2 fotos 4 por 4', false],
  ['mi comercio puede estar en la calle belgrano 1234 ?', false],
]

// 2) DIRECCIÓN — regla 6. Los `false` importan más que los `true`: la regla
// ensancha la detección y el riesgo real es frenar consultas legítimas.
const DIRECCION = [
  // Sin tipo de vía: nadie escribe "calle" cuando da su dirección de verdad.
  ['mi domicilio es Alvarado 856', true],
  ['vivo en Belgrano 1234', true],
  ['vivo en Entre Ríos 1450', true],
  ['mi casa está en General Güemes 1200', true],
  ['me mudé a Alvarado 856', true],
  ['mi local está en Caseros 1120', true],
  ['vivo en el barrio Tres Cerritos, Los Lapachos 450', true],
  // No abren contextoPersonalDireccion, que es la compuerta. Zonificación
  // hipotética ("puede estar" es condicional, no indicativo) y direcciones de
  // terceros: son el caso de uso central de la app.
  ['mi comercio puede estar en la calle belgrano 1234 ?', false],
  ['¿el domicilio de Rentas es Santa Fe 545?', false],
  ['¿la casa de la cultura está en Caseros 460?', false],
  ['El centro cívico queda en avenida Paraguay 1200?', false],
  ['mi local mide 50 metros cuadrados, ¿cuánto pago?', false],
  // Abren contexto y los frena el descarte de arranque de oración: el único
  // match es "Necesito 2" / "Tengo 3", y lo previo termina en punto.
  ['Vivo en zona sur. Necesito 2 formularios', false],
  ['Mi casa es de material. Tengo 3 expedientes abiertos', false],
  // Abren contexto y no hay nada que matchear: sin mayúscula, o con una palabra
  // en minúscula entre el nombre propio y el número.
  ['mi casa tiene 3 ambientes, ¿pago más tasa?', false],
  ['vivo en Salta hace 20 años, ¿me sirve la licencia de otra provincia?', false],
  ['la ordenanza 15292 dice algo de esto?', false],
  ['necesito 2 fotos 4 por 4', false],
]

correrTanda(`1) TELÉFONO — regla 4 (${TELEFONO.length} casos)`, TELEFONO)
correrTanda(`2) DIRECCIÓN — regla 6 (${DIRECCION.length} casos)`, DIRECCION)

// 3) SONDA DE ESTABILIDAD. Si patronCalleSinTipo (flag g) se filtrara a un
// `.test()`, lastIndex sobreviviría entre llamadas y el resultado alternaría.
// Seis llamadas seguidas con el mismo input tienen que dar seis veces lo mismo.
console.log('\n3) ESTABILIDAD — 6 llamadas seguidas con el mismo input')
for (const t of [
  'mi domicilio es Alvarado 856',
  'vivo en Belgrano 1234',
  'vivo en el barrio Tres Cerritos, Los Lapachos 450',
]) {
  const r = [0, 1, 2, 3, 4, 5].map(() => detectarDatosSensibles(t))
  if (r.every((v) => v === r[0])) console.log(`  OK   ${JSON.stringify(r)} | ${t}`)
  else fallo(`alterna entre llamadas ${JSON.stringify(r)} | ${t}`)
}

// 4) CHEQUEOS ESTRUCTURALES: sobre el fuente, no sobre el comportamiento.
console.log('\n4) ESTRUCTURA de los patrones')

const { flags: flagsTel, re: reTel } = aislarRegex('patronTelefono')
if (flagsTel.includes('g')) fallo('patronTelefono tiene flag g (se usa con .test(), sería stateful)')
else console.log(`  OK   patronTelefono sin flag g (flags: "${flagsTel}")`)

if (HAY_CALLE_SIN_TIPO) {
  const { flags } = aislarRegex('patronCalleSinTipo')
  if (!flags.includes('g')) fallo('patronCalleSinTipo perdió el flag g (lo requiere matchAll)')
  else console.log(`  OK   patronCalleSinTipo con flag g (flags: "${flags}")`)
  // Case-sensitive a propósito: la mayúscula inicial es lo único que separa un
  // nombre de calle de una palabra cualquiera.
  if (flags.includes('i')) fallo('patronCalleSinTipo tiene flag i (debe ser case-sensitive)')
  else console.log('  OK   patronCalleSinTipo sin flag i (case-sensitive)')
  if (/patronCalleSinTipo\s*\.\s*test\s*\(/.test(fuente)) {
    fallo('patronCalleSinTipo se usa con .test() — regex global stateful, fuga intermitente')
  } else {
    console.log('  OK   patronCalleSinTipo solo se consume con matchAll')
  }
}

// Desarma la trampa de "+5493874123456" afirmando sobre cada regla por
// separado. Con la sola aserción de detectarDatosSensibles este caso queda
// verde aunque la rama +54 esté muerta, porque lo atrapa la regla de tarjeta.
const TRAMPA = '+5493874123456'
const { re: reTarjeta } = aislarRegex('patronTarjeta')
if (!reTarjeta.test(TRAMPA)) fallo(`patronTarjeta ya no matchea ${TRAMPA} (eran sus 13 dígitos seguidos)`)
else console.log(`  OK   patronTarjeta matchea ${TRAMPA} (13 dígitos)`)
if (!reTel.test(TRAMPA)) fallo(`patronTelefono NO matchea ${TRAMPA} — volvió el bug del \\b en la rama +54`)
else console.log(`  OK   patronTelefono matchea ${TRAMPA} (rama +54 viva)`)

const TOTAL = TELEFONO.length + DIRECCION.length
console.log('\n' + '='.repeat(78))
console.log(fallas === 0 ? `PII OK (${TOTAL} casos + estabilidad + estructura)` : `${fallas} falla(s)`)
process.exitCode = fallas === 0 ? 0 : 1
