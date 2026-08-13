-- ============================================================================
-- 002 · match_tramite_chunks_v2 — función RPC de retrieval por similitud
-- ============================================================================
-- Reemplaza el cálculo de coseno en JS de app/api/chat/route.ts: en vez de
-- traer toda la KB y rankear en memoria, la base devuelve los top-N chunks.
--
-- ORDEN: se puede aplicar antes o después de cargar los datos — la función no
--        depende del índice para ser correcta, sólo para ser rápida. Sin índice
--        hace seq scan + sort exacto (que a 700 filas igual responde en pocos
--        ms). Ver supabase/ORDEN-DE-APLICACION.md.
--
-- DECISIONES CLAVE
--
--   * Operador `<=>` = distancia COSENO. NUNCA `<->` (L2 / euclidiana).
--     Tiene que matchear el opclass del índice, que es `vector_cosine_ops`
--     (migración 003). Si no matchean, el planner ignora el índice en silencio
--     y además el ranking cambia. Este error ya se cometió una vez.
--     similarity = 1 - distancia_coseno  →  rango [0, 2], en la práctica [0, 1].
--
--   * Devuelve `similarity` explícitamente. Hoy el score se descarta y eso hace
--     imposible diagnosticar un retrieval malo (¿matcheó flojo? ¿matcheó bien
--     pero el prompt lo ignoró?). El umbral MIN_SIMILARITY (0.5) del route.ts
--     se aplica del lado de la app sobre este valor.
--
--   * Devuelve TODAS las columnas menos `embedding`. Son 5 filas por request;
--     el costo de payload es despreciable frente a tener que migrar la función
--     cada vez que la app necesita un campo más.
-- ============================================================================

create or replace function public.match_tramite_chunks_v2(
  query_embedding       vector(768),
  match_count           int     default 5,
  filtro_categoria      text    default null,
  excluir_institucional boolean default true
)
returns table (
  id                    text,
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
  similarity            float
)
language sql
stable
parallel safe
security definer
-- Mismo patrón que el resto de las funciones del proyecto: search_path fijo
-- para que `vector` / `<=>` resuelvan contra el schema `extensions` de Supabase
-- y para que un search_path malicioso del caller no pueda secuestrar la función.
set search_path = extensions, public
as $$
  select
    c.id,
    c.tramite_id,
    c.slug,
    c.titulo_tramite,
    c.categorias,
    c.categorias_slug,
    c.subtramite,
    c.titulo_seccion,
    c.texto_embedding,
    c.texto_display,
    c.enlaces,
    c.indice,
    c.indice_en_subtramite,
    c.total_secciones,
    c.es_secuencial,
    c.parte,
    c.total_partes,
    c.universo,
    c.estructura,
    c.tipo_contenido,
    c.es_mas_consultado,
    c.sin_categoria,
    c.url_origen,
    c.modified,
    c.fecha_scraping,
    c.hash_contenido,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.tramite_chunks_v2 as c
  where c.embedding is not null
    -- Filtro opcional por categoría: null = sin filtro.
    and (
      filtro_categoria is null
      or c.categorias_slug @> array[filtro_categoria]
    )
    -- "institucional" = organigrama y competencias de área, no trámites.
    -- `is distinct from` para que los chunks con tipo_contenido null pasen.
    and (
      not excluir_institucional
      or c.tipo_contenido is distinct from 'institucional'
    )
  order by c.embedding <=> query_embedding   -- <=> coseno. NO <->.
  limit greatest(coalesce(match_count, 5), 1);
$$;

comment on function public.match_tramite_chunks_v2(vector, int, text, boolean) is
  'Top-N chunks de tramite_chunks_v2 por similitud coseno (<=>), con similarity en el retorno. filtro_categoria matchea contra categorias_slug; excluir_institucional descarta tipo_contenido = ''institucional''.';

-- ----------------------------------------------------------------------------
-- Permisos
-- ----------------------------------------------------------------------------
-- `create function` otorga EXECUTE a PUBLIC por defecto, lo que incluiría a
-- `anon`. Se revoca: hoy la app llama con service_role desde el server
-- (lib/supabase-admin.ts) y no hay razón para exponer el retrieval a cualquiera
-- con la anon key.
revoke execute on function public.match_tramite_chunks_v2(vector, int, text, boolean) from public;
grant  execute on function public.match_tramite_chunks_v2(vector, int, text, boolean) to service_role;
grant  execute on function public.match_tramite_chunks_v2(vector, int, text, boolean) to authenticated;

-- Si en algún momento se llama al RPC desde el cliente con la anon key,
-- descomentar:
-- grant execute on function public.match_tramite_chunks_v2(vector, int, text, boolean) to anon;
