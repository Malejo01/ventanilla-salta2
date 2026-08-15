# Observaciones sobre el corpus

Cosas que encontramos en los datos del corpus (`tramite_chunks_v2`) que **no
podemos ni debemos arreglar por nuestra cuenta**, porque son decisiones de
clasificación que le corresponden a la Municipalidad.

Cada una dice qué encontramos, cómo lo estamos tapando mientras tanto, y qué
haría falta para resolverlo de fondo.

Este archivo es para llevar a la reunión con el municipio.

---

## 1. El área "Exenciones" no contiene las exenciones

**Estado:** tapado del lado nuestro. Pendiente de definición del municipio.

### Qué encontramos

El área **"Exenciones"** tiene **un solo trámite**: *Exenciones Impositivas*, que
es una ficha genérica. Y ese trámite además está en otras tres áreas
(`Automotor`, `Inmobiliarios`, `Licencia de conducir`), así que el área no aporta
ningún trámite propio al catálogo.

Mientras tanto, en el corpus hay **14 trámites de exención**, y **13 están fuera
del área "Exenciones"**:

| Dónde viven hoy | Cuántos | Ejemplos |
|---|---|---|
| `Inmobiliarios` | 7 | Exención para Jubilados y Pensionados · Exención para Discapacitados · Exención para Desocupados · Exención para ex Combatientes de Malvinas · Exención Empresas sin Fines de Lucro |
| `Automotor` | 5 | Eximición de la Tasa de Protección Ambiental (vehículos de 20 años o más) · Exención para Discapacitados · Exención para Automotores y Motovehículos Autopropulsados · Exención IRA – Licencia Habilitante |
| `Taxis y remises` | 1 | Exención IRA – Licencia Individual |
| **`Exenciones`** | **1** | Exenciones Impositivas (la ficha genérica) |

### Por qué importa

Un vecino que entra por "Exenciones" buscando la exención de jubilados **no la
encuentra ahí**. El nombre del área promete un lugar donde están todas las
exenciones y entrega una sola ficha general. Es de las consultas más probables:
la exención para jubilados y la de discapacidad son trámites de alta demanda.

### Detalle adicional: el slug no coincide con el contenido

El área se muestra como **"Exenciones"** pero su `categorias_slug` es
**`exenciones-comerciales`**, y no contiene ningún trámite comercial. O el nombre
o el slug está mal; hoy no sabemos cuál de los dos es el que el municipio
considera correcto.

### Qué hicimos mientras tanto

En `lib/catalogo.ts`, la respuesta de catálogo **no lista "Exenciones" como área
propia**. La regla es derivada, no una exclusión escrita a mano: se suprime toda
área cuyos trámites estén **todos** también en otra área, porque no es una puerta
de entrada, es un rótulo. Hoy la única que cae en esa regla es "Exenciones".

Consecuencias:

- Ningún trámite se pierde: los 133 siguen contándose y siguen alcanzables por
  las otras áreas. `totalTramites` no cambia.
- *Exenciones Impositivas* deja de aparecer como ejemplo (antes encabezaba tres
  áreas distintas y la respuesta parecía contar el mismo trámite varias veces).
- **Si el municipio le da a "Exenciones" aunque sea un trámite propio, el área
  vuelve a listarse sola, sin tocar código.**

### Qué haría falta para resolverlo de fondo

Que el municipio decida **una** de estas:

1. **Recategorizar**: agregar la categoría `Exenciones` a los 13 trámites de
   exención que hoy viven en otras áreas. El área pasaría a tener 14 trámites y
   sería una puerta de entrada real. Es lo que recomendamos.
2. **Eliminar el área**: si "Exenciones" no es una categoría que el municipio
   quiera sostener, sacarla y dejar cada exención en su área temática.
3. **Dejarlo como está**: si hay un motivo administrativo para que "Exenciones
   Impositivas" sea su propia categoría, nos lo explican y revertimos la
   supresión.

Nosotros **no** aplicamos ninguna de las tres: recategorizar 13 trámites es
inventar taxonomía sobre datos oficiales, y eso lo define el municipio.

---

## 2. Categorías con jerarquía implícita

**Estado:** resuelto del lado nuestro, leyendo los datos. Sin acción pendiente,
pero conviene confirmarlo.

Tres áreas están **enteramente contenidas** en `Automotor`, sin que el corpus lo
diga en ningún lado:

| Área | Trámites | Cuántos están también en Automotor |
|---|---|---|
| `Licencia de conducir` | 24 | **24 (100%)** |
| `Taxis y remises` | 4 | **4 (100%)** |
| `Tránsito Digital` | 8 | 7 (88%) — se salva *Oblea de Discapacidad* |

Listadas al mismo nivel que `Automotor`, la respuesta se lee como si el catálogo
contara los mismos trámites dos veces.

**Qué hicimos:** la respuesta de catálogo anida las áreas 100% contenidas dentro
de su contenedora. La relación se **deriva del corpus en cada carga**, no está
escrita a mano: si mañana entra un trámite de licencia que no sea de Automotor,
las dos vuelven a listarse por separado solas. `Tránsito Digital` no califica y
se sigue listando aparte.

**A confirmar con el municipio:** si esta jerarquía es intencional. Si lo es,
convendría que el corpus la exprese explícitamente en vez de que la infiramos.

---

## 3. Nombres de categoría con grafía inconsistente

**Estado:** normalizado del lado nuestro, reversible.

De las 16 categorías, 15 vienen bien escritas (`Vía Pública`, `Inspección de
Obras Privadas`) y una venía como **`conexion electrica`**, en minúscula y sin
tildes. En el listado de áreas de la respuesta de catálogo, que las muestra una
debajo de la otra, cantaba.

**Qué hicimos:** `qa/normalizar-nombres-categorias.mjs` la deja como
`Conexión eléctrica`. Se revierte con `--revert`. Toca solo `categorias` (el
nombre visible); **no** toca `categorias_slug`, que es la clave del índice GIN y
del `filtro_categoria` de la RPC. No re-embebe: el retrieval no se mueve.

**A confirmar con el municipio:** es grafía nuestra. Si publican su propia forma,
se revierte y se usa la de ellos.

---

## 4. Trámites que el municipio publicó sin categoría

**Estado:** tapado del lado nuestro, reversible. Ver
`qa/completar-categorias.mjs`.

16 trámites llegaron del scraping con `categorias: []`. Les inventamos tres
categorías (`Desarrollo Social`, `Emprendedores`, `Comunicación`) que **no
existen en la taxonomía del sitio municipal**, porque si no el chip de fuentes
quedaba sin etiqueta.

**A confirmar con el municipio:** cuál es la clasificación oficial de esos 16.
`node qa/completar-categorias.mjs --revert` los deja como estaban.
