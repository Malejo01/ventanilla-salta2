-- ============================================================================
-- 001 · tramite_chunks_v2 — tabla + índices NO vectoriales
-- ============================================================================
-- Tabla nueva, EN PARALELO a `tramite_chunks`. La tabla actual sigue sirviendo
-- producción y no se toca en ninguna de estas migraciones.
--
-- Motivo del cambio: el retrieval hoy es coseno en JS sobre toda la KB cacheada
-- en memoria del proceso (app/api/chat/route.ts). Con ~700 chunks y creciendo
-- eso tiene dos problemas concretos:
--   1. Traer todos los embeddings de 768 dims en cada cold start es caro.
--   2. El `select` sin paginar cruza el límite por defecto de 1000 filas de
--      PostgREST, que TRUNCA EN SILENCIO — sin error, sin warning.
--
-- ORDEN: esta migración se aplica ANTES de cargar los datos.
--        El índice ivfflat va aparte (migración 003) y DESPUÉS de la carga.
--        Ver supabase/ORDEN-DE-APLICACION.md.
-- ============================================================================

create extension if not exists vector with schema extensions;

-- ----------------------------------------------------------------------------
-- Tabla
-- ----------------------------------------------------------------------------
-- Casi todas las columnas quedan nullable a propósito: la carga inicial del
-- corpus no debe fallar por un campo faltante en un chunk suelto. `embedding`
-- también es nullable para poder cargar el texto primero y embeddear después;
-- la función de match filtra `embedding is not null`.
create table if not exists public.tramite_chunks_v2 (
  id                    text primary key,
  tramite_id            int,
  slug                  text,
  titulo_tramite        text,
  categorias            text[],
  categorias_slug       text[],
  subtramite            text,
  titulo_seccion        text,
  texto_embedding       text,
  texto_display         text,
  enlaces               jsonb,
  indice                int,
  indice_en_subtramite  int,
  total_secciones       int,
  es_secuencial         boolean,
  parte                 int,
  total_partes          int,
  universo              text,
  estructura            text,
  tipo_contenido        text,
  es_mas_consultado     boolean,
  sin_categoria         boolean,
  url_origen            text,
  modified              timestamptz,
  fecha_scraping        timestamptz,
  hash_contenido        text,
  -- 768 dims = configuración de `gemini-embedding-001` con
  -- `outputDimensionality: 768`. Si algún día se cambia el modelo o la
  -- dimensionalidad hay que recrear tabla e índice: `vector(n)` es rígido.
  embedding             vector(768)
);

comment on table public.tramite_chunks_v2 is
  'Chunks del corpus de trámites (tuki-corpus) con embedding de 768 dims para búsqueda por similitud coseno. Reemplaza gradualmente a tramite_chunks.';

comment on column public.tramite_chunks_v2.texto_embedding is
  'Texto que se embeddeó. Puede diferir de texto_display (normalizaciones, contexto agregado).';
comment on column public.tramite_chunks_v2.texto_display is
  'Texto que se le pasa al LLM / se muestra al usuario.';
comment on column public.tramite_chunks_v2.tipo_contenido is
  'Tipo de chunk. "institucional" = organigrama y competencias de área, NO trámites: se excluye del retrieval por defecto.';
comment on column public.tramite_chunks_v2.embedding is
  'vector(768) — gemini-embedding-001 con outputDimensionality: 768. Se compara SIEMPRE con <=> (coseno), nunca con <-> (L2).';

-- ----------------------------------------------------------------------------
-- Índices no vectoriales (filtros y joins que no pasan por el embedding)
-- ----------------------------------------------------------------------------
-- Estos sí se pueden crear con la tabla vacía: B-tree y GIN se mantienen
-- correctos ante inserciones posteriores. El único índice sensible al momento
-- de creación es el ivfflat (ver migración 003).

create index if not exists idx_tramite_chunks_v2_slug
  on public.tramite_chunks_v2 (slug);

create index if not exists idx_tramite_chunks_v2_tramite_id
  on public.tramite_chunks_v2 (tramite_id);

-- GIN para el array: habilita `categorias_slug @> array['comercial']`
-- y `'comercial' = any(categorias_slug)` de forma indexada.
create index if not exists idx_tramite_chunks_v2_categorias_slug
  on public.tramite_chunks_v2 using gin (categorias_slug);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
-- Se habilita sin políticas: la app accede con `service_role` (lib/supabase-admin.ts),
-- que bypassea RLS, y el acceso público va exclusivamente por la función RPC
-- `match_tramite_chunks_v2` (security definer, migración 002). Nadie con la
-- anon key puede hacer un `select *` de la tabla completa.
alter table public.tramite_chunks_v2 enable row level security;
