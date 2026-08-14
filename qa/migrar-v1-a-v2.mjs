// Migra a `tramite_chunks_v2` los trámites de la tabla v1 que no tienen
// equivalente en v2 (ver qa/inventario-v1-v2.mjs para cómo se determinó).
//
// - Re-embebe cada chunk con gemini-embedding-001, 768 dims,
//   taskType RETRIEVAL_DOCUMENT. Los embeddings guardados en v1 NO sirven:
//   se generaron sin taskType, o sea en el espacio RETRIEVAL_QUERY.
// - fecha_scraping = tramites.ultima_verificacion real de v1, no hoy.
// - id = `v1-<tramite_id>-<indice>` — prefijo que hace triviales el UPDATE de
//   `origen` y el rollback (`delete ... where id like 'v1-%'`).
// - Idempotente: upsert por id. Se puede re-correr sin duplicar.
//
// Uso: node qa/migrar-v1-a-v2.mjs [--dry-run]
import crypto from 'node:crypto'
import { env, sb, sbHeaders, embed } from './lib-corpus.mjs'

const DRY = process.argv.includes('--dry-run')

// Los 7 trámites de v1 sin equivalente en v2 (id de la tabla `tramites`).
const FALTANTES = [2, 3, 4, 5, 15, 16, 17]

// Chunks que son notas internas del equipo, no contenido para el ciudadano:
// mencionan archivos .md del repo del corpus, rutas `_raw/`, mecánica de
// scraping o "antes de usarlo en la demo". Se migran igual (no se pierde nada)
// pero como `institucional`, que es lo que la RPC ya excluye por defecto.
const NOTAS_INTERNAS = new Set([339, 340, 351, 373, 374])

const CATEGORIAS = {
  comercial: [['Comerciales'], ['comerciales']],
  social: [['Desarrollo Social'], ['desarrollo-social']],
  'infraestructura-digital': [['Plataformas digitales'], ['plataformas-digitales']],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tramites = await sb('tramites', 'select=*&order=id')
const chunks = await sb('tramite_chunks', 'select=id,tramite_id,chunk_texto&order=id&limit=2000')

const filas = []
for (const tid of FALTANTES) {
  const t = tramites.find((x) => x.id === tid)
  const propios = chunks.filter((c) => c.tramite_id === tid)
  const titulo = propios[0].chunk_texto.match(/^Tr[áa]mite:\s*(.+)$/m)?.[1]?.trim()
  if (!titulo) throw new Error(`sin título para tramite ${tid}`)
  const [categorias, categoriasSlug] = CATEGORIAS[t.categoria] ?? [[], []]

  propios.forEach((c, i) => {
    // Primer encabezado ## de la sección, limpiando artefactos tipo "## # Foo".
    const seccion = c.chunk_texto.match(/^##\s*(.+)$/m)?.[1]?.replace(/^#+\s*/, '').trim() ?? null
    filas.push({
      id: `v1-${tid}-${i}`,
      tramite_id: tid,
      slug: t.slug.toLowerCase(),
      titulo_tramite: titulo,
      categorias,
      categorias_slug: categoriasSlug,
      subtramite: null,
      titulo_seccion: seccion,
      texto_embedding: c.chunk_texto,
      texto_display: c.chunk_texto,
      enlaces: [],
      indice: i,
      indice_en_subtramite: i,
      total_secciones: propios.length,
      es_secuencial: false,
      parte: null,
      total_partes: null,
      universo: null,
      estructura: 'markdown',
      tipo_contenido: NOTAS_INTERNAS.has(c.id) ? 'institucional' : 'tramite',
      es_mas_consultado: false,
      sin_categoria: categorias.length === 0,
      url_origen: t.url?.trim() ? t.url.trim() : null,
      modified: null,
      fecha_scraping: t.ultima_verificacion,
      hash_contenido: crypto.createHash('sha256').update(c.chunk_texto).digest('hex'),
      _chunk_v1: c.id,
    })
  })
}

console.log(`Van a migrarse ${filas.length} chunks de ${FALTANTES.length} trámites:\n`)
for (const tid of FALTANTES) {
  const f = filas.filter((x) => x.tramite_id === tid)
  const inst = f.filter((x) => x.tipo_contenido === 'institucional').length
  console.log(
    `  [${String(tid).padStart(2)}] ${f[0].slug.padEnd(40)} ${String(f.length).padStart(2)} chunks` +
      `${inst ? ` (${inst} como institucional)` : ''}  fecha_scraping=${f[0].fecha_scraping}  url=${f[0].url_origen ?? 'NULL'}`,
  )
  console.log(`       título: ${f[0].titulo_tramite}`)
  console.log(`       categorias: ${JSON.stringify(f[0].categorias)}`)
}

if (DRY) {
  console.log('\n--dry-run: no se escribió nada.')
  const ej = { ...filas[0] }
  delete ej._chunk_v1
  console.log('\nFila de ejemplo (sin embedding):')
  console.log(JSON.stringify({ ...ej, texto_embedding: ej.texto_embedding.slice(0, 80) + '…', texto_display: '(idem)' }, null, 2))
  process.exit(0)
}

// --- Embeddings (concurrencia 4 para no golpear el rate limit) ---
console.log(`\nGenerando ${filas.length} embeddings con taskType RETRIEVAL_DOCUMENT…`)
let hechos = 0
const cola = [...filas]
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cola.length) {
      const f = cola.shift()
      f.embedding = JSON.stringify(await embed(f.texto_embedding, 'RETRIEVAL_DOCUMENT'))
      hechos += 1
      if (hechos % 10 === 0) console.log(`  ${hechos}/${filas.length}`)
    }
  }),
)
console.log(`  ${hechos}/${filas.length} listos`)

// --- Upsert por lotes ---
console.log('\nInsertando en tramite_chunks_v2 (upsert por id)…')
for (let i = 0; i < filas.length; i += 20) {
  const lote = filas.slice(i, i + 20).map(({ _chunk_v1, ...r }) => r)
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tramite_chunks_v2?on_conflict=id`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(lote),
  })
  if (!res.ok) {
    console.error(`FALLÓ el lote ${i}-${i + lote.length}: ${res.status}`)
    console.error(await res.text())
    process.exit(1)
  }
  console.log(`  ${Math.min(i + 20, filas.length)}/${filas.length}`)
}

const total = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tramite_chunks_v2?select=id&limit=1`, {
  headers: { ...sbHeaders, Prefer: 'count=exact' },
}).then((r) => r.headers.get('content-range'))
console.log(`\nListo. Filas totales en tramite_chunks_v2: ${total}`)
