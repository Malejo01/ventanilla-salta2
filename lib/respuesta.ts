// ---------------------------------------------------------------------------
// CLASIFICACIÓN DE LA RESPUESTA GENERADA
//
// Decide si una respuesta merece que se muestren los chips de fuente. El
// retrieval siempre devuelve algo — hay 133 trámites y el coseno contra
// cualquier frase da un número —, así que las fuentes no las decide la búsqueda:
// las decide lo que el modelo terminó contestando.
//
// Hay dos formas de no contestar, y hasta acá solo se detectaba una:
//
//   · "no tengo información oficial" — la frase que pide la regla 1. Ya se
//     detectaba y ya vaciaba las fuentes.
//   · el rechazo de la regla 4 — la pregunta no es de trámites y Tuki contesta
//     sobre sí mismo ("no uso pañales, soy un asistente de trámites"). Esa
//     respuesta NO dice "no tengo información oficial", así que pasaba el filtro
//     y salía con los chips del retrieval pegados abajo.
//
// El caso real que motivó esto: "usás pañales?" recupera CUD, Promoción Social,
// Subsecretaría de la Mujer y Adicciones — el coseno asocia pañales con
// discapacidad —, contesta bien que es un asistente de trámites, y abajo lista
// cinco trámites de discapacidad. Frente a público se lee como si le estuviera
// ofreciendo esos trámites a alguien que hizo un chiste.
//
// Este módulo NO importa nada, para que qa/ lo cargue directo con el
// type-stripping de Node y se pueda probar contra respuestas reales guardadas,
// sin gastar generaciones. Mismo criterio que lib/catalogo.ts y lib/historial.ts.
// ---------------------------------------------------------------------------

// La frase de la regla 1, más la variante del corte por umbral ("no tengo
// información cargada"), que no pasa por el modelo.
export function esNoSe(texto: string): boolean {
  return (
    /no tengo informaci[oó]n oficial/i.test(texto) ||
    /no tengo informaci[oó]n cargada/i.test(texto)
  )
}

// Frases con las que Tuki se corre del tema. Son deliberadamente ESTRECHAS: todas
// hablan de lo que Tuki es o de lo que puede hacer, no de un trámite.
//
// La autodescripción ("soy un asistente virtual") entró después de medirla, no
// de suponerla. La duda era que el modelo abre respuestas legítimas
// presentándose ("¡Hola! Soy Tuki, el asistente virtual de la Municipalidad…") y
// marcarlas le sacaría los chips a una respuesta buena. Contra las 57 respuestas
// guardadas en qa/salida-memoria.json: 0 de 37 respuestas legítimas se
// autodescriben así, y 5 de 8 respuestas fuera de dominio sí. Igual no queda
// suelta — las dos compuertas de abajo (extensión y señales de datos) la
// sostienen.
//
// Lo que sigue AFUERA: "soy Tuki" a secas, que es un saludo y no un rechazo.
const FRASES_DE_RECHAZO = [
  // "solo puedo ayudarte con trámites de Salta"
  /s[oó]lo puedo (?:ayudarte|ayudarlo|ayudarla|ayudar|responder|contestar|hablar|darte|brindarte|informarte)/i,
  // "mi función es ayudarte con trámites municipales"
  /(?:mi|la) (?:funci[oó]n|tarea|rol|especialidad) (?:es|consiste en)\s+(?:ayudar|responder|brindar|dar|informar)/i,
  // "estoy acá para ayudarte con trámites"
  /estoy (?:ac[áa]|aqu[ií]) para (?:ayudarte|ayudarlo|ayudarla|responder|brindarte)/i,
  // "no puedo escribir poemas / opinar sobre política / hacer cálculos"
  /no puedo (?:escribir|redactar|componer|opinar|calcular|hacer c[áa]lculos|resolver|traducir|contar chistes)/i,
  // "soy un programa de computadora", "no tengo cuerpo", "no uso pañales"
  /soy un (?:programa|software|bot|modelo|sistema)\b/i,
  /soy (?:un|una) (?:asistente|ia|inteligencia artificial)\b/i,
  /\basistente virtual\b/i,
  /no tengo (?:cuerpo|un cuerpo|manos|forma f[ií]sica|existencia f[ií]sica)/i,
]

// Señales de que la respuesta SÍ está dando datos de un trámite. Si aparece
// alguna, no se oculta nada aunque haya frase de rechazo: una respuesta con una
// URL, un monto, un horario o un requisito está contestando, no esquivando.
//
// Los verbos del final son los que protegen el caso que preocupaba arriba: una
// respuesta que se presenta y CONTESTA ("Soy Tuki, el asistente virtual. Para la
// licencia necesitás DNI y libre deuda") tiene alguno, y un rechazo no.
const SENALES_DE_DATOS = [
  /https?:\/\//i,
  /\$\s?\d/,
  /\b\d+\s?UT\b/i,
  /\b\d{1,2}[:.]\d{2}\s?(?:a|hs|horas)\b/i,
  /\bAv\.|\bAvda\.|\bcalle\b/i,
  /\bnecesit[áa]s\b|\bten[ée]s que\b|\bpresent[áa]\b|\brequisitos?\b|\bdocumentaci[oó]n\b/i,
  /\bse tramita\b|\bse hace en\b|\bpod[ée]s (?:iniciar|solicitar|pedir|tramitar|hacerlo)\b/i,
]

// Cuántas palabras puede tener un rechazo. Los medidos van de 6 a 34; los
// trámites reales de la regresión arrancan en 22 y la mediana está cerca de 120.
// El tope en 60 deja lugar a un rechazo con vueltas sin llegar a tocar una
// respuesta que explique algo.
export const MAX_PALABRAS_RECHAZO = 60

export function esRechazoFueraDeDominio(texto: string): boolean {
  const limpio = texto.trim()
  if (!limpio) return false
  if (SENALES_DE_DATOS.some((re) => re.test(limpio))) return false
  if (limpio.split(/\s+/).length > MAX_PALABRAS_RECHAZO) return false
  return FRASES_DE_RECHAZO.some((re) => re.test(limpio))
}

// La única pregunta que le hace la ruta a este módulo.
//
// Ojo con el orden de las dos condiciones: son independientes. Una respuesta
// puede decir "no tengo información oficial" y nada más (caso noSabe), o no
// decirlo nunca y ser igual un rechazo (caso regla 4). El caso de "usás
// pañales?" es el segundo, y es el que se escapaba.
export function debeOcultarFuentes(texto: string): boolean {
  return esNoSe(texto) || esRechazoFueraDeDominio(texto)
}
