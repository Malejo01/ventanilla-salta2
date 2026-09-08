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

En tres trámites, la página **muestra** una dirección institucional y el atributo
`href` del mismo enlace apunta a una casilla de proveedor gratuito. No son dos
contactos distintos puestos uno al lado del otro: es un solo elemento de enlace
cuyo texto y cuyo destino son direcciones diferentes.

| Trámite | Chunk | Texto visible del enlace | Destino real del `mailto:` |
|---|---|---|---|
| [Denuncia de colisión](https://municipalidadsalta.gob.ar/tramites/denuncia-de-colision/) | — | `licenciasdeconducir@…gob.ar` | `m***@gmail.com` |
| [Solicitud de dársena](https://municipalidadsalta.gob.ar/tramites/solicitud-de-darsena/) | `208497-2` | `tramitestransito@…gob.ar` | `f***@gmail.com` |
| [Vehículo secuestrado](https://municipalidadsalta.gob.ar/tramites/vehiculo-secuestrado/) | `176720-12` | `licenciasdeconducir@…gob.ar` | `m***@gmail.com` |

Lo confirmamos sobre el HTML servido, no sobre el corpus: en las tres páginas el
`mailto:` resuelve a la casilla gratuita y el texto que se imprime en pantalla es
la dirección institucional.

El tercer caso (*Vehículo secuestrado*) apareció en el barrido de enlaces de la
observación 9, no en el relevamiento original de contactos. Es el mismo par de
direcciones que *Denuncia de colisión* — las dos fichas son de Movilidad
Ciudadana — así que lo más probable es que sea un solo bloque de contacto
copiado entre páginas, con el error incluido.

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

---

## 8. Un mismo trámite publica dos casillas distintas para la misma consulta

**Estado:** sin tapar del lado nuestro. El corpus reproduce las dos, tal como
están publicadas.

### Qué encontramos

En **16 trámites** la página publica **dos direcciones de correo distintas para
la misma consulta**, y las dos están bajo el dominio institucional. Siempre es
el mismo par: una casilla `armsa.*` y una casilla `rentas.*` del mismo área.

Lo que las separa no es el tema sino **dónde están en la página**: la `armsa.*`
aparece dentro del acordeón, en la respuesta a *"¿Dónde y en qué horario se
realiza?"*, y la `rentas.*` en el bloque de contacto que está fuera del
acordeón, bajo el rótulo *"Para consultas sobre Trámites"*.

| Par | Trámites |
|---|---|
| `armsa.inm@` · `rentas.inm@` | alta-unidad-urbana · cambio-de-titularidad-inmuebles · desglose-de-tgi-e-iiu-en-boleta-edesa · inclusion-de-tgi-e-iiu-en-boleta-edesa · modificacion-de-nis-unidad-urbana · exencion-empresas-sin-fines-de-lucro · exencion-entidades-intermedias-religiosas |
| `armsa.aut@` · `rentas.aut@` | baja-del-automotor-por-desguase · baja-del-automotor-por-robo · exencion-para-automotores-y-motovehiculos-autopropulsados |
| `armsa.inf.des.terr@` · `rentas.inf.des.terr@` | recategorizacion-en-tgi · rezonificacion-en-impuesto-inmobiliario · subdivision-de-unidad-urbana · exencion-para-inmuebles-de-valor-historico-y-o-arquitectonico |

Dos trámites publican **tres**:

| Trámite | Casillas |
|---|---|
| `pagos-errados-de-inmuebles` | `armsa.inm@` · `rentas.inm@` · `rentas.acreditaciones@` |
| `unificacion-de-cuenta-con-unidad-urbana` | `armsa.inm@` · `rentas.inm@` · `rentas.inf.des@` |

### Por qué aparece ahora

No es nuevo en el sitio: es nuevo en el corpus. Hasta el fix del recorte de
secciones, el corpus solo tenía la casilla de adentro del acordeón, así que el
asistente contestaba siempre la `armsa.*` y la contradicción no se veía. Al
incorporar el bloque de contacto que estaba fuera, el corpus pasó a tener las
dos, y el asistente puede entregar cualquiera de ellas según qué chunk se
recupere. Las dos son igual de oficiales; nosotros no tenemos forma de saber
cuál es la vigente.

### Por qué importa

Es el mismo problema de fondo que el punto 6, en otra forma: dos canales para el
mismo trámite, ninguno señalado como principal. Las consultas se reparten entre
dos bandejas y ninguna de las dos ve el total, así que una consulta demorada en
una casilla es indistinguible de una consulta que nunca llegó. Para el vecino no
hay ninguna señal de que exista una segunda dirección.

Como no podemos elegir por el municipio, el banco de preguntas de QA
(`qa/banco-preguntas.json`, pregunta C5) acepta **cualquiera de las dos** como
respuesta correcta. Si el municipio define una, se ajusta ahí.

### Qué haría falta para resolverlo de fondo

Que cada trámite publique **una** casilla, o que diga explícitamente para qué
sirve cada una si de verdad son dos canales distintos. Es un cambio en la
fuente: el corpus se regenera del scraping y toma el dato nuevo sin tocar código.

---

## 9. Un requisito de habilitación enlaza a un dominio mal escrito, y la ruta correcta tampoco existe

**Estado:** sin tapar del lado nuestro. Verificado contra DNS, TLS y HTTP.

### Qué encontramos

La ficha de **Habilitaciones Comerciales**, en la sección *3) SOLICITUD DE
HABILITACIÓN*, pide un certificado de seguridad contra incendios y remite a un
listado de entidades de bomberos:

```
Consultá por entidades de Bomberos aquí:
http://www.policiasalta.gob.ar/requisitos/bomberos/db1.html
```

Está en **dos chunks**, y en los dos hay que corregirlo:

| Chunk | Trámite | Dónde aparece |
|---|---|---|
| `95471-25` | `habilitaciones-comerciales` (sub: *Nueva Habilitación Comercial*) | cuerpo **y** `enlaces[2]` |
| `v1-17-3` | `salta-activa-plataformas` (corpus curado v1) | solo cuerpo, en una tabla de plataformas |

El dominio de la Policía de la Provincia de Salta es **`policiadesalta.gob.ar`**
— con `de` en el medio. Lo que publica el municipio, `policiasalta.gob.ar`, es
otro host.

### Qué es realmente `policiasalta.gob.ar`

Dos cosas, ninguna buena:

- **`www.policiasalta.gob.ar`**, que es exactamente lo que dice el corpus, **no
  existe**: `NXDOMAIN`. El enlace está roto desde la resolución de nombres, antes
  de llegar a hacer un pedido HTTP.
- **`policiasalta.gob.ar`** sin el `www` **sí resuelve** (181.111.226.107), y ahí
  está lo llamativo: responde **HTTP 403** con un cuerpo que dice *"Este mensaje
  ha sido generado por Kerio Control Proxy"*. No es un sitio web: es un **proxy
  de control de tráfico interno, expuesto a internet**. Además sirve por HTTPS un
  certificado emitido para `*.policiadesalta.gob.ar`, que no lo cubre
  (`ERR_TLS_CERT_ALTNAME_INVALID`).

O sea: el host al que apunta el municipio no es, ni fue, el listado de bomberos.

### Qué pasa con el dominio correcto

`policiadesalta.gob.ar` está sano en lo que hace a identidad:

```
DNS   181.111.226.106, 200.49.93.130         resuelve
TLS   CN=*.policiadesalta.gob.ar
      SAN=*.policiadesalta.gob.ar, policiadesalta.gob.ar
      Sectigo, vigente 2025-10-01 → 2026-10-08     certificado válido
HTTP  302 → https://web.policiadesalta.gob.ar/    (200, WordPress)
```

Pero **la ruta del corpus no existe en ningún lado**:

| URL probada | Resultado |
|---|---|
| `policiadesalta.gob.ar/requisitos/bomberos/db1.html` | **404** |
| `web.policiadesalta.gob.ar/requisitos/bomberos/db1.html` | **404** |
| `policiadesalta.gob.ar/requisitos/bomberos/` | **404** |

El sitio de la Policía se rehízo en WordPress y la estructura estática vieja
(`/requisitos/...`) desapareció entera. La home actual **no menciona "bomberos"
ni una vez** en sus 85 KB de HTML.

Un detalle técnico que conviene anotar acá porque nos costó descubrirlo: el
servidor de `policiadesalta.gob.ar` **no manda el certificado intermedio**. Los
navegadores se recuperan solos (Chrome y Safari lo bajan por AIA, Firefox lo
tiene cacheado), pero `fetch` de Node falla con
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`. El certificado **está bien**; el que está mal
configurado es el servidor. Ver el punto 4 de `PENDIENTES.md`: es la razón por la
que el verificador de enlaces no puede usar `rejectUnauthorized` como criterio.

### Por qué importa

Este requisito no es opcional: el certificado de bomberos es condición para
habilitar locales con afluencia masiva de público. El vecino que sigue el enlace
para averiguar a qué entidad recurrir no recibe un "no existe" claro, recibe un
**403 de un proxy**, que no le dice nada y que además parece un problema suyo.

El asistente hereda el mismo problema, con un agravante: la URL está en el
`texto_display`, así que puede reproducirla dentro de la respuesta como el dato
operativo que la fuente dice que es.

### Qué recomendamos, y qué NO

**Recomendación: quitar la URL y dejar el texto.** Que el chunk diga *"Consultá
por entidades de Bomberos"* sin enlace es honesto. Con un enlace a un 403 de un
proxy interno, no lo es. Toca `texto_display`, `texto_embedding` y `enlaces[]` de
`95471-25`, y el cuerpo de `v1-17-3`.

**Lo que NO hay que hacer: reescribirlo a `policiadesalta.gob.ar`.** Es la
corrección que parece obvia y es la peor de las tres opciones:

1. el enlace queda **igual de roto** — 404 en vez de 403;
2. **borra la evidencia** de que había un error de transcripción, que es
   justamente el dato que el municipio necesita para arreglarlo en la fuente;
3. deja el corpus afirmando que existe una página que no existe.

Es un error de transcripción **y** un enlace caído. Las dos cosas a la vez, y
arreglar una no arregla la otra.

### Qué haría falta para resolverlo de fondo

Que la Dirección General de Habilitaciones **indique a dónde apunta hoy ese
requisito**: si el listado de entidades de bomberos se publica en algún lado del
sitio nuevo de la Policía, si se pide por otra vía, o si el requisito cambió. Es
el área que exige el certificado, así que es la que sabe. Con esa respuesta se
corrige la página municipal y el corpus lo toma del scraping siguiente.

---

### Otros dos hallazgos del mismo barrido

Salieron de verificar los 224 enlaces del corpus. Los anotamos acá porque son de
la misma familia —enlaces que el municipio publica hacia sistemas que ya no
responden— aunque cada uno es independiente del anterior.

#### `armsa.dgrmsalta.gov.ar` no existe

En la ficha **Vehículo secuestrado** (chunk `176720-3`), la instrucción para
pagar voluntariamente la multa dice *"deberás imprimir la Boleta Pago desde la
página web de la ARMSa"* y enlaza a:

```
https://armsa.dgrmsalta.gov.ar/#/automotores/emision-boletas/multas-transito
```

Ese host da **`NXDOMAIN`**. No es una caída temporal: el nombre no está en el
DNS. Los hermanos del mismo dominio sí resuelven —`dgrmsalta.gov.ar`,
`www.dgrmsalta.gov.ar` y `rentas.dgrmsalta.gov.ar`— así que lo más probable es
que el subdominio `armsa` se haya renombrado o consolidado bajo `rentas`.

Importa porque es **la única vía online que la ficha ofrece** para obtener la
boleta: el texto la menciona dos veces, una para imprimirla y otra para pagarla
por el sistema del Banco Macro. Sin ese enlace, al vecino le quedan solo los
canales presenciales.

**Qué haría falta:** que la ARMSa confirme cuál es la URL vigente de emisión de
boletas de multas de tránsito.

#### El apex de `dgrmsalta.gov.ar` sirve un certificado vencido

Al verificar la familia de dominios de Rentas apareció esto:

| Host | Certificado | Vigencia | Estado |
|---|---|---|---|
| `dgrmsalta.gov.ar` | `*.dgrmsalta.gov.ar` | 2025-05-09 → **2026-05-25** | **vencido hace 106 días** |
| `www.dgrmsalta.gov.ar` | `*.dgrmsalta.gov.ar` | 2026-04-17 → 2026-11-01 | vigente |
| `rentas.dgrmsalta.gov.ar` | `*.dgrmsalta.gov.ar` | 2026-04-17 → 2026-11-01 | vigente |

Es el mismo certificado wildcard en los tres. **Lo renovaron y no lo instalaron
en el apex**, que quedó sirviendo el anterior.

**Alcance, para no exagerarlo:** el apex pelado **no está enlazado desde ningún
chunk** del corpus (nosotros usamos `rentas.*` y el `armsa.*` del punto
anterior), así que hoy no rompe ninguna respuesta del asistente. Lo anotamos por
dos razones: es el mismo host que sirve Rentas del Municipio, y quien entre
escribiendo `dgrmsalta.gov.ar` a mano en el navegador va a ver una advertencia de
seguridad a pantalla completa antes de poder pagar nada.

**Qué haría falta:** instalar el certificado ya renovado también en el apex. Es
configuración de servidor, no hay que emitir nada nuevo.

---

## 10. Dieciocho de los veintitrés formularios de Google del corpus no funcionan

**Estado:** sin tapar del lado nuestro. Verificado contra los formularios en
vivo el 2026-09-08.

### Qué encontramos

Buena parte de los trámites del sitio municipal se inician completando un
formulario de Google, enlazado desde la ficha como *"COMPLETAR FORMULARIO"*,
*"LLENAR FORMULARIO"* o *"Completar Formulario Aquí"*. En el corpus hay **23
URLs de formulario** distintas, entre `forms.gle` (enlaces cortos) y
`docs.google.com/forms/...` (largos).

De esas 23, **funcionan 5**.

| Estado | Cuántos | Qué le pasa al vecino |
|---|---|---|
| **Cerrado** | 10 | Google redirige a `/closedform`: *"El formulario ya no acepta respuestas"* |
| **Exige cuenta de Google** | 5 | Redirige a `accounts.google.com/signin`; sin cuenta, no se puede completar |
| **404** | 3 | El enlace corto `forms.gle` resuelve a un formulario que ya no existe |
| **Funciona** | 5 | — |

### Por qué el municipio no se enteró

Éste es el punto que hace que la observación valga la pena, y es la razón por la
que conviene leerla completa antes de pedir "una lista de links rotos":

**15 de los 18 formularios rotos devuelven HTTP 200.**

Un formulario cerrado no da 404 ni 410: Google responde `302` hacia
`/closedform`, y esa página devuelve **200 OK**. Uno que exige login responde
`302` hacia la pantalla de ingreso de Google, que también devuelve **200 OK**.
Para cualquier chequeo que mire el código de estado —un verificador de enlaces
casero, una extensión de navegador, el reporte de un CMS— los 15 están
**perfectos**. Solo los 3 que dan 404 se ven.

Dicho de otro modo: el modo de falla más común de estos formularios es
**invisible para las herramientas y visible solo para el vecino**, que llega
hasta el final del trámite y ahí se entera. Y como el que se entera es el vecino
y no el municipio, nadie reporta nada: la persona abandona o llama por teléfono,
y la ficha sigue publicada igual.

Detectarlo requiere mirar la **URL final de la cadena de redirecciones**, no el
código de estado. Está anotado como aprendizaje en el punto 4 de
`PENDIENTES.md`, porque es exactamente el caso que nuestro primer diseño de
verificador clasificaba como sano.

### Detalle por ficha

**Cerrados — 10**

| Ficha (slug) | Chunk | URL |
|---|---|---|
| `denuncias` (A — aguas y cloacas) | `144867-0` | `https://forms.gle/XT59LC1UeYUfWGV47` |
| `denuncias` (D — vía pública) | `144867-3` | `https://forms.gle/3CTnN9EbeFzgf9jZ8` |
| `yoemprendo` | `228272-5` | `https://forms.gle/Qd61v2AMMwQQkWZv5` |
| `curso-manipulacion-alimentos` | `v1-5-4` | `https://forms.gle/PVuvcRw6aKk8XZfb9` |
| `curso-manipulacion-alimentos` | `v1-5-4` | `https://docs.google.com/forms/d/e/1FAIpQLSdTPHa5atWEkPV6lgla5eeafztaMIpai7s_v1sdCGa1ZxIB_Q/viewform` |
| `curso-manipulacion-alimentos` | `v1-5-4` | `https://docs.google.com/forms/d/e/1FAIpQLSe6CrRbyLEHHzAOiaLar2Ty7hcfaYAg_sd9b-gNYi4ckfN3ow/viewform` |
| `curso-manipulacion-alimentos` | `v1-5-4` | `https://docs.google.com/forms/d/e/1FAIpQLSe7-LfRi01yFCBCW4mrMgJEFHz3XJbWCUJiT0aod8d2CO8F6Q/viewform` |
| `curso-manipulacion-alimentos` | `v1-5-4` | `https://docs.google.com/forms/d/e/1FAIpQLSe_UUMgifUz_EtP6FfIv8xoHVvIxnANDzoC57qHxPCSmb2BMA/viewform` |
| `curso-manipulacion-alimentos` | `v1-5-5` | `https://docs.google.com/forms/d/e/1FAIpQLScjSRwOOsvRwRZoyZFobIE5bKdUNARZA4YE8aUOG7bIaAh50g/viewform` |
| `curso-manipulacion-alimentos` | `v1-5-5` | `https://docs.google.com/forms/d/e/1FAIpQLSfCv0jgQIncBWvlawTY90HhbccCR9RX-aMTi3pSRvwRVJIfPg/viewform` |

**Exigen cuenta de Google — 5**

| Ficha (slug) | Chunk | URL |
|---|---|---|
| `permiso-de-frentista-residente` | `208213-2` | `https://docs.google.com/forms/d/e/1FAIpQLScLbNvGxR-1spPVyZ_iIwy9wyLhWW5XTClDvo99tPIIHUaKnA/viewform` |
| `permiso-de-frentista-comerciante` | `208217-2` | `https://docs.google.com/forms/d/e/1FAIpQLSd801KRmP3RhKKIK1mRCcm5NGaPluIGfTM0tzBDDKAs8UkQMA/viewform` |
| `solicitud-de-darsena` | `208497-2` | `https://forms.gle/SmJCZBpoyxPNX2xo9` |
| `oblea-de-discapacidad` | `223416-2` | `https://forms.gle/bemFdrAddTrRzE3q9` |
| `denuncia-de-vehiculo-abandonado` | `143567-2` | `https://forms.gle/vEmEHmLjCm2rzQtGA` |

**404 — 3**

| Ficha (slug) | Chunk | URL |
|---|---|---|
| `solicitud-de-estados-de-cuenta` | `146957-0` | `https://forms.gle/Sh5pZqDUqgEKXcQh6` |
| `consulta-de-expedientes` | `146963-0` | `https://forms.gle/25yjQL7kVkmSVPFK9` |
| `denuncias` (E — defensa del consumidor) | `144867-4` | `https://forms.gle/GfN4F68w2JhMkcQY7` |

**Funcionan — 5**, para que quede constancia de que no está todo roto:
`registro-de-aperturas` (`144855-4`), `solicitud-de-alta-de-garaje`
(`208500-2`), `denuncias` B y C (`144867-1`, `144867-2`) y un horario del
`curso-manipulacion-alimentos` (`v1-5-4`).

### Qué implica cada modo de falla

Los tres son distintos y no se arreglan igual:

- **Cerrado.** Alguien apagó el formulario y la ficha quedó publicada. En
  `curso-manipulacion-alimentos` son 7 de 8: es un cronograma de cursos por día y
  horario, así que probablemente los cierren al terminar cada cohorte y abran
  otros nuevos, sin actualizar la página. En `denuncias` y `yoemprendo` no hay
  esa explicación.
- **Exige cuenta de Google.** Es una opción de configuración del formulario
  ("restringir a usuarios" o "recopilar direcciones de correo"). Convierte una
  cuenta en un proveedor privado en **requisito de hecho para un trámite
  municipal**. Pesa distinto según la ficha: en `oblea-de-discapacidad` y
  `denuncia-de-vehiculo-abandonado` el destinatario es justamente el vecino que
  menos podemos asumir que tenga cuenta.
- **404.** El formulario se borró. Acá no hay nada que reabrir: hay que hacer uno
  nuevo o dar otra vía.

Los tres casos de **`denuncias`** son los más sensibles del conjunto: esa ficha
es un menú de cinco tipos de denuncia y **tres de los cinco no se pueden
presentar**. El vecino que quiere denunciar una apertura sin cerrar en la vereda
(A), una ocupación indebida de la vía pública (D), o pedir el acompañamiento de
Defensa del Consumidor (E) llega a un formulario muerto. Los que funcionan son
B y C.

### Efecto sobre el asistente

Directo y no lo podemos evitar desde el corpus: cuando la respuesta incluye el
paso *"completá el formulario"*, el asistente entrega la URL que la fuente
publica. Es la respuesta correcta según el corpus y aun así el vecino no puede
completar el trámite. Peor: como el formulario cerrado abre y muestra una página
de Google con aspecto normal, la falla parece del vecino.

### Qué haría falta para resolverlo de fondo

Que cada dependencia revise el formulario de su trámite y, para cada uno:

1. **reabra** el que cerró por error, o **actualice la ficha** si el trámite pasó
   a otra vía;
2. **saque el requisito de cuenta de Google** de los cinco que lo tienen, salvo
   que haya una razón que lo justifique — y si la hay, que la ficha lo diga
   **antes** de que el vecino haga clic;
3. **reemplace** los tres borrados.

Es un cambio en la fuente en todos los casos: el corpus se regenera del scraping
y toma el dato nuevo sin tocar código.

Nosotros no podemos taparlo: no tenemos forma de saber cuál es el formulario
nuevo de un trámite cuyo formulario se borró, y ocultarle al vecino el único
enlace que la fuente publica sería peor que dárselo.
