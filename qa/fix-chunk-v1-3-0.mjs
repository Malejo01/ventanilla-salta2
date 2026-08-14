// Corrección puntual del chunk `v1-3-0` (CUD — Marco general nacional).
//
// Venía de la migración v1 como `institucional` porque su sección "Alcance de
// este documento" mezclaba dos cosas: referencias internas al repo del corpus
// (`cud-provincial-COMPLEMENTO.md`, `cud-certificado-discapacidad-provincia.md`)
// y un dato útil para el ciudadano — dónde se tramita el CUD en Salta y cómo
// sacar turno.
//
// Se descarta la referencia interna y se conserva el dato útil, con
// tipo_contenido = 'tramite' para que vuelva a ser recuperable. Se re-embebe
// porque cambió el texto.
//
// Idempotente: si el chunk ya está corregido, no hace nada.
//
// Uso: node qa/fix-chunk-v1-3-0.mjs
import crypto from 'node:crypto'
import { env, sb, sbHeaders, embed } from './lib-corpus.mjs'

const ID = 'v1-3-0'

const TEXTO = `Trámite: Certificado Único de Discapacidad (CUD) — Marco general nacional

## Dónde se tramita en Salta
El CUD se rige por un **proceso general nacional**. En Salta ese proceso se instrumenta a través de
la **Secretaría de Discapacidad y Políticas Inclusivas de la Provincia**, ubicada en **Av. Jujuy 402**.
El **turno se saca llamando al 148**.`

const SECCION = 'Dónde se tramita en Salta'

const [actual] = await sb('tramite_chunks_v2', `select=id,tipo_contenido,titulo_seccion,texto_display&id=eq.${ID}`)
if (!actual) {
  console.error(`No existe el chunk ${ID}. ¿Corriste qa/migrar-v1-a-v2.mjs?`)
  process.exit(1)
}

if (actual.tipo_contenido === 'tramite' && actual.titulo_seccion === SECCION) {
  console.log(`${ID} ya está corregido. Nada que hacer.`)
  process.exit(0)
}

console.log(`Corrigiendo ${ID}…`)
console.log(`  antes : tipo=${actual.tipo_contenido} seccion="${actual.titulo_seccion}"`)

const vector = await embed(TEXTO, 'RETRIEVAL_DOCUMENT')

const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tramite_chunks_v2?id=eq.${ID}`, {
  method: 'PATCH',
  headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({
    titulo_seccion: SECCION,
    texto_embedding: TEXTO,
    texto_display: TEXTO,
    tipo_contenido: 'tramite',
    hash_contenido: crypto.createHash('sha256').update(TEXTO).digest('hex'),
    embedding: JSON.stringify(vector),
  }),
})
if (!res.ok) {
  console.error(`PATCH falló: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const [despues] = await sb('tramite_chunks_v2', `select=id,tipo_contenido,titulo_seccion&id=eq.${ID}`)
console.log(`  después: tipo=${despues.tipo_contenido} seccion="${despues.titulo_seccion}"`)
console.log('Listo.')
