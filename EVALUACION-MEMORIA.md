# Memoria conversacional — evaluación

Rama `feat/memoria-conversacional`, medida el 15/8/2026 contra el corpus v2
(`USAR_CORPUS_V2=true`, 133 trámites). **No mergeada, no deployada.**

**Recomendación corta:** conviene mergear, con `REFORMULAR_CONSULTA=heuristica`
(el default), y con una condición previa a que el móvil saque su parche de
contexto. El detalle está al final.

---

## 1. Qué se cambió

### Contrato

```jsonc
POST /api/chat
{
  "pregunta": "y cuánto cuesta?",
  "historial": [                                   // opcional
    { "rol": "usuario",   "texto": "cómo habilito un kiosco" },
    { "rol": "asistente", "texto": "Para habilitar un quiosco…" }
  ]
}
```

Sin `historial`, todo se comporta exactamente como hoy (§2). Un `historial` mal
formado se descarta en silencio en vez de devolver 400: es una mejora de la
conversación, no un dato necesario para contestar, y un 400 rompería a un
cliente viejo por una función nueva.

### Ventana

Dos topes, no uno: **6 turnos** y **3000 caracteres**, recortando siempre desde
el más viejo. El tope por turnos acota la deriva del tema; el de caracteres
acota el costo, porque un solo turno del usuario puede llegar a 1000 caracteres
(el límite que ya valida la ruta) y entonces "6 turnos" no presupuesta nada. Un
turno suelto de más de 1200 caracteres se corta con puntos suspensivos en vez de
descartarse, porque si el turno gigante es el último, tirarlo deja a la pregunta
actual sin el contexto que necesita.

Después del recorte la ventana se normaliza: se descartan los turnos del
asistente que quedaron al principio (Gemini espera que `contents` arranque con
el usuario) y se fusionan turnos consecutivos del mismo rol.

### Separación búsqueda / generación

Es la decisión central. El `contents` que va a Gemini lleva **el historial
completo**; el embedding del retrieval **no**. Para las preguntas que dependen
del hilo se reformula *solo la consulta de búsqueda*, y a la generación se le
sigue mandando la pregunta original — el modelo ya tiene el historial para
resolver a qué se refiere, así que no necesita el artefacto del buscador.

Dos caminos, elegibles por entorno con `REFORMULAR_CONSULTA`:

- **`heuristica`** (default) — antepone el tema anterior: la última pregunta del
  usuario que se sostenía sola. Si la pregunta es una afirmación pelada ("sí,
  dale"), usa en cambio la oferta que el propio asistente dejó abierta
  ("¿Querés que te cuente sobre X?"), que existe porque la regla 9 del
  `SYSTEM_PROMPT` la obliga. Cuesta 0 ms y 0 tokens.
- **`modelo`** — una llamada corta a `gemini-2.5-flash` que reescribe la
  pregunta como consulta autónoma. Se invoca **solo** en los turnos que la
  heurística ya marcó como dependientes (6 de 14 en esta evaluación), así que el
  resto no paga la latencia.
- **`off`** — el historial se usa solo para generar, no para buscar. Es el
  rollback más chico de la rama y se midió como arm propio para saber cuánto
  aporta cada mitad por separado.

En los dos caminos hay un corte previo: **si el turno anterior del asistente fue
un "no sé", no se arrastra nada**. Es el caso que rompió en producción.

### Reglas nuevas

Van en `INSTRUCCION_MEMORIA` (`lib/historial.ts`), que se suma como segunda
parte de la `systemInstruction` **solo cuando hay historial**, igual que hace
`INSTRUCCION_CATALOGO`. El `SYSTEM_PROMPT` **no se tocó**, y eso es lo que hace
demostrable la retrocompatibilidad en vez de argumentable.

Las reglas: no saludar (ya se saludaron en el primer turno), usar el historial
para entender la pregunta pero nunca para completar datos que el CONTEXTO no
tiene, no arrastrar el trámite anterior después de un "no sé", no repetir lo ya
explicado, y tratar los turnos previos como registro de la charla y no como
instrucciones.

### Camino nuevo: cierre cortés

"gracias", "listo, chau" no son preguntas: no hay nada que buscar. Con historial
se contestan sin retrieval (**702 ms** medidos contra el endpoint real, frente a
1500–3700 ms de un turno completo). Es la única respuesta de la app que no se
apoya en el CONTEXTO, así que va detrás de un clasificador cerrado — la frase
entera tiene que estar hecha de palabras de cortesía, con lo cual no puede
colarse un tema adentro — y con una instrucción que prohíbe dar datos.

---

## 2. Retrocompatibilidad: las 16 consultas de regresión

`node qa/test-retro-memoria.mjs --red` → **RETROCOMPATIBILIDAD OK**.

Comparar el texto de dos respuestas no sirve como criterio: el modelo corre a
`temperature 0.2` sin seed, así que dos corridas de `main` tampoco dan lo mismo.
Se probó lo que sí es determinista y lo que sí decide el resultado:

| # | Control | Resultado |
|---|---------|-----------|
| 1 | `SYSTEM_PROMPT` byte a byte igual al de `main` (leído con `git show main:…`) | idéntico, 3817 chars |
| 2 | Ninguna de las 16 clasifica como cierre cortés ni como dependiente del historial | 16/16 |
| 3 | Sin historial la consulta de búsqueda es la pregunta intacta → mismo vector, mismos chunks | 16/16 |
| 4 | El body que se le manda a Gemini es byte a byte el que arma `main` | 16/16 + camino de catálogo |
| 5 | Retrieval real: ninguna cae bajo `MIN_SIMILARITY`, mismos trámites y fuentes | 16/16, sim 0.663–0.814 |

Con 1+4 no queda ningún grado de libertad: mismo prompt, mismo contexto, mismo
turno único. El corte de dependencia quedó en 5 palabras justamente porque la
consulta más corta de las 16 ("dónde queda el CIC más cercano") tiene 6.

También se controló que un `historial` ausente, `null`, string suelto, con
turnos sin `rol`, con rol inventado o con textos vacíos dé siempre ventana vacía
— es decir, el camino de siempre.

Las suites que ya existían siguen pasando sin tocarlas:
`qa/test-retrieval-v2.mjs` (cobertura completa, 0 violaciones del tope, 0 bajo
umbral) y `qa/test-catalogo.mjs` (TODO OK).

---

## 3. Las 6 conversaciones, antes y después

Método: `node qa/test-memoria.mjs main,off,heuristica,modelo`. Cada arm replica
la conversación con **su propio** historial — las respuestas que ese arm fue
dando — porque un arm que contesta distinto cambia el historial del turno
siguiente. El arm `main` manda historial vacío en cada turno, que por §2 es
exactamente el backend de hoy. Detalle completo en `qa/salida-memoria.json`.

**Resumen de los 8 turnos de seguimiento (turno ≥ 2):**

| | `main` (hoy) | `off` | `heuristica` | `modelo` |
|---|---|---|---|---|
| Saluda de más | **5 de 8** | 0 | 0 | 0 |
| Turnos fallados | 4 | 2 | 1 | 0 |
| Turnos parciales | 1 | 1 | 1 | 1 |
| Arrastre indebido de contexto | 1 (+1 con el parche del móvil) | 0 | 0 | 0 |

### 1. "cómo habilito un kiosco" → "y cuánto cuesta?" → "dónde lo hago?"

| arm | se buscó con | chunks | respuesta |
|---|---|---|---|
| `main` | `y cuánto cuesta?` | conexión eléctrica, habilitaciones, ocupación de vereda, demoliciones | **"No tengo información oficial sobre eso."** |
| `off` | `y cuánto cuesta?` | (los mismos) | "No tengo información oficial sobre el costo específico…" |
| `heuristica` | `cómo habilito un kiosco y cuánto cuesta?` | habilitaciones, cartelería, venta vía pública | **"30 días: $1026 · 60 días: $2052 · 90 días: $3078"** |
| `modelo` | `Costo permiso de venta kiosco vía pública Salta` | venta vía pública, habilitaciones, cartelería | los mismos montos + la Ordenanza 15.800 |

Turno 3, "dónde lo hago?": `main` contesta *"¡Hola! Para decirte dónde hacer tu
trámite, necesito saber a cuál te referís"* — y encima saluda. `heuristica` y
`modelo` contestan "Salta Activa" y la Subsecretaría de Habilitaciones con
dirección y horario.

Este es el caso donde la memoria sola (`off`) **no alcanza**: el modelo entiende
la pregunta pero el retrieval le trajo chunks de otros trámites, y no puede
contestar lo que no tiene. La reformulación de la búsqueda es la mitad que
arregla el turno.

### 2. "quiero abrir un foodtruck" → "sí, contame del carnet"

| arm | se buscó con | resultado |
|---|---|---|
| `main` | `sí, contame del carnet` | saluda, da la definición del carnet y agrega *"no tengo información oficial sobre el costo, dónde se retira…"* |
| `heuristica` | `quiero abrir un foodtruck sí, contame del carnet` | trae el curso de manipulación primero; explica qué es y ofrece seguir |
| `modelo` | `Carnet de manipulador de alimentos para foodtruck` | **el único que trae las dos modalidades** (virtual y presencial), con días, horarios y qué llevar |

El corpus sí tiene las modalidades del curso. `main` y `heuristica` no las
recuperan; `modelo` sí, porque su consulta reescrita apunta al trámite y no
arrastra "foodtruck", que competía por el presupuesto de contexto.

### 3. "usás pañales?" → "osea que sí usás" ← el caso que rompió

| arm | respuesta al turno 2 |
|---|---|
| `main` | **"¡Hola! Si tenés el Certificado Único de Discapacidad (CUD), podés tramitar la oblea de discapacidad para estacionar gratis…"** + los 3 pasos del trámite |
| `main` + parche del móvil | **el CUD completo**: para qué sirve, cobertura del 100%, ANSES, el link de argentina.gob.ar. Similitud 0.814. |
| `off` / `heuristica` / `modelo` | **"No, no uso pañales. Soy un programa de computadora y no tengo cuerpo. Si tenés alguna duda sobre trámites municipales o provinciales de Salta, con gusto te ayudo."** |

El bug se reproduce en `main` **sin necesidad del parche del móvil**: la
pregunta "osea que sí usás" tiene similitud 0.655 contra oblea de discapacidad,
arriba del umbral de 0.5, así que el modelo recibe chunks de un trámite real y
contesta sobre él. El parche lo empeora — lleva la similitud a 0.814 y hace que
la respuesta sea larga y segura de sí misma.

Los tres arms con memoria lo arreglan, y por dos mecanismos distintos que se
refuerzan: `heuristica` no arrastra el tema (motivo `no-se-previo`), y la
instrucción de memoria le dice al modelo que si su turno anterior fue un "no sé"
no vuelva al trámite anterior. El retrieval sigue devolviendo los mismos chunks
de discapacidad — lo que cambia es que el modelo ahora ve que le están haciendo
una pregunta sobre él, no sobre un trámite.

### 4. "qué trámites hay" → "el segundo" ← **falla en los cuatro arms**

| arm | se buscó con | respuesta |
|---|---|---|
| `main` | `el segundo` | "No tengo información oficial sobre eso." |
| `off` | `el segundo` | "El segundo trámite que mencioné es **Permiso para Instalación de Fibras Ópticas**" — coherente pero falso: lee los chunks recuperados, no la lista que él mismo imprimió |
| `heuristica` | `qué trámites hay el segundo` | habla del "segundo **paso**" de la licencia de conducir |
| `modelo` | `Trámites inmobiliarios Municipalidad de Salta` | acierta el área (Inmobiliarios **es** la segunda), pero contesta solo sobre Libre Deuda de Inmuebles |

Ninguno contesta lo que se preguntó. La causa es estructural: el turno 1 se
respondió por el **camino de catálogo**, que no deja chunks, y el turno 2 se va
por el retrieval vectorial, que no tiene forma de resolver un ordinal contra una
lista que no está en su índice. La reescritura del `modelo` es la única que
"ve" la lista (porque le llega en el historial) y por eso es la única que acierta
el área — pero después el retrieval la desarma igual.

**Arreglo propuesto, fuera del alcance de esta rama:** si el turno anterior salió
por el camino de catálogo y el actual es una referencia ordinal, volver a entrar
al camino de catálogo con el listado completo, en vez de ir al retrieval. Son
pocas líneas y usa la misma señal `modo: "catalogo"` que ya viaja al cliente.

### 5. "licencia de conducir" → "y para profesionales?"

Los cuatro arms contestan bien: jurisdiccional vs interjurisdiccional, con las
categorías. `main` saluda de más; los otros tres no. La reformulación mejora
levemente el retrieval (`heuristica` sim 0.764 vs `main` 0.715) pero acá no
cambia el resultado — la pregunta ya tenía suficiente señal propia.

### 6. "cómo saco el CUD" → "gracias" → "otra cosa: libre deuda"

Turno 2 ("gracias"): `main` lo resolvió bien **por casualidad** — "gracias" da
similitud 0.642 contra trámites cualquiera (medidascomercio, solicitud de
gráfica…), pasa el umbral, y el modelo tuvo el criterio de contestar "¡De nada!"
en vez de hablar de esos trámites. Con el camino de cierre eso deja de depender
de la suerte, y además ahorra el embedding, el retrieval y ~1400 tokens de
contexto: **702 ms** contra ~1500.

Turno 3 ("otra cosa: libre deuda"): los tres arms con memoria detectan el
marcador de cambio de tema, buscan con `libre deuda` a secas y **no arrastran
nada del CUD**. Sin el marcador, "libre deuda" son 2 palabras y habría entrado
como pregunta dependiente con el CUD pegado adelante.

---

## 4. Latencia

Promedios sobre los 14 turnos de cada arm (arnés local, sin Next; la red a
Gemini domina):

| arm | ms por turno | ms de generación | ms de reescritura |
|---|---|---|---|
| `main` | 2034 | 1557 | — |
| `off` | 1881 | 1509 | — |
| `heuristica` | **1822** | 1442 | 0 |
| `modelo` | 2037 | 1408 | 239 (promedio sobre todos los turnos) |

- **`heuristica` no agrega latencia medible.** Es lógico: no hace ninguna
  llamada extra, y los ~740 tokens de entrada adicionales no mueven el tiempo de
  generación de forma apreciable (la diferencia con `main` está dentro del ruido
  de la red, medida sobre 14 turnos).
- **`modelo` agrega 557 ms** en promedio, pero **solo en los turnos que
  reformula**: 6 de 14 acá. Las seis llamadas midieron 515, 532, 541, 553, 583 y
  617 ms. Repartido sobre todos los turnos da +239 ms; sobre un turno de
  seguimiento típico (~1600 ms) es **+35 %**.
- **El cierre cortés resta**: 702 ms contra ~1500, porque se saltea embedding y
  retrieval.

Contra el endpoint real (`next dev`, incluye el overhead de Next): 3750 ms el
primer turno en frío, 1548 ms un turno con historial en `heuristica`, 3073 ms
uno en `modelo`.

---

## 5. Costo en tokens

Medido con `countTokens` de la API y con el `usageMetadata` de cada respuesta.

**Costo fijo nuevo, por request con historial:**

| pieza | tokens |
|---|---|
| `INSTRUCCION_MEMORIA` | 309 |
| `INSTRUCCION_CIERRE` (solo en el camino de cierre) | 77 |
| `INSTRUCCION_REESCRITURA` (solo en modo `modelo`) | 190 |

**Costo variable:** el historial mide **0.278 tokens por carácter** en este
corpus (español con markdown). Con el tope de ventana de 3000 caracteres, el
techo del historial es **~834 tokens**. Techo total del turno más caro:
309 + 834 ≈ **1143 tokens extra**.

**Medido sobre los 8 turnos de seguimiento:**

| arm | tokens de entrada por turno | vs. hoy |
|---|---|---|
| `main` (hoy) | 1705 | — |
| `heuristica` | 2447 | **+742 (+44 %)** |
| `modelo` | 2890 (incluye la reescritura) | +1185 (+70 %) |

La llamada de reescritura costó entre 288 y 587 tokens (entrada + salida) según
el largo del historial; 2854 tokens en total para las 6 que se hicieron.

**Un request sin historial no cambia en nada**: mismos ~1850 tokens de entrada
que hoy, porque el body es idéntico (§2).

Para dimensionar: si el 60 % de los turnos de una charla son de seguimiento, el
gasto de entrada del chat sube ~26 % con `heuristica` y ~42 % con `modelo`. La
salida no se mueve (155 vs 155 tokens promedio): las respuestas no se alargan.

---

## 6. Interacción con lo que ya estaba

| pieza | estado | detalle |
|---|---|---|
| Clasificador de catálogo | **intacto** | Recibe solo `pregunta`, que no cambia. 0 falsos positivos sobre las 16 (`test-retro-memoria.mjs`) y `test-catalogo.mjs` sigue en TODO OK. El camino de catálogo ahora recibe el historial para no volver a saludar. |
| `hayFugaDePrompt` | **funciona, sin cambios** | 7 casos nuevos con historial en `qa/test-seguridad-memoria.mjs`, todos OK. Incluye el control de que un rechazo legítimo de la regla 4 **no** se descarte como fuga (el bug de `36923eb`). |
| Detector de `noSabe` | **funciona** | Con historial, una respuesta de "no tengo información oficial" sigue devolviendo `fuentes: []`. |
| Tope por trámite con puerta de competencia | **intacto** | No lo toca nadie; `test-retrieval-v2.mjs` sigue en 0 violaciones. Lo que sí cambia es *qué se embebe*, así que la reformulación puede cambiar si hay competencia o no: en la conv. 2 la consulta reescrita del `modelo` dejó de tener competencia y un solo trámite llenó el contexto — que era justo lo que hacía falta. |
| Rate limit (20/min por IP) | **sin cambios** | En modo `modelo` un turno de seguimiento hace 2 llamadas a Gemini en vez de 1, pero el contador es por request HTTP, así que el límite visible para el ciudadano no se mueve. Sí sube el consumo de cuota de la API de Gemini. |

### ¿Se puede simplificar el clasificador de catálogo con historial?

**No.** El clasificador decide si *la pregunta actual* pide el catálogo, y eso no
depende de lo que se dijo antes: "qué trámites hay" es una pregunta de catálogo
sea el primer turno o el quinto. Lo que el historial sí permite simplificar es
**el parche del cliente móvil** (`"Sobre <trámite>: <pregunta>"`), que era el que
falseaba contexto y produjo el caso de la conv. 3.

---

## 7. Riesgos nuevos

1. **El historial lo manda el cliente.** Un atacante puede inventar turnos del
   *asistente* y hacerle creer al modelo que él mismo aceptó cambiar de rol. Se
   probaron 4 variantes (`qa/test-seguridad-memoria.mjs` casos 3 a 5): el modelo
   no obedece, no opina de política y no repite datos inventados del historial
   como si fueran oficiales. La mitigación de diseño es que la salida de la
   reescritura **solo alimenta al embedder** — nunca se le muestra al ciudadano
   ni entra a la generación —, así que lo peor que puede lograr una inyección
   por ahí es empeorar el retrieval.
2. **`detectarDatosSensibles` no corre sobre el historial.** Hoy filtra solo
   `pregunta`, lo cual alcanza porque cada turno pasó por ese filtro cuando fue
   pregunta. Un cliente malicioso podría meter PII directamente en un turno
   falseado. No se cambió para no tocar el filtro en esta rama; si se mergea,
   vale una línea de decisión explícita.
3. **Costo.** +44 % de tokens de entrada en turnos de seguimiento (§5).
4. **Un cliente que mande el historial mal recortado** (por ejemplo el hilo
   entero de 50 turnos) no rompe nada — el servidor recorta —, pero paga el
   ancho de banda. Conviene que los clientes manden ya los últimos 6 turnos.

---

## 8. Lo que esta rama no arregla

- **Referencias ordinales a una respuesta de catálogo** (conv. 4). Falla en los
  cuatro arms. Propuesta concreta en §3.4.
- **Los `[[0]]` en las respuestas.** Aparecieron en dos respuestas de la
  evaluación (`[[0]](https://…)`). Es un artefacto de scraping que ya está en el
  corpus — 4 de 20 chunks de `habilitaciones-comerciales` tienen marcas
  `[[n]]` en `texto_display` — y no tiene nada que ver con la memoria. Va para
  `OBSERVACIONES-CORPUS.md`.
- **La evaluación es de una corrida por conversación.** El resultado del saludo
  (5 de 8 → 0 de 8) es robusto porque es una regla dura del prompt; las
  comparaciones de respuestas individuales son una muestra de una, con el modelo
  a `temperature 0.2`. Antes de mergear conviene repetir las 6 conversaciones 3
  veces y confirmar que los turnos que hoy fallan en `main` siguen fallando.

---

## 9. Recomendación

**Sí conviene mergear**, con estas condiciones:

1. **Default `REFORMULAR_CONSULTA=heuristica`.** El camino `modelo` gana clarito
   en 2 de 6 conversaciones (la 2 por bastante, la 4 en la reescritura aunque no
   en la respuesta) y cuesta +557 ms y ~475 tokens en los turnos que reformula.
   `heuristica` consigue el mismo resultado cualitativo en 5 de 6, gratis. El
   flag queda para poder subir a `modelo` sin tocar código si el móvil reporta
   que las repreguntas siguen fallando.
2. **El historial solo para generar (`off`) no alcanza.** Saca el saludo y
   arregla el caso de producción, pero deja fallando la conv. 1 completa: el
   modelo entiende la pregunta y no tiene los chunks para contestarla. Si se
   mergea, se mergea con reformulación.
3. **Arreglar el ordinal de catálogo (§3.4) antes de que el móvil saque su
   parche.** Hoy el parche es dañino, pero es lo único que da algo de contexto en
   ese camino; conviene que el reemplazo esté completo.
4. **Los tres clientes pueden migrar de a uno.** El contrato es aditivo y está
   probado byte a byte: el que todavía no manda `historial` recorre exactamente
   el mismo código que hoy. No hace falta coordinar un deploy conjunto.

Lo que inclina la balanza no es el saludo — aunque 5 de 8 turnos arrancando con
"¡Hola!" es lo que más hace sonar a formulario. Es que **4 de los 8 turnos de
seguimiento hoy fallan directamente**: dos con "No tengo información oficial"
sobre datos que el corpus sí tiene, uno pidiéndole al ciudadano que repita el
trámite que acaba de nombrar, y uno contestando sobre un trámite que nadie pidió.
Con memoria y reformulación heurística queda uno, y es el que ya sabemos cómo
arreglar.

---

## Cómo reproducir

```bash
node qa/test-retro-memoria.mjs --red     # retrocompatibilidad de las 16
node qa/test-memoria.mjs                 # las 6 conversaciones, 4 arms
node qa/test-seguridad-memoria.mjs       # seguridad (necesita `pnpm dev`)
node qa/test-retrieval-v2.mjs            # regresión de retrieval que ya existía
node qa/test-catalogo.mjs                # regresión de catálogo que ya existía
```
