// =============================================================================
// Filtros y resumen de Solicitudes de Compra.
//
// El selector "Actuando como" que vivía acá se fue: ahora "quién soy" es
// global (CurrentUserBar, montado una vez en App.tsx) y el rol se RESUELVE
// en vez de elegirse — ver shared/auth/CurrentUserContext.tsx. Este
// componente vuelve a ser sólo lo que su nombre dice: filtros y resumen.
//
// Los contadores se ocultan cuando la carga falló: mostrar ceros junto a un
// aviso de error se lee como "hay cero solicitudes" (ver PurchaseDashboard.tsx).
// =============================================================================

import React from 'react';
import { Search } from 'lucide-react';
import { PurchaseRequestStatus, PURCHASE_REQUEST_STATUSES } from '@/types';
import DateRangeBar from '@/shared/components/DateRangeBar';

/** Estados con tarjeta propia en el resumen; el resto cae en "En proceso". */
const SUMMARY_STATUSES: PurchaseRequestStatus[] = [
  'BORRADOR',
  'PENDIENTE_APROBACION',
  'APROBADA',
  'RECHAZADA',
  'CANCELADA',
];

interface PurchaseRequestFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;

  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
  onExport: () => void;
  shown: number;
  total: number;

  hasError: boolean;
  countsByStatus: Record<string, number>;
}

export const PurchaseRequestFilters: React.FC<PurchaseRequestFiltersProps> = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  startDate,
  endDate,
  onDateChange,
  onExport,
  shown,
  total,
  hasError,
  countsByStatus,
}) => (
  <div className="space-y-4 mb-4 shrink-0">
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[220px]">
        <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Código, solicitante, área, cargo, jefe o producto..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">Todos</option>
          {PURCHASE_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>

    <DateRangeBar
      startDate={startDate}
      endDate={endDate}
      onChange={onDateChange}
      onExport={onExport}
      shown={shown}
      total={total}
      accent="cyan"
      label="solicitudes"
    />

    {!hasError && (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {SUMMARY_STATUSES.map((s) => (
          <div key={s} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <p className="text-xs text-slate-500">{s.replace(/_/g, ' ')}</p>
            <p className="text-xl font-bold text-slate-800">{countsByStatus[s] || 0}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <p className="text-xs text-slate-500">En proceso de compra</p>
          <p className="text-xl font-bold text-slate-800">{countsByStatus.EN_PROCESO || 0}</p>
        </div>
      </div>
    )}
  </div>
);

export default PurchaseRequestFilters;
