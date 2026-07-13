import { createBrowserClient } from '@supabase/ssr';

// Re-export types so client components can import from here
export type { CatalogoPapel, HistorialPedido, Incidencia } from './types';
export { WHITELIST, MOTIVOS_INCIDENCIA } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Singleton browser client for convenience (replaces legacy `supabase` export)
let _browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!_browserClient) {
    _browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return _browserClient;
}

// Legacy-compatible export for client components
export const supabase = typeof window !== 'undefined'
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null!; // Will never be used on the server side from client components
