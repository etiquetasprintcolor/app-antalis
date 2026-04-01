'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { supabase, CatalogoPapel } from '@/lib/supabase-client';
import {
    Calculator,
    Package,
    Layers,
    ArrowUpRight,
    TrendingUp,
    TrendingDown,
    Save,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Clock,
    ShoppingCart,
    X,
} from 'lucide-react';

// Imposition multipliers: how many of each book format fit on one SRA3 sheet
// And how many SRA3 fit in the purchased machine sheet size (45x64 vs 64x90)
const IMPOSICION: Record<string, { multiplicador: number; sra3PorHoja: number; label: string }> = {
    'A4': { multiplicador: 2, sra3PorHoja: 2, label: '2 por SRA3 (Papel 45x64)' },
    'A5': { multiplicador: 4, sra3PorHoja: 4, label: '4 por SRA3 (Papel 64x90)' },
    '15x23': { multiplicador: 4, sra3PorHoja: 4, label: '4 por SRA3 (Papel 64x90)' },
};

export default function CalculadoraPage() {
    // Form state
    const [cantLibros, setCantLibros] = useState<number | ''>('');
    const [formatoLibro, setFormatoLibro] = useState('A4');
    const [paginasPorLibro, setPaginasPorLibro] = useState<number | ''>('');
    const [materialFilter, setMaterialFilter] = useState('');
    const [gramajeFilter, setGramajeFilter] = useState<number | ''>('');

    // Data
    const [catalogo, setCatalogo] = useState<CatalogoPapel[]>([]);
    const [loading, setLoading] = useState(true);

    // Purchase registration
    const [selectedPaper, setSelectedPaper] = useState<CatalogoPapel | null>(null);
    const [referencia, setReferencia] = useState('');
    const [precioNuevo, setPrecioNuevo] = useState<number | ''>('');
    const [precioPallet, setPrecioPallet] = useState<number | ''>('');
    const [precioPaquete, setPrecioPaquete] = useState<number | ''>('');
    const [cantPallets, setCantPallets] = useState<number | ''>('');
    const [cantPaquetesCompra, setCantPaquetesCompra] = useState<number | ''>('');
    const [ultimoPrecio, setUltimoPrecio] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [tipoCompra, setTipoCompra] = useState<'Pallet' | 'Paquete' | 'Pallet + Paquetes'>('Pallet');
    const [isStock, setIsStock] = useState(false);

    // Extra Stock State
    const [isExtraStockModalOpen, setIsExtraStockModalOpen] = useState(false);
    const [extraStockActivo, setExtraStockActivo] = useState(false);
    const [extraStockCant, setExtraStockCant] = useState<number | ''>('');
    const [extraStockTipo, setExtraStockTipo] = useState<'Paquete' | 'Pallet'>('Paquete');
    const [extraStockPrecio, setExtraStockPrecio] = useState<number | ''>('');

    // Auto-calculate extra stock price
    useEffect(() => {
        if (extraStockCant && selectedPaper) {
            if (extraStockTipo === 'Paquete' && selectedPaper.precio_hoja && selectedPaper.cantidad_paquete) {
                setExtraStockPrecio(parseFloat((Number(extraStockCant) * selectedPaper.precio_hoja * selectedPaper.cantidad_paquete).toFixed(2)));
            } else if (extraStockTipo === 'Pallet' && selectedPaper.precio_hoja_pallet && selectedPaper.cantidad_pallet) {
                setExtraStockPrecio(parseFloat((Number(extraStockCant) * selectedPaper.precio_hoja_pallet * selectedPaper.cantidad_pallet).toFixed(2)));
            } else {
                setExtraStockPrecio('');
            }
        } else {
            setExtraStockPrecio('');
        }
    }, [extraStockCant, extraStockTipo, selectedPaper]);

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

    // Get unique materials & gramajes for filters — scoped by selected format
    const materiales = useMemo(() => {
        const filtered = catalogo.filter(p => p.formato_libro === formatoLibro);
        return [...new Set(filtered.map(p => p.material))].sort();
    }, [catalogo, formatoLibro]);

    // Reset material if not available for the selected format
    useEffect(() => {
        if (materialFilter && !materiales.includes(materialFilter)) {
            setMaterialFilter('');
        }
    }, [materiales, materialFilter]);

    const gramajes = useMemo(() => {
        const filtered = catalogo.filter(p => {
            if (materialFilter && p.material !== materialFilter) return false;
            if (p.formato_libro !== formatoLibro) return false;
            return true;
        });
        return [...new Set(filtered.map(p => p.gramaje))].sort((a, b) => a - b);
    }, [catalogo, materialFilter, formatoLibro]);

    // Auto-select gramaje when only one option exists (e.g., Ahuesado=80gr, Offset=90gr)
    // Also reset if current selection isn't valid for the new material/format
    useEffect(() => {
        if (gramajes.length === 1) {
            setGramajeFilter(gramajes[0]);
        } else if (gramajeFilter && !gramajes.includes(gramajeFilter as number)) {
            setGramajeFilter('');
        }
    }, [gramajes, gramajeFilter]);

    // Filter matching papers — by material, gramaje, AND formato_libro
    // formato_libro MUST match the selected formatoLibro to ensure correct paper format
    // e.g., A5 books need 65x90 paper (formato_libro='A5'), NOT 45x64 (formato_libro='A4')
    const papelesFiltrados = useMemo(() => {
        return catalogo.filter(p => {
            if (materialFilter && p.material !== materialFilter) return false;
            if (gramajeFilter && p.gramaje !== gramajeFilter) return false;
            // CRITICAL: match paper format to book format
            if (p.formato_libro !== formatoLibro) return false;
            return true;
        });
    }, [catalogo, materialFilter, gramajeFilter, formatoLibro]);


    // Calculation result
    // Formula: (ejemplares/2) × (páginas/imposición) / sra3PorHoja
    // This gives the number of PRINTING SHEETS (hojas grandes: 45x64, 65x90, etc.)
    const resultado = useMemo(() => {
        if (!cantLibros || !paginasPorLibro) return null;

        const imposicion = IMPOSICION[formatoLibro];
        if (!imposicion) return null;

        const ejemplares = Number(cantLibros);
        const paginas = Number(paginasPorLibro);

        // (ejemplares/2) × (páginas/imposición) = SRA3 sheets needed
        // Then ÷ sra3PorHoja = actual physical printing sheets needed
        // (For A5, 64x90 fits 4 SRA3. For A4, 45x64 fits 2 SRA3).
        const totalHojas = (ejemplares / 2) * (paginas / imposicion.multiplicador) / imposicion.sra3PorHoja;

        return {
            totalHojas,
            paginasInput: paginas,
            ejemplares,
            multiplicador: imposicion.multiplicador,
            label: imposicion.label,
        };
    }, [cantLibros, paginasPorLibro, formatoLibro]);

    // Calculate the single best purchase option from all matching papers
    // totalHojas is now in PRINTING SHEET units (same as paquete/pallet quantities)

    const bestOption = useMemo(() => {
        if (!resultado || papelesFiltrados.length === 0) return null;
        const hojasNecesarias = resultado.totalHojas;

        let best: {
            paper: typeof papelesFiltrados[0];
            recPallets: number;
            recPaquetes: number;
            recTipo: 'mix' | 'paquetes' | 'pallets';
            totalHojas: number;
            sobrante: number;
        } | null = null;

        for (const paper of papelesFiltrados) {
            const qPallet = paper.cantidad_pallet || 0;
            const qPaquete = paper.cantidad_paquete || 0;

            let recPallets = 0;
            let recPaquetes = 0;
            let recTipo: 'mix' | 'paquetes' | 'pallets' = 'paquetes';

            if (qPallet > 0) {
                recPallets = Math.floor(hojasNecesarias / qPallet);
                const restante = hojasNecesarias - (recPallets * qPallet);
                if (restante > 0 && qPaquete > 0) {
                    recPaquetes = Math.ceil(restante / qPaquete);
                    recTipo = recPallets > 0 ? 'mix' : 'paquetes';
                } else if (restante === 0) {
                    recTipo = 'pallets';
                } else {
                    recPallets = Math.ceil(hojasNecesarias / qPallet);
                    recTipo = 'pallets';
                }
            } else if (qPaquete > 0) {
                recPaquetes = Math.ceil(hojasNecesarias / qPaquete);
                recTipo = 'paquetes';
            }

            const totalHojas = (recPallets * qPallet) + (recPaquetes * qPaquete);
            const sobrante = Math.floor(totalHojas - hojasNecesarias);

            if (!best || sobrante < best.sobrante) {
                best = { paper, recPallets, recPaquetes, recTipo, totalHojas, sobrante };
            }
        }

        return best;
    }, [resultado, papelesFiltrados]);

    // Auto-select the best paper for the order form
    useEffect(() => {
        if (bestOption && (!selectedPaper || selectedPaper.id !== bestOption.paper.id)) {
            setSelectedPaper(bestOption.paper);
        }
    }, [bestOption, selectedPaper]);

    // Auto-select tipoCompra based on suggestion
    useEffect(() => {
        if (!bestOption) return;
        if (bestOption.recTipo === 'paquetes') {
            setTipoCompra('Paquete');
        } else if (bestOption.recTipo === 'pallets') {
            setTipoCompra('Pallet');
        } else if (bestOption.recTipo === 'mix') {
            setTipoCompra('Pallet + Paquetes');
        }
    }, [bestOption]);

    // Auto-fill prices from catalog when paper is selected
    useEffect(() => {
        if (!selectedPaper || !bestOption) return;
        const phPaq = selectedPaper.precio_hoja;
        const phPal = selectedPaper.precio_hoja_pallet;

        if (tipoCompra === 'Pallet + Paquetes') {
            // Pallet: fixed price per pallet
            if (phPal && selectedPaper.cantidad_pallet) {
                setPrecioPallet(parseFloat((phPal * selectedPaper.cantidad_pallet).toFixed(2)));
            }
            // Paquete: price per paquete (quantity is separate field)
            if (phPaq && selectedPaper.cantidad_paquete) {
                setPrecioPaquete(parseFloat((phPaq * selectedPaper.cantidad_paquete).toFixed(2)));
            }
            if (bestOption.recPallets) setCantPallets(bestOption.recPallets);
            if (bestOption.recPaquetes) setCantPaquetesCompra(bestOption.recPaquetes);
        } else if (tipoCompra === 'Pallet') {
            // Pallet: fixed pallet price
            if (phPal && selectedPaper.cantidad_pallet) {
                setPrecioNuevo(parseFloat((phPal * selectedPaper.cantidad_pallet).toFixed(2)));
            }
        } else {
            // Paquetes: precio_hoja × hojas/paquete × nº paquetes = coste total
            if (phPaq && selectedPaper.cantidad_paquete) {
                const numPaquetes = Math.ceil(resultado!.totalHojas / (selectedPaper.cantidad_paquete || 1));
                setPrecioNuevo(parseFloat((phPaq * selectedPaper.cantidad_paquete * numPaquetes).toFixed(2)));
            }
        }
    }, [selectedPaper, tipoCompra, bestOption, resultado]);

    // Fetch last price when paper is selected
    useEffect(() => {
        if (!selectedPaper) {
            setUltimoPrecio(null);
            return;
        }

        const fetchLastPrice = async () => {
            const { data } = await supabase
                .from('historial_pedidos')
                .select('precio_pagado')
                .eq('id_catalogo', selectedPaper.id)
                .order('fecha', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                setUltimoPrecio(Number(data[0].precio_pagado));
            } else {
                setUltimoPrecio(null);
            }
        };
        fetchLastPrice();
    }, [selectedPaper]);

    // Price delta (uses pallet price for Pallet + Paquetes, or single price for others)
    const priceDelta = useMemo(() => {
        const price = tipoCompra === 'Pallet + Paquetes' ? precioPallet : precioNuevo;
        if (ultimoPrecio === null || price === '' || price === 0) return null;
        const diff = ((Number(price) - ultimoPrecio) / ultimoPrecio) * 100;
        return diff;
    }, [precioNuevo, precioPallet, ultimoPrecio, tipoCompra]);

    // Save to historial
    const handleSave = async () => {
        if (!selectedPaper || !resultado) return;

        setSaving(true);
        setSaveMessage('');
        let hasError = false;

        const estado = 'Guardado';

        try {
            if (tipoCompra === 'Pallet + Paquetes') {
                if (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetesCompra === '') return setSaving(false);

                // Insert Pallet record
                const { error: errPallet } = await supabase.from('historial_pedidos').insert({
                    referencia,
                    id_catalogo: selectedPaper.id,
                    tipo_compra: 'Pallet',
                    cantidad_comprada: Number(cantPallets),
                    precio_pagado: Number(precioPallet),
                    estado,
                });

                // Insert Paquete record with same referencia
                const { error: errPaquete } = await supabase.from('historial_pedidos').insert({
                    referencia,
                    id_catalogo: selectedPaper.id,
                    tipo_compra: 'Paquete',
                    cantidad_comprada: Number(cantPaquetesCompra),
                    precio_pagado: Number(precioPaquete),
                    estado,
                });

                hasError = !!(errPallet || errPaquete);

            } else {
                // Single purchase (Pallet or Paquete)
                if (precioNuevo === '') return setSaving(false);

                const cantidadComprada =
                    tipoCompra === 'Pallet'
                        ? Math.ceil(resultado.totalHojas / (selectedPaper.cantidad_pallet || 1))
                        : Math.ceil(resultado.totalHojas / (selectedPaper.cantidad_paquete || 1));

                const { error } = await supabase.from('historial_pedidos').insert({
                    referencia,
                    id_catalogo: selectedPaper.id,
                    tipo_compra: tipoCompra,
                    cantidad_comprada: cantidadComprada,
                    precio_pagado: Number(precioNuevo),
                    estado,
                });

                hasError = !!error;
            }

            // Insert extra stock if active
            if (!hasError && extraStockActivo && extraStockCant !== '' && extraStockPrecio !== '') {
                // Generate sequential stock reference (e.g. Stock 001)
                let stockRef = 'Stock 001';
                const { data: stockData } = await supabase
                    .from('historial_pedidos')
                    .select('referencia')
                    .ilike('referencia', 'Stock %')
                    .order('id', { ascending: false })
                    .limit(1);

                if (stockData && stockData.length > 0) {
                    const lastRef = stockData[0].referencia;
                    const match = lastRef.match(/\d+$/);
                    if (match) {
                        const nextNum = parseInt(match[0], 10) + 1;
                        stockRef = `Stock ${nextNum.toString().padStart(3, '0')}`;
                    }
                }

                const { error: errExtra } = await supabase.from('historial_pedidos').insert({
                    referencia: stockRef,
                    id_catalogo: selectedPaper.id,
                    tipo_compra: extraStockTipo,
                    cantidad_comprada: Number(extraStockCant),
                    precio_pagado: Number(extraStockPrecio),
                    estado,
                });
                if (errExtra) hasError = true;
            }

            if (hasError) {
                setSaveMessage('Error al guardar el pedido.');
            } else {
                setSaveSuccess(true);
                setSaveMessage('Pedido guardado correctamente');
                setTimeout(() => {
                    setSaveSuccess(false);
                    setSaveMessage('');
                    setReferencia('');
                }, 3000);
            }

            setPrecioPallet('');
            setPrecioPaquete('');
            setCantPallets('');
            setCantPaquetesCompra('');
            setExtraStockActivo(false);
            setExtraStockCant('');
            setExtraStockPrecio('');

        } catch (err) {
            console.error(err);
            setSaveMessage('Error inesperado.');
        } finally {
            setSaving(false);
        }
    };

    // Animation variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 15 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
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
                    <Calculator size={28} className="text-[var(--accent)]" />
                    Calculadora de Producción
                </h1>
                <p className="text-sm text-[var(--muted)] mt-1">
                    Calcula la cantidad de papel necesaria e introduce tu pedido
                </p>
            </motion.div>

            {/* Calculator Form */}
            <motion.div variants={itemVariants} className="bg-white border border-[var(--border-color)] rounded-xl p-6 mb-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-5">
                    Datos del trabajo
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* Cantidad de libros */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                            Cantidad de Libros
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={cantLibros}
                            onChange={(e) => setCantLibros(e.target.value ? parseInt(e.target.value) : '')}
                            placeholder="Ej. 500"
                            className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                        />
                    </div>

                    {/* Formato del libro */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                            Formato del Libro
                        </label>
                        <select
                            value={formatoLibro}
                            onChange={(e) => setFormatoLibro(e.target.value)}
                            className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                        >
                            {Object.keys(IMPOSICION).map(fmt => (
                                <option key={fmt} value={fmt}>{fmt}</option>
                            ))}
                        </select>
                    </div>

                    {/* Páginas por libro */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                            Nº de Páginas
                        </label>
                        <input
                            type="number"
                            min="1"
                            step="2"
                            value={paginasPorLibro}
                            onChange={(e) => setPaginasPorLibro(e.target.value ? parseInt(e.target.value) : '')}
                            placeholder="Ej. 100"
                            className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                        />
                    </div>

                    {/* Material */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                            Material
                        </label>
                        <select
                            value={materialFilter}
                            onChange={(e) => { setMaterialFilter(e.target.value); setGramajeFilter(''); setSelectedPaper(null); }}
                            className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                        >
                            <option value="">Todos los materiales</option>
                            {materiales.map((m: string) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Gramaje filter */}
                <div className="mt-4 max-w-xs">
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                        Gramaje
                    </label>
                    <select
                        value={gramajeFilter}
                        onChange={(e) => { setGramajeFilter(e.target.value ? parseInt(e.target.value) : ''); setSelectedPaper(null); }}
                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    >
                        <option value="">Todos los gramajes</option>
                        {gramajes.map((g: number) => (
                            <option key={g} value={g}>{g} g/m²</option>
                        ))}
                    </select>
                </div>
            </motion.div>

            {/* Result Card */}
            <AnimatePresence mode="wait">
                {resultado && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="bg-gradient-to-br from-[var(--accent)] to-blue-700 text-white rounded-xl p-6 mb-6 shadow-lg shadow-blue-500/20 relative overflow-hidden"
                    >
                        {/* Decorative background grain/pattern (optional, just using simple opacity circles for now) */}
                        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-5 rounded-full blur-2xl"></div>
                        <div className="absolute bottom-0 left-20 -mb-10 w-32 h-32 bg-white opacity-5 rounded-full blur-xl"></div>

                        <div className="relative z-10 flex items-center gap-3 mb-2">
                            <Layers size={24} className="opacity-90" />
                            <h2 className="text-lg font-semibold">Resultado del Cálculo</h2>
                        </div>
                        <div className="relative z-10 flex items-baseline gap-2 mt-3">
                            <motion.span
                                key={resultado.totalHojas}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-5xl font-bold tracking-tight"
                            >
                                {Math.ceil(resultado.totalHojas).toLocaleString('es-ES')}
                            </motion.span>
                            <span className="text-lg opacity-90 font-medium">hojas formato impresión</span>
                        </div>
                        <p className="relative z-10 text-sm opacity-80 mt-3 font-medium bg-black/10 inline-block px-3 py-1.5 rounded-md">
                            ({resultado.ejemplares}/2) × ({resultado.paginasInput}/{resultado.multiplicador}) ÷ 4 = {Math.ceil(resultado.totalHojas)} hojas (imposición {resultado.label})
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Purchase Suggestions */}
            <AnimatePresence mode="popLayout">
                {resultado && papelesFiltrados.length > 0 && (
                    <motion.div
                        initial="hidden"
                        animate="show"
                        exit={{ opacity: 0, y: -10 }}
                        variants={containerVariants}
                        className="mb-6"
                    >
                        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
                            Sugerencia de Compra
                        </h2>

                        {loading ? (
                            <div className="flex items-center gap-2 text-[var(--muted)] py-8">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm">Cargando catálogo…</span>
                            </div>
                        ) : papelesFiltrados.length === 0 ? (
                            <div className="flex items-center gap-2 text-[var(--muted)] py-8">
                                <AlertCircle size={18} />
                                <span className="text-sm">No se encontraron papeles con ese material y gramaje.</span>
                            </div>
                        ) : bestOption ? (() => {
                            const { paper, recPallets, recPaquetes, recTipo, totalHojas: totalHojasRec, sobrante } = bestOption;
                            const qPallet = paper.cantidad_pallet || 0;
                            const qPaquete = paper.cantidad_paquete || 0;
                            return (
                                <div
                                    key={paper.id}
                                    className="border-2 border-[var(--accent)] rounded-xl p-5 bg-blue-50/10 shadow-sm"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-sm font-semibold text-[var(--foreground)]">
                                                {paper.material} — {paper.gramaje} g/m²
                                            </h3>
                                            <p className="text-xs text-[var(--muted)] mt-0.5">
                                                {paper.formato_impresion} → {paper.formato_libro}
                                            </p>
                                        </div>
                                        <span className="text-xs font-medium text-[var(--accent)] bg-blue-50 px-2.5 py-1 rounded-full">
                                            Mejor opción
                                        </span>
                                    </div>

                                    <div className="border border-blue-200 rounded-lg p-4 bg-white">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Package size={16} className="text-[var(--accent)]" />
                                            <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wide">
                                                {recTipo === 'mix' && 'Pallet + Paquetes sueltos'}
                                                {recTipo === 'pallets' && 'Solo Pallets'}
                                                {recTipo === 'paquetes' && 'Solo Paquetes'}
                                            </span>
                                        </div>

                                        <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                                            {recTipo === 'mix' && (
                                                <>{recPallets} {recPallets === 1 ? 'pallet' : 'pallets'} + {recPaquetes} {recPaquetes === 1 ? 'paquete' : 'paquetes'}</>
                                            )}
                                            {recTipo === 'pallets' && (
                                                <>{recPallets} {recPallets === 1 ? 'pallet' : 'pallets'}</>
                                            )}
                                            {recTipo === 'paquetes' && (
                                                <>{recPaquetes} {recPaquetes === 1 ? 'paquete' : 'paquetes'}</>
                                            )}
                                        </div>

                                        <p className="text-xs text-[var(--muted)]">
                                            {totalHojasRec.toLocaleString('es-ES')} hojas total
                                            {sobrante > 0 && <span className="ml-1 text-[var(--warning)]">({sobrante.toLocaleString('es-ES')} sobrantes)</span>}
                                        </p>

                                        {recTipo === 'mix' && qPallet > 0 && (
                                            <p className="text-xs text-[var(--muted)] mt-0.5">
                                                {recPallets}×{qPallet.toLocaleString('es-ES')} + {recPaquetes}×{qPaquete.toLocaleString('es-ES')} hojas
                                            </p>
                                        )}
                                        {recTipo === 'pallets' && qPallet > 0 && (
                                            <p className="text-xs text-[var(--muted)] mt-0.5">
                                                {qPallet.toLocaleString('es-ES')} hojas/pallet
                                            </p>
                                        )}
                                        {recTipo === 'paquetes' && qPaquete > 0 && (
                                            <p className="text-xs text-[var(--muted)] mt-0.5">
                                                {qPaquete.toLocaleString('es-ES')} hojas/paquete
                                            </p>
                                        )}

                                        <div className="flex flex-wrap gap-3 mt-3">
                                            {(recTipo === 'pallets' || recTipo === 'mix') && paper.url_pallet && (
                                                <a href={paper.url_pallet} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                                                >
                                                    Pallet en Antalis <ArrowUpRight size={12} />
                                                </a>
                                            )}
                                            {(recTipo === 'paquetes' || recTipo === 'mix') && paper.url_paquete && (
                                                <a href={paper.url_paquete} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--warning)] hover:underline"
                                                >
                                                    Paquete en Antalis <ArrowUpRight size={12} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })() : null}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Order Registration */}
            <AnimatePresence>
                {selectedPaper && resultado && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden mb-8"
                    >
                        <div className="bg-white border border-[var(--border-color)] rounded-xl p-6 shadow-sm">
                            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-5">
                                Registrar Compra
                            </h2>

                            {/* Row 1: Referencia + Tipo de Compra */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                                        Referencia
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={referencia}
                                            onChange={(e) => { setReferencia(e.target.value); if (e.target.value !== 'Stock') setIsStock(false); }}
                                            placeholder="Pedido #123"
                                            className="flex-1 px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setIsStock(!isStock); setReferencia(isStock ? '' : 'Stock'); }}
                                            className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all cursor-pointer whitespace-nowrap
                                                ${isStock
                                                    ? 'bg-purple-50 border-purple-300 text-purple-600'
                                                    : 'bg-white border-[var(--border-color)] text-[var(--muted)] hover:border-purple-300 hover:text-purple-600'
                                                }`}
                                        >
                                            📦 Stock
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsExtraStockModalOpen(true)}
                                            className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all cursor-pointer whitespace-nowrap
                                                ${extraStockActivo
                                                    ? 'bg-green-50 border-green-300 text-green-700'
                                                    : 'bg-white border-[var(--border-color)] text-[var(--muted)] hover:border-green-300 hover:text-green-700'
                                                }`}
                                        >
                                            {extraStockActivo ? `📦 +${extraStockCant} ${extraStockTipo}(s)` : '+ Añadir stock'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                                        Tipo de Compra
                                    </label>
                                    <select
                                        value={tipoCompra}
                                        onChange={(e) => setTipoCompra(e.target.value as 'Pallet' | 'Paquete' | 'Pallet + Paquetes')}
                                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                                    >
                                        <option value="Pallet">Solo Pallet</option>
                                        <option value="Paquete">Solo Paquete</option>
                                        <option value="Pallet + Paquetes">Pallet + Paquetes</option>
                                    </select>
                                </div>
                            </div>

                            {/* Row 2: Price fields — conditional based on tipoCompra */}
                            {tipoCompra === 'Pallet + Paquetes' ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-5"
                                >
                                    {/* Pallet section */}
                                    <div className="border border-[var(--border-color)] rounded-lg p-4 bg-[var(--surface)]">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Package size={16} className="text-[var(--accent)]" />
                                            <span className="text-xs font-semibold text-[var(--accent)] uppercase">Pallet</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--muted)] mb-1 focus-within:text-[var(--accent)] transition-colors">
                                                    Nº Pallets
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={cantPallets}
                                                    onChange={(e) => setCantPallets(e.target.value ? parseInt(e.target.value) : '')}
                                                    placeholder="1"
                                                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--muted)] mb-1 focus-within:text-[var(--accent)] transition-colors">
                                                    Precio Pallet (€)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={precioPallet}
                                                    onChange={(e) => setPrecioPallet(e.target.value ? parseFloat(e.target.value) : '')}
                                                    placeholder="0.00"
                                                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Paquetes section */}
                                    <div className="border border-[var(--border-color)] rounded-lg p-4 bg-[var(--surface)]">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Layers size={16} className="text-[var(--warning)]" />
                                            <span className="text-xs font-semibold text-[var(--warning)] uppercase">Paquetes</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--muted)] mb-1 focus-within:text-[var(--warning)] transition-colors">
                                                    Nº Paquetes
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={cantPaquetesCompra}
                                                    onChange={(e) => setCantPaquetesCompra(e.target.value ? parseInt(e.target.value) : '')}
                                                    placeholder="1"
                                                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--warning)]/20 focus:border-[var(--warning)] transition-all outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-[var(--muted)] mb-1 focus-within:text-[var(--warning)] transition-colors">
                                                    Precio Paquete (€)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={precioPaquete}
                                                    onChange={(e) => setPrecioPaquete(e.target.value ? parseFloat(e.target.value) : '')}
                                                    placeholder="0.00"
                                                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--warning)]/20 focus:border-[var(--warning)] transition-all outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="max-w-xs"
                                >
                                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                                        Precio en Antalis (€)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={precioNuevo}
                                        onChange={(e) => setPrecioNuevo(e.target.value ? parseFloat(e.target.value) : '')}
                                        placeholder="0.00"
                                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                                    />
                                </motion.div>
                            )}

                            {/* Price Delta Badge */}
                            {priceDelta !== null && (
                                <div className="mt-4">
                                    {priceDelta > 0 ? (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] text-sm font-medium">
                                            <TrendingUp size={14} />
                                            🔺 Ha subido un {Math.abs(priceDelta).toFixed(1)}%
                                            <span className="text-xs opacity-75 ml-1">(anterior: {ultimoPrecio?.toFixed(2)}€)</span>
                                        </div>
                                    ) : priceDelta < 0 ? (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-sm font-medium">
                                            <TrendingDown size={14} />
                                            🔻 Ha bajado un {Math.abs(priceDelta).toFixed(1)}%
                                            <span className="text-xs opacity-75 ml-1">(anterior: {ultimoPrecio?.toFixed(2)}€)</span>
                                        </div>
                                    ) : (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface)] text-[var(--muted)] text-sm font-medium">
                                            Sin cambios respecto al último precio
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Info badge for Pallet + Paquetes */}
                            {tipoCompra === 'Pallet + Paquetes' && (
                                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-[var(--accent)] text-xs font-medium">
                                    ℹ️ Se registrarán 2 líneas en el historial con la misma referencia
                                </div>
                            )}

                            {/* Save Buttons */}
                            <div className="mt-5 flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => handleSave()}
                                    disabled={
                                        !referencia || saving ||
                                        (tipoCompra === 'Pallet + Paquetes'
                                            ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetesCompra === '')
                                            : precioNuevo === ''
                                        )
                                    }
                                    className={`
                                        inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
                                        transition-colors duration-150 border-0 cursor-pointer shadow-sm
                                        ${!referencia || saving ||
                                            (tipoCompra === 'Pallet + Paquetes'
                                                ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetesCompra === '')
                                                : precioNuevo === ''
                                            )
                                            ? 'bg-[var(--border-color)] text-[var(--muted)] cursor-not-allowed shadow-none'
                                            : 'bg-[var(--accent)] text-white hover:bg-blue-600'
                                        }
                                    `}
                                >
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                                    Pedir ahora
                                </button>

                                <button
                                    onClick={() => handleSave()}
                                    disabled={
                                        !referencia || saving ||
                                        (tipoCompra === 'Pallet + Paquetes'
                                            ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetesCompra === '')
                                            : precioNuevo === ''
                                        )
                                    }
                                    className={`
                                        inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
                                        transition-colors duration-150 border-0 cursor-pointer shadow-sm
                                        ${!referencia || saving ||
                                            (tipoCompra === 'Pallet + Paquetes'
                                                ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetesCompra === '')
                                                : precioNuevo === ''
                                            )
                                            ? 'bg-[var(--border-color)] text-[var(--muted)] cursor-not-allowed shadow-none'
                                            : 'bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border-color)] hover:bg-gray-50'
                                        }
                                    `}
                                >
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    Guardar
                                </button>

                                <AnimatePresence>
                                    {saveSuccess && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            className="flex items-center gap-1.5 text-sm text-[var(--success)] font-medium bg-[var(--success-bg)] px-3 py-1.5 rounded-md"
                                        >
                                            <CheckCircle2 size={16} />
                                            {saveMessage}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Empty state when no catalog */}
            {!loading && catalogo.length === 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-16"
                >
                    <AlertCircle size={40} className="mx-auto text-[var(--muted)] mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">
                        Catálogo vacío
                    </h3>
                    <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
                        Importa tu catálogo de papel usando el script <code className="bg-[var(--surface)] border border-[var(--border-color)] px-1.5 py-0.5 rounded text-xs text-rose-500">import-data.js</code> o
                        configura tu conexión a Supabase en <code className="bg-[var(--surface)] border border-[var(--border-color)] px-1.5 py-0.5 rounded text-xs text-rose-500">.env.local</code>.
                    </p>
                </motion.div>
            )}

            {/* Modal Añadir Stock Extra */}
            <AnimatePresence>
                {isExtraStockModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[var(--border-color)]"
                        >
                            <div className="px-6 py-5 border-b border-[var(--border-color)] flex justify-between items-center bg-gray-50/50">
                                <h3 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                                    <Package size={20} className="text-[var(--accent)]" />
                                    Añadir Stock Extra
                                </h3>
                                <button onClick={() => setIsExtraStockModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer bg-white p-1 rounded-md border border-[var(--border-color)] shadow-sm">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                                        ¿Qué quieres añadir al stock?
                                    </label>
                                    <select
                                        value={extraStockTipo}
                                        onChange={(e) => setExtraStockTipo(e.target.value as 'Paquete' | 'Pallet')}
                                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                                    >
                                        <option value="Paquete">Paquetes</option>
                                        <option value="Pallet">Pallets</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                                        Cantidad extra
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={extraStockCant}
                                        onChange={(e) => setExtraStockCant(e.target.value ? parseInt(e.target.value) : '')}
                                        placeholder="Ej. 2"
                                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                                    />
                                </div>
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex justify-between items-center mt-2">
                                    <span className="text-sm text-[var(--muted)] font-medium">Coste del stock extra:</span>
                                    <span className="text-lg font-bold text-[var(--foreground)]">
                                        {extraStockPrecio !== '' ? `${Number(extraStockPrecio).toFixed(2)} €` : '0.00 €'}
                                    </span>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-gray-50 border-t border-[var(--border-color)] flex justify-end gap-3">
                                {extraStockActivo && (
                                    <button
                                        onClick={() => {
                                            setExtraStockActivo(false);
                                            setExtraStockCant('');
                                            setIsExtraStockModalOpen(false);
                                        }}
                                        className="px-4 py-2 border border-red-200 rounded-lg text-sm font-medium text-red-600 bg-white hover:bg-red-50 transition-colors mr-auto cursor-pointer"
                                    >
                                        Quitar extra
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsExtraStockModalOpen(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--muted)] hover:bg-gray-200 transition-colors border-0 cursor-pointer bg-transparent"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        if (extraStockCant !== '' && Number(extraStockCant) > 0) {
                                            setExtraStockActivo(true);
                                            setIsExtraStockModalOpen(false);
                                        }
                                    }}
                                    disabled={!extraStockCant || Number(extraStockCant) <= 0}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border-0 cursor-pointer shadow-sm
                                        ${!extraStockCant || Number(extraStockCant) <= 0
                                            ? 'bg-[var(--border-color)] text-[var(--muted)] cursor-not-allowed shadow-none'
                                            : 'bg-[var(--accent)] text-white hover:bg-blue-600'
                                        }`}
                                >
                                    Guardar extra
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ManualPurchaseForm catalogo={catalogo} />

        </motion.div>
    );
}

function ManualPurchaseForm({ catalogo }: { catalogo: CatalogoPapel[] }) {
    const [referencia, setReferencia] = useState('');
    const [isStock, setIsStock] = useState(false);

    const [formato, setFormato] = useState('A4');
    const [material, setMaterial] = useState('');
    const [gramaje, setGramaje] = useState<number | ''>('');
    const [hojasInput, setHojasInput] = useState<number | ''>('');

    const [tipoCompra, setTipoCompra] = useState<'Paquete' | 'Pallet' | 'Pallet + Paquetes'>('Paquete');

    const [precioUnitario, setPrecioUnitario] = useState<number | ''>('');
    const [precioPaquete, setPrecioPaquete] = useState<number | ''>('');
    const [precioPallet, setPrecioPallet] = useState<number | ''>('');
    const [cantPaquetes, setCantPaquetes] = useState<number | ''>('');
    const [cantPallets, setCantPallets] = useState<number | ''>('');

    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const formatos = ['A4', 'A5', '15x23', 'Portadas'];

    const materiales = useMemo(() => {
        const filtered = catalogo.filter(p => p.formato_libro === formato);
        return [...new Set(filtered.map(p => p.material))].sort();
    }, [catalogo, formato]);

    useEffect(() => {
        if (material && !materiales.includes(material)) setMaterial('');
    }, [materiales, material]);

    const gramajes = useMemo(() => {
        const filtered = catalogo.filter(p => p.formato_libro === formato && (!material || p.material === material));
        return [...new Set(filtered.map(p => p.gramaje))].sort((a, b) => a - b);
    }, [catalogo, formato, material]);

    useEffect(() => {
        if (gramajes.length === 1) setGramaje(gramajes[0]);
        else if (gramaje && !gramajes.includes(gramaje)) setGramaje('');
    }, [gramajes, gramaje]);

    const selectedPaper = useMemo(() => {
        if (!material || !gramaje || !formato) return null;
        return catalogo.find(p => p.material === material && p.gramaje === gramaje && p.formato_libro === formato) || null;
    }, [catalogo, material, gramaje, formato]);

    const syncQuantities = (val: number | '', tCompra = tipoCompra, paper = selectedPaper) => {
        if (!paper || !val || typeof val !== 'number') return;
        if (tCompra === 'Paquete' && paper.cantidad_paquete) {
            setCantPaquetes(Math.ceil(val / paper.cantidad_paquete));
            setCantPallets('');
        } else if (tCompra === 'Pallet' && paper.cantidad_pallet) {
            setCantPallets(Math.ceil(val / paper.cantidad_pallet));
            setCantPaquetes('');
        } else if (tCompra === 'Pallet + Paquetes') {
            const qPallet = paper.cantidad_pallet || 0;
            const qPaquete = paper.cantidad_paquete || 0;
            if (qPallet > 0) {
                const numPallets = Math.floor(val / qPallet);
                setCantPallets(numPallets || '');
                const restante = val - (numPallets * qPallet);
                if (restante > 0 && qPaquete > 0) {
                    setCantPaquetes(Math.ceil(restante / qPaquete));
                } else {
                    setCantPaquetes('');
                }
            }
        }
    };

    // Auto-sync when paper or type changes (keeps current hojasInput steady)
    useEffect(() => {
        if (hojasInput) syncQuantities(hojasInput, tipoCompra, selectedPaper);
    }, [tipoCompra, selectedPaper]);

    // Auto-calculate prices based on current quantities
    useEffect(() => {
        if (!selectedPaper) return;

        if (tipoCompra === 'Pallet + Paquetes') {
            if (selectedPaper.precio_hoja_pallet && selectedPaper.cantidad_pallet && cantPallets) {
                setPrecioPallet(parseFloat((selectedPaper.precio_hoja_pallet * selectedPaper.cantidad_pallet * Number(cantPallets)).toFixed(2)));
            } else setPrecioPallet('');

            if (selectedPaper.precio_hoja && selectedPaper.cantidad_paquete && cantPaquetes) {
                setPrecioPaquete(parseFloat((selectedPaper.precio_hoja * selectedPaper.cantidad_paquete * Number(cantPaquetes)).toFixed(2)));
            } else setPrecioPaquete('');
        } else if (tipoCompra === 'Pallet') {
            if (selectedPaper.precio_hoja_pallet && selectedPaper.cantidad_pallet && cantPallets) {
                setPrecioUnitario(parseFloat((selectedPaper.precio_hoja_pallet * selectedPaper.cantidad_pallet * Number(cantPallets)).toFixed(2)));
            } else setPrecioUnitario('');
        } else if (tipoCompra === 'Paquete') {
            if (selectedPaper.precio_hoja && selectedPaper.cantidad_paquete && cantPaquetes) {
                setPrecioUnitario(parseFloat((selectedPaper.precio_hoja * selectedPaper.cantidad_paquete * Number(cantPaquetes)).toFixed(2)));
            } else setPrecioUnitario('');
        }
    }, [selectedPaper, tipoCompra, cantPallets, cantPaquetes]);

    const [previewStockRef, setPreviewStockRef] = useState('Stock auto');
    useEffect(() => {
        if (isStock) {
            const fetchNextStock = async () => {
                const { data: stockData } = await supabase
                    .from('historial_pedidos')
                    .select('referencia')
                    .ilike('referencia', 'Stock %')
                    .order('id', { ascending: false })
                    .limit(1);

                if (stockData && stockData.length > 0) {
                    const match = stockData[0].referencia.match(/\d+$/);
                    if (match) {
                        setPreviewStockRef(`Stock ${(parseInt(match[0], 10) + 1).toString().padStart(3, '0')}`);
                    }
                } else {
                    setPreviewStockRef('Stock 001');
                }
            };
            fetchNextStock();
        }
    }, [isStock, saveSuccess]);

    const handleSave = async (estadoStr: 'Guardado' | 'Pedido') => {
        if (!selectedPaper) return;
        setSaving(true);
        setSaveMessage('');
        let hasError = false;

        try {
            let refToSave = referencia;
            if (isStock) refToSave = previewStockRef;

            if (tipoCompra === 'Pallet + Paquetes') {
                if (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetes === '') return setSaving(false);

                if (Number(cantPallets) > 0) {
                    const { error: err1 } = await supabase.from('historial_pedidos').insert({
                        referencia: refToSave, id_catalogo: selectedPaper.id, tipo_compra: 'Pallet',
                        cantidad_comprada: Number(cantPallets), precio_pagado: Number(precioPallet), estado: estadoStr
                    });
                    if (err1) hasError = true;
                }
                if (Number(cantPaquetes) > 0) {
                    const { error: err2 } = await supabase.from('historial_pedidos').insert({
                        referencia: refToSave, id_catalogo: selectedPaper.id, tipo_compra: 'Paquete',
                        cantidad_comprada: Number(cantPaquetes), precio_pagado: Number(precioPaquete), estado: estadoStr
                    });
                    if (err2) hasError = true;
                }
            } else {
                if (precioUnitario === '') return setSaving(false);
                const cantToSave = tipoCompra === 'Pallet' ? cantPallets : cantPaquetes;
                const { error } = await supabase.from('historial_pedidos').insert({
                    referencia: refToSave, id_catalogo: selectedPaper.id, tipo_compra: tipoCompra,
                    cantidad_comprada: Number(cantToSave) || 1, precio_pagado: Number(precioUnitario), estado: estadoStr
                });
                if (error) hasError = true;
            }

            if (hasError) {
                setSaveMessage('Error al guardar.');
            } else {
                setSaveSuccess(true);
                setSaveMessage('Registrado correctamente');
                setTimeout(() => {
                    setSaveSuccess(false); setSaveMessage('');
                    if (!isStock) setReferencia('');
                    setPrecioUnitario(''); setPrecioPaquete(''); setPrecioPallet('');
                    setCantPaquetes(''); setCantPallets(''); setHojasInput('');
                }, 3000);
            }
        } catch (e) {
            console.error(e);
            setSaveMessage('Error inesperado.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white border border-[var(--border-color)] rounded-xl p-6 mb-6 mt-8 shadow-sm hover:shadow-md transition-shadow duration-300">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-5 flex items-center gap-2">
                <ShoppingCart size={18} className="text-[var(--accent)]" />
                Registrar Compra
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
                <div>
                    <div className="flex justify-between items-center mb-1.5">
                        <label className="text-sm font-medium text-[var(--foreground)] focus-within:text-[var(--accent)] transition-colors">
                            Referencia
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
                            <input
                                type="checkbox"
                                checked={isStock}
                                onChange={(e) => setIsStock(e.target.checked)}
                                className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                            />
                            📦 Stock
                        </label>
                    </div>
                    <input
                        type="text"
                        value={isStock ? previewStockRef : referencia}
                        onChange={(e) => setReferencia(e.target.value)}
                        disabled={isStock}
                        placeholder={isStock ? previewStockRef : "Pedido #123"}
                        className={`w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none ${isStock ? 'opacity-70 bg-gray-50' : ''}`}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                        Cantidad de Hojas
                    </label>
                    <input
                        type="number"
                        min="1"
                        value={hojasInput}
                        onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : '';
                            setHojasInput(val);
                            syncQuantities(val);
                        }}
                        placeholder="Ej. 2000"
                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                        Tipo de Compra
                    </label>
                    <select
                        value={tipoCompra}
                        onChange={(e) => setTipoCompra(e.target.value as any)}
                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    >
                        <option value="Paquete">Solo Paquete</option>
                        <option value="Pallet">Solo Pallet</option>
                        <option value="Pallet + Paquetes">Pallet + Paquetes</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                        Formato del Libro
                    </label>
                    <select
                        value={formato}
                        onChange={(e) => setFormato(e.target.value)}
                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    >
                        {formatos.map((f) => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                        Material
                    </label>
                    <select
                        value={material}
                        onChange={(e) => setMaterial(e.target.value)}
                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    >
                        <option value="">Seleccione...</option>
                        {materiales.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5 focus-within:text-[var(--accent)] transition-colors">
                        Gramaje
                    </label>
                    <select
                        value={gramaje}
                        onChange={(e) => setGramaje(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                    >
                        <option value="">Seleccione...</option>
                        {gramajes.map((g) => (
                            <option key={g} value={g}>{g} g/m²</option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedPaper && (
                <div className="bg-gray-50/50 rounded-lg p-4 border border-gray-100 mb-5">
                    <div className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-green-500" />
                        Papel sugerido: {selectedPaper.material} {selectedPaper.gramaje}g — Imprime {selectedPaper.formato_impresion} — {selectedPaper.cantidad_paquete} hj/paq
                    </div>

                    {tipoCompra === 'Pallet + Paquetes' ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Nº Pallets</label>
                                <input type="number" min="0" value={cantPallets}
                                    onChange={(e) => {
                                        const v = e.target.value ? parseInt(e.target.value) : '';
                                        setCantPallets(v);
                                        setHojasInput((v ? v * (selectedPaper.cantidad_pallet || 0) : 0) + (cantPaquetes ? Number(cantPaquetes) * (selectedPaper.cantidad_paquete || 0) : 0));
                                    }}
                                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-md text-sm outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Total Pallets (€)</label>
                                <input type="number" step="0.01" value={precioPallet} onChange={(e) => setPrecioPallet(e.target.value ? parseFloat(e.target.value) : '')} placeholder="0.00" className="w-full px-3 py-2 border border-[var(--border-color)] rounded-md text-sm outline-none bg-gray-50 opacity-80" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Nº Paquetes</label>
                                <input type="number" min="0" value={cantPaquetes}
                                    onChange={(e) => {
                                        const v = e.target.value ? parseInt(e.target.value) : '';
                                        setCantPaquetes(v);
                                        setHojasInput((cantPallets ? Number(cantPallets) * (selectedPaper.cantidad_pallet || 0) : 0) + (v ? v * (selectedPaper.cantidad_paquete || 0) : 0));
                                    }}
                                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-md text-sm outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Total Paquetes (€)</label>
                                <input type="number" step="0.01" value={precioPaquete} onChange={(e) => setPrecioPaquete(e.target.value ? parseFloat(e.target.value) : '')} placeholder="0.00" className="w-full px-3 py-2 border border-[var(--border-color)] rounded-md text-sm outline-none bg-gray-50 opacity-80" />
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-md">
                            <div>
                                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Nº de {tipoCompra}s</label>
                                <input type="number" min="1" value={tipoCompra === 'Paquete' ? cantPaquetes : cantPallets}
                                    onChange={(e) => {
                                        const v = e.target.value ? parseInt(e.target.value) : '';
                                        if (tipoCompra === 'Paquete') {
                                            setCantPaquetes(v);
                                            setHojasInput(v ? v * (selectedPaper.cantidad_paquete || 0) : '');
                                        } else {
                                            setCantPallets(v);
                                            setHojasInput(v ? v * (selectedPaper.cantidad_pallet || 0) : '');
                                        }
                                    }}
                                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Precio total (€)</label>
                                <input type="number" step="0.01" min="0" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value ? parseFloat(e.target.value) : '')} placeholder="Calculado aut." className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-gray-50 opacity-80 outline-none" />
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <button
                    onClick={() => handleSave('Guardado')}
                    disabled={saving || !selectedPaper || (tipoCompra === 'Pallet + Paquetes' ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetes === '') : precioUnitario === '') || (!isStock && !referencia)}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 border-0 shadow-sm cursor-pointer
                        ${saving || !selectedPaper || (tipoCompra === 'Pallet + Paquetes' ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetes === '') : precioUnitario === '') || (!isStock && !referencia)
                            ? 'bg-[var(--border-color)] text-[var(--muted)] cursor-not-allowed shadow-none'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 pointer-events-auto'}
                    `}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                    Pedir ahora
                </button>

                <button
                    onClick={() => handleSave('Guardado')}
                    disabled={saving || !selectedPaper || (tipoCompra === 'Pallet + Paquetes' ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetes === '') : precioUnitario === '') || (!isStock && !referencia)}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 border-0 shadow-sm cursor-pointer
                        ${saving || !selectedPaper || (tipoCompra === 'Pallet + Paquetes' ? (precioPallet === '' || precioPaquete === '' || cantPallets === '' || cantPaquetes === '') : precioUnitario === '') || (!isStock && !referencia)
                            ? 'bg-[var(--border-color)] text-[var(--muted)] cursor-not-allowed shadow-none'
                            : 'bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border-color)] hover:bg-gray-50 pointer-events-auto'}
                    `}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Guardar
                </button>

                <AnimatePresence>
                    {saveSuccess && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-1.5 text-sm text-[var(--success)] font-medium bg-[var(--success-bg)] px-3 py-1.5 rounded-md"
                        >
                            <CheckCircle2 size={16} /> {saveMessage}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
