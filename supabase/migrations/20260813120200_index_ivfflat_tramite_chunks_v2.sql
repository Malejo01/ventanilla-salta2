-- ============================================================================
-- 003 · Índice ivfflat sobre tramite_chunks_v2.embedding
-- ============================================================================
--
--   ⚠  ESTA MIGRACIÓN SE APLICA **DESPUÉS** DE CARGAR LOS DATOS. ⚠
--
-- Por qué está en un archivo separado y no junto a la tabla:
--
-- ivfflat no es un índice incremental como B-tree. Al construirse corre k-means
-- sobre las filas que existen EN ESE MOMENTO y congela los centroides de las
-- `lists` particiones. Las filas que se insertan después se asignan al centroide
-- más cercano de ese conjunto ya fijo.
--
-- Construirlo sobre una tabla vacía (o casi) produce centroides basura. El
-- índice se crea sin error, las queries corren sin error, y el retrieval
-- devuelve resultados peores — silenciosamente. No hay ninguna señal de que
-- algo esté mal salvo mirar la calidad de las respuestas.
--
-- Corolario: si el corpus crece de forma significativa (digamos >2x), hay que
-- RECONSTRUIR el índice — no alcanza con dejarlo ahí. Ver el bloque `lists`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Guarda: falla ruidosamente si la tabla está vacía
-- ----------------------------------------------------------------------------
-- Convierte el error silencioso descrito arriba en un error explícito.
do $$
declare
  filas         bigint;
  lists_actual  int := 26;   -- mantener sincronizado con el CREATE INDEX de abajo
  lists_sugerido int;
begin
  select count(*) into filas
  from public.tramite_chunks_v2
  where embedding is not null;

  if filas = 0 then
    raise exception
      'tramite_chunks_v2 no tiene filas con embedding. Cargá el corpus ANTES de crear el índice ivfflat — construirlo vacío degrada el retrieval sin emitir ningún error. Ver supabase/ORDEN-DE-APLICACION.md';
  end if;

  lists_sugerido := greatest(1, round(sqrt(filas))::int);

  raise notice 'tramite_chunks_v2: % filas con embedding. lists en uso = %, lists sugerido = sqrt(%) ≈ %',
    filas, lists_actual, filas, lists_sugerido;

  -- Tolerancia amplia a propósito: lists no necesita ser exacto, pero si está
  -- desviado más de ~2x conviene recalcularlo antes de seguir.
  if lists_sugerido > lists_actual * 2 or lists_sugerido * 2 < lists_actual then
    raise warning
      'lists = % está lejos del sugerido (%) para % filas. Considerá ajustar el CREATE INDEX antes de aplicar esta migración.',
      lists_actual, lists_sugerido, filas;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Índice
-- ----------------------------------------------------------------------------
-- lists ≈ sqrt(filas esperadas).
--   ~700 chunks → sqrt(700) ≈ 26.4 → lists = 26
--
-- Cómo recalcularlo si el corpus crece:
--   select round(sqrt(count(*))) from public.tramite_chunks_v2 where embedding is not null;
-- (regla de pgvector: sqrt(n) hasta 1M filas; n/1000 por encima de eso)
-- y después:
--   drop index if exists public.idx_tramite_chunks_v2_embedding_ivfflat;
--   create index ... with (lists = <nuevo>);
--   analyze public.tramite_chunks_v2;
--
-- vector_cosine_ops ⇄ operador `<=>`. La función match_tramite_chunks_v2 ordena
-- por `<=>`; si acá se pusiera vector_l2_ops (`<->`) el opclass no matchearía,
-- el planner descartaría el índice sin avisar y volveríamos a seq scan.
create index if not exists idx_tramite_chunks_v2_embedding_ivfflat
  on public.tramite_chunks_v2
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 26);

-- Estadísticas frescas para que el planner elija el índice.
analyze public.tramite_chunks_v2;

-- ----------------------------------------------------------------------------
-- Tuning opcional (no se aplica por defecto)
-- ----------------------------------------------------------------------------
-- `ivfflat.probes` = cuántas particiones se escanean por query (default: 1).
-- Más probes = mejor recall, más lento. Referencia: sqrt(lists) ≈ 5.
--
-- Importa especialmente acá porque match_tramite_chunks_v2 filtra
-- (excluir_institucional / filtro_categoria) DENTRO del scan: si los chunks
-- descartados están concentrados en las listas visitadas, se pueden devolver
-- menos de `match_count` filas. Subir probes es la mitigación.
--
-- alter database postgres set ivfflat.probes = 5;   -- requiere reconectar
-- o por sesión:  set ivfflat.probes = 5;
