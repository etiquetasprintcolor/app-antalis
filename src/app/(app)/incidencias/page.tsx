'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { supabase, CatalogoPapel, Incidencia, MOTIVOS_INCIDENCIA } from '@/lib/supabase-client';
import {
  AlertTriangle,
  Calculator,
  Layers,
  Inbox,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Calendar,
  FileText,
  DollarSign
} from 'lucide-react';

const IMPOSICION: Record<string, { multiplicador: number; sra3PorHoja: number; label: string }> = {
  'A4': { multiplicador: 2, sra3PorHoja: 2, label: '2 por SRA3 (Papel 45x64)' },
  'A5': { multiplicador: 4, sra3PorHoja: 4, label: '4 por SRA3 (Papel 64x90)' },
  '15x23': { multiplicador: 4, sra3PorHoja: 4, label: '4 por SRA3 (Papel 64x90)' },
};

function fmt(n: number, dec = 2) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function IncidenciasPage() {
  // Catalogo and Incidencias Data
  const [catalogo, setCatalogo] = useState<CatalogoPapel[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [cantLibros, setCantLibros] = useState<number | ''>('');
  const [formatoLibro, setFormatoLibro] = useState('A4');
  const [paginasPorLibro, setPaginasPorLibro] = useState<number | ''>('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [gramajeFilter, setGramajeFilter] = useState<number | ''>('');
  const [selectedPaper, setSelectedPaper] = useState<CatalogoPapel | null>(null);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_INCIDENCIA[0]);
  const [observaciones, setObservaciones] = useState('');

  // Actions State
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load catalog and incidents history
  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, incRes] = await Promise.all([
        supabase.from('catalogo_papel').select('*').order('material').order('gramaje'),
        supabase.from('incidencias').select('*, catalogo_papel(*)').order('fecha', { ascending: false })
      ]);

      if (catRes.data) setCatalogo(catRes.data);
      if (incRes.data) setIncidencias(incRes.data as Incidencia[]);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter lists based on cascades (same as Calculator)
  const materiales = useMemo(() => {
    const filtered = catalogo.filter(p => p.formato_libro === formatoLibro);
    return [...new Set(filtered.map(p => p.material))].sort();
  }, [catalogo, formatoLibro]);

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

  useEffect(() => {
    if (gramajes.length === 1) {
      setGramajeFilter(gramajes[0]);
    } else if (gramajeFilter && !gramajes.includes(gramajeFilter as number)) {
      setGramajeFilter('');
    }
  }, [gramajes, gramajeFilter]);

  const papelesFiltrados = useMemo(() => {
    return catalogo.filter(p => {
      if (materialFilter && p.material !== materialFilter) return false;
      if (gramajeFilter && p.gramaje !== gramajeFilter) return false;
      if (p.formato_libro !== formatoLibro) return false;
      return true;
    });
  }, [catalogo, materialFilter, gramajeFilter, formatoLibro]);

  // Calculations (same formulas as Calculator)
  const calculos = useMemo(() => {
    if (!cantLibros || !paginasPorLibro) return null;

    const imposicion = IMPOSICION[formatoLibro];
    if (!imposicion) return null;

    const ejemplares = Number(cantLibros);
    const paginas = Number(paginasPorLibro);

    // Hojas de impresión
    const totalHojas = (ejemplares / 2) * (paginas / imposicion.multiplicador) / imposicion.sra3PorHoja;

    return {
      totalHojas,
      ejemplares,
      paginas,
      label: imposicion.label
    };
  }, [cantLibros, paginasPorLibro, formatoLibro]);

  // Auto-select the paper if only one fits or matches
  useEffect(() => {
    if (papelesFiltrados.length > 0) {
      // Find the first or best match
      if (!selectedPaper || !papelesFiltrados.some(p => p.id === selectedPaper.id)) {
        setSelectedPaper(papelesFiltrados[0]);
      }
    } else {
      setSelectedPaper(null);
    }
  }, [papelesFiltrados, selectedPaper]);

  // Calculate estimated cost of wasted sheets
  const costeEstimado = useMemo(() => {
    if (!calculos || !selectedPaper) return 0;
    // We use precio_hoja (pack price divided by pack sheets, or default leaf cost in db)
    // If not set, we default to 0.05 or fallback
    const precioPorHoja = selectedPaper.precio_hoja || 0.05;
    return calculos.totalHojas * precioPorHoja;
  }, [calculos, selectedPaper]);

  // Total cost sum of all registered incidents
  const totalCostePerdidas = useMemo(() => {
    return incidencias.reduce((sum, item) => sum + Number(item.coste_estimado), 0);
  }, [incidencias]);

  // Submit handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaper || !calculos) return;

    setSaving(true);
    setSaveMessage('');

    try {
      const hojasGastadas = parseFloat(calculos.totalHojas.toFixed(2));
      const coste = parseFloat(costeEstimado.toFixed(2));

      // 1. Save to Supabase
      const { data, error } = await supabase
        .from('incidencias')
        .insert({
          id_catalogo: selectedPaper.id,
          motivo,
          cantidad_libros: calculos.ejemplares,
          paginas_por_libro: calculos.paginas,
          formato_libro: formatoLibro,
          hojas_gastadas: hojasGastadas,
          coste_estimado: coste,
          observaciones: observaciones.trim() || null
        })
        .select('*, catalogo_papel(*)')
        .single();

      if (error) throw error;

      // 2. Add locally to avoid full fetch if possible, or fetch later
      if (data) {
        setIncidencias(prev => [data as Incidencia, ...prev]);
      }

      // 3. Send automatic email notification to archivos@printcolorweb.com
      try {
        const emailRes = await fetch('/api/email-incidencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            material: selectedPaper.material,
            gramaje: selectedPaper.gramaje,
            formatoLibro: formatoLibro,
            cantidadLibros: calculos.ejemplares,
            paginasPorLibro: calculos.paginas,
            hojasGastadas,
            costeEstimado: coste,
            motivo,
            observaciones: observaciones.trim() || null
          })
        });

        if (!emailRes.ok) {
          console.error('Failed to send email notification');
        }
      } catch (errEmail) {
        console.error('Error sending email request:', errEmail);
      }

      // Success feedback & Form Reset
      setSaveSuccess(true);
      setSaveMessage('Incidencia registrada y correo enviado correctamente.');
      setCantLibros('');
      setPaginasPorLibro('');
      setObservaciones('');

      setTimeout(() => {
        setSaveSuccess(false);
        setSaveMessage('');
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setSaveMessage(err.message || 'Error al guardar la incidencia.');
    } finally {
      setSaving(false);
    }
  };

  // Delete handler
  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta incidencia del historial?')) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('incidencias').delete().eq('id', id);
      if (error) throw error;

      setIncidencias(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Error deleting incident:', err);
      alert('No se pudo eliminar el registro.');
    } finally {
      setDeletingId(null);
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
      className="space-y-6"
    >
      {/* Page Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)] flex items-center gap-3">
            <AlertTriangle size={28} className="text-red-500" />
            Registro de Incidencias Internas
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Calcula el papel gastado en reimpresiones y notifica automáticamente al departamento de archivos.
          </p>
        </div>

        {/* Global Stats Badge */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3 self-start md:self-auto shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600">
            <DollarSign size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-red-500/80 uppercase tracking-wider">Total Pérdida Estimada</p>
            <p className="text-xl font-bold text-red-700 mt-0.5">{fmt(totalCostePerdidas)} €</p>
          </div>
        </div>
      </motion.div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left Side: Registration Form (2 cols wide on large screens) */}
        <motion.div variants={itemVariants} className="xl:col-span-2 space-y-6">
          <div className="bg-white border border-[var(--border-color)] rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-5 flex items-center gap-2">
              <Calculator size={16} className="text-[var(--accent)]" />
              Calcular e Introducir Incidencia
            </h2>

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Formato del libro */}
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Formato del Libro
                  </label>
                  <select
                    value={formatoLibro}
                    onChange={(e) => {
                      setFormatoLibro(e.target.value);
                      setSelectedPaper(null);
                    }}
                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                  >
                    {Object.keys(IMPOSICION).map(fmt => (
                      <option key={fmt} value={fmt}>{fmt}</option>
                    ))}
                  </select>
                </div>

                {/* Material */}
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Material
                  </label>
                  <select
                    value={materialFilter}
                    onChange={(e) => {
                      setMaterialFilter(e.target.value);
                      setGramajeFilter('');
                      setSelectedPaper(null);
                    }}
                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                  >
                    <option value="">Selecciona material</option>
                    {materiales.map((m: string) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Gramaje */}
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Gramaje
                  </label>
                  <select
                    value={gramajeFilter}
                    disabled={!materialFilter}
                    onChange={(e) => {
                      setGramajeFilter(e.target.value ? parseInt(e.target.value) : '');
                      setSelectedPaper(null);
                    }}
                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <option value="">Selecciona gramaje</option>
                    {gramajes.map((g: number) => (
                      <option key={g} value={g}>{g} g/m²</option>
                    ))}
                  </select>
                </div>

                {/* Papel Resultante */}
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Papel de Catálogo Seleccionado
                  </label>
                  <select
                    value={selectedPaper?.id || ''}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      const paper = catalogo.find(p => p.id === id) || null;
                      setSelectedPaper(paper);
                    }}
                    disabled={papelesFiltrados.length === 0}
                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    {papelesFiltrados.length === 0 ? (
                      <option value="">(No hay papeles disponibles)</option>
                    ) : (
                      papelesFiltrados.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.material} ({p.gramaje}g) - {p.formato_impresion}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Cantidad de libros a repetir */}
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Cantidad de Libros a Repetir
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={cantLibros}
                    onChange={(e) => setCantLibros(e.target.value ? parseInt(e.target.value) : '')}
                    placeholder="Ej. 100"
                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                  />
                </div>

                {/* Número de páginas */}
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Nº de Páginas
                  </label>
                  <input
                    type="number"
                    min="2"
                    step="2"
                    required
                    value={paginasPorLibro}
                    onChange={(e) => setPaginasPorLibro(e.target.value ? parseInt(e.target.value) : '')}
                    placeholder="Ej. 180"
                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                  />
                </div>

                {/* Motivo de la Incidencia */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Motivo del Error
                  </label>
                  <select
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] cursor-pointer focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none"
                  >
                    {MOTIVOS_INCIDENCIA.map(mot => (
                      <option key={mot} value={mot}>{mot}</option>
                    ))}
                  </select>
                </div>

                {/* Observaciones */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Observaciones / Notas (Opcional)
                  </label>
                  <textarea
                    rows={3}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Detalla cómo ocurrió o cualquier instrucción especial para la reimpresión..."
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none resize-none"
                  />
                </div>
              </div>

              {/* Action feedback message */}
              {saveMessage && (
                <div className={`p-4 rounded-lg flex items-center gap-2 ${saveSuccess ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {saveSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  <span className="text-xs font-medium">{saveMessage}</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={saving || !selectedPaper || !calculos}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 border-0 cursor-pointer shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={16} />
                      Registrar y Notificar a Archivos
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>

        {/* Right Side: Estimated consumption display */}
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="bg-gradient-to-br from-red-600 to-red-800 text-white rounded-xl p-6 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-5 rounded-full blur-2xl"></div>
            
            <div className="relative z-10 flex items-center gap-3 mb-2">
              <Layers size={20} className="opacity-95" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Consumo de Papel</h3>
            </div>
            
            {calculos ? (
              <div className="space-y-4 mt-4">
                <div>
                  <span className="text-4xl font-bold tracking-tight">
                    {Math.ceil(calculos.totalHojas).toLocaleString('es-ES')}
                  </span>
                  <span className="text-sm opacity-90 ml-1.5 font-medium">hojas grandes</span>
                </div>

                <div className="border-t border-white/20 pt-4 space-y-2">
                  <div className="flex justify-between text-xs opacity-90">
                    <span>Libros a repetir:</span>
                    <span className="font-semibold">{calculos.ejemplares}</span>
                  </div>
                  <div className="flex justify-between text-xs opacity-90">
                    <span>Páginas/libro:</span>
                    <span className="font-semibold">{calculos.paginas}</span>
                  </div>
                  <div className="flex justify-between text-xs opacity-90">
                    <span>Imposición:</span>
                    <span className="font-semibold">{calculos.label}</span>
                  </div>
                  <div className="flex justify-between text-xs opacity-90">
                    <span>Precio hoja catálogo:</span>
                    <span className="font-semibold">
                      {selectedPaper?.precio_hoja ? `${fmt(selectedPaper.precio_hoja, 4)} €` : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-white/20 pt-4 flex flex-col gap-0.5">
                  <span className="text-xs uppercase opacity-85 font-semibold">Impacto Coste Papel</span>
                  <span className="text-2xl font-bold">{fmt(costeEstimado)} €</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-red-100/70">
                <Calculator size={36} className="mb-2 opacity-50" />
                <p className="text-xs">Introduce cantidad de libros y páginas para calcular el gasto.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Incident History Table */}
      <motion.div variants={itemVariants} className="bg-white border border-[var(--border-color)] rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-5 flex items-center gap-2">
          <FileText size={16} className="text-red-500" />
          Historial de Incidencias Registradas
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--muted)]">
            <Loader2 size={24} className="animate-spin mr-2" />
            <span className="text-sm">Cargando historial...</span>
          </div>
        ) : incidencias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
            <Inbox size={40} className="mb-2 opacity-50" />
            <p className="text-sm">No hay incidencias registradas en el sistema.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-100 text-[var(--muted)] text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Motivo</th>
                  <th className="py-3 px-4">Papel utilizado</th>
                  <th className="py-3 px-4 text-right">Cantidad Libros</th>
                  <th className="py-3 px-4 text-right">Hojas Gastadas</th>
                  <th className="py-3 px-4 text-right">Coste Estimado</th>
                  <th className="py-3 px-4">Observaciones</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm text-[var(--foreground)]">
                {incidencias.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap text-gray-500">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} />
                        {new Date(item.fecha).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-red-600">
                      {item.motivo}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.catalogo_papel ? (
                        <div>
                          <p className="font-medium text-gray-900">{item.catalogo_papel.material}</p>
                          <p className="text-xs text-gray-400">
                            {item.catalogo_papel.gramaje}g/m² | {item.catalogo_papel.formato_impresion}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Papel eliminado del catálogo</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium">
                      {item.cantidad_libros} ({item.formato_libro})
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-600">
                      {Math.ceil(item.hojas_gastadas).toLocaleString('es-ES')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-red-700">
                      {fmt(item.coste_estimado)} €
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-500 max-w-[200px] truncate" title={item.observaciones || ''}>
                      {item.observaciones || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 border-0 bg-transparent cursor-pointer transition-colors"
                        title="Eliminar registro"
                      >
                        {deletingId === item.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
