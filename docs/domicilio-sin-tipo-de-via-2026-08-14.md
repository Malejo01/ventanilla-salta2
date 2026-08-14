# Detección de domicilio sin tipo de vía — 14 de agosto de 2026

## El hueco

El patrón de domicilio exigía un tipo de vía adelante (`av.`, `avenida`, `calle`,
`pasaje`, `pje.`, `ruta`). En Salta lo habitual es nombrar la calle sin anteponerle
nada, así que **"vivo en Alvarado 1234" no frenaba**: el contexto personal estaba,
pero el patrón no matcheaba.

Salió de la pregunta 29 del banco de evaluación. Estaba en los dos lados —el proxy de
`demo-municipalidad` y este backend— porque uno es un port del otro.

## El arreglo

Se agregó un patrón nuevo, `patronDomicilioPersonal`, sin tocar el que ya existía.

**Por qué dos patrones y no uno más flexible.** El patrón viejo se conforma con una
palabra de contexto suelta (`mi`, `casa`, `vivo`, `domicilio`…) en cualquier parte de la
oración. Eso alcanza cuando el texto además nombra la vía. Si se le sacara la exigencia
de tipo de vía manteniendo ese contexto flojo, empezarían a frenar consultas legítimas:

- "el local está en Belgrano 450, necesito habilitación?"
- "mi local está en Belgrano 450, qué habilitación necesito?"

Por eso el patrón nuevo exige una **frase de residencia** —`vivo en`, `mi domicilio`,
`mi casa está en`, `resido en`, `mi dirección es`— y no una palabra suelta.

**Por qué la frase y la dirección van en un solo patrón, contiguas.** Evaluadas por
separado, "vivo en Salta hace 3 años" daba contexto por un lado ("vivo en") y
nombre+altura por el otro ("hace 3"), y frenaba. Yendo pegadas, eso no puede pasar.

**Por qué el cierre niega unidades.** Es la última defensa contra el mismo falso
positivo: "vivo acá hace 20 años", "vivo a 300 metros de la plaza", "mi casa tiene
120 m2". Si después de la altura viene una unidad de tiempo o de medida, no es una
dirección.

## Verificación

31 casos, todos pasando, en los dos repos. El test extrae `detectarDatosSensibles` del
archivo real y la evalúa, en vez de copiarla: una copia puede pasar contra una versión
que ya no es la que corre.

**11 que deben frenar:** el #29 del banco, en minúsculas, "mi domicilio es",
"mi domicilio" sin verbo, "mi casa está en", "resido en", "vivimos en" con nombre
compuesto, "mi dirección es", el caso viejo con tipo de vía, "vivo en la calle X",
"nuestro domicilio".

**14 que no deben frenar:** los cuatro del Bloque 5 del banco, los tres que pidió el
equipo (oficina de Alvarado 1200, local en Belgrano 450, dependencia de España 800) y
siete trampas propias: antigüedad ("vivo en Salta hace 3 años", "vivimos en el barrio
hace 20 años"), sin altura, superficie de la casa, dependencia con vía, local propio y
distancia.

**6 de control:** las otras cinco categorías (DNI, CUIT, email, teléfono, tarjeta) y el
número de expediente, que tiene que seguir pasando.

## Logs

Se verificó que la pregunta no aparece en los logs: se buscaron 18 tokens de las
preguntas de prueba —calles, DNIs, mails, "vivo en", "mi domicilio"— en la salida del
server y no hubo ninguna coincidencia. Solo se loguea la categoría.
