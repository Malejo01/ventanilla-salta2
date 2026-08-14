// Completa `categorias` / `categorias_slug` en los trámites del corpus que
// quedaron sin clasificar.
//
// ⚠ ESTAS CATEGORÍAS NO EXISTEN EN LA TAXONOMÍA DEL SITIO MUNICIPAL.
//
// El municipio publicó estos 16 trámites sin clasificar, así que el scraping
// los trajo con `categorias: []`. El backend caía al fallback "general" y el
// chip de fuentes terminaba sin badge (ver components/source-chip.tsx), lo que
// hacía que "Promoción Social" se leyera como una etiqueta de categoría en vez
// de como el nombre del trámite.
//
// "Desarrollo Social", "Emprendedores" y "Comunicación" las inventamos
// nosotros para tapar ese hueco. Si en algún momento la Municipalidad define su
// propia clasificación para estos trámites, esto hay que reemplazarlo:
//
//   node qa/completar-categorias.mjs --revert
//
// deja los 16 slugs como estaban (`categorias: []`), y a partir de ahí se
// aplica el mapeo oficial.
//
// No re-embebe: `categorias` no forma parte del texto que se vectoriza
// (texto_embedding), así que el retrieval no cambia. Solo cambia el badge.
//
// Idempotente: solo escribe los slugs cuyo estado no coincide con el objetivo.
//
// Uso: node qa/completar-categorias.mjs [--dry-run] [--revert]
import { env, sb, sbHeaders } from './lib-corpus.mjs'

const DRY = process.argv.includes('--dry-run')
const REVERT = process.argv.includes('--revert')

// slug del trámite -> [nombre visible de la categoría, slug de la categoría]
const DESARROLLO_SOCIAL = ['Desarrollo Social', 'desarrollo-social']
const EMPRENDEDORES = ['Emprendedores', 'emprendedores']
const COMUNICACION = ['Comunicación', 'comunicacion']

const MAPEO = {
  'promocion-social': DESARROLLO_SOCIAL,
  'desarrollo-social': DESARROLLO_SOCIAL,
  'desarrollo-humano-2-programas-descentralizados': DESARROLLO_SOCIAL,
  'becas-municipales': DESARROLLO_SOCIAL,
  'subsecretaria-mujer': DESARROLLO_SOCIAL,
  'desarrollo-humano-2-adicciones': DESARROLLO_SOCIAL,
  'centro-de-mediacion-y-conciliaciones': DESARROLLO_SOCIAL,
  'voluntariado-del-centro-de-adopciones': DESARROLLO_SOCIAL,
  'clubes-de-la-ciudad-de-salta': DESARROLLO_SOCIAL,
  huertas: DESARROLLO_SOCIAL,

  emprendedores: EMPRENDEDORES,
  yoemprendo: EMPRENDEDORES,
  medidascomercio: EMPRENDEDORES,

  'solicitud-de-auspicio': COMUNICACION,
  'solicitud-de-produccion': COMUNICACION,
  'solicitud-de-grafica': COMUNICACION,
}

const iguales = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

async function patch(slug, categorias, categoriasSlug) {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tramite_chunks_v2?slug=eq.${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ categorias, categorias_slug: categoriasSlug }),
    },
  )
  if (!res.ok) throw new Error(`PATCH ${slug}: ${res.status} ${await res.text()}`)
}

const filas = await sb('tramite_chunks_v2', 'select=slug,titulo_tramite,categorias,categorias_slug&limit=2000')
const porSlug = new Map()
for (const f of filas) {
  if (!porSlug.has(f.slug)) porSlug.set(f.slug, { ...f, chunks: 0 })
  porSlug.get(f.slug).chunks += 1
}

console.log(REVERT ? 'MODO REVERT: se vuelven a dejar sin categoría.\n' : 'Completando categorías inventadas por nosotros.\n')

let escritos = 0
let yaEstaban = 0
const faltantes = []

for (const [slug, [nombre, slugCat]] of Object.entries(MAPEO)) {
  const actual = porSlug.get(slug)
  if (!actual) {
    faltantes.push(slug)
    continue
  }

  const objetivoNombres = REVERT ? [] : [nombre]
  const objetivoSlugs = REVERT ? [] : [slugCat]

  if (iguales(actual.categorias, objetivoNombres) && iguales(actual.categorias_slug, objetivoSlugs)) {
    yaEstaban += 1
    console.log(`  =  ${slug.padEnd(48)} ya estaba en ${JSON.stringify(objetivoNombres)}`)
    continue
  }

  console.log(
    `  ${DRY ? '~' : '→'}  ${slug.padEnd(48)} ${JSON.stringify(actual.categorias ?? [])} -> ${JSON.stringify(objetivoNombres)}  (${actual.chunks} chunks)`,
  )
  if (!DRY) {
    await patch(slug, objetivoNombres, objetivoSlugs)
    escritos += 1
  }
}

if (faltantes.length) {
  console.log(`\n⚠ slugs del mapeo que no existen en el corpus: ${faltantes.join(', ')}`)
}

console.log(`\n${DRY ? '(dry-run) ' : ''}actualizados: ${escritos} · sin cambios: ${yaEstaban}`)

// --- Verificación: ningún trámite sin categoría ---
if (!DRY) {
  const despues = await sb('tramite_chunks_v2', 'select=slug,titulo_tramite,categorias&limit=2000')
  const m = new Map()
  for (const c of despues) if (!m.has(c.slug)) m.set(c.slug, c)
  const sinCategoria = [...m.values()].filter((c) => !(c.categorias ?? []).length)

  console.log(`\ntrámites en el corpus: ${m.size}`)
  console.log(`sin categoría: ${sinCategoria.length}${REVERT ? '' : ' (esperado 0)'}`)
  for (const c of sinCategoria) console.log(`  ${c.titulo_tramite} (${c.slug})`)

  const conteo = {}
  for (const c of m.values()) for (const n of c.categorias ?? []) conteo[n] = (conteo[n] ?? 0) + 1
  console.log('\ntrámites por categoría:')
  for (const [n, k] of Object.entries(conteo).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padStart(3)}  ${n}`)

  process.exitCode = REVERT || sinCategoria.length === 0 ? 0 : 1
}
