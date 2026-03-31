'use client';

import { useState, useEffect } from 'react';
import { supabase, HistorialPedido } from '@/lib/supabase';
import {
    Clock,
    CheckCircle2,
    Package,
    Layers,
    Loader2,
    ArrowUpRight,
    ShoppingCart,
    Inbox,
    Trash2,
} from 'lucide-react';

export default function PendientesPage() {
    const [pedidos, setPedidos] = useState<HistorialPedido[]>([]);
    const [loading, setLoading] = useState(true);

    // Load Guardado + Pendiente orders
    const fetchPending = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('historial_pedidos')
            .select('*, catalogo_papel(*)')
            .in('estado', ['Guardado', 'Pendiente'])
            .order('fecha', { ascending: false });

        if (!error && data) {
            setPedidos(data as HistorialPedido[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchPending();
    }, []);

    // Separate into two lists
    const guardados = pedidos.filter(p => p.estado === 'Guardado');
    const pendientes = pedidos.filter(p => p.estado === 'Pendiente');

    // Change estado of a single order
    const updateEstado = async (pedido: HistorialPedido, nuevoEstado: 'Pendiente' | 'Entregado') => {
        // Optimistic update
        if (nuevoEstado === 'Entregado') {
            setPedidos(prev => prev.filter(p => p.id !== pedido.id));
        } else {
            setPedidos(prev => prev.map(p =>
                p.id === pedido.id ? { ...p, estado: nuevoEstado } : p
            ));
        }

        const { error } = await supabase
            .from('historial_pedidos')
            .update({ estado: nuevoEstado })
            .eq('id', pedido.id);

        if (error) {
            // Revert on error
            setPedidos(prev => {
                const exists = prev.find(p => p.id === pedido.id);
                if (!exists) return [...prev, pedido].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
                return prev.map(p => p.id === pedido.id ? { ...p, estado: pedido.estado } : p);
            });
        } else if (nuevoEstado === 'Pendiente') {
            // Trigger email notification for this single order
            const itemParaEmail = {
                referencia: pedido.referencia,
                material: pedido.catalogo_papel?.material || 'Desconocido',
                gramaje: pedido.catalogo_papel?.gramaje || '-',
                formato: pedido.catalogo_papel?.formato_libro || '-',
                cantidad: `${pedido.cantidad_comprada} ${pedido.tipo_compra}(s)`,
                tipoCompra: pedido.tipo_compra,
                precioTotal: pedido.precio_pagado
            };

            fetch('/api/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pedidos: [itemParaEmail] })
            }).catch(err => console.error("Error sending email:", err));
        }
    };

    // Pedir all Guardados at once
    const pedirTodos = async () => {
        if (guardados.length === 0) return;

        // Optimistic
        setPedidos(prev => prev.map(p =>
            p.estado === 'Guardado' ? { ...p, estado: 'Pendiente' as const } : p
        ));

        const ids = guardados.map(g => g.id);
        const { error } = await supabase
            .from('historial_pedidos')
            .update({ estado: 'Pendiente' })
            .in('id', ids);

        if (error) {
            fetchPending(); // Re-fetch on error
        } else {
            // Map all guardados to the email format
            const pedidosParaEmail = guardados.map(pedido => ({
                referencia: pedido.referencia,
                material: pedido.catalogo_papel?.material || 'Desconocido',
                gramaje: pedido.catalogo_papel?.gramaje || '-',
                formato: pedido.catalogo_papel?.formato_libro || '-',
                cantidad: `${pedido.cantidad_comprada} ${pedido.tipo_compra}(s)`,
                tipoCompra: pedido.tipo_compra,
                precioTotal: pedido.precio_pagado
            }));

            // Trigger single email for all
            fetch('/api/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pedidos: pedidosParaEmail })
            }).catch(err => console.error("Error sending email:", err));
        }
    };

    // Delete order permanently
    const deletePedido = async (id: number) => {
        // Optimistic delete
        setPedidos(prev => prev.filter(p => p.id !== id));

        const { error } = await supabase
            .from('historial_pedidos')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Error deleting order:", error);
            fetchPending(); // Re-fetch on error to revert optimistic UI
        }
    };

    // Render an order card
    const renderCard = (pedido: HistorialPedido, actions: React.ReactNode) => (
        <div
            key={pedido.id}
            className="bg-white border border-[var(--border-color)] rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200"
        >
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--foreground)]">
                            {pedido.referencia}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                            ${pedido.tipo_compra === 'Pallet'
                                ? 'bg-blue-50 text-[var(--accent)]'
                                : 'bg-orange-50 text-[var(--warning)]'
                            }`}
                        >
                            {pedido.tipo_compra === 'Pallet' ? <Package size={11} /> : <Layers size={11} />}
                            {pedido.tipo_compra}
                        </span>
                        {pedido.referencia === 'Stock' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600">
                                📦 Stock
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                        <span>
                            {new Date(pedido.fecha).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                            })}
                        </span>
                        {pedido.catalogo_papel && (
                            <>
                                <span className="font-medium text-[var(--foreground)]">
                                    {pedido.catalogo_papel.material} — {pedido.catalogo_papel.gramaje} g/m²
                                </span>
                                <span>
                                    {pedido.catalogo_papel.formato_impresion} → {pedido.catalogo_papel.formato_libro}
                                </span>
                            </>
                        )}
                        <span>
                            {pedido.cantidad_comprada} {pedido.tipo_compra === 'Pallet' ? 'pallets' : 'paquetes'}
                        </span>
                        <span className="font-semibold text-[var(--foreground)]">
                            {Number(pedido.precio_pagado).toFixed(2)} €
                        </span>
                    </div>

                    {pedido.catalogo_papel && (
                        <div className="flex gap-3 mt-2">
                            {pedido.tipo_compra === 'Pallet' && pedido.catalogo_papel.url_pallet && (
                                <a href={pedido.catalogo_papel.url_pallet} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                                >
                                    Ver en Antalis <ArrowUpRight size={11} />
                                </a>
                            )}
                            {pedido.tipo_compra === 'Paquete' && pedido.catalogo_papel.url_paquete && (
                                <a href={pedido.catalogo_papel.url_paquete} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                                >
                                    Ver en Antalis <ArrowUpRight size={11} />
                                </a>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-shrink-0 flex items-center gap-2">
                    {actions}
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Clock size={28} className="text-amber-500" />
                    <h1 className="text-2xl font-bold text-[var(--foreground)]">
                        Pedidos Pendientes
                    </h1>
                </div>
                <p className="text-sm text-[var(--muted)]">
                    Gestiona tus pedidos guardados y pendientes de entrega
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-[var(--muted)]">
                    <Loader2 size={20} className="animate-spin mr-2" />
                    <span className="text-sm">Cargando pedidos…</span>
                </div>
            ) : pedidos.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 size={32} className="text-green-500" />
                    </div>
                    <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">
                        ¡Todo al día!
                    </h3>
                    <p className="text-sm text-[var(--muted)]">
                        No hay pedidos guardados ni pendientes de entrega.
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Section 1: Guardados (saved for later) */}
                    {guardados.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Clock size={18} className="text-amber-500" />
                                    <h2 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wider">
                                        Guardados para más tarde
                                    </h2>
                                    <span className="bg-amber-50 text-amber-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                                        {guardados.length}
                                    </span>
                                </div>
                                <button
                                    onClick={pedirTodos}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-blue-600 transition-colors cursor-pointer border-0 shadow-sm"
                                >
                                    <ShoppingCart size={14} />
                                    Pedir todos
                                </button>
                            </div>
                            <div className="space-y-3">
                                {guardados.map(pedido => renderCard(pedido,
                                    <>
                                        <button
                                            onClick={() => deletePedido(pedido.id)}
                                            className="inline-flex items-center justify-center p-2.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer border border-transparent hover:border-red-100 shadow-sm hover:shadow-md bg-white flex-shrink-0"
                                            title="Eliminar pedido"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateEstado(pedido, 'Pendiente')}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg
                                                bg-[var(--accent)] text-white text-sm font-medium
                                                hover:bg-blue-600 transition-all cursor-pointer border-0 shadow-sm hover:shadow-md"
                                        >
                                            <ShoppingCart size={16} />
                                            Pedir
                                        </button>
                                    </>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Section 2: Pendientes (ordered, waiting for delivery) */}
                    {pendientes.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <Package size={18} className="text-blue-500" />
                                <h2 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wider">
                                    Pedidos en camino
                                </h2>
                                <span className="bg-blue-50 text-[var(--accent)] text-xs font-semibold px-2 py-0.5 rounded-full">
                                    {pendientes.length}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {pendientes.map(pedido => renderCard(pedido,
                                    <>
                                        <button
                                            onClick={() => deletePedido(pedido.id)}
                                            className="inline-flex items-center justify-center p-2.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer border border-transparent hover:border-red-100 shadow-sm hover:shadow-md bg-white flex-shrink-0"
                                            title="Eliminar pedido"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => updateEstado(pedido, 'Entregado')}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg
                                                bg-green-500 text-white text-sm font-medium
                                                hover:bg-green-600 transition-all cursor-pointer border-0 shadow-sm hover:shadow-md"
                                        >
                                            <CheckCircle2 size={16} />
                                            Entregado
                                        </button>
                                    </>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
