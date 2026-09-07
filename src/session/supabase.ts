// The Supabase client handle. This is the ONLY file in this codebase that
// calls `createClient` — `auth.ts` and `caseSync.ts` (Task 7) are the only
// two files allowed to import `getClient()` from here; nothing under
// `screens/`, `templates/` or `ui/` ever sees a raw Supabase client.
//
// The client is built LAZILY, on first call to `getClient()`, never at
// module scope: a module-scope `createClient()` call would run in every
// test that transitively imports anything under `session/` — which is
// most of the suite — for a client no such test needs or wants
// constructed.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Returns the singleton Supabase client, creating it on first call.
 *  `detectSessionInUrl` and PKCE stay at their supabase-js v2 defaults
 *  (both on) — that default is exactly what Google sign-in needs: Supabase
 *  redirects back with `?code=...` and the client exchanges it for a
 *  session on init. No option here turns either off, and there is no
 *  manual code exchange — stripping `?code=` from the URL afterwards is
 *  Task 8's job, not this file's. */
export function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    )
  }
  return client
}
