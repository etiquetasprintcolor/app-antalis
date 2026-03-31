'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase, CatalogoPapel } from '@/lib/supabase';
import {
    DollarSign,
    Loader2,
    CheckCircle2,
    Search,
    Package,
    Layers,
    ExternalLink,
} from 'lucide-react';

type EditField = 'precio_hoja' | 'precio_hoja_pallet';

export default function PreciosPage() {
    const [catalogo, setCatalogo] = useState<CatalogoPapel[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMaterial, setFilterMaterial] = useState('');
    const [editingKey, setEditingKey] = useState<string | null>(null); // "id-field"
    const [editValue, setEditValue] = useState('');
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [savedKey, setSavedKey] = useState<string | null>(null);

    // Load catalog
    useEffect(() => {
        const fetchCatalog = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('catalogo_papel')
                .select('*')
                .order('material')
                .order('gramaje');

            if (!error && data) {
                setCatalogo(data);
            }
            setLoading(false);
        };
        fetchCatalog();
    }, []);

    // Unique materials for filter
    const materiales = useMemo(() =>
        [...new Set(catalogo.map(p => p.material))].sort(),
        [catalogo]
    );

    // Filtered catalog
    const catalogoFiltrado = useMemo(() => {
        return catalogo.filter(p => {
            if (filterMaterial && p.material !== filterMaterial) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchMaterial = p.material.toLowerCase().includes(q);
                const matchGramaje = p.gramaje.toString().includes(q);
                const matchFormato = p.formato_libro.toLowerCase().includes(q);
                if (!matchMaterial && !matchGramaje && !matchFormato) return false;
            }
            return true;
        });
    }, [catalogo, searchQuery, filterMaterial]);

    const makeKey = (id: number, field: EditField) => `${id}-${field}`;

    // Start editing a specific field
    const startEdit = (paper: CatalogoPapel, field: EditField) => {
        const key = makeKey(paper.id, field);
        setEditingKey(key);
        const val = paper[field];
        setEditValue(val ? val.toString() : '');
    };

    // Save price for a specific field
    const savePrice = async (paper: CatalogoPapel, field: EditField) => {
        const key = makeKey(paper.id, field);
        const precio = editValue ? parseFloat(editValue) : null;
        setSavingKey(key);

        const { error } = await supabase
            .from('catalogo_papel')
            .update({ [field]: precio })
            .eq('id', paper.id);

        if (!error) {
            setCatalogo(prev => prev.map(p =>
                p.id === paper.id ? { ...p, [field]: precio } : p
            ));
            setSavedKey(key);
            setTimeout(() => setSavedKey(null), 2000);
        }

        setSavingKey(null);
        setEditingKey(null);
    };

    // Handle key press in edit field
    const handleKeyDown = (e: React.KeyboardEvent, paper: CatalogoPapel, field: EditField) => {
        if (e.key === 'Enter') savePrice(paper, field);
        if (e.key === 'Escape') setEditingKey(null);
    };

    // Calculate total prices
    const calcPrecioPaquete = (paper: CatalogoPapel) => {
        if (!paper.precio_hoja || !paper.cantidad_paquete) return null;
        return paper.precio_hoja * paper.cantidad_paquete;
    };

    const calcPrecioPallet = (paper: CatalogoPapel) => {
        if (!paper.precio_hoja_pallet || !paper.cantidad_pallet) return null;
        return paper.precio_hoja_pallet * paper.cantidad_pallet;
    };

    // Stats
    const conPrecio = catalogo.filter(p => p.precio_hoja || p.precio_hoja_pallet).length;
    const sinPrecio = catalogo.length - conPrecio;

    // Render an editable price cell
    const renderPriceCell = (paper: CatalogoPapel, field: EditField) => {
        const key = makeKey(paper.id, field);
        const isEditing = editingKey === key;
        const isSaving = savingKey === key;
        const isSaved = savedKey === key;
        const value = paper[field];

        if (isEditing) {
            return (
                <div className="inline-flex items-center gap-1">
                    <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, paper, field)}
                        onBlur={() => savePrice(paper, field)}
                        autoFocus
                        className="w-24 px-2 py-1 border border-[var(--accent)] rounded text-sm text-right bg-white text-[var(--foreground)] focus:ring-2 focus:ring-[var(--accent)]/20 outline-none"
                    />
                    {isSaving && <Loader2 size={14} className="animate-spin text-[var(--accent)]" />}
                </div>
            );
        }

        return (
            <button
                onClick={() => startEdit(paper, field)}
                className={`text-sm cursor-pointer bg-transparent border-0 px-2 py-1 rounded transition-colors
                    ${value
                        ? 'text-[var(--foreground)] font-medium hover:bg-blue-50'
                        : 'text-[var(--muted)] hover:bg-amber-50 italic'
                    }`}
            >
                {isSaved ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle2 size={14} /> ✓
                    </span>
                ) : value
                    ? `${value.toFixed(4)} €`
                    : 'Sin precio'
                }
            </button>
        );
    };

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <DollarSign size={28} className="text-green-500" />
                    <h1 className="text-2xl font-bold text-[var(--foreground)]">
                        Precios del Papel
                    </h1>
                </div>
                <p className="text-sm text-[var(--muted)]">
                    Configura el precio por hoja para paquetes y pallets. Los totales se calculan automáticamente.
                </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-[var(--muted)] font-medium mb-1">Total papeles</p>
                    <p className="text-xl font-bold text-[var(--foreground)]">{catalogo.length}</p>
                </div>
                <div className="bg-white border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-[var(--muted)] font-medium mb-1">Con precio</p>
                    <p className="text-xl font-bold text-green-600">{conPrecio}</p>
                </div>
                <div className="bg-white border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-[var(--muted)] font-medium mb-1">Sin precio</p>
                    <p className="text-xl font-bold text-amber-600">{sinPrecio}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por material, gramaje o formato…"
                        className="w-full pl-9 pr-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    />
                </div>
                <select
                    value={filterMaterial}
                    onChange={(e) => setFilterMaterial(e.target.value)}
                    className="px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                >
                    <option value="">Todos los materiales</option>
                    {materiales.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-[var(--muted)]">
                    <Loader2 size={20} className="animate-spin mr-2" />
                    <span className="text-sm">Cargando catálogo…</span>
                </div>
            ) : (
                <div className="bg-white border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[var(--border-color)]">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Material</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Gramaje</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Formato</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                                        <span className="inline-flex items-center gap-1"><Layers size={12} /> €/Hoja Paq.</span>
                                    </th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                                        <span className="inline-flex items-center gap-1"><Layers size={12} /> Total Paquete</span>
                                    </th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                                        <span className="inline-flex items-center gap-1"><Package size={12} /> €/Hoja Pallet</span>
                                    </th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                                        <span className="inline-flex items-center gap-1"><Package size={12} /> Total Pallet</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {catalogoFiltrado.map((paper, i) => {
                                    const pPaquete = calcPrecioPaquete(paper);
                                    const pPallet = calcPrecioPallet(paper);

                                    return (
                                        <tr
                                            key={paper.id}
                                            className={`border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--surface)] transition-colors duration-100 ${i % 2 !== 0 ? 'bg-[#fafaf9]' : ''}`}
                                        >
                                            <td className="px-4 py-3 text-sm font-medium text-[var(--foreground)]">
                                                {paper.material}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-[var(--foreground)]">
                                                {paper.gramaje} g/m²
                                            </td>
                                            <td className="px-4 py-3 text-sm text-[var(--muted)]">
                                                {paper.formato_impresion} → {paper.formato_libro}
                                            </td>

                                            {/* €/Hoja Paquete — editable */}
                                            <td className="px-4 py-3 text-right">
                                                {renderPriceCell(paper, 'precio_hoja')}
                                            </td>

                                            {/* Total Paquete — calculated */}
                                            <td className="px-4 py-3 text-sm text-right">
                                                {pPaquete !== null ? (
                                                    <span className="font-medium text-[var(--foreground)]">
                                                        {pPaquete.toFixed(2)} €
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--muted)] italic text-xs">—</span>
                                                )}
                                                {paper.cantidad_paquete && (
                                                    <a
                                                        href={paper.url_paquete || '#'}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline mt-1 transition-colors"
                                                        title="Ver en Antalis"
                                                    >
                                                        ({paper.cantidad_paquete.toLocaleString('es-ES')} hojas)
                                                        <ExternalLink size={10} />
                                                    </a>
                                                )}
                                            </td>

                                            {/* €/Hoja Pallet — editable */}
                                            <td className="px-4 py-3 text-right">
                                                {renderPriceCell(paper, 'precio_hoja_pallet')}
                                            </td>

                                            {/* Total Pallet — calculated */}
                                            <td className="px-4 py-3 text-sm text-right">
                                                {pPallet !== null ? (
                                                    <span className="font-medium text-[var(--foreground)]">
                                                        {pPallet.toFixed(2)} €
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--muted)] italic text-xs">—</span>
                                                )}
                                                {paper.cantidad_pallet && (
                                                    <a
                                                        href={paper.url_pallet || '#'}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline mt-1 transition-colors"
                                                        title="Ver en Antalis"
                                                    >
                                                        ({paper.cantidad_pallet.toLocaleString('es-ES')} hojas)
                                                        <ExternalLink size={10} />
                                                    </a>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="border-t border-[var(--border-color)] px-4 py-3 bg-[var(--surface)]">
                        <p className="text-xs text-[var(--muted)]">
                            {catalogoFiltrado.length} de {catalogo.length} papel{catalogo.length !== 1 ? 'es' : ''}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
