-- ============================================================================
-- 004 · Columna `origen` en tramite_chunks_v2
-- ============================================================================
-- Distingue el corpus scrapeado (tuki-corpus) del contenido curado a mano que
-- venía en la tabla vieja `tramite_chunks` y se migró para que v2 fuera
-- superconjunto de v1.
--
-- Contexto: v2 tenía 126 trámites contra los 17 de v1, pero NO era superconjunto.
-- Faltaban 7 trámites curados, 76 chunks — entre ellos el Carnet de Manipulación
-- de Alimentos (la "libreta sanitaria"), que es requisito para el caso de demo
-- del foodtruck, y la Guía de venta en vía pública que regula ese permiso.
--
-- Las filas migradas ya están insertadas (script qa/migrar-v1-a-v2.mjs) con el
-- prefijo `v1-` en el id, así que el UPDATE de abajo es exacto.
--
-- ORDEN: se aplica DESPUÉS de correr qa/migrar-v1-a-v2.mjs. Si se corre antes,
--        el alter table igual funciona y el update no afecta ninguna fila; el
--        script de migración deja las filas con el default 'scraping' y hay que
--        volver a correr el update.
-- ============================================================================

alter table public.tramite_chunks_v2
  add column if not exists origen text not null default 'scraping';

comment on column public.tramite_chunks_v2.origen is
  '"scraping" = corpus automático de tuki-corpus. "curado_v1" = migrado a mano desde la tabla tramite_chunks (v1).';

update public.tramite_chunks_v2
   set origen = 'curado_v1'
 where id like 'v1-%'
   and origen is distinct from 'curado_v1';

-- Verificación:
--   select origen, count(*) from public.tramite_chunks_v2 group by origen;
--   esperado: scraping 682, curado_v1 76
--
-- Rollback de la migración de contenido (se lleva las 76 filas, no la columna):
--   delete from public.tramite_chunks_v2 where id like 'v1-%';

-- ----------------------------------------------------------------------------
-- Nota sobre match_tramite_chunks_v2
-- ----------------------------------------------------------------------------
-- La RPC NO devuelve `origen` y no hace falta tocarla: selecciona columnas
-- explícitas, así que agregar una columna no la rompe.
--
-- Si en algún momento se quiere `origen` en el retorno (por ejemplo para medir
-- qué porcentaje de las respuestas se apoya en contenido curado), OJO: no
-- alcanza con `create or replace`, porque cambiar el RETURNS TABLE exige
-- borrar la función primero:
--
--   drop function if exists public.match_tramite_chunks_v2(vector, int, text, boolean);
--   -- y volver a crearla con `origen text` agregado al returns table,
--   -- `c.origen` en el select, y re-aplicar los grant/revoke de la migración 002.
