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

### Feature flags

All read per-request (not at module import), so flipping one needs no code change — but on Vercel it does need a **Redeploy**, because changing an env var does not affect the deployment already running.

| Flag | Default if unset | What it does |
|---|---|---|
| `USAR_CORPUS_V2` | old path | `"true"` switches retrieval to the v2 corpus (`tramite_chunks_v2` + `match_tramite_chunks_v2` RPC) and enables the catálogo path. Anything else is the full rollback to the in-memory cosine path. |
| `REFORMULAR_CONSULTA` | `heuristica` | How the **search query** is built when a question depends on the conversation history. `heuristica` \| `modelo` \| `off`. |

`REFORMULAR_CONSULTA` is the outcome of `EVALUACION-MEMORIA.md`, which measured the three paths over 6 multi-turn conversations (8 follow-up turns). Keep the default at `heuristica` unless there is new evidence:

| | `off` (history only) | **`heuristica`** | `modelo` |
|---|---|---|---|
| Follow-up turns that fail | 2 of 8 | **1 of 8** | 0 of 8 |
| Added latency | 0 ms | **0 ms** | +557 ms, on dependent turns only |
| Input tokens, follow-up turns | +30 % | **+44 %** | +70 % |

`off` is not a viable default: it stops the model from greeting again and fixes the out-of-domain drag, but leaves whole conversations failing because the retrieval never gets the right chunks (the model understands the question and has nothing to answer it with). `modelo` buys the last failing turn for a third more latency on every follow-up; it is there for when the mobile client reports that repreguntas still miss. Baseline for all of the above: on `main` before this feature, **5 of those 8 turns greeted again and 4 failed outright**.

## Architecture

This is a single-purpose RAG (retrieval-augmented generation) chat app: **Tuki**, an assistant that answers questions about municipal/provincial *trámites* (bureaucratic procedures) in Salta, Argentina, using only an official knowledge base stored in Supabase — never the model's general knowledge.

Everything of substance happens in two places:

- **`app/page.tsx`** — client-side chat UI (message list, input, printable "ficha" view). All state is local `useState`; no global store, no streaming — a single POST per turn.
- **`app/api/chat/route.ts`** — the entire RAG pipeline, in one file:
  1. Embed the user's question via Gemini (`gemini-embedding-001`, 768 dims).
  2. Load the whole knowledge base from Supabase (`tramites` + `tramite_chunks` tables) into an in-memory module-level cache (`kbCache`, 5 min TTL).
  3. Compute cosine similarity in plain JS against every chunk (no pgvector RPC — deliberate, see comment in the file: ~150 chunks is small enough that this is simpler and avoids a DB-side function). Take top 5.
  4. If best similarity < `MIN_SIMILARITY` (0.5), short-circuit with "no tengo información oficial" and no sources.
  5. Build a context string with `[Fuente: slug | url]` headers per chunk and call `gemini-2.5-flash` with a strict Spanish system prompt (`SYSTEM_PROMPT`) that forbids answering outside the provided context, forbids inline source citations in the answer body (attribution is rendered by the clients from the structured `fuentes` field; URLs that are functionally part of the trámite — online forms, downloads — still belong in the body), and instructs the model to resist prompt injection / role-change attempts from the user.
  6. Enrich returned sources with `ultima_verificacion` (last-verified date) from `tramites`, and suppress sources entirely if the model's answer indicates it didn't know.

  Also implements a simple in-memory per-IP rate limiter (20 req/min) — explicitly noted in the code as inaccurate across multiple serverless instances, acceptable for demo scope only.

- **`lib/supabase-admin.ts`** — server-only Supabase client using the `service_role` key (bypasses RLS). Must never be imported from a client component.
- **`lib/types.ts`** — shared `ChatMessage`/`Fuente` types and the `CATEGORIA_LABEL` map used to render trámite categories (comercial/social/transito/infraestructura).
- **`lib/historial.ts`** — conversational memory: window trimming (6 turns / 3000 chars, oldest dropped first), anaphora classification, and search-query reformulation. The body accepts an optional `historial: Array<{rol, texto}>`; without it the request takes exactly the same path as before the feature (proven byte-for-byte in `qa/test-retro-memoria.mjs`), which is why the three clients can migrate one at a time. The key invariant: **the full history goes to the generation `contents`, never to the retrieval embedding** — only a reformulated standalone query is embedded, because embedding the whole thread contaminates the vector with old turns. Memory-specific rules live in `INSTRUCCION_MEMORIA`, appended to the `systemInstruction` only when there is history (same mechanism as `INSTRUCCION_CATALOGO`), so `SYSTEM_PROMPT` is identical for a request without history. See `EVALUACION-MEMORIA.md` and the flag table above.

### Expected Supabase schema

- `tramites`: `id, slug, categoria, url, ultima_verificacion`
- `tramite_chunks`: `tramite_id, chunk_texto, embedding` (768-dim vectors, stored as array or JSON string — `parseEmbedding` in `route.ts` handles both)

### UI components (`components/`)

Presentational components consumed by `app/page.tsx`: `chat-input`, `user-message`, `bot-message` (renders answer + `source-chip` list), `example-cards` (empty-state prompts), `thinking-indicator`, `formatted-text` (turns numbered steps/lists in the model's answer into structured markup), and `ficha-print` (hidden-until-print view used for downloading/printing a trámite as a standalone sheet, triggered via `window.print()`).

`components/ui/` holds shadcn-style base components (style: `base-nova`, baseColor `neutral`, see `components.json`). Path alias `@/*` maps to repo root (`tsconfig.json`).

## Notes

- This repo is linked to a [v0.app](https://v0.app) project; merges to `main` auto-deploy, and v0 chats can push commits directly here.
- The system prompt in `app/api/chat/route.ts` is a security-relevant piece of the app (jailbreak resistance, no-opinions-on-politics, contradictory-source handling) — treat changes to it carefully and preserve its constraints rather than simplifying them away.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
