'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { supabase, HistorialPedido } from '@/lib/supabase';
import {
    ClipboardList,
    Search,
    Filter,
    Calendar,
    Package,
    Layers,
    ArrowUpRight,
    Loader2,
    Inbox,
} from 'lucide-react';

export default function HistorialPage() {
    const [pedidos, setPedidos] = useState<HistorialPedido[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMes, setFilterMes] = useState('');
    const [filterAnio, setFilterAnio] = useState('');
    const [filterMaterial, setFilterMaterial] = useState('');

    // Load orders with joins
    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('historial_pedidos')
                .select('*, catalogo_papel(*)')
                .eq('estado', 'Entregado')
                .order('fecha', { ascending: false });

            if (!error && data) {
                setPedidos(data as HistorialPedido[]);
            }
            setLoading(false);
        };
        fetchOrders();
    }, []);

    // Unique materials for filter
    const materiales = useMemo(() => {
        const mats = pedidos
            .map(p => p.catalogo_papel?.material)
            .filter(Boolean) as string[];
        return [...new Set(mats)].sort();
    }, [pedidos]);

    // Unique years for filter
    const anios = useMemo(() => {
        const years = pedidos
            .map(p => new Date(p.fecha).getFullYear().toString())
            .filter(Boolean);
        return [...new Set(years)].sort().reverse();
    }, [pedidos]);

    // Filtered orders
    const pedidosFiltrados = useMemo(() => {
        return pedidos.filter(p => {
            // Search by referencia
            if (searchQuery && !p.referencia.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
            // Filter by month
            if (filterMes) {
                const mes = (new Date(p.fecha).getMonth() + 1).toString().padStart(2, '0');
                if (mes !== filterMes) return false;
            }
            // Filter by year
            if (filterAnio) {
                const anio = new Date(p.fecha).getFullYear().toString();
                if (anio !== filterAnio) return false;
            }
            // Filter by material
            if (filterMaterial && p.catalogo_papel?.material !== filterMaterial) {
                return false;
            }
            return true;
        });
    }, [pedidos, searchQuery, filterMes, filterAnio, filterMaterial]);

    // Calculate totals based on filtered orders
    const totales = useMemo(() => {
        let euros = 0;
        let hojas = 0;

        pedidosFiltrados.forEach(p => {
            euros += Number(p.precio_pagado) || 0;

            if (p.catalogo_papel) {
                const hojasPorUnidad = p.tipo_compra === 'Pallet'
                    ? (p.catalogo_papel.cantidad_pallet || 0)
                    : (p.catalogo_papel.cantidad_paquete || 0);
                hojas += p.cantidad_comprada * hojasPorUnidad;
            }
        });

        return { euros, hojas };
    }, [pedidosFiltrados]);

    const meses = [
        { value: '01', label: 'Enero' },
        { value: '02', label: 'Febrero' },
        { value: '03', label: 'Marzo' },
        { value: '04', label: 'Abril' },
        { value: '05', label: 'Mayo' },
        { value: '06', label: 'Junio' },
        { value: '07', label: 'Julio' },
        { value: '08', label: 'Agosto' },
        { value: '09', label: 'Septiembre' },
        { value: '10', label: 'Octubre' },
        { value: '11', label: 'Noviembre' },
        { value: '12', label: 'Diciembre' },
    ];

    // Animation variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            {/* Page Header */}
            <motion.div variants={itemVariants} className="mb-8">
                <h1 className="text-2xl font-semibold text-[var(--foreground)] flex items-center gap-3">
                    <ClipboardList size={28} className="text-[var(--accent)]" />
                    Historial de Pedidos
                </h1>
                <p className="text-sm text-[var(--muted)] mt-1">
                    Registro completo de compras de papel
                </p>
            </motion.div>

            {/* Filters Bar */}
            <motion.div variants={itemVariants} className="bg-white border border-[var(--border-color)] rounded-xl p-4 mb-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar por referencia…"
                            className="w-full pl-9 pr-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                        />
                    </div>

                    {/* Month Filter */}
                    <div className="flex items-center gap-1.5 focus-within:text-[var(--accent)] transition-colors">
                        <Calendar size={14} className="text-[var(--muted)] field-icon" />
                        <select
                            value={filterMes}
                            onChange={(e) => setFilterMes(e.target.value)}
                            className="px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                        >
                            <option value="">Mes</option>
                            {meses.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Year Filter */}
                    <select
                        value={filterAnio}
                        onChange={(e) => setFilterAnio(e.target.value)}
                        className="px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    >
                        <option value="">Año</option>
                        {anios.map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>

                    {/* Material Filter */}
                    <div className="flex items-center gap-1.5 focus-within:text-[var(--accent)] transition-colors">
                        <Filter size={14} className="text-[var(--muted)] field-icon" />
                        <select
                            value={filterMaterial}
                            onChange={(e) => setFilterMaterial(e.target.value)}
                            className="px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                        >
                            <option value="">Material</option>
                            {materiales.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </motion.div>

            {/* Totals Summary */}
            <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white border border-[var(--border-color)] rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Layers className="text-[var(--accent)]" size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-[var(--muted)] font-medium">Total Hojas Compradas</p>
                        <p className="text-2xl font-bold text-[var(--foreground)]">
                            {totales.hojas.toLocaleString('es-ES')}
                        </p>
                    </div>
                </div>
                <div className="bg-white border border-[var(--border-color)] rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-[var(--success)] font-bold text-xl">€</span>
                    </div>
                    <div>
                        <p className="text-sm text-[var(--muted)] font-medium">Inversión Total</p>
                        <p className="text-2xl font-bold text-[var(--foreground)]">
                            {totales.euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Table */}
            {loading ? (
                <motion.div variants={itemVariants} className="flex items-center justify-center py-16 text-[var(--muted)]">
                    <Loader2 size={20} className="animate-spin mr-2" />
                    <span className="text-sm">Cargando historial…</span>
                </motion.div>
            ) : pedidosFiltrados.length === 0 ? (
                <motion.div variants={itemVariants} className="text-center py-16">
                    <Inbox size={40} className="mx-auto text-[var(--muted)] mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">
                        Sin resultados
                    </h3>
                    <p className="text-sm text-[var(--muted)]">
                        {pedidos.length === 0
                            ? 'No hay pedidos registrados aún. Crea uno desde la Calculadora.'
                            : 'No se encontraron pedidos con los filtros seleccionados.'}
                    </p>
                </motion.div>
            ) : (
                <motion.div variants={itemVariants} className="bg-white border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[var(--border-color)]">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Fecha</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Referencia</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Material</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Gramaje</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Tipo</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Cantidad</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Precio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pedidosFiltrados.map((pedido, i) => (
                                    <tr
                                        key={pedido.id}
                                        className={`
                      border-b border-[var(--border-color)] last:border-b-0
                      hover:bg-[var(--surface)] transition-colors duration-100 group
                      ${i % 2 === 0 ? '' : 'bg-[#fafaf9]'}
                    `}
                                    >
                                        <td className="px-4 py-3 text-sm text-[var(--foreground)]">
                                            {new Date(pedido.fecha).toLocaleDateString('es-ES', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                                                {pedido.referencia}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[var(--foreground)]">
                                            {pedido.catalogo_papel?.material || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[var(--foreground)]">
                                            {pedido.catalogo_papel?.gramaje ? `${pedido.catalogo_papel.gramaje} g/m²` : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`
                        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors
                        ${pedido.tipo_compra === 'Pallet'
                                                    ? 'bg-blue-50 text-[var(--accent)] group-hover:bg-blue-100'
                                                    : 'bg-orange-50 text-[var(--warning)] group-hover:bg-orange-100'
                                                }
                      `}>
                                                {pedido.tipo_compra === 'Pallet' ? <Package size={11} /> : <Layers size={11} />}
                                                {pedido.tipo_compra}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-[var(--foreground)]">
                                            {pedido.cantidad_comprada}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold text-[var(--foreground)]">
                                            {Number(pedido.precio_pagado).toFixed(2)} €
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer with count */}
                    <div className="border-t border-[var(--border-color)] px-4 py-3 bg-[var(--surface)]">
                        <p className="text-xs text-[var(--muted)]">
                            {pedidosFiltrados.length} de {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
