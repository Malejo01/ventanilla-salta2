# Orden de aplicación — `tramite_chunks_v2`

Migraciones para mover el retrieval de `/api/chat` desde coseno en JS sobre la KB
cacheada hacia una función RPC con índice pgvector.

**Nada de esto toca `tramites` ni `tramite_chunks`.** La tabla vieja sigue
sirviendo producción hasta que `app/api/chat/route.ts` se apunte a la nueva.

## Archivos

| # | Archivo | Cuándo |
|---|---|---|
| 001 | `migrations/20260813120000_create_tramite_chunks_v2.sql` | **antes** de cargar datos |
| 002 | `migrations/20260813120100_match_tramite_chunks_v2.sql` | antes o después (indistinto) |
| — | *carga del corpus* | — |
| 003 | `migrations/20260813120200_index_ivfflat_tramite_chunks_v2.sql` | **después** de cargar datos |

El orden no es una preferencia de estilo: **003 sobre tabla vacía construye
centroides basura y degrada el retrieval sin emitir ningún error.** Por eso 003
arranca con un `do $$` que aborta si no hay filas con embedding.

---

## Secuencia

### 1. Aplicar 001 y 002

```bash
supabase db push --include-all
```

Si se corre con las tres migraciones pendientes, 001 y 002 aplican y **003 falla
a propósito** con:

```
tramite_chunks_v2 no tiene filas con embedding. Cargá el corpus ANTES de crear
el índice ivfflat...
```

Eso es el comportamiento esperado. 003 queda sin registrar y se vuelve a aplicar
en el paso 3.

> Si el CLI de tu versión revierte el batch completo ante un fallo, aplicá 001 y
> 002 sueltos desde el SQL Editor de Supabase (copiar/pegar en orden) y dejá 003
> para después.

Verificación:

```sql
-- 1. La tabla existe con las 27 columnas + embedding
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'tramite_chunks_v2'
order by ordinal_position;

-- 2. La función quedó security definer con el search_path correcto
select proname, prosecdef, proconfig
from pg_proc
where proname = 'match_tramite_chunks_v2';
-- esperado: prosecdef = t, proconfig = {"search_path=extensions, public"}

-- 3. Índices no vectoriales presentes (slug, tramite_id, categorias_slug GIN)
select indexname from pg_indexes
where tablename = 'tramite_chunks_v2';
```

### 2. Cargar el corpus

Insertar los ~700 chunks de `tuki-corpus` en `public.tramite_chunks_v2`.

Requisitos de la carga:

- `id` es la PK (`text`). Usar `upsert on conflict (id) do update` para poder
  re-correr la carga sin duplicar.
- `embedding` tiene que ser **768 dims** — `gemini-embedding-001` con
  `outputDimensionality: 768`. Un vector de otra dimensión es rechazado por el
  tipo `vector(768)` (esto sí falla ruidosamente).
- Insertar por lotes (500–1000 filas) para no timeoutear.
- Ojo con PostgREST: si la carga lee de vuelta lo insertado, el límite por
  defecto de 1000 filas trunca **sin error**. Contar siempre con SQL, no con el
  largo del array que devuelve el cliente.

Verificación antes de seguir:

```sql
select
  count(*)                                      as filas,
  count(embedding)                              as con_embedding,
  count(*) filter (where tipo_contenido = 'institucional') as institucionales,
  min(vector_dims(embedding))                   as dims_min,
  max(vector_dims(embedding))                   as dims_max
from public.tramite_chunks_v2;
-- dims_min = dims_max = 768, con_embedding = filas
```

> Si `vector_dims` no resuelve en el SQL Editor, calificarlo:
> `extensions.vector_dims(embedding)`. La función de retrieval no depende de
> esto — ya fija `search_path = extensions, public`.

### 3. Aplicar 003 (índice ivfflat)

```bash
supabase db push
```

La salida debe incluir el `NOTICE` con el conteo real y el `lists` sugerido:

```
NOTICE: tramite_chunks_v2: 700 filas con embedding. lists en uso = 26, lists sugerido = sqrt(700) ≈ 26
```

Si aparece un `WARNING` diciendo que `lists` está lejos del sugerido, editar el
`with (lists = N)` de 003 (y el `lists_actual` del bloque de guarda) antes de
continuar.

---

## Cómo verificar que el índice quedó bien construido

### a) Opclass = coseno, no L2

El error clásico. `<=>` (coseno) sólo usa el índice si el opclass es
`vector_cosine_ops`; con `vector_l2_ops` (`<->`) el planner lo descarta en
silencio.

```sql
select
  i.relname            as indice,
  am.amname            as metodo,
  opc.opcname          as opclass,
  i.reloptions         as opciones
from pg_index x
join pg_class    i   on i.oid = x.indexrelid
join pg_class    t   on t.oid = x.indrelid
join pg_am       am  on am.oid = i.relam
join pg_opclass  opc on opc.oid = x.indclass[0]
where t.relname = 'tramite_chunks_v2'
  and am.amname = 'ivfflat';
```

Esperado:

| indice | metodo | opclass | opciones |
|---|---|---|---|
| `idx_tramite_chunks_v2_embedding_ivfflat` | `ivfflat` | `vector_cosine_ops` | `{lists=26}` |

### b) El índice es usable

```sql
set enable_seqscan = off;

explain (analyze, buffers)
select id, 1 - (embedding <=> (select embedding from public.tramite_chunks_v2 where embedding is not null limit 1)) as sim
from public.tramite_chunks_v2
order by embedding <=> (select embedding from public.tramite_chunks_v2 where embedding is not null limit 1)
limit 5;

reset enable_seqscan;
```

Tiene que aparecer `Index Scan using idx_tramite_chunks_v2_embedding_ivfflat`.
Si aparece `Seq Scan` incluso con `enable_seqscan = off`, el índice no es
aplicable a esa query → revisar (a): casi seguro es el operador o el opclass.

**Con `enable_seqscan` en su valor normal, un `Seq Scan` a 700 filas no es un
bug**: el planner puede estimar que el scan secuencial es más barato y tener
razón. Lo que se está verificando acá es que el índice *pueda* usarse, no que
siempre se use.

### c) La función devuelve resultados y scores sanos

Smoke test sin necesidad de llamar a Gemini — se usa el embedding de una fila
existente como query:

```sql
select slug, titulo_seccion, tipo_contenido, round(similarity::numeric, 4) as sim
from public.match_tramite_chunks_v2(
  (select embedding from public.tramite_chunks_v2 where embedding is not null limit 1),
  5
);
```

Lecturas esperadas:

- 5 filas.
- La primera con `sim` ≈ `1.0000` (se está matcheando consigo misma). Si da
  ~0.5 o negativo, hay un problema de normalización o de dimensionalidad.
- El resto entre ~0.4 y ~0.9. Todo pegado en 0.99 huele a embeddings idénticos
  (¿se embeddeó el mismo texto para todos?); todo por debajo de 0.3 huele a
  vectores desalineados.
- `tipo_contenido` nunca `institucional`, salvo que se pase
  `excluir_institucional => false`.

Y los filtros:

```sql
-- filtro por categoría
select slug, categorias_slug, round(similarity::numeric, 4)
from public.match_tramite_chunks_v2(
  query_embedding  => (select embedding from public.tramite_chunks_v2 where embedding is not null limit 1),
  match_count      => 5,
  filtro_categoria => 'comercial'
);

-- sin excluir institucional: el conteo de institucionales debe poder subir
select count(*) filter (where tipo_contenido = 'institucional')
from public.match_tramite_chunks_v2(
  query_embedding       => (select embedding from public.tramite_chunks_v2 where embedding is not null limit 1),
  match_count           => 50,
  excluir_institucional => false
);
```

### d) Recall del índice vs. exacto

El ivfflat es aproximado: puede perderse resultados. Comparar contra el ranking
exacto (seq scan) para ver cuánto:

```sql
with q as (
  select embedding from public.tramite_chunks_v2 where embedding is not null limit 1
),
exacto as (
  select id from (
    select id from public.tramite_chunks_v2, q
    where embedding is not null
    order by tramite_chunks_v2.embedding <=> q.embedding
    limit 10
  ) s
),
aprox as (
  select m.id from q, lateral public.match_tramite_chunks_v2(q.embedding, 10, null, false) m
)
select count(*) as coincidencias_top10 from exacto join aprox using (id);
```

Con 700 filas y `lists = 26` esperar 9–10 de 10. Si baja de 8, subir
`ivfflat.probes` (ver el bloque de tuning al final de 003).

---

## Rollback

Las tres migraciones son aditivas y no tocan nada existente:

```sql
drop function if exists public.match_tramite_chunks_v2(vector, int, text, boolean);
drop table if exists public.tramite_chunks_v2;   -- se lleva sus índices
```

Para reconstruir sólo el índice (por ejemplo tras un crecimiento grande del
corpus):

```sql
drop index if exists public.idx_tramite_chunks_v2_embedding_ivfflat;
-- editar `lists` en 003 y re-aplicar, o inline:
create index idx_tramite_chunks_v2_embedding_ivfflat
  on public.tramite_chunks_v2 using ivfflat (embedding vector_cosine_ops)
  with (lists = 26);
analyze public.tramite_chunks_v2;
```

---

## Después de esto (fuera del alcance de estas migraciones)

`app/api/chat/route.ts` sigue usando `tramite_chunks` + coseno en JS
(`loadKnowledgeBase`, `cosineSimilarity`, `buscarChunks`, `kbCache`). El
siguiente paso es cambiar `buscarChunks` por un
`supabaseAdmin.rpc('match_tramite_chunks_v2', { query_embedding, match_count })`
y borrar el caché de KB — con eso desaparecen tanto el costo de cold start como
el truncado silencioso a 1000 filas de PostgREST.
