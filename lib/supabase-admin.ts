import { createClient } from "@supabase/supabase-js"

// Server-side Supabase client using the service_role key.
// NEVER import this file from a client component — it bypasses RLS.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error("Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL")
}
if (!serviceRoleKey) {
  throw new Error("Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY")
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

export type MatchedChunk = {
  chunk_texto: string
  url: string
  categoria: string
  slug: string
  similarity: number
}
