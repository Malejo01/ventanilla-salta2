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

---

## 5. Dependencias que publican un correo de proveedor gratuito como contacto

**Estado:** sin tapar del lado nuestro. El corpus reproduce el contacto tal como
está publicado en la página oficial.

### Qué encontramos

Barriendo los 758 chunks de `tramite_chunks_v2` (texto y enlaces `mailto:`)
aparecen **63 direcciones de email distintas**. Separadas por origen:

| Origen de la página | Dominio institucional | Proveedor gratuito |
|---|---|---|
| `municipalidadsalta.gob.ar` | 18 | 3 |
| `atencionciudadana.salta.gob.ar` (Guía provincial) | 1 | 41 |

A esas 3 se suma una cuarta que el corpus no tiene: el chunk de *Oblea para
Personas con Discapacidad* perdió la sección de contacto al regenerarse, pero la
dirección **sigue publicada en la página**. La verificamos contra el sitio en
vivo, igual que las otras tres. Quedan **4 direcciones de proveedor gratuito en
3 dependencias**:

| Dependencia | Correo | Dónde aparece |
|---|---|---|
| Dirección General de Discapacidad (Promoción Social) | `d***@gmail.com` | [`/promocion-social/`](https://municipalidadsalta.gob.ar/promocion-social/) |
| Secretaría de Tránsito y Seguridad Vial — frentistas y dársenas | `f***@gmail.com` | [`/tramites/permiso-de-frentista-residente/`](https://municipalidadsalta.gob.ar/tramites/permiso-de-frentista-residente/) · [`/tramites/permiso-de-frentista-comerciante/`](https://municipalidadsalta.gob.ar/tramites/permiso-de-frentista-comerciante/) · [`/tramites/solicitud-de-darsena/`](https://municipalidadsalta.gob.ar/tramites/solicitud-de-darsena/) |
| Secretaría de Tránsito y Seguridad Vial — oblea de discapacidad | `d***@gmail.com` | [`/tramites/oblea-de-discapacidad/`](https://municipalidadsalta.gob.ar/tramites/oblea-de-discapacidad/) |
| Movilidad Ciudadana — denuncia de colisión | `m***@gmail.com` | [`/tramites/denuncia-de-colision/`](https://municipalidadsalta.gob.ar/tramites/denuncia-de-colision/) |

Las otras 18 direcciones de esas mismas páginas sí usan
`@municipalidadsalta.gob.ar` (`armsa.inm`, `rentas.aut`, `licenciasdeconducir`,
`tribunaldefaltas01`…`05`, entre otras), así que el criterio institucional está
aplicado en la mayor parte del sitio.

En *Promoción Social* conviven las dos formas: la página trae también una
dirección `@municipalidadsalta.gob.ar` en el bloque de contacto, mientras que la
sección "Servicio de asesoramiento e información" publica la casilla gratuita y
es esa la que está enlazada.

### Por qué importa

Dos cuestiones operativas, ninguna de las cuales podemos resolver desde el
corpus:

1. **Continuidad del contacto.** Una casilla de proveedor gratuito está a nombre
   de una persona, no de la dependencia. Si esa persona deja el área, la
   Municipalidad no tiene forma de recuperar la casilla ni el historial de
   consultas que entró por ahí. Una dirección bajo el dominio institucional se
   reasigna internamente.
2. **Verificabilidad.** Un ciudadano que recibe una respuesta desde una casilla
   gratuita no tiene cómo comprobar que sea un canal oficial, y a la inversa: no
   puede distinguir la casilla real de una imitación. El dominio institucional es
   la única señal comprobable de que el canal pertenece al municipio.

Para el asistente el efecto es directo: cuando la respuesta incluye el contacto,
reproduce lo que dice la fuente. Si la dirección deja de atenderse, el asistente
sigue entregándola hasta que cambie la página de origen.

### Alcance del relevamiento

Las **41** direcciones de proveedor gratuito restantes no están en páginas
municipales: salen de una sola página de la Guía de Trámites **provincial** (CUD),
en una tabla de referentes de discapacidad por municipio del interior de Salta.
Varias tienen forma de cuenta personal y figuran junto al nombre y apellido de la
persona. Las anotamos acá solo para dejar claro de dónde sale la diferencia entre
las 4 municipales y el total; no son contactos de la Municipalidad de Salta y su
corrección no depende de ella.

### Qué haría falta para resolverlo de fondo

Que las dependencias publiquen una dirección bajo `municipalidadsalta.gob.ar` en
la página del trámite. Es un cambio en la fuente: el corpus se regenera del
scraping y toma el dato nuevo sin tocar código.

---

## 6. El texto visible de un enlace de contacto no coincide con su destino

**Estado:** sin tapar del lado nuestro. Verificado contra el sitio en vivo.

### Qué encontramos

En dos trámites, la página **muestra** una dirección institucional y el atributo
`href` del mismo enlace apunta a una casilla de proveedor gratuito. No son dos
contactos distintos puestos uno al lado del otro: es un solo elemento de enlace
cuyo texto y cuyo destino son direcciones diferentes.

| Trámite | Texto visible del enlace | Destino real del `mailto:` |
|---|---|---|
| [Denuncia de colisión](https://municipalidadsalta.gob.ar/tramites/denuncia-de-colision/) | `licenciasdeconducir@…gob.ar` | `m***@gmail.com` |
| [Solicitud de dársena](https://municipalidadsalta.gob.ar/tramites/solicitud-de-darsena/) | `tramitestransito@…gob.ar` | `f***@gmail.com` |

Lo confirmamos sobre el HTML servido, no sobre el corpus: en las dos páginas el
`mailto:` resuelve a la casilla gratuita y el texto que se imprime en pantalla es
la dirección institucional.

### Por qué importa

El resultado depende de cómo el ciudadano use la página, sin que nada se lo
indique:

- Si **copia la dirección a mano**, escribe a la casilla institucional.
- Si **hace clic**, su cliente de correo se abre con la casilla gratuita como
  destinatario, y el campo "Para" muestra esa dirección, no la que leyó.

Las dos casillas reciben entonces consultas del mismo trámite, y ninguna de las
dos ve el total. Una respuesta que no llega puede estar esperando en la otra
bandeja. Del lado del ciudadano no hay señal de que existan dos destinos: la
página se lee como si hubiera uno solo.

Como hecho técnico, el patrón —texto visible con dominio institucional, destino
en un dominio de terceros— es la forma que toma un enlace de correo manipulado, y
es el caso que los filtros antiphishing y los clientes de correo señalan. No
estamos afirmando que sea eso: la casilla de destino es la misma que la Secretaría
publica en otros trámites del sitio. El punto es que un ciudadano no tiene forma
de distinguir un caso del otro sin abrir el código de la página, y una herramienta
automática tampoco.

Para el asistente hay un efecto adicional: el scraping guarda el `href` y el texto
por separado, así que la respuesta puede citar una dirección distinta de la que se
ve en la página oficial, sin que ninguna de las dos sea un error nuestro.

### Qué haría falta para resolverlo de fondo

Que en las dos páginas el texto del enlace y el destino del `mailto:` sean la
misma dirección, cualquiera de las dos que la Secretaría considere la vigente.

---

## 7. Una dirección de contacto apunta a un dominio que no existe

**Estado:** sin tapar del lado nuestro. Verificado contra el sitio en vivo y
contra DNS.

### Qué encontramos

La página de la [Subsecretaría de la Mujer](https://municipalidadsalta.gob.ar/subsecretaria-mujer/)
publica como contacto una dirección en el dominio **`municipalidadsalt.gob.ar`**
— sin la `a` final de `municipalidadsalta`. Está así en el texto visible y
también en el destino del enlace, de modo que copiarla a mano y hacer clic llevan
al mismo lugar.

Ese dominio **no existe**: la consulta DNS devuelve `NXDOMAIN`, sin registro `A`
y sin registro `MX`. No está registrado por nadie. El dominio oficial
`municipalidadsalta.gob.ar` sí resuelve y sí tiene `MX`.

### Por qué importa

Hoy el correo enviado a esa dirección **no se entrega**. Al no existir el
dominio, el servidor del remitente normalmente devuelve un rebote; si ese aviso
llega y si se lo lee depende del proveedor y del cliente de correo de cada
persona. La dependencia, en cambio, no recibe ninguna señal: desde el lado del
municipio una consulta que nunca llegó es indistinguible de una consulta que
nunca se hizo.

El segundo punto es sobre el dominio en sí. Al estar libre y a un carácter del
oficial, `municipalidadsalt.gob.ar` es registrable por un tercero. Si alguien lo
registrara y le configurara `MX`, el correo dirigido a esa casilla pasaría a
entregarse en su servidor: dejaría de rebotar, el remitente ya no recibiría aviso
alguno, y el mensaje llegaría a destino sin que ni el ciudadano ni la
Subsecretaría puedan notarlo. La página seguiría publicando la misma dirección.
Esto aplica al canal de una dependencia cuyas consultas pueden incluir datos
sensibles.

### Qué haría falta para resolverlo de fondo

Corregir la grafía del dominio en la página de la Subsecretaría. Es un carácter
en la fuente; el corpus lo toma del scraping siguiente.
