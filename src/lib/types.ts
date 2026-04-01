// Shared types used across client and server components

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

export const WHITELIST = [
  'leo.merino@printcolorweb.com',
  'compras@printcolorweb.com',
  'produccion@printcolorweb.com',
];
