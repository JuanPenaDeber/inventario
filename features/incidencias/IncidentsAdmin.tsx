import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Download,
  RotateCcw,
  Pencil,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  AREAS,
  ARTICULOS,
  ESTADOS,
  ESTADO_CHIP,
  TECNICOS,
  DEFAULT_RANGE_DAYS,
  getIncidents,
  updateIncident,
  downloadExcelReport,
  getErrorMessage,
  type Estado,
  type Incident,
} from '@/features/incidencias/incidentsService';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { today, daysAgo, isWithinDateRange, formatDateTime } from '@/shared/utils/reportUtils';
import { usePagination } from '@/shared/hooks/usePagination';
import TablePagination from '@/shared/components/TablePagination';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';

interface DashboardFilters {
  startDate: string;
  endDate: string;
  usuario: string;
  area: string;
  articulo: string;
  estado: string;
}

const defaultFilters = (): DashboardFilters => ({
  startDate: daysAgo(DEFAULT_RANGE_DAYS),
  endDate: today(),
  usuario: '',
  area: '',
  articulo: '',
  estado: '',
});

const inputBase =
  'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500';

/** Panel administrativo de incidencias: filtros, tabla, edición y exportación. */
export default function IncidentsAdmin() {
  const { can } = useCurrentUser();
  // Este panel documentaba "solo lo usan administradores" como si fuera una
  // regla, pero no había ningún control real — cualquier rol que llegara acá
  // podía editar el estado de una incidencia. incident.manage en
  // permissions.ts ya lo limita a SISTEMAS/ADMINISTRADOR.
  const canManage = can('incident.manage');
  const {
    data: incidents,
    setData: setIncidents,
    loading,
    error,
    setError,
    refresh: load,
  } = useAsyncData<Incident[]>(getIncidents, [], {
    errorMessage: 'No se pudieron cargar las incidencias.',
    getErrorMessage,
  });

  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Incident | null>(null);

  // Filtrado en el cliente: fecha (createdAt) + usuario/área/artículo/estado.
  const filtered = useMemo(() => {
    const usuario = filters.usuario.trim().toLowerCase();
    return incidents.filter((inc) => {
      if (!isWithinDateRange(inc.createdAt, filters.startDate, filters.endDate))
        return false;
      if (usuario && !inc.usuario.toLowerCase().includes(usuario)) return false;
      if (filters.area && inc.area !== filters.area) return false;
      if (filters.articulo && inc.articulo !== filters.articulo) return false;
      if (filters.estado && inc.estado !== filters.estado) return false;
      return true;
    });
  }, [incidents, filters]);

  const handleSaved = (updated: Incident) => {
    setIncidents((prev) =>
      prev.map((i) => (i._id === updated._id ? updated : i)),
    );
    setToast(`Incidencia ${updated.ticketId} actualizada.`);
    window.setTimeout(() => setToast(null), 4000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadExcelReport(filters.startDate, filters.endDate);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo generar el reporte Excel.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado + acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Incidencias registradas
          </h2>
          <p className="text-sm text-slate-500">
            Mostrando {filtered.length} de {incidents.length} incidencias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
          >
            {downloading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Download size={16} />
            )}
            Exportar Excel
          </button>
        </div>
      </div>

      <FiltersBar
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters())}
      />

      <StatCards incidents={filtered} />

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : (
        <IncidentsTable incidents={filtered} onEdit={setEditing} canManage={canManage} />
      )}

      <EditIncidentModal
        incident={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
            <CheckCircle2 size={18} />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Barra de filtros
// =============================================================================

interface FiltersBarProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  onReset: () => void;
}

function FiltersBar({ filters, onChange, onReset }: FiltersBarProps) {
  const set =
    (field: keyof DashboardFilters) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => onChange({ ...filters, [field]: e.target.value });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Desde
          </label>
          <input
            type="date"
            className={inputBase}
            value={filters.startDate}
            onChange={set('startDate')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Hasta
          </label>
          <input
            type="date"
            className={inputBase}
            value={filters.endDate}
            onChange={set('endDate')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Usuario
          </label>
          <input
            className={inputBase}
            placeholder="Buscar por nombre"
            value={filters.usuario}
            onChange={set('usuario')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Área
          </label>
          <select className={inputBase} value={filters.area} onChange={set('area')}>
            <option value="">Todas</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Artículo
          </label>
          <select
            className={inputBase}
            value={filters.articulo}
            onChange={set('articulo')}
          >
            <option value="">Todos</option>
            {ARTICULOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Estado
          </label>
          <select
            className={inputBase}
            value={filters.estado}
            onChange={set('estado')}
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <RotateCcw size={15} />
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Tarjetas resumen
// =============================================================================

function StatCards({ incidents }: { incidents: Incident[] }) {
  const byEstado = (estado: string) =>
    incidents.filter((i) => i.estado === estado).length;

  const cards = [
    { label: 'Total', value: incidents.length, color: 'text-slate-900' },
    { label: 'Pendiente', value: byEstado('Pendiente'), color: 'text-amber-500' },
    { label: 'En proceso', value: byEstado('En proceso'), color: 'text-blue-600' },
    { label: 'Solucionado', value: byEstado('Solucionado'), color: 'text-green-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-sm text-slate-500">{c.label}</p>
          <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Tabla de incidencias con paginación
// =============================================================================

interface IncidentsTableProps {
  incidents: Incident[];
  onEdit: (incident: Incident) => void;
  /** incident.manage en permissions.ts — SISTEMAS/ADMINISTRADOR. */
  canManage: boolean;
}

const ROWS_OPTIONS = [10, 25, 50];

function IncidentsTable({ incidents, onEdit, canManage }: IncidentsTableProps) {
  // Paginación (shared/hooks/usePagination.ts). El hook acota solo la página
  // fuera de rango, cosa que esta copia no hacía: al reducirse la lista por un
  // filtro, la tabla quedaba en blanco hasta el siguiente reset.
  const pagination = usePagination(incidents, ROWS_OPTIONS[0]);
  const paginated = pagination.pageItems;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Ticket</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Fecha</th>
              <th className="px-4 py-3 font-semibold">Usuario</th>
              <th className="px-4 py-3 font-semibold">Área</th>
              <th className="px-4 py-3 font-semibold">Artículo</th>
              <th className="px-4 py-3 font-semibold">Problema</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  No hay incidencias que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              paginated.map((inc) => (
                <tr
                  key={inc._id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">
                    {inc.ticketId}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {formatDateTime(inc.createdAt)}
                  </td>
                  <td className="px-4 py-3">{inc.usuario}</td>
                  <td className="px-4 py-3">{inc.area}</td>
                  <td className="px-4 py-3">{inc.articulo}</td>
                  <td
                    className="px-4 py-3 max-w-[280px] truncate"
                    title={inc.problema}
                  >
                    {inc.problema}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${ESTADO_CHIP[inc.estado]}`}
                    >
                      {inc.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {canManage && (
                    <button
                      onClick={() => onEdit(inc)}
                      title="Editar"
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                    >
                      <Pencil size={16} />
                    </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination pagination={pagination} options={ROWS_OPTIONS} selectId="rows-per-page-incidencias" />
    </div>
  );
}

// =============================================================================
// Modal de edición
// =============================================================================

interface EditIncidentModalProps {
  incident: Incident | null;
  onClose: () => void;
  onSaved: (updated: Incident) => void;
}

function EditIncidentModal({
  incident,
  onClose,
  onSaved,
}: EditIncidentModalProps) {
  const [estado, setEstado] = useState<Estado>('Pendiente');
  const [tecnico, setTecnico] = useState('');
  const [solucion, setSolucion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (incident) {
      setEstado(incident.estado);
      setTecnico(incident.tecnico ?? '');
      setSolucion(incident.solucion ?? '');
      setError(null);
    }
  }, [incident]);

  if (!incident) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateIncident(incident._id, {
        estado,
        tecnico: tecnico.trim(),
        solucion: solucion.trim(),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo actualizar la incidencia.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Título */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Editar incidencia
          </h3>
          <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {incident.ticketId}
          </span>
          <button
            onClick={saving ? undefined : onClose}
            className="ml-auto text-slate-400 hover:text-slate-700 disabled:opacity-40"
            disabled={saving}
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido */}
        <div className="px-6 py-4">
          <div className="space-y-1 text-sm text-slate-600 mb-3">
            <p>
              <strong>Usuario:</strong> {incident.usuario} · {incident.area}
            </p>
            <p>
              <strong>Artículo:</strong> {incident.articulo}
            </p>
            <p>
              <strong>Problema:</strong> {incident.problema}
            </p>
          </div>
          <hr className="border-slate-200 mb-4" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Estado
              </label>
              <select
                className={inputBase}
                value={estado}
                onChange={(e) => setEstado(e.target.value as Estado)}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Técnico
              </label>
              <select
                className={inputBase}
                value={tecnico}
                onChange={(e) => setTecnico(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {TECNICOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {/* Conserva un técnico previo que ya no esté en la lista. */}
                {tecnico && !TECNICOS.includes(tecnico as any) && (
                  <option value={tecnico}>{tecnico}</option>
                )}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Solución
              </label>
              <textarea
                className={`${inputBase} resize-y`}
                rows={3}
                value={solucion}
                onChange={(e) => setSolucion(e.target.value)}
                placeholder="Detalle de la solución aplicada"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
