# Rediseño Tuki — cómo aplicarlo en `ventanilla-salta2`

## Aplicar el parche

```bash
git checkout -b rediseno-tuki
git apply /ruta/a/tuki-rediseno.patch
pnpm install   # o npm install
pnpm dev
```

Si `git apply` falla porque alguien tocó los mismos archivos, usá `git apply --3way tuki-rediseno.patch`.

## Qué cambia

| Archivo | Cambio |
|---|---|
| `app/globals.css` | Reemplaza la paleta verde/papel por los tokens Tuki (navy + naranja), en `:root` (oscuro, por defecto) y `.light`. Mapea los tokens a las variables de shadcn (`--primary`, `--card`, etc.) y expone utilidades propias (`bg-tuki-panel`, `text-tuki-dim`, …) vía `@theme inline` de Tailwind v4. Suma `.tuki-canvas` (gradientes radiales) y las animaciones `tukiFloat` / `tukiGlow` / `tukiDot` con corte por `prefers-reduced-motion`. |
| `app/layout.tsx` | Inter + Instrument Serif → **Manrope** (400–800) con `next/font/google`. Metadata y `themeColor` actualizados a Tuki. `defaultTheme="dark"`. |
| `app/page.tsx` | Nueva home: header, hero, barra de consulta, conversación inline, consultas frecuentes, panel lateral y banda de seguridad. **La lógica de chat es la misma de antes** (`fetch('/api/chat')`, manejo de 429/error/red, ficha imprimible). |
| `components/tuki/*` | 6 componentes nuevos: `tuki-header`, `tuki-hero`, `consulta-bar`, `consultas-frecuentes`, `panel-beneficios`, `banda-seguridad`. |
| `components/user-message.tsx` | Burbuja del usuario con el gradiente naranja y tinta `#26140A`. |
| `public/tuki/` | `mascot.png` y `clipboard.png`. |

Los componentes viejos `header.tsx`, `chat-input.tsx`, `example-cards.tsx` y `theme-toggle.tsx` **quedan en el repo pero ya no se usan** en la home. No los borré por si los usan en otra vista; si no, se pueden eliminar en un commit aparte.

## Decisiones que conviene revisar en equipo

**El escudo lo hice en SVG inline, no PNG.** El `shield.png` del bundle vino sin canal alfa (fondo opaco con un borde de recorte), así que se veía como un cuadradito pegado sobre el panel. El SVG escala nítido en cualquier densidad y toma el gradiente del tema. Si Ani exporta el escudo original con transparencia, se cambia por un `<Image>` en `banda-seguridad.tsx`.

**La mascota pesa 1 MB.** Está como PNG a 839×1040. Antes de la demo conviene exportarla en WebP/AVIF; `next/image` ya la sirve optimizada, pero el peso de origen impacta el primer build y el LCP en 3G.

**Contraste (esto es lo que más pesa en la evaluación del proyecto):**
- Los botones naranjas usan tinta `#26140A`, **no blanco**. Blanco sobre `#F5811F` da ~2.6:1 y no pasa AA.
- El naranja de *texto* cambia según el modo: `#FF9038` en oscuro, `#A94A05` en claro. `#F5811F` como texto en modo claro da ~2.9:1 y no pasa.
- Foco visible unificado con `outline: 3px solid var(--tuki-focus)` en `:focus-visible`, más `focus-within` en la barra de consulta.

**Modo claro.** El diseño de referencia solo mostraba el oscuro. Definí la paleta clara completa siguiendo los tokens del handoff, pero **hay que mirarla con ojos propios**: las 4 tarjetas de consultas frecuentes mantienen los mismos gradientes oscuros en ambos modos (así estaba especificado) y en fondo claro pueden verse pesadas. Es la decisión de diseño que yo dejaría abierta para Ani.

## Verificación hecha

- `npx tsc --noEmit` → sin errores.
- `next build` → compila (`✓ Compiled successfully`). Los dos fallos que vas a ver si lo corrés en un entorno sin red o sin `.env` son ambientales, no del código: Google Fonts necesita salida a internet para Manrope, y `/api/chat` necesita `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY`.

## Pendiente antes de la demo

1. Correr Lighthouse en la home (accesibilidad y performance).
2. Probar navegación completa por teclado: Tab debe recorrer header → barra → micrófono → enviar → las 4 tarjetas → "Más información", con foco visible en cada paso.
3. Probar el dictado por voz en Chrome Android (la Web Speech API no existe en Firefox ni en iOS Safari; el botón se oculta solo si no hay soporte).
4. Revisar en 360px de ancho que el hero apile bien la mascota sobre el texto.
