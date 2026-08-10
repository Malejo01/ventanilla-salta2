# Dictado por voz — diagnóstico abierto

**Estado: activado.** El flag `VOZ_HABILITADA` en `components/tuki/consulta-bar.tsx` está
en `true`. Se apagó y se volvió a encender el 2026-08-10: el dictado sí funciona en las
máquinas y navegadores del equipo, que son los que se usan en la presentación.

**El bug de abajo no está resuelto.** Se reproduce en al menos un equipo. Lo que cambió es
la decisión de producto, no el diagnóstico: todo lo que sigue mantiene su valor.

Fecha del diagnóstico: 2026-08-10.

## Qué tiene que hacer la función

Al tocar el micrófono, el navegador pide permiso, el usuario habla, lo dicho se transcribe
y **al terminar de hablar la consulta se envía sola** a Tuki, sin un click extra en "Enviar".

## Síntoma con micrófono real

En Chrome con micrófono de verdad:

1. El ícono **deja de animarse** mientras el usuario todavía está hablando.
2. Al terminar, la consulta transcripta **no se envía**.

## Causas confirmadas y ya corregidas

Estas dos están arregladas en el código (commit `ef8486b`), pero **no alcanzaron**: el bug
con micrófono real persiste.

### 1. `onerror` trataba como fatal un evento rutinario de Chrome

Chrome emite `'aborted'` al cerrar el reconocimiento —incluso después de haber entregado
la transcripción correctamente— y `'no-speech'` ante cualquier pausa. El handler original
hacía `setListening(false)` (mataba la animación) y vaciaba el buffer de texto pendiente.
Después llegaba `onend`, encontraba el buffer vacío y no enviaba nada.

Ahora `'aborted'` se ignora, `'no-speech'` solo avisa si no llegó texto, y de apagar
`listening` se encarga `onend`, que siempre llega después.

### 2. `onresult` leía siempre `results[0]`

`e.results` **acumula todos los tramos de la sesión**; el tramo nuevo empieza en
`e.resultIndex`. Si Chrome partía la frase en dos, se re-procesaba el primer tramo en vez
del nuevo. Ahora se recorre desde `resultIndex`. Este bug ya existía antes del auto-envío.

## Lo que queda sin explicar

Con las dos causas corregidas, **el micrófono real sigue sin enviar**. Falta al menos una
causa más, no identificada.

## Lección de método — importante

Los tests con doble (mock) de la Web Speech API **dieron 13/13 en verde mientras la
función estaba rota**. El doble solo emitía `onresult → onend`, que es el camino ideal:
nunca emitía los errores rutinarios ni acumulaba resultados. Estaba midiendo la
suposición del test, no el comportamiento del navegador.

**Ningún resultado verde de esa suite es evidencia de que el dictado funcione.** La única
prueba válida es hablarle a un micrófono real en Chrome. Claude no puede hacerlo: no tiene
micrófono ni forma de generar audio. Esa verificación siempre la tiene que hacer una
persona.

## Cómo retomar el diagnóstico

1. Poner `VOZ_HABILITADA = true` en `components/tuki/consulta-bar.tsx`.
2. **Instrumentar todos los handlers**, no solo los tres que usa el código. Loguear con
   timestamp: `onstart`, `onaudiostart`, `onsoundstart`, `onspeechstart`, `onresult`
   (con `resultIndex`, `results.length`, `isFinal` y el texto), `onspeechend`,
   `onsoundend`, `onaudioend`, `onerror` (con `e.error`) y `onend`. También el valor de
   `disabledRef.current` y `dictadoPendienteRef.current` dentro de `onend`.
3. Correr `pnpm dev`, abrir en Chrome real, hablar una consulta y leer la consola en orden
   cronológico.

Lo primero a determinar con ese log: **¿`onresult` se dispara alguna vez?** Si no se
dispara, el problema es la captura de audio y no la lógica de envío — sería otro bug
distinto al que se corrigió.

### Hipótesis todavía sin probar

- `onend` llega antes que `onresult`, y el buffer está vacío cuando se decide enviar.
- `onresult` nunca se dispara (permiso concedido pero sin captura, o servicio de speech de
  Google inalcanzable).
- Con `interimResults = false` y audio de bajo volumen, Chrome cierra sin resultado.
- El guard `disabledRef.current` en `onend` está en `true` en ese instante por alguna razón
  no contemplada. (Poco probable: `enviar` en `app/page.tsx` libera `loading` en un
  `finally`, así que un `loading` colgado ya está descartado.)
- StrictMode en desarrollo monta el efecto dos veces; el `recognitionRef` podría quedar
  apuntando a una instancia distinta de la que emite los eventos.

## Restricciones del entorno

- **Solo Chrome y Edge.** Firefox no implementa la Web Speech API: ahí `micSupported` es
  `false` y el botón no aparece aunque se active el flag.
- **Requiere HTTPS** (o `localhost`). En `http://` plano el navegador no concede el micrófono.
- El permiso lo pide el navegador solo al llamar a `start()`; no hay nada que programar para
  eso. Si se rechaza, llega por `onerror` con `'not-allowed'`.

## Archivos

- `components/tuki/consulta-bar.tsx` — flag `VOZ_HABILITADA`, handlers y auto-envío.
- `components/chat-input.tsx` — **código muerto**, copia vieja que nadie importa. No tiene
  ninguno de estos arreglos. Editarlo no cambia nada en pantalla; ya causó confusión antes.
