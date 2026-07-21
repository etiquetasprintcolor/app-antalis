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

export interface Incidencia {
  id: number;
  fecha: string;
  id_catalogo: number;
  numero_pedido?: string;
  motivo: string;
  cantidad_libros: number;
  paginas_por_libro: number;
  formato_libro: string;
  hojas_gastadas: number;
  coste_estimado: number;
  observaciones: string | null;
  created_at?: string;
  catalogo_papel?: CatalogoPapel;
}

export const MOTIVOS_INCIDENCIA = [
  'Manchas en la impresión',
  'Libros mal cortados',
  'Interior mal cortado',
  'Mala selección del papel',
  'Libros manchados post impresión',
  'Desajuste de color',
  'Laminado erróneo',
  'Otros',
] as const;
