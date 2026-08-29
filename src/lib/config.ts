/**
 * Configuration client Supabase.
 * La clé "publishable" est conçue pour être embarquée côté navigateur (rôle anon,
 * lecture des seules vues publiques v_*, RLS verrouillée partout ailleurs).
 * Surchargée par variables d'environnement Vite si besoin (previews, autre projet).
 */
export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://cwdickfefpobnsceubew.supabase.co'

export const SUPABASE_PUBLISHABLE_KEY: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  'sb_publishable_PeVfbXvL4R3UfQpl_tzlLQ_l1Rw2JH4'

/** Cadence de revalidation du dashboard (brief : 60 secondes). */
export const REFRESH_INTERVAL_MS = 60_000
