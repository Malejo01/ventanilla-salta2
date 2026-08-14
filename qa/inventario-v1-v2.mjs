// Inventario de cobertura: qué trámites de la tabla vieja `tramites`/`tramite_chunks`
// tienen equivalente en `tramite_chunks_v2` y cuáles no. Solo lectura.
//
// La señal fuerte es la URL oficial: si dos filas apuntan a la misma página, es
// el mismo trámite aunque el slug haya cambiado de convención entre v1 y v2
// (`exencion-jubilados-pensionados` vs `exencion-para-jubilados-y-pensionados`).
//
// Uso: node qa/inventario-v1-v2.mjs
import { sb } from './lib-corpus.mjs'

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'y', 'en', 'por', 'con', 'a', 'al', 'un', 'una', 'tramite', 'tramites'])
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t && !STOP.has(t)))
const jaccard = (a, b) => {
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : [...a].filter((t) => b.has(t)).length / union
}
const limpiarUrl = (u) => (u ?? '').trim().replace(/\/+$/, '')

const tramitesV1 = await sb('tramites', 'select=id,slug,categoria,url,ultima_verificacion&order=id')
const chunksV1 = await sb('tramite_chunks', 'select=tramite_id&limit=2000')
const v2 = await sb('tramite_chunks_v2', 'select=slug,titulo_tramite,url_origen&limit=2000')

const cuentaV1 = new Map()
for (const c of chunksV1) cuentaV1.set(c.tramite_id, (cuentaV1.get(c.tramite_id) ?? 0) + 1)

const v2PorSlug = new Map()
const v2PorUrl = new Map()
for (const c of v2) {
  if (!v2PorSlug.has(c.slug)) v2PorSlug.set(c.slug, c)
  if (c.url_origen) v2PorUrl.set(limpiarUrl(c.url_origen), c.slug)
}

console.log(`v1: ${tramitesV1.length} trámites, ${chunksV1.length} chunks`)
console.log(`v2: ${v2PorSlug.size} trámites, ${v2.length} chunks\n`)

const presentes = []
const faltantes = []
for (const t of tramitesV1) {
  const porUrl = v2PorUrl.get(limpiarUrl(t.url))
  const porSlug = v2PorSlug.has(t.slug) ? t.slug : null
  const tk = tokens(t.slug)
  const mejor = [...v2PorSlug.values()]
    .map((c) => ({ slug: c.slug, score: Math.max(jaccard(tk, tokens(c.slug)), jaccard(tk, tokens(c.titulo_tramite))) }))
    .sort((a, b) => b.score - a.score)[0]

  const equivalente = porUrl ?? porSlug ?? (mejor.score >= 0.6 ? mejor.slug : null)
  const fila = {
    id: t.id,
    slug_v1: t.slug,
    chunks: cuentaV1.get(t.id) ?? 0,
    equivalente_v2: equivalente,
    via: porUrl ? 'url' : porSlug ? 'slug' : equivalente ? `titulo (${mejor.score.toFixed(2)})` : '—',
  }
  ;(equivalente ? presentes : faltantes).push(fila)
}

console.log(`CON equivalente en v2 (${presentes.length}):`)
console.table(presentes)
console.log(`\nSIN equivalente en v2 (${faltantes.length}) — ${faltantes.reduce((a, f) => a + f.chunks, 0)} chunks:`)
console.table(faltantes)

if (faltantes.length) {
  console.log('\nEstos trámites solo existen en el corpus curado v1.')
  console.log('Para migrarlos: node qa/migrar-v1-a-v2.mjs --dry-run')
} else {
  console.log('\nv2 es superconjunto de v1.')
}
