import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Legacy anonymous client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server client for use in Server Components, Layouts, and API Routes
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch (error) {
          // The `set` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch (error) {
          // The `remove` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}

export const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export const WHITELIST = [
  'leo.merino@printcolorweb.com',
  'compras@printcolorweb.com',
  'produccion@printcolorweb.com',
];

// Types
export interface CatalogoPapel {
  id: number;
  material: string;
  gramaje: number;
  formato_impresion: string;
  formato_libro: string;
  cantidad_pallet: number | null;
  url_pallet: string | null;
  cantidad_paquete: number | null;
  url_paquete: string | null;
  precio_hoja: number | null;
  precio_hoja_pallet: number | null;
  created_at?: string;
}

export interface HistorialPedido {
  id: number;
  fecha: string;
  referencia: string;
  id_catalogo: number;
  tipo_compra: 'Pallet' | 'Paquete';
  cantidad_comprada: number;
  precio_pagado: number;
  estado: 'Guardado' | 'Pendiente' | 'Entregado';
  created_at?: string;
  // Joined fields
  catalogo_papel?: CatalogoPapel;
}
