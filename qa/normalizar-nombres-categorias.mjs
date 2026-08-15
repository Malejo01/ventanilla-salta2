// Normaliza el NOMBRE VISIBLE de categorías que el scraping trajo mal escritas.
//
// ⚠ ESTA GRAFÍA NO VIENE DEL SITIO MUNICIPAL: LA NORMALIZAMOS NOSOTROS.
//
// Mismo criterio que qa/completar-categorias.mjs: cuando el corpus tiene un
// hueco de presentación que se ve en la respuesta al ciudadano, lo tapamos acá y
// lo dejamos anotado y reversible, para poder devolverlo apenas la
// Municipalidad publique su propia forma.
//
// El caso: el municipio publicó una categoría como "conexion electrica", en
// minúscula y sin tildes, mientras las otras 15 vienen bien escritas
// ("Vía Pública", "Inspección de Obras Privadas"). En la respuesta de catálogo
// —la que contesta "¿qué trámites puedo hacer?"— las 16 áreas se listan una
// debajo de la otra, así que la que está mal escrita canta.
//
// QUÉ SE TOCA Y QUÉ NO:
//   · `categorias`      -> SÍ. Es el nombre visible, el que termina en pantalla.
//   · `categorias_slug` -> NO. "conexion-electrica" ya está bien formado, y es
//                          la clave que usan el índice GIN
//                          (idx_tramite_chunks_v2_categorias_slug) y el
//                          parámetro `filtro_categoria` de match_tramite_chunks_v2.
//                          Cambiarlo rompería cualquier filtro que lo use, sin
//                          ganar nada: el slug no se le muestra a nadie.
//
// NO re-embebe: `categorias` no forma parte de `texto_embedding`, así que el
// retrieval no se mueve ni un decimal. Solo cambia cómo se lee el nombre.
//
// Idempotente: solo escribe las filas cuyo estado no coincide con el objetivo.
// Preserva el resto del array: mapea elemento por elemento en vez de pisar
// `categorias` entera, así una fila con dos categorías no pierde la otra.
//
// Uso: node qa/normalizar-nombres-categorias.mjs [--dry-run] [--revert]
import { env, sb, sbHeaders } from './lib-corpus.mjs'

const DRY = process.argv.includes('--dry-run')
const REVERT = process.argv.includes('--revert')

// nombre tal como vino del scraping -> nombre normalizado por nosotros.
const NORMALIZACIONES = {
  'conexion electrica': 'Conexión eléctrica',
}

const DESDE = REVERT
  ? Object.fromEntries(Object.entries(NORMALIZACIONES).map(([a, b]) => [b, a]))
  : NORMALIZACIONES

console.log(
  REVERT
    ? 'MODO REVERT: se devuelven los nombres tal como los publicó el municipio.\n'
    : 'Normalizando nombres de categoría (grafía nuestra, no del sitio municipal).\n',
)
for (const [de, a] of Object.entries(DESDE)) console.log(`  ${JSON.stringify(de)} -> ${JSON.stringify(a)}`)
console.log()

async function patch(id, categorias) {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tramite_chunks_v2?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ categorias }),
    },
  )
  if (!res.ok) throw new Error(`PATCH ${id}: ${res.status} ${await res.text()}`)
}

const filas = await sb('tramite_chunks_v2', 'select=id,slug,categorias&limit=5000')

let escritas = 0
let yaEstaban = 0
const porSlug = new Map()

for (const f of filas) {
  const actuales = f.categorias ?? []
  const objetivo = actuales.map((c) => DESDE[c] ?? c)
  const cambia = objetivo.some((c, i) => c !== actuales[i])

  const tocada = actuales.some((c) => c in DESDE) || objetivo.some((c) => Object.values(DESDE).includes(c))
  if (!tocada) continue

  if (!cambia) {
    yaEstaban += 1
    continue
  }

  if (!porSlug.has(f.slug)) {
    porSlug.set(f.slug, true)
    console.log(`  ${DRY ? '~' : '→'}  ${f.slug}: ${JSON.stringify(actuales)} -> ${JSON.stringify(objetivo)}`)
  }
  if (!DRY) {
    await patch(f.id, objetivo)
    escritas += 1
  }
}

console.log(`\n${DRY ? '(dry-run) ' : ''}filas actualizadas: ${escritas} · ya estaban: ${yaEstaban}`)

// --- Verificación: no queda ninguna categoría con la grafía vieja ---
if (!DRY) {
  const despues = await sb('tramite_chunks_v2', 'select=slug,categorias&limit=5000')
  const nombres = new Set()
  for (const f of despues) for (const c of f.categorias ?? []) nombres.add(c)

  const pendientes = Object.keys(DESDE).filter((n) => nombres.has(n))
  console.log(`\ncategorías distintas en el corpus: ${nombres.size}`)
  console.log(`con la grafía vieja: ${pendientes.length} (esperado 0)`)
  for (const n of pendientes) console.log(`  ${JSON.stringify(n)}`)

  const enMinuscula = [...nombres].filter((n) => n[0] === n[0].toLowerCase() && n[0] !== n[0].toUpperCase())
  console.log(`en minúscula inicial: ${enMinuscula.length}${REVERT ? '' : ' (esperado 0)'}`)
  for (const n of enMinuscula) console.log(`  ${JSON.stringify(n)}`)

  console.log('\nnombres finales:')
  for (const n of [...nombres].sort()) console.log(`  ${n}`)

  process.exitCode = REVERT || (pendientes.length === 0 && enMinuscula.length === 0) ? 0 : 1
}
