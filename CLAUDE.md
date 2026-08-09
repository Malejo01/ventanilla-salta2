# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

```bash
pnpm dev      # start dev server (http://localhost:3000)
pnpm build    # production build
pnpm start    # run production build
pnpm lint     # eslint .
```

There is no test suite configured in this repo (no test runner in `package.json`).

Required env vars (`.env.local`, not committed): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. Without `GEMINI_API_KEY` the chat API returns a 500.

## Architecture

This is a single-purpose RAG (retrieval-augmented generation) chat app: **Tuki**, an assistant that answers questions about municipal/provincial *trámites* (bureaucratic procedures) in Salta, Argentina, using only an official knowledge base stored in Supabase — never the model's general knowledge.

Everything of substance happens in two places:

- **`app/page.tsx`** — client-side chat UI (message list, input, printable "ficha" view). All state is local `useState`; no global store, no streaming — a single POST per turn.
- **`app/api/chat/route.ts`** — the entire RAG pipeline, in one file:
  1. Embed the user's question via Gemini (`gemini-embedding-001`, 768 dims).
  2. Load the whole knowledge base from Supabase (`tramites` + `tramite_chunks` tables) into an in-memory module-level cache (`kbCache`, 5 min TTL).
  3. Compute cosine similarity in plain JS against every chunk (no pgvector RPC — deliberate, see comment in the file: ~150 chunks is small enough that this is simpler and avoids a DB-side function). Take top 5.
  4. If best similarity < `MIN_SIMILARITY` (0.5), short-circuit with "no tengo información oficial" and no sources.
  5. Build a context string with `[Fuente: slug | url]` headers per chunk and call `gemini-2.5-flash` with a strict Spanish system prompt (`SYSTEM_PROMPT`) that forbids answering outside the provided context, mandates citing sources, and instructs the model to resist prompt injection / role-change attempts from the user.
  6. Enrich returned sources with `ultima_verificacion` (last-verified date) from `tramites`, and suppress sources entirely if the model's answer indicates it didn't know.

  Also implements a simple in-memory per-IP rate limiter (20 req/min) — explicitly noted in the code as inaccurate across multiple serverless instances, acceptable for demo scope only.

- **`lib/supabase-admin.ts`** — server-only Supabase client using the `service_role` key (bypasses RLS). Must never be imported from a client component.
- **`lib/types.ts`** — shared `ChatMessage`/`Fuente` types and the `CATEGORIA_LABEL` map used to render trámite categories (comercial/social/transito/infraestructura).

### Expected Supabase schema

- `tramites`: `id, slug, categoria, url, ultima_verificacion`
- `tramite_chunks`: `tramite_id, chunk_texto, embedding` (768-dim vectors, stored as array or JSON string — `parseEmbedding` in `route.ts` handles both)

### UI components (`components/`)

Presentational components consumed by `app/page.tsx`: `chat-input`, `user-message`, `bot-message` (renders answer + `source-chip` list), `example-cards` (empty-state prompts), `thinking-indicator`, `formatted-text` (turns numbered steps/lists in the model's answer into structured markup), and `ficha-print` (hidden-until-print view used for downloading/printing a trámite as a standalone sheet, triggered via `window.print()`).

`components/ui/` holds shadcn-style base components (style: `base-nova`, baseColor `neutral`, see `components.json`). Path alias `@/*` maps to repo root (`tsconfig.json`).

## Notes

- This repo is linked to a [v0.app](https://v0.app) project; merges to `main` auto-deploy, and v0 chats can push commits directly here.
- The system prompt in `app/api/chat/route.ts` is a security-relevant piece of the app (jailbreak resistance, no-opinions-on-politics, contradictory-source handling) — treat changes to it carefully and preserve its constraints rather than simplifying them away.
