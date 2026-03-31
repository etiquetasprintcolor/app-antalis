-- ============================================================
-- Printcolor App v2 — Supabase Schema
-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Catálogo de Papel
-- Stores all available paper products from Antalis catalog
CREATE TABLE IF NOT EXISTS catalogo_papel (
  id SERIAL PRIMARY KEY,
  material TEXT NOT NULL,
  gramaje INTEGER NOT NULL,
  formato_impresion TEXT NOT NULL,      -- SRA3, SRA3+, etc.
  formato_libro TEXT NOT NULL,          -- A4, A5, 15x23, etc.
  cantidad_pallet INTEGER,             -- Sheets per pallet
  url_pallet TEXT,                      -- Antalis URL for pallet purchase
  cantidad_paquete INTEGER,            -- Sheets per pack
  url_paquete TEXT,                     -- Antalis URL for pack purchase
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for common lookups by material + gramaje
CREATE INDEX idx_catalogo_material_gramaje ON catalogo_papel(material, gramaje);

-- 2. Historial de Pedidos
-- Tracks all purchase orders with prices for analytics
CREATE TABLE IF NOT EXISTS historial_pedidos (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMPTZ DEFAULT now(),
  referencia TEXT NOT NULL,             -- e.g. "Pedido #123" or "Stock"
  id_catalogo INTEGER NOT NULL REFERENCES catalogo_papel(id) ON DELETE CASCADE,
  tipo_compra TEXT NOT NULL CHECK (tipo_compra IN ('Pallet', 'Paquete')),
  cantidad_comprada INTEGER NOT NULL,
  precio_pagado NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for date-based queries (dashboard, history)
CREATE INDEX idx_historial_fecha ON historial_pedidos(fecha DESC);
-- Index for price comparison queries
CREATE INDEX idx_historial_catalogo ON historial_pedidos(id_catalogo, fecha DESC);

-- ============================================================
-- Row Level Security (RLS)
-- Uncomment and adapt if you add auth:
-- ============================================================
-- ALTER TABLE catalogo_papel ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE historial_pedidos ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Allow all for authenticated users" ON catalogo_papel
--   FOR ALL USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow all for authenticated users" ON historial_pedidos
--   FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- 3. Historial de Precios de Catálogo
-- ============================================================
-- Tracks the market price variations collected by the monthly cron
CREATE TABLE IF NOT EXISTS historial_precios_catalogo (
  id SERIAL PRIMARY KEY,
  id_papel INTEGER NOT NULL REFERENCES catalogo_papel(id) ON DELETE CASCADE,
  precio_paquete_registrado NUMERIC(10,6),
  precio_pallet_registrado NUMERIC(10,6),
  fecha_registro TIMESTAMPTZ DEFAULT now()
);

-- Index for plotting historical charts efficiently per paper
CREATE INDEX idx_historial_precios_papel ON historial_precios_catalogo(id_papel, fecha_registro DESC);
