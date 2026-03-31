'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, Clock, CalendarDays, Loader2, AlertCircle, Play, X, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

type Papel = {
    id: number;
    material: string;
    gramaje: number;
    formato_libro: string;
};

type HistorialPrecio = {
    fecha_registro: string;
    precio_paquete_registrado: number;
    precio_pallet_registrado: number;
    id_papel: number;
};

export default function AnalisisPage() {
    const [latestReport, setLatestReport] = useState<{ name: string; url: string; date: Date } | null>(null);
    const [loading, setLoading] = useState(true);
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
    const [hoursRemaining, setHoursRemaining] = useState<number | null>(null);
    const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);

    // Chart state
    const [papeles, setPapeles] = useState<Record<number, Papel>>({});
    const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([]);
    const [selectedMes, setSelectedMes] = useState<string>('');
    const [historialData, setHistorialData] = useState<HistorialPrecio[]>([]);
    const [loadingChart, setLoadingChart] = useState(false);

    // Calculate countdown to the last day of the month at 07:00h
    useEffect(() => {
        const updateCountdown = () => {
            const now = new Date();
            let year = now.getFullYear();
            let month = now.getMonth();

            let targetDate = new Date(year, month + 1, 0, 7, 0, 0);

            if (now.getTime() > targetDate.getTime()) {
                targetDate = new Date(year, month + 2, 0, 7, 0, 0);
            }

            const diff = targetDate.getTime() - now.getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

            setDaysRemaining(days);
            setHoursRemaining(hours);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000 * 60 * 60);

        return () => clearInterval(interval);
    }, []);

    // Fetch initial data
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                // PDF Fetching
                const { data: pdfData, error: pdfError } = await supabase.storage.from('reportes_precios').list('', {
                    sortBy: { column: 'created_at', order: 'desc' },
                    limit: 1
                });

                if (!pdfError && pdfData && pdfData.length > 0) {
                    const file = pdfData[0];
                    if (file.name !== '.emptyFolderPlaceholder') {
                        const { data: publicUrlData } = supabase.storage.from('reportes_precios').getPublicUrl(file.name);
                        setLatestReport({
                            name: file.name,
                            url: publicUrlData.publicUrl,
                            date: new Date(file.created_at)
                        });
                    }
                }

                // Papeles Map Fetching
                const { data: catData, error: catError } = await supabase.from('catalogo_papel').select('id, material, gramaje, formato_libro').order('material');
                if (!catError && catData) {
                    const map: Record<number, Papel> = {};
                    catData.forEach(p => map[p.id] = p);
                    setPapeles(map);
                }

                // Available Months Fetching
                // Note: We'll distinct them locally since Supabase REST doesn't easily do DISTINCT over custom formatted dates.
                const { data: allHist, error: allHistErr } = await supabase
                    .from('historial_precios_catalogo')
                    .select('fecha_registro')
                    .order('fecha_registro', { ascending: false });

                if (!allHistErr && allHist) {
                    const uniqueMonths = new Set<string>();
                    allHist.forEach(item => {
                        const mesLabel = new Date(item.fecha_registro).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                        uniqueMonths.add(mesLabel);
                    });

                    const mesesArray = Array.from(uniqueMonths);
                    setMesesDisponibles(mesesArray);
                    if (mesesArray.length > 0) {
                        setSelectedMes(mesesArray[0]);
                    }
                }

            } catch (err) {
                console.error("Error fetching reports:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, []);

    // Fetch chart data when selectedMes changes
    useEffect(() => {
        if (!selectedMes) return;

        const fetchChartData = async () => {
            setLoadingChart(true);
            try {
                // Fetch all history and filter locally by month string. 
                // A production app might use raw SQL or stored procedures for precise date filtering, 
                // but local JS filtering is fine for <=10k rows.
                const { data, error } = await supabase
                    .from('historial_precios_catalogo')
                    .select('fecha_registro, precio_paquete_registrado, precio_pallet_registrado, id_papel');

                if (!error && data) {
                    const filtered = data.filter(d => {
                        const rowMes = new Date(d.fecha_registro).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                        return rowMes === selectedMes;
                    });
                    // Only keep the latest record of a paper in a given month, in case of multiple script runs in the same month.
                    const distinctFiltered: Record<number, HistorialPrecio> = {};
                    filtered.forEach(item => {
                        // Using ISO string comparison to keep the latest
                        if (!distinctFiltered[item.id_papel] || new Date(item.fecha_registro) > new Date(distinctFiltered[item.id_papel].fecha_registro)) {
                            distinctFiltered[item.id_papel] = item;
                        }
                    });

                    setHistorialData(Object.values(distinctFiltered));
                }
            } catch (err) {
                console.error("Error fetching historical data:", err);
            } finally {
                setLoadingChart(false);
            }
        };

        fetchChartData();
    }, [selectedMes]);

    const handleDownload = () => {
        if (latestReport) {
            window.open(latestReport.url, '_blank');
        }
    };

    // Format data for Recharts: X-Axis is the Paper Name
    const formattedChartData = historialData.map(d => {
        const p = papeles[d.id_papel];
        return {
            papelShortName: p ? `${p.material.substring(0, 8)}... ${p.gramaje}g` : `ID ${d.id_papel}`,
            papelFullName: p ? `${p.material} ${p.gramaje}g | ${p.formato_libro}` : `Desconocido`,
            Paquete: Number(d.precio_paquete_registrado) || 0,
            Pallet: Number(d.precio_pallet_registrado) || 0
        };
    }).sort((a, b) => a.papelShortName.localeCompare(b.papelShortName));

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="space-y-6 pb-12"
        >
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-[var(--foreground)] flex items-center gap-3">
                        <FileText size={28} className="text-[var(--accent)]" />
                        Análisis de Precios
                    </h1>
                    <p className="text-sm text-[var(--muted)] mt-1">
                        Visualiza el último informe comparativo y la comparativa de mercado
                    </p>
                </div>

                <button
                    onClick={() => setIsTriggerModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--foreground)] text-[var(--surface)] hover:opacity-90 transition-opacity shadow-sm"
                >
                    <Play size={16} className="fill-[var(--surface)]" />
                    Analizar Ahora
                </button>
            </div>

            {/* Countdown Banner */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                        <Clock size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-blue-900">Próximo Análisis Programado</h3>
                        <p className="text-xs text-blue-700 mt-0.5">El robot comprobará los precios automáticamente a fin de mes a las 07:00h</p>
                    </div>
                </div>
                <div className="sm:text-right flex items-end sm:items-center gap-2">
                    <div className="text-2xl font-bold text-blue-900 tabular-nums">
                        {daysRemaining !== null ? (
                            <>
                                {daysRemaining} <span className="text-sm font-medium text-blue-700">días</span> {hoursRemaining} <span className="text-sm font-medium text-blue-700">horas</span>
                            </>
                        ) : (
                            <Loader2 size={24} className="animate-spin text-blue-600 inline ml-2" />
                        )}
                    </div>
                    <p className="text-xs text-blue-700 mt-0.5 font-medium uppercase tracking-wider hidden sm:block">Restantes</p>
                </div>
            </div>

            {/* Price Aggregation Chart Section */}
            <div className="bg-white border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                            <TrendingUp size={16} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--foreground)]">Comparativa Mensual del Catálogo</h2>
                            <p className="text-xs text-[var(--muted)]">Visualiza el precio de todos los materiales en un mes concreto</p>
                        </div>
                    </div>

                    <div className="relative w-full sm:w-72">
                        <select
                            value={selectedMes}
                            onChange={(e) => setSelectedMes(e.target.value)}
                            className="w-full flex h-10 w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 appearance-none pr-8 truncate font-medium text-gray-800 capitalize"
                        >
                            {mesesDisponibles.length === 0 && <option value="" disabled>Buscando meses...</option>}
                            {mesesDisponibles.map(m => (
                                <option key={m} value={m}>
                                    📅 {m}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--muted)]">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {loadingChart ? (
                        <div className="h-72 flex flex-col items-center justify-center text-[var(--muted)]">
                            <Loader2 size={32} className="animate-spin mb-4" />
                            <p className="text-sm">Cargando precios...</p>
                        </div>
                    ) : historialData.length === 0 ? (
                        <div className="h-72 flex flex-col items-center justify-center text-[var(--muted)] bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                            <TrendingUp size={32} className="mb-4 text-gray-300" />
                            <p className="text-sm font-medium">No hay datos históricos para este mes.</p>
                            <p className="text-xs mt-1">Los datos aparecerán tras correr el robot.</p>
                        </div>
                    ) : (
                        <div className="h-[450px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={formattedChartData}
                                    margin={{ top: 5, right: 30, left: 10, bottom: 80 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis
                                        dataKey="papelShortName"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#6b7280', fontSize: 10 }}
                                        dy={10}
                                        angle={-45}
                                        textAnchor="end"
                                        interval={0}
                                    />
                                    <YAxis
                                        tickFormatter={(val) => `${val.toFixed(3)}€`}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#6b7280', fontSize: 11 }}
                                        domain={['auto', 'auto']}
                                    />

                                    <Tooltip
                                        labelFormatter={(label, payload) => {
                                            if (payload && payload.length > 0) {
                                                return payload[0].payload.papelFullName;
                                            }
                                            return label;
                                        }}
                                        formatter={(value: number | string | undefined, name: string | undefined): [string, string] => [
                                            typeof value === 'number' ? `${value.toFixed(4)} €` : String(value || ''),
                                            name || ''
                                        ]}
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: '1px solid #e5e7eb',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} />

                                    {/* Line for Paquete of ALL Papers */}
                                    <Line
                                        type="monotone"
                                        dataKey="Paquete"
                                        name="Precio Hoja (Paquete)"
                                        stroke="#111827"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#111827', strokeWidth: 0 }}
                                        activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                                    />
                                    {/* Line for Pallet of ALL Papers */}
                                    <Line
                                        type="monotone"
                                        dataKey="Pallet"
                                        name="Precio Hoja (Pallet)"
                                        stroke="#4f46e5"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#4f46e5', strokeWidth: 0 }}
                                        activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* PDF Viewer Section */}
            <div className="bg-white border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm flex flex-col" style={{ minHeight: 'calc(100vh - 280px)' }}>
                {/* PDF Header */}
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                            <CalendarDays size={16} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--foreground)]">Último Reporte Mensual</h2>
                            <p className="text-xs text-[var(--muted)]">
                                {loading ? 'Buscando...' : latestReport ? `Generado el ${latestReport.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Ningún PDF disponible'}
                            </p>
                        </div>
                    </div>

                    {latestReport && (
                        <button
                            onClick={handleDownload}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--surface)] border border-[var(--border-color)] text-[var(--foreground)] hover:bg-gray-100 transition-colors shadow-sm cursor-pointer"
                        >
                            <Download size={16} />
                            <span>Descargar PDF</span>
                        </button>
                    )}
                </div>

                {/* PDF Content Area */}
                <div className="flex-1 bg-gray-100 flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-[var(--muted)]">
                            <Loader2 size={32} className="animate-spin mb-4" />
                            <p>Cargando visor...</p>
                        </div>
                    ) : latestReport ? (
                        <iframe
                            src={`${latestReport.url}#view=FitH`}
                            className="w-full h-full border-0 flex-1 min-h-[500px]"
                            title="Visor PDF Reporte Antalis"
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--muted)]">
                            <AlertCircle size={48} className="mb-4 text-gray-300" />
                            <h3 className="text-lg font-medium text-[var(--foreground)] mb-1">Aún no hay reportes generados</h3>
                            <p className="max-w-md text-sm pl-4 pr-4">
                                El primer reporte PDF aparecerá aquí automáticamente cuando el robot finalice su primer ciclo a final de mes.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Manual Trigger Modal */}
            <AnimatePresence>
                {isTriggerModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                        onClick={() => setIsTriggerModalOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-[var(--surface)] w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-[var(--border-color)]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                                <h3 className="text-lg font-semibold text-[var(--foreground)]">Ejecutar Análisis</h3>
                                <button
                                    onClick={() => setIsTriggerModalOpen(false)}
                                    className="p-1 rounded-md text-[var(--muted)] hover:bg-gray-100 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm flex items-start gap-3">
                                    <AlertCircle size={20} className="flex-shrink-0 mt-0.5 text-amber-600" />
                                    <div>
                                        <p className="font-semibold mb-1">Restricción de Servidor</p>
                                        <p>Dado que esta web está alojada en la nube, el sistema de seguridad no permite ejecutar el robot desde este botón físico, ya que cada análisis toma unos 2 minutos y excedería el tiempo límite del servidor.</p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[var(--foreground)] font-medium text-sm mb-2">Para forzar un análisis de precios ahora mismo:</p>
                                    <ol className="list-decimal list-inside text-sm text-[var(--muted)] space-y-2">
                                        <li>Cierra esta ventana web (o minimízala).</li>
                                        <li>Dirígete al escritorio de tu ordenador físico.</li>
                                        <li>Abre la carpeta de la App de Printcolor.</li>
                                        <li>Entra en la carpeta <code className="bg-gray-100 px-1 py-0.5 rounded text-xs text-black border border-gray-200">scripts</code>.</li>
                                        <li>Haz doble clic en el archivo <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-semibold text-blue-600 border border-gray-200 cursor-pointer">verificador-precios.bat</code>.</li>
                                    </ol>
                                </div>
                                <p className="text-xs text-[var(--muted)] italic mt-4 pt-4 border-t border-[var(--border-color)]">
                                    El archivo abrirá una ventana negra durante 2 minutos completando el análisis de forma local. En cuanto termine, envíará el informe a tu correo y actualizará esta pantalla.
                                </p>
                            </div>

                            <div className="px-6 py-4 border-t border-[var(--border-color)] bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setIsTriggerModalOpen(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--foreground)] text-[var(--surface)] hover:opacity-90 transition-opacity"
                                >
                                    Entendido
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
