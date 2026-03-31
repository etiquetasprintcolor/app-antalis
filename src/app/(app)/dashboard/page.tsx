'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase, HistorialPedido, CatalogoPapel } from '@/lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, ShoppingCart, Layers, DollarSign, Package, Loader2, Inbox } from 'lucide-react';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// --------------- helpers ---------------
function fmt(n: number, dec = 2) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function monthLabel(month: number) {
    return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][month];
}

// --------------- KPI card ---------------
function KpiCard({ label, value, sub, icon: Icon, color }: {
    label: string; value: string; sub: string;
    icon: React.ElementType; color: string;
}) {
    return (
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-3 hover:shadow-lg transition-shadow duration-300 relative overflow-hidden`}>
            <div className={`absolute top-0 right-0 w-28 h-28 rounded-full -mr-8 -mt-8 opacity-10 ${color}`} />
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} bg-opacity-15`}>
                <Icon size={20} className="text-inherit" />
            </div>
            <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
                <p className="text-sm text-gray-400 mt-1">{sub}</p>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [pedidos, setPedidos] = useState<HistorialPedido[]>([]);
    const [catalogo, setCatalogo] = useState<CatalogoPapel[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPaperId, setSelectedPaperId] = useState<number | ''>('');

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [{ data: pd }, { data: cat }] = await Promise.all([
                supabase.from('historial_pedidos').select('*, catalogo_papel(*)').order('fecha', { ascending: true }),
                supabase.from('catalogo_papel').select('*').order('material'),
            ]);
            if (pd) setPedidos(pd as HistorialPedido[]);
            if (cat) setCatalogo(cat);
            setLoading(false);
        })();
    }, []);

    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;

    const thisMonth = useMemo(() => pedidos.filter(p => {
        const d = new Date(p.fecha);
        return d.getMonth() === curMonth && d.getFullYear() === curYear;
    }), [pedidos, curMonth, curYear]);

    const lastMonth = useMemo(() => pedidos.filter(p => {
        const d = new Date(p.fecha);
        return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    }), [pedidos, prevMonth, prevYear]);

    const totalGastoMes = useMemo(() => thisMonth.reduce((s, p) => s + Number(p.precio_pagado), 0), [thisMonth]);
    const totalGastoPrev = useMemo(() => lastMonth.reduce((s, p) => s + Number(p.precio_pagado), 0), [lastMonth]);

    const totalHojasMes = useMemo(() => thisMonth.reduce((s, p) => {
        const k = p.tipo_compra === 'Pallet' ? p.catalogo_papel?.cantidad_pallet ?? 0 : p.catalogo_papel?.cantidad_paquete ?? 0;
        return s + p.cantidad_comprada * k;
    }, 0), [thisMonth]);

    const diffPct = totalGastoPrev > 0 ? ((totalGastoMes - totalGastoPrev) / totalGastoPrev) * 100 : null;

    // Monthly spend trend (last 6 months)
    const trendData = useMemo(() => {
        return Array.from({ length: 6 }, (_, i) => {
            const d = new Date(curYear, curMonth - (5 - i), 1);
            const m = d.getMonth();
            const y = d.getFullYear();
            const gasto = pedidos
                .filter(p => { const dd = new Date(p.fecha); return dd.getMonth() === m && dd.getFullYear() === y; })
                .reduce((s, p) => s + Number(p.precio_pagado), 0);
            return { name: monthLabel(m), gasto };
        });
    }, [pedidos, curMonth, curYear]);

    // Material breakdown (pie chart) — all time
    const materialPie = useMemo(() => {
        const counts: Record<string, number> = {};
        pedidos.forEach(p => {
            const key = p.catalogo_papel?.material ?? 'Otro';
            counts[key] = (counts[key] ?? 0) + Number(p.precio_pagado);
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
    }, [pedidos]);

    // Price evolution for selected paper
    const priceEvo = useMemo(() => {
        if (!selectedPaperId) return [];
        return pedidos
            .filter(p => p.id_catalogo === Number(selectedPaperId))
            .map(p => ({
                fecha: new Date(p.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                precio: Number(p.precio_pagado),
            }));
    }, [pedidos, selectedPaperId]);

    // Top materials this month
    const topMaterials = useMemo(() => {
        const m: Record<string, number> = {};
        thisMonth.forEach(p => {
            const k = `${p.catalogo_papel?.material ?? '?'} ${p.catalogo_papel?.gramaje ?? ''}g`;
            m[k] = (m[k] ?? 0) + p.cantidad_comprada;
        });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
    }, [thisMonth]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px] text-gray-400">
                <Loader2 size={28} className="animate-spin mr-3" />
                <span className="text-lg">Cargando dashboard…</span>
            </div>
        );
    }

    const tooltipStyle = {
        background: 'white', border: '1px solid #e7e5e4',
        borderRadius: 12, fontSize: 13,
        boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
    };

    return (
        <div className="space-y-8">

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-400 mt-1">
                    {monthLabel(curMonth)} {curYear} · {pedidos.length} registros totales
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <KpiCard
                    label="Gasto este mes"
                    value={`${fmt(totalGastoMes)} €`}
                    sub={`${thisMonth.length} pedido${thisMonth.length !== 1 ? 's' : ''}`}
                    icon={DollarSign}
                    color="bg-blue-500"
                />
                <KpiCard
                    label="vs. Mes anterior"
                    value={diffPct !== null ? `${diffPct > 0 ? '+' : ''}${fmt(diffPct, 1)}%` : '—'}
                    sub={totalGastoPrev > 0 ? `Anterior: ${fmt(totalGastoPrev)} €` : 'Sin datos previos'}
                    icon={diffPct !== null && diffPct > 0 ? TrendingUp : TrendingDown}
                    color={diffPct !== null && diffPct > 0 ? 'bg-red-500' : 'bg-emerald-500'}
                />
                <KpiCard
                    label="Hojas este mes"
                    value={totalHojasMes.toLocaleString('es-ES')}
                    sub="unidades compradas"
                    icon={Layers}
                    color="bg-violet-500"
                />
                <KpiCard
                    label="Pedidos totales"
                    value={pedidos.length.toString()}
                    sub="en toda la base de datos"
                    icon={ShoppingCart}
                    color="bg-amber-500"
                />
            </div>

            {/* Trend + Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 6-month spend trend */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5">
                        Gasto últimos 6 meses
                    </h2>
                    {trendData.some(d => d.gasto > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={trendData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gastoGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${fmt(Number(v))} €`, 'Gasto']} />
                                <Area type="monotone" dataKey="gasto" stroke="#2563eb" strokeWidth={3} fill="url(#gastoGrad)" activeDot={{ r: 6, fill: '#2563eb', stroke: 'white', strokeWidth: 2 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[220px] text-gray-300">
                            <Inbox size={36} className="mb-2" /><span>Sin datos</span>
                        </div>
                    )}
                </div>

                {/* Material breakdown pie */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5">
                        Gasto por Material
                    </h2>
                    {materialPie.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={materialPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                    {materialPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${fmt(Number(v))} €`, '']} />
                                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: '#6b7280' }}>{v}</span>} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[220px] text-gray-300">
                            <Inbox size={36} className="mb-2" /><span>Sin datos</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Top materials + Price Evo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Top 5 materials bar chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5">
                        Top Materiales este mes <span className="text-gray-300">(por unidades)</span>
                    </h2>
                    {topMaterials.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={topMaterials} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.8} />
                                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.8} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={130} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v), 'Unidades']} />
                                <Bar dataKey="value" fill="url(#barGrad)" radius={[0, 6, 6, 0]} name="Unidades" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[220px] text-gray-300">
                            <Package size={36} className="mb-2" /><span>Sin pedidos este mes</span>
                        </div>
                    )}
                </div>

                {/* Price evolution */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
                        Evolución de Precio
                    </h2>
                    <select
                        value={selectedPaperId}
                        onChange={e => setSelectedPaperId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                        <option value="">Selecciona un papel…</option>
                        {catalogo.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.material} — {p.gramaje}g/m² ({p.formato_libro})
                            </option>
                        ))}
                    </select>
                    {selectedPaperId && priceEvo.length > 0 ? (
                        <ResponsiveContainer width="100%" height={170}>
                            <AreaChart data={priceEvo} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${fmt(Number(v))} €`, 'Precio']} />
                                <Area type="monotone" dataKey="precio" stroke="#10b981" strokeWidth={3} fill="url(#priceGrad)" activeDot={{ r: 6, fill: '#10b981', stroke: 'white', strokeWidth: 2 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : selectedPaperId ? (
                        <div className="flex flex-col items-center justify-center h-[170px] text-gray-300">
                            <Inbox size={28} className="mb-2" /><span className="text-sm">Sin historial para este papel</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[170px] text-gray-300">
                            <span className="text-sm">Selecciona un papel</span>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
