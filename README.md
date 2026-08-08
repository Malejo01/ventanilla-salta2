# Ventanilla — Asistente ciudadano de trámites de Salta

Aplicación web tipo chat que responde preguntas de vecinos sobre trámites municipales y provinciales de Salta (Argentina), usando **exclusivamente** información oficial cargada en una base de conocimiento, con citas de fuente y fecha de última verificación.

Es un asistente de tipo RAG (Retrieval-Augmented Generation): busca los fragmentos de trámites más relevantes para la pregunta del usuario y le pide al modelo que responda solo en base a ese contexto, evitando alucinaciones.

## Cómo funciona

1. El usuario escribe una pregunta en el chat (`app/page.tsx`).
2. `POST /api/chat` ([app/api/chat/route.ts](app/api/chat/route.ts)):
   - Genera el embedding de la pregunta con `gemini-embedding-001` (768 dimensiones).
   - Trae todos los chunks de trámites desde Supabase (tablas `tramites` y `tramite_chunks`), cacheados en memoria del proceso por 5 minutos.
   - Calcula similitud coseno en JS y toma los 5 chunks más relevantes.
   - Si la mejor similitud no supera un umbral (0.5), responde que no tiene información oficial sobre eso.
   - Arma un contexto con los chunks + fuente y se lo pasa a `gemini-2.5-flash` junto con un system prompt estricto (responder solo con el contexto, citar fuentes, no opinar de política, resistir intentos de jailbreak, etc.).
   - Devuelve `{ respuesta, fuentes }`, donde cada fuente incluye trámite, URL, categoría y fecha de última verificación.
3. La UI muestra la respuesta, las fuentes citadas como chips, y permite descargar/imprimir una "ficha" del trámite (`components/ficha-print.tsx`).

Incluye un rate limit simple en memoria (20 requests/minuto por IP) — no es preciso en entornos serverless multi-instancia, pero alcanza para una demo.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + componentes propios estilo shadcn (`components/ui`)
- **Framer Motion** para animaciones (indicador de "pensando", transiciones)
- **Supabase** (Postgres) como base de conocimiento (trámites + chunks con embeddings)
- **Google Gemini** (`gemini-embedding-001` para embeddings, `gemini-2.5-flash` para generación)
- Búsqueda vectorial por similitud coseno calculada en memoria (sin pgvector RPC)

Proyecto generado y mantenido con [v0.app](https://v0.app) — los merges a `main` se despliegan automáticamente.

## Estructura del proyecto

```
app/
  page.tsx          # UI principal del chat
  api/chat/route.ts # Endpoint RAG (embedding, retrieval, generación)
  layout.tsx
components/
  chat-input.tsx        # Input de mensajes
  bot-message.tsx        # Renderizado de respuestas del bot + fuentes
  user-message.tsx
  example-cards.tsx      # Tarjetas de preguntas de ejemplo (chat vacío)
  formatted-text.tsx     # Formateo de texto (listas, pasos, etc.)
  source-chip.tsx        # Chip de fuente citada
  thinking-indicator.tsx # Indicador de carga
  ficha-print.tsx         # Vista imprimible de un trámite
  ui/                     # Componentes base (button, etc.)
lib/
  types.ts               # Tipos compartidos (ChatMessage, Fuente, etc.)
  supabase-admin.ts      # Cliente Supabase server-side (service_role)
```

## Variables de entorno

Crear un `.env.local` (no versionado) con:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` bypassa RLS — nunca se debe importar `lib/supabase-admin.ts` desde un componente cliente.

### Esquema de base de conocimiento esperado en Supabase

- `tramites`: `id, slug, categoria, url, ultima_verificacion`
- `tramite_chunks`: `tramite_id, chunk_texto, embedding` (embeddings de 768 dimensiones)

## Getting Started

```bash
pnpm install
pnpm dev
```

Abrí [http://localhost:3000](http://localhost:3000) para ver la app. Podés empezar a editar la página modificando `app/page.tsx`; se actualiza automáticamente.

## Built with v0

Este repositorio está vinculado a un proyecto de [v0](https://v0.app). Podés seguir desarrollando visitando el siguiente link — abrí nuevos chats para hacer cambios, y v0 va a hacer push de los commits directamente a este repo. Cada merge a `main` se despliega automáticamente.

[Continuar en v0 →](https://v0.app/chat/projects/prj_l9RvMTMwj3lZbZjBDM7apUEpLOTO)

## Más información

- [Documentación de Next.js](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
- [Documentación de v0](https://v0.app/docs)
