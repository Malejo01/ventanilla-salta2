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
