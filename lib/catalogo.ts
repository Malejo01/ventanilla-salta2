// ---------------------------------------------------------------------------
// CAMINO DE CATÁLOGO ("¿qué trámites puedo hacer?")
//
// Estas preguntas no tienen un trámite que las conteste: las contesta el corpus
// entero. El retrieval vectorial las resuelve mal por construcción — trae los 5
// chunks más parecidos a la frase, que terminan siendo 2 trámites cualquiera, y
// el modelo solo puede hablar de lo que le pasamos. Subir `match_count` tampoco
// alcanza: 30 chunks siguen siendo 8 o 10 trámites de 133, y encima se comen el
// presupuesto de contexto.
//
// Así que se saltea el retrieval: se detecta la pregunta con un clasificador de
// regex y se arma el contexto con un agregado sobre `tramite_chunks_v2`.
//
// El clasificador es regex y no una llamada al modelo a propósito: clasificar
// con Gemini agrega un round-trip completo a TODAS las consultas, no solo a las
// de catálogo, y la latencia se paga en la demo.
//
// Este módulo NO importa nada (ni Supabase ni el cliente de Gemini) para que
// `qa/test-catalogo.mjs` lo pueda importar directo con el type-stripping nativo
// de Node y probar el clasificador sin levantar Next ni pegarle a la red. La
// parte que sí toca la base vive en app/api/chat/route.ts.
// ---------------------------------------------------------------------------

// Rango de marcas diacríticas combinantes: es lo que deja sueltas el NFD al
// descomponer "á" en "a" + tilde. Se arma con `new RegExp` y no como literal
// para que el archivo quede en ASCII puro (un literal con los combinantes
// adentro es invisible en un diff y cualquier editor lo puede romper).
const RE_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g")

// Minúsculas, sin tildes, sin signos, espacios colapsados.
// "¿Qué trámites puedo hacer?" -> "que tramites puedo hacer"
export function normalizarConsulta(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(RE_DIACRITICOS, "")
    .replace(/[¿?¡!.,;:"'()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// --- Vocabulario del clasificador (todo ya normalizado) ---

// Cómo se nombra al catálogo entero, sin apuntar a ningún trámite.
const CAT_OBJETO = "(?:tramites?|gestiones|servicios|cosas|temas|consultas)"

// Existencia / posesión / cobertura: "qué trámites HAY", "qué trámites TENÉS",
// "qué tipo de trámites HACÉS".
const CAT_HAY =
  "(?:hay|tenes|tiene|tienen|manejas|maneja|manejan|cubris|cubre|cubren|conoces|conoce|ofreces|ofrece|ofrecen|existen|abarcas|abarca|haces|hace|hacen)"

// Capacidad: "qué trámites PUEDO hacer", "qué PODÉS hacer".
const CAT_PODER = "(?:puedo|podes|puede|pueden|podemos|podria|podrias|se puede|se pueden)"

// Acción genérica que acompaña a los verbos de capacidad.
const CAT_ACCION = "(?:hacer|realizar|gestionar|consultar|preguntar|preguntarte|tramitar|averiguar)"

// Arranques que no cambian el sentido: "hola, ¿qué podés hacer?".
const CAT_SALUDO = "(?:hola|buenas|buen dia|buenas tardes|buenas noches|che|ey|hey|tuki)"

// Coletillas que tampoco lo cambian: "…acá", "…con vos", "…por favor".
const CAT_COLA =
  "(?:\\s+(?:disponibles?|aca|aqui|ahora|hoy|en total|en esta pagina|en este chat|en la muni|en la municipalidad|en salta|con vos|con usted|vos|usted|tuki|por favor|porfa|porfis|gracias))*"

// La clave para no comerse consultas reales es que el match es de la CADENA
// ENTERA (^…$), no de una subcadena. "qué trámites hay" es catálogo; "qué
// trámites DE LICENCIA hay" no matchea, porque "de licencia" no entra en ningún
// fragmento, y cae al retrieval normal como corresponde. Lo mismo con "qué
// necesito para habilitar un local" o "qué documentación piden": ninguna arranca
// con una de estas formas.
//
// Cada núcleo va con y sin voseo: la misma persona escribe "qué podés hacer" y
// "qué puede hacer usted" según cómo trate al asistente.
const NUCLEOS_CATALOGO = [
  // "qué trámites hay" · "cuántos trámites tenés" · "qué tipo de trámites hay"
  `(?:que|cuales|cuantos|cuantas)\\s+(?:tipos?\\s+de\\s+)?${CAT_OBJETO}\\s+${CAT_HAY}`,

  // "qué trámites puedo hacer" · "qué trámites se pueden hacer"
  `(?:que|cuales|cuantos|cuantas)\\s+(?:tipos?\\s+de\\s+)?${CAT_OBJETO}\\s+${CAT_PODER}(?:\\s+${CAT_ACCION})?`,

  // "qué tipo de trámites" — sin verbo, tal cual la escribe la gente
  `(?:que|cuales)\\s+tipos?\\s+de\\s+${CAT_OBJETO}`,

  // "qué podés hacer" · "qué puedo consultar" · "qué puede hacer usted"
  `que\\s+${CAT_PODER}\\s+${CAT_ACCION}`,

  // "qué sabés" · "qué sabés hacer" · "qué sabe usted"
  `que\\s+(?:sabes|sabe)(?:\\s+${CAT_ACCION})?`,

  // "en qué me podés ayudar" · "en qué me puede ayudar"
  `(?:en\\s+)?que\\s+(?:cosas\\s+|temas\\s+)?(?:me\\s+)?${CAT_PODER}\\s+ayudar`,

  // "para qué servís" · "para qué sirve" · "para qué sos"
  `para\\s+que\\s+(?:servis|sirve|sos|es|estas)`,

  // "qué hay disponible" · "qué hay" (la cola se come el "disponible")
  `que\\s+hay`,

  // "de qué temas sabés" · "sobre qué me podés ayudar"
  `(?:de|sobre)\\s+que\\s+(?:${CAT_OBJETO}\\s+)?(?:sabes|sabe|${CAT_PODER}\\s+ayudar)`,

  // "mostrame los trámites" · "listame las gestiones"
  `(?:mostra|mostrame|muestrame|lista|listame|dame|decime)\\s+(?:la\\s+lista\\s+de\\s+|los\\s+|las\\s+|todos\\s+los\\s+|todas\\s+las\\s+)?${CAT_OBJETO}`,
]

const RE_CATALOGO = new RegExp(
  `^(?:${CAT_SALUDO}\\s+)*(?:${NUCLEOS_CATALOGO.join("|")})${CAT_COLA}$`,
)

export function esPreguntaDeCatalogo(pregunta: string): boolean {
  return RE_CATALOGO.test(normalizarConsulta(pregunta))
}

// --- Agregado del corpus -----------------------------------------------------

export type CatalogoArea = {
  categoria: string
  cantidad: number
  ejemplos: string[]
  // Nombre del área que contiene a esta por completo, si hay exactamente una.
  // Ver `detectarSubareas`. Ausente = área de primer nivel.
  subareaDe?: string
}

export type Catalogo = {
  areas: CatalogoArea[]
  totalTramites: number
}

// Las columnas de `tramite_chunks_v2` que necesita el catálogo, y ninguna más:
// no se traen ni embeddings ni textos.
export type FilaCatalogo = {
  slug: string | null
  titulo_tramite: string | null
  categorias: string[] | null
  es_mas_consultado: boolean | null
}

export const EJEMPLOS_POR_AREA = 3

// Copia local de `slugToNombre` de app/api/chat/route.ts. Se duplica para que
// este módulo no importe nada y Node lo pueda cargar suelto (ver cabecera). Es
// solo el fallback de título: hoy los 133 trámites del corpus tienen
// `titulo_tramite`, así que no llega a ejecutarse.
function slugToNombre(slug: string): string {
  const s = slug.replace(/-/g, " ").trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Algunas áreas del corpus no son hermanas de otras: están enteras adentro.
// Los 24 trámites de "Licencia de conducir" son TODOS también "Automotor"
// (medido: 24 de 24, cero disjuntos), y los 4 de "Taxis y remises" también.
// Listadas una debajo de otra como si fueran áreas independientes, la respuesta
// de catálogo se lee como si el corpus tuviera un error de conteo: aparece
// "Automotor (53)" y después "Licencia de conducir (24)", y el ciudadano no
// tiene forma de saber que los 24 ya estaban contados en los 53.
//
// La relación NO se hardcodea: se deriva del corpus en cada carga. Así no
// inventamos una taxonomía que el municipio no publicó — solo describimos la que
// ya está en los datos — y si mañana el scraping agrega un trámite de licencia
// que no sea de Automotor, la relación desaparece sola y las dos vuelven a
// listarse como áreas de primer nivel.
//
// Condiciones para marcar A como subárea de B:
//   · todos los trámites de A están en B;
//   · A es más chica que B (si son iguales, se contienen mutuamente y no hay
//     forma de decir cuál va adentro);
//   · B es el ÚNICO contenedor de A. "Exenciones" tiene un solo trámite
//     ("Exenciones Impositivas") que está a la vez en Automotor, Inmobiliarios y
//     Licencia de conducir: elegir uno sería arbitrario, así que queda de primer
//     nivel;
//   · B no es a su vez subárea de otra. Un solo nivel de anidamiento: en una
//     respuesta de chat, dos niveles se leen peor que ninguno.
//
// Casos que NO califican hoy, a propósito: "Tránsito Digital" solapa 7 de 8 con
// Automotor pero tiene un trámite propio (Oblea de Discapacidad), así que no
// está contenida y se sigue listando aparte.
function detectarSubareas(porCategoria: Map<string, Set<string>>): Map<string, string> {
  const contenedores = new Map<string, string[]>()

  for (const [a, tramitesA] of porCategoria) {
    const candidatos: string[] = []
    for (const [b, tramitesB] of porCategoria) {
      if (a === b || tramitesA.size >= tramitesB.size) continue
      let contenida = true
      for (const t of tramitesA) {
        if (!tramitesB.has(t)) {
          contenida = false
          break
        }
      }
      if (contenida) candidatos.push(b)
    }
    contenedores.set(a, candidatos)
  }

  const subareas = new Map<string, string>()
  for (const [a, candidatos] of contenedores) {
    if (candidatos.length !== 1) continue
    // Un solo nivel: si el contenedor está él mismo contenido en otra, no
    // anidamos, para no armar cadenas.
    if ((contenedores.get(candidatos[0]) ?? []).length === 1) continue
    subareas.set(a, candidatos[0])
  }
  return subareas
}

export function agruparCatalogo(filas: FilaCatalogo[]): Catalogo {
  // Un trámite = un slug, aunque tenga 29 chunks. `es_mas_consultado` viene por
  // chunk: alcanza con que UNO lo tenga para que el trámite lo sea.
  type Tramite = {
    slug: string
    titulo: string
    categorias: string[]
    masConsultado: boolean
    chunks: number
    orden: number
  }
  const porSlug = new Map<string, Tramite>()

  for (const f of filas) {
    const slug = f.slug?.trim()
    if (!slug) continue
    const existente = porSlug.get(slug)
    if (existente) {
      existente.chunks += 1
      existente.masConsultado ||= f.es_mas_consultado === true
      continue
    }
    porSlug.set(slug, {
      slug,
      titulo: f.titulo_tramite?.trim() || slugToNombre(slug),
      categorias: (f.categorias ?? []).filter((c) => c?.trim()),
      masConsultado: f.es_mas_consultado === true,
      chunks: 1,
      orden: porSlug.size,
    })
  }

  const porCategoria = new Map<string, Tramite[]>()
  for (const t of porSlug.values()) {
    // Un trámite sin categoría no se pierde: cae en un área genérica en vez de
    // desaparecer del catálogo. Hoy no hay ninguno (ver
    // qa/completar-categorias.mjs), pero el corpus crece por scraping.
    const categorias = t.categorias.length ? t.categorias : ["Otros trámites"]
    for (const c of categorias) {
      const clave = capitalizar(c.trim())
      const lista = porCategoria.get(clave) ?? []
      lista.push(t)
      porCategoria.set(clave, lista)
    }
  }

  // La contención se mide por slug, que es la identidad del trámite. Dos
  // trámites distintos pueden compartir título (el corpus tiene varios
  // "Exenciones Impositivas") y compararlos por texto los fusionaría.
  const subareas = detectarSubareas(
    new Map([...porCategoria.entries()].map(([c, ts]) => [c, new Set(ts.map((t) => t.slug))])),
  )

  const areas: CatalogoArea[] = [...porCategoria.entries()]
    .map(([categoria, tramites]) => ({
      categoria,
      cantidad: tramites.length,
      ...(subareas.has(categoria) ? { subareaDe: subareas.get(categoria)! } : {}),
      // Orden de los ejemplos:
      //   1. Los que el municipio marca como más consultados.
      //   2. Los que están en MENOS categorías. Un ejemplo sirve para que la
      //      persona reconozca el área, así que uno que pertenece a cuatro no
      //      identifica ninguna: "Exenciones Impositivas" está en Automotor,
      //      Inmobiliarios, Licencia de conducir y Exenciones, y sin este
      //      criterio encabezaba tres de las cuatro.
      //   3. Los que tienen más chunks (proxy de trámite sustancial vs. ficha
      //      de dos líneas).
      //   4. A igualdad, el orden del corpus.
      // Sin nada de esto el primer ejemplo de Automotor salía "Eximición de la
      // Tasa de Protección Ambiental aplicado a vehículos con 20 años o más".
      ejemplos: [...tramites]
        .sort(
          (a, b) =>
            Number(b.masConsultado) - Number(a.masConsultado) ||
            a.categorias.length - b.categorias.length ||
            b.chunks - a.chunks ||
            a.orden - b.orden,
        )
        .slice(0, EJEMPLOS_POR_AREA)
        .map((t) => t.titulo),
    }))
    .sort((a, b) => b.cantidad - a.cantidad || a.categoria.localeCompare(b.categoria, "es"))

  // OJO: el total NO es la suma de `cantidad`. 35 de los 133 trámites están en
  // más de una categoría (todas las licencias de conducir son también
  // "Automotor"), así que sumar da bastante de más. Por eso el total va
  // explícito en el contexto y la instrucción le prohíbe al modelo sumarlo.
  return { areas, totalTramites: porSlug.size }
}

export function construirContextoCatalogo(catalogo: Catalogo): string {
  const linea = (a: CatalogoArea) =>
    `- ${a.categoria} (${a.cantidad} ${a.cantidad === 1 ? "trámite" : "trámites"}` +
    `${a.subareaDe ? `, todos incluidos en ${a.subareaDe}` : ""}). ` +
    `Ejemplos: ${a.ejemplos.join("; ")}`

  // Las subáreas se emiten pegadas a su contenedor y con sangría, para que el
  // modelo vea la jerarquía en el propio orden del contexto y no tenga que
  // reconstruirla leyendo los "todos incluidos en".
  const principales = catalogo.areas.filter((a) => !a.subareaDe)
  const lineas: string[] = []
  for (const a of principales) {
    lineas.push(linea(a))
    for (const s of catalogo.areas.filter((x) => x.subareaDe === a.categoria)) {
      lineas.push(`  ${linea(s)}`)
    }
  }

  const subareas = catalogo.areas.length - principales.length

  return [
    "CATÁLOGO COMPLETO DE TRÁMITES CUBIERTOS",
    `Total de trámites distintos: ${catalogo.totalTramites}`,
    `Áreas principales: ${principales.length}` +
      (subareas > 0 ? ` (más ${subareas} subárea${subareas === 1 ? "" : "s"}, listadas con sangría)` : ""),
    "",
    ...lineas,
  ].join("\n")
}

// Instrucción que se le suma al SYSTEM_PROMPT solo en este camino. Va aparte y
// no dentro del prompt principal porque levanta dos reglas que en el camino
// normal son correctas: el tope de 3 ítems por lista (regla 7) y el límite de
// 120 palabras (regla 9). Una respuesta de catálogo que entra en 120 palabras no
// llega a nombrar las áreas, que es justo lo que la persona preguntó.
export const INSTRUCCION_CATALOGO = `ESTA CONSULTA ES UNA PREGUNTA DE CATÁLOGO: la persona quiere saber de qué temas
podés hablar, no está preguntando por un trámite puntual. El CONTEXTO no son
chunks de un trámite: es el listado completo de áreas cubiertas.

Para ESTA respuesta, y solo para esta:
- NO se aplica el límite de 120 palabras de la regla 9, ni el tope de 3 ítems por
  lista de la regla 7. Usá el espacio que haga falta.
- Nombrá TODAS las áreas que figuran en el CONTEXTO, sin saltearte ninguna.
  Podés juntar en un mismo renglón las áreas chicas que sean del mismo tema.
- Las áreas que en el CONTEXTO vienen con sangría y dicen "todos incluidos en X"
  son subáreas de X: sus trámites YA están contados dentro de X. Presentalas
  debajo de X y visiblemente adentro (con sangría, o nombrándolas en la misma
  línea de X como "incluye …"), nunca como un área más al mismo nivel. Si no,
  parece que se cuentan dos veces.
- Decí el total de trámites cubiertos usando el número que viene en el CONTEXTO
  como "Total de trámites distintos". NO sumes las cantidades de cada área: un
  mismo trámite puede estar en más de una, así que esa suma da de más.
- Por cada área dale 2 o 3 ejemplos concretos, tomados de los que ya vienen
  listados en el CONTEXTO. No inventes áreas, trámites ni cantidades.
- Arrancá con una línea corta que ubique a la persona, y cerrá invitando a que
  pregunte por alguno en concreto.
- Formato: un renglón por área, con el nombre del área en negrita y los ejemplos
  después. Nada de párrafos largos de texto corrido.`
