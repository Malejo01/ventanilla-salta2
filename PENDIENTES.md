# Pendientes

Cosas que encontramos y decidimos **no** arreglar todavía, con lo que ya sabemos
de cada una para que quien la agarre no empiece de cero.

A diferencia de `OBSERVACIONES-CORPUS.md`, que junta decisiones que le
corresponden a la Municipalidad, esto es todo trabajo nuestro.

---

## 1. Desambiguación de licencias de conducir

**Dónde se ve:** pregunta `A3` del banco (`qa/banco-preguntas.json`).
**Síntoma:** responde bien y de más. A *"tengo 70 años, ¿pago lo mismo por la
licencia?"* contesta con el precio correcto ($7.301/año + CENAT $10.150) y a
continuación agrega el juego de precios de la renovación por cambio de
jurisdicción de licencias profesionales ($6.145 + $8.840), que nadie pidió.

**Lo que ya sabemos:**

- **No es un problema de corpus.** Antes del fix del recorte fallaba porque los
  precios no estaban; ahora están, y sigue mezclando. Con más datos disponibles
  mezcla más prolijamente: pasó de reencuadrar la pregunta en silencio hacia la
  única categoría que tenía datos, a dar la respuesta correcta primero y marcar
  la otra como *"hay una fuente que indica otros valores para…"*. Es mejor, pero
  sigue poniendo al vecino a decidir cuál le toca.
- **La causa es que hay ~10 páginas de licencia casi idénticas** (principiantes /
  renovación / ampliación × profesionales / no profesionales × jurisdiccionales /
  interjurisdiccionales), con la misma estructura y casi el mismo texto. Como
  vectores son vecinos muy cercanos.
- **Y la pregunta genuinamente no dice cuál.** "¿Pago lo mismo?" no menciona
  categoría. No hay recuperación que pueda acertar sin más información: o se
  elige un default explícito, o se repregunta.
- `fuente_ok` en A3 da `0/5`, pero eso sobre-castiga: la fuente principal es
  `renovacion-cambio-jurisdiccion-noprofesionales`, hermana de la que el banco
  espera. Lo que falla es la elección entre hermanas, no el trámite.

**Por dónde iría:** repreguntar cuando la consulta toca la familia de licencias
sin decir categoría, es lo más honesto. La alternativa —elegir la no profesional
como default por ser la más frecuente— es más barata y hay que decirla en la
respuesta, no esconderla.

---

## 2. El tope de chunks por trámite deja afuera el bloque de contacto

**Dónde se ve:** pregunta `C4` del banco. Es la única falla que quedó viva
después de los dos fixes.

**Síntoma:** a *"quiero hacer un plan de pago de inmuebles, ¿dónde consulto?"*
contesta con la oficina, el horario y la documentación, y no da el mail. El mail
existe en el corpus: es el chunk `655-6` de `plan-de-pago-inmuebles`, que trae
`atencion.contribuyente@municipalidadsalta.gob.ar`.

**Lo que ya sabemos:** el chunk está en la base y no entra al top-5 del
retrieval. La única fuente citada es el trámite correcto, así que no es una fuga
a otra ficha: es ranking. El fix del recorte agregó chunks a los trámites
afectados (de ~6 a ~8 en varios), así que ahora hay más candidatos del mismo
trámite compitiendo por los mismos lugares, y `MAX_CHUNKS_POR_TRAMITE = 2` los
recorta antes.

**Por dónde iría:** medir primero. `DIAG_RETRIEVAL=true` en
`app/api/chat/route.ts` imprime el pool crudo, qué sobrevivió al tope y el
contexto final — está puesto exactamente para esto. Recién con eso decidir si el
problema es el tope, el corte en 5 o el embedding del chunk de contacto.

---

## 3. La supresión de fuentes borra los chips de una respuesta que sí tiene fuente

**Dónde se ve:** pregunta `C1` del banco, en las dos corridas.

**Síntoma:** a *"¿a qué mail escribo por la exención del impuesto automotor para
discapacidad?"* el asistente contesta, correctamente, que no tiene un mail —
porque esa página no publica ninguno— y ofrece la atención presencial del Centro
Cívico Municipal, 2° Salón, que **sí** sale del corpus. Pero como la respuesta
arranca con "no tengo información oficial", la supresión de fuentes la toma por
un "no sé" y borra los chips. El vecino recibe una dirección física, real y
verificable, presentada sin ninguna atribución.

**Lo que ya sabemos:** la supresión existe por una razón buena (ver el commit
`6784e66`, "no mostrar chips de fuente cuando la respuesta no contesta"): evita
que una respuesta vacía venga firmada por trámites que no se usaron. El caso que
no contempla es el mixto — "no tengo *esto*, pero sí tengo *esto otro*" — que
después del fix del recorte es más frecuente, porque ahora el corpus tiene el
canal presencial de muchos trámites que antes no tenía.

**Por dónde iría:** la condición hoy mira cómo **arranca** la respuesta. Tendría
que mirar si el cuerpo aporta algún dato del contexto, no si hay una frase de
disculpa adelante.

---

## 4. Verificador de enlaces del corpus

**Estado:** diseñado y medido, sin implementar. Va al hito.

El barrido diagnóstico del 2026-09-08 corrió una vez sobre las **224 URLs
http(s) distintas** del corpus (41 hosts, 915 chunks) y encontró **35 rotas o
degradadas — 15,6 %**. Eso es lo que justifica automatizarlo: a mano no se
sostiene, y una corrida sola ya destapó las observaciones 9 y 10 de
`OBSERVACIONES-CORPUS.md`.

### Dónde vive

`qa/lib-enlaces.mjs` (biblioteca) + `qa/verificar-enlaces.mjs` (runner), mismo
patrón que `lib-corpus.mjs` / `correr-banco.mjs`. **Sin dependencias nuevas:**
`node:dns/promises`, `node:tls`, `node:http`/`node:https`, `fetch` y
`AbortSignal.timeout` alcanzan. El prototipo del barrido está hecho así y
funciona.

### Diseño

1. **DNS** del hostname exacto.
2. **HTTP**: `HEAD` primero, `GET` con `Range: bytes=0-0` de respaldo.
3. **Redirecciones** seguidas a mano, guardando la cadena completa.
4. **TLS**: validez y vigencia, no solo que responda.
5. **Clasificación** en estados, no en un booleano.
6. **Dos fallas separadas en el tiempo** antes de marcar algo como caído.
7. **Persistencia** en `enlace_estado`.

### Los ocho aprendizajes

Esto es lo que hace que valga la pena leer esta entrada antes de escribir la
primera línea. Cinco salieron del diagnóstico de `policiasalta.gob.ar`, tres del
barrido completo. Los ocho costaron descubrirlos y ninguno es evidente desde el
diseño.

#### 1. `dns.lookup`, nunca `dns.resolve4`

`resolve4` habla directo con el resolver configurado del sistema. En la máquina
donde corrimos el barrido devolvió **`ECONNREFUSED` para todos los hosts**,
incluido `municipalidadsalta.gob.ar`. Un verificador construido sobre `resolve4`
habría reportado **el corpus entero como caído**.

`dns.lookup` usa `getaddrinfo`, que es lo que `fetch` usa por debajo, así que es
el veredicto correcto: mide lo mismo que va a experimentar el usuario.

Corolario: **un error del resolver no es una caída del host.** Solo `ENOTFOUND`
(NXDOMAIN) cuenta como `caido_dns`. Cualquier otro código va a un estado aparte
`dns_indeterminado`, que no dispara alerta.

Y hay que consultar el **hostname exacto**, no el dominio registrable:
`armsa.dgrmsalta.gov.ar` da NXDOMAIN mientras `dgrmsalta.gov.ar` resuelve
perfecto.

#### 2. `rejectUnauthorized` no alcanza como criterio de "TLS roto"

Es el aprendizaje más caro. `policiadesalta.gob.ar` **falla** la validación por
defecto de Node (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) y sin embargo **anda bien en
cualquier navegador**: el servidor no manda el certificado intermedio, y Chrome y
Safari lo bajan solos por AIA mientras Firefox lo tiene cacheado. El certificado
está bien; el servidor está mal configurado. Node es el único que se queja.

Si `tls_roto` se decide con el default de Node, ese dominio —y probablemente
varios `.gob.ar` más— se reportan rotos, y el equipo aprende a ignorar la
categoría entera. Una alerta que grita por algo que funciona es peor que no
tenerla.

**Tres estados separados, no uno:**

| Estado | Condición | Gravedad |
|---|---|---|
| `tls_nombre` | el SAN/CN no cubre el host (`policiasalta.gob.ar`) | **grave** |
| `tls_vencido` | fuera de `valid_from`/`valid_to` (apex de `dgrmsalta.gov.ar`) | **grave** |
| `tls_cadena` | solo falla por intermedio faltante, y valida al bajarlo del AIA | **advertencia** |

Implementación: conectar con `rejectUnauthorized: false`, leer el certificado y
evaluar **nombre** (`tls.checkServerIdentity`) y **fechas** por separado. Solo si
las dos pasan y aun así `socket.authorized` es falso, bajar el intermedio del
`infoAccess['CA Issuers - URI']` del propio certificado, cachearlo y revalidar.
Si así valida, es `tls_cadena` y no es una caída.

#### 3. El orden DNS → TLS → HTTP importa, y se comprueba solo

En el barrido no hubo **ni un** `tls_nombre`, `tls_vencido` o `tls_cadena` sobre
las 224 URLs. No porque el chequeo esté de más, sino porque `policiasalta.gob.ar` —el
caso que motivó todo esto— entra al corpus como `www.policiasalta.gob.ar`, que
**muere en DNS antes de llegar a TLS**. El chequeo caro no se corre cuando el
barato ya falló. Mantener ese orden.

#### 4. `redirigido` con 200 tapa los formularios cerrados

El diseño original clasificaba como sano todo lo que terminara en 2xx. Es
exactamente lo que hace invisible a la observación 10: **15 de los 18
formularios rotos devuelven HTTP 200.**

- Un formulario de Google cerrado responde `302` → `/closedform`, que da **200**.
- Uno que exige cuenta responde `302` → `accounts.google.com/signin`, que da
  **200**.

Hay que mirar la **URL final de la cadena**, no el código. Dos subestados
nuevos, con detección por patrón sobre la URL final:

| Subestado | Patrón en la URL final |
|---|---|
| `form_cerrado` | `/closedform` |
| `form_login` | `accounts.google.com` |

Y un tercero que salió del mismo barrido: `servicio_migrado`, para cuando el
destino final es otro dominio de otra empresa. Caso real:
`agenda.whyline.com/new` → `clearme.com/where-to-use-clear`, porque CLEAR
compró Whyline. Da 200 y no sirve para pedir un turno.

La regla del **soft 404** (path final `/` y original distinto de `/`) sigue
siendo necesaria, pero no alcanza sola: ninguno de estos tres casos la dispara.

Cuidado con el falso positivo simétrico: `policiadesalta.gob.ar` redirige a
`web.policiadesalta.gob.ar/` y **es legítimo** —apex a su equivalente www—, no un
soft 404. Por eso la condición mira el path de origen, no solo el de destino.

#### 5. El umbral de vencimiento de certificados hay que filtrarlo por dominio

Un aviso a 60 días parecía razonable. En la práctica devolvió 17 hosts, y la
mitad era ruido: `facebook.com`, `instagram.com` y `api.whatsapp.com` a **7
días**, y todo Google a 54. Son CDN globales que rotan certificados
automáticamente; que estén a 7 días de vencer no significa absolutamente nada.

Filtrar por dominio. La señal real del barrido fueron
`licencias.municipalidadsalta.gob.ar` (43 d), `apps.snr.gob.ar` (33 d),
`municipalidadsalta.gob.ar` (54 d) — los que, si vencen, no los renueva nadie
automáticamente. Un allowlist de sufijos (`.gob.ar`, `.gov.ar`, más los dominios
de proveedores del municipio) alcanza y es fácil de mantener.

#### 6. Hay que recortar los marcadores `[[n]]` al extraer del cuerpo

El corpus guarda los enlaces en `enlaces[]` y en el `texto_display` deja un
marcador `[[n]]` **pegado a la URL**. Extraer con un regex que no excluya `[`
produce URLs fantasma:

```
https://agenda.whyline.com/new[[7
http://municipalidadsalta.gob.ar/boletas/[[0
```

Nos pasó en la primera corrida del barrido: **9 URLs inventadas sobre 232**, que
después se verificaron y reportaron como rotas. El conteo real era 224. Ninguna
era un defecto del corpus; eran todas del extractor.

El regex tiene que excluir `[` además de `]`, y conviene recortar un
`/\[+\d*\]*$/` residual antes de dar la URL por buena. Va con test: es
silencioso y contamina las métricas hacia arriba, que es la peor dirección.

#### 7. Los dos strikes no aplican a todos los estados

La regla de "dos fallas separadas en el tiempo antes de marcar como caído" es
correcta para lo transitorio: **timeout, 5xx y errores de conexión**.

No aplica a `tls_nombre` ni a NXDOMAIN persistente. Un certificado que no cubre
el host no se arregla solo, y un nombre que no está en el DNS tampoco. Aplicar
los dos strikes ahí solo hace que un error de transcripción como el de
`policiasalta.gob.ar` tarde un ciclo extra en aparecer, sin ninguna ganancia.

#### 8. La tabla va con `url` como clave, no por chunk

La idea original era `url_estado` y `url_verificada_en` **por chunk**. Los datos
del barrido dicen que no: **224 URLs distintas repartidas en 184 chunks**, con
URLs que se repiten entre fichas. `www.policiasalta.gob.ar/...` está en dos
chunks de trámites distintos; `www.municipalidadsalta.gob.ar/` está en **37**.

Por chunk se verifica la misma URL N veces y las copias se pueden desincronizar.
Con la URL como clave, la lógica de dos strikes es una columna y no un join, y la
corrida baja de ~400 requests a 224.

```sql
create table public.enlace_estado (
  url                text primary key,
  estado             text not null,      -- ok | redirigido | form_cerrado | form_login
                                         -- | servicio_migrado | soft_404 | caido_dns
                                         -- | caido_http | tls_nombre | tls_vencido
                                         -- | tls_cadena | timeout | error_conexion
                                         -- | dns_indeterminado
  http_status        int,
  url_final          text,               -- lo que necesita form_cerrado/form_login
  cadena_redirect    jsonb,              -- [{url, status}, ...]
  cert_hasta         timestamptz,        -- para el aviso de vencimiento
  detalle            text,
  fallas_seguidas    int not null default 0,
  primera_falla_en   timestamptz,
  verificada_en      timestamptz not null
);
```

El estado por chunk se lee con un join contra `enlaces[]` cuando haga falta. Si
el runtime lo necesita barato, un `url_estado_peor` desnormalizado por chunk que
calcule el mismo script.

**Ojo, aparte:** `url_origen` **no** está en las 224. Es la URL que la app le
muestra al vecino en el chip de fuente y sale de otra columna. La barrimos por
separado (132 distintas, 130 sanas) y encontró el punto 5 de acá abajo. El
verificador tiene que cubrir las dos fuentes de URLs, no solo `enlaces[]`.

### Decisión abierta: reporte, no bloqueo

**Arrancar solo con reporte.** No bloquear enlaces en runtime hasta tener medido
el índice de falsos positivos sobre al menos dos o tres corridas.

El motivo es concreto: `tls_cadena` va a producir falsos positivos por diseño
—son sitios que andan bien— y la detección de `form_cerrado` y `servicio_migrado`
es por patrón de URL, que es frágil ante cambios de Google. Bloquear en runtime
con esa base significa sacarle al vecino un enlace que funciona, que es peor que
el problema que estamos arreglando. Un enlace roto es una molestia; un enlace
bueno escondido es una respuesta incompleta sin que nadie se entere.

Cuando el índice esté medido, se decide. La tabla ya guarda todo lo necesario
para tomar esa decisión con datos.

### Estimación

| Pieza | Horas |
|---|---|
| `lib-enlaces.mjs`: DNS + HEAD/GET Range + cadena de redirects + timeouts | 3–4 |
| TLS en tres estados + caché del intermedio AIA + aviso de vencimiento filtrado por dominio | 3 |
| Clasificación + soft 404 + subestados `form_*` / `servicio_migrado` | 2 |
| Migración `enlace_estado` + persistencia + dos strikes | 2–3 |
| Runner con reporte legible y `--solo-nuevos` | 2 |
| Harness de bordes al estilo de `qa/test-enlaces-contexto.mjs` | 3 |
| **Total** | **15–17 h** |

El harness tiene casos reales del corpus para cada borde, que es lo que lo hace
barato de escribir: redirect legítimo a la home (`policiadesalta.gob.ar`),
formulario cerrado (`forms.gle/XT59LC1UeYUfWGV47`), formulario con login
(`forms.gle/bemFdrAddTrRzE3q9`), NXDOMAIN (`armsa.dgrmsalta.gov.ar`), certificado
vencido (apex de `dgrmsalta.gov.ar`), cadena incompleta
(`policiadesalta.gob.ar`), y marcador `[[n]]` pegado (`95471-41`).

### Aparte, no en este hito

| | Horas |
|---|---|
| Normalizar `&amp;` y `%20` colgando (17 URLs) — **en la ingesta, no en la base** | 2 |
| Verificación de `mailto:` (MX del dominio) | 3–4 |

La de `mailto:` la marcamos porque la observación 7 —`municipalidadsalt.gob.ar`,
sin la `a` final— se encontró a mano. Un chequeo de MX sobre los 63 dominios de
correo la habría dado sola en la primera corrida.

---

## 5. `url_origen` de `exencion-para-discapacitados` da 404

**Estado:** sin arreglar. Es trabajo nuestro, no del municipio.

**Síntoma:** los 7 chunks del trámite `exencion-para-discapacitados` tienen

```
url_origen = https://municipalidadsalta.gob.ar/tramites/exencion-para-discapacitados/
```

y esa URL devuelve **404**. La página se movió a
`.../tramites/exencion-para-discapacitados-2/`, que responde 301 y está viva.

**Por qué importa más de lo que parece:** `url_origen` no es un enlace cualquiera
dentro del texto. Es **lo que la app le muestra al vecino como chip de fuente**,
o sea la atribución con la que el asistente firma la respuesta. Un vecino que
recibe la información sobre la exención por discapacidad y toca el chip para
verificarla contra la página oficial se encuentra con un 404. La respuesta puede
ser perfectamente correcta y aun así queda sin poder comprobarse, que es
exactamente lo que el chip existe para evitar.

**Lo que ya sabemos:**

- Es el **único** `url_origen` caído del corpus. Lo barrimos entero el
  2026-09-08: de 132 URLs distintas, 130 responden bien, una redirige
  (`cierre-de-negocio` → `cierre-de-negocio-cese-actividades`, 6 chunks, sana) y
  esta da 404.
- El trámite **existe y está publicado**. No es contenido dado de baja: es una
  página renombrada que el scraping tomó antes del cambio.
- No hay que inventar nada: el destino correcto lo da el propio 301 del sitio.

**Por dónde iría:** re-scrapear ese trámite y dejar que la ingesta traiga la
`url_origen` nueva, en vez de parchear la columna a mano. Si el scraping ya sigue
redirecciones, alcanza con volver a correrlo sobre ese slug; si no, es el mismo
fix que el verificador del punto 4 necesita de todos modos.

Conviene hacerlo **después** del punto 4, o al menos reusando su barrido: si una
`url_origen` se movió, es probable que haya más a punto de moverse, y correr el
verificador sobre `url_origen` de forma periódica es más barato que descubrirlas
de a una.
