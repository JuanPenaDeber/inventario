// =============================================================================
// Barra de filtros y resumen de Órdenes de Compra.
//
// Los contadores por estado y los totales por moneda se ocultan cuando la carga
// falló: mostrar ceros junto a un aviso de error se lee como "hay cero órdenes"
// en vez de "no se pudo cargar" (mismo criterio que PurchaseDashboard.tsx).
// =============================================================================

import React from 'react';
import { Search } from 'lucide-react';
import { PURCHASE_ORDER_STATUSES } from '@/types';
import DateRangeBar from '@/shared/components/DateRangeBar';

interface PurchaseOrderFiltersProps {
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

  /** Cuando hay error no se dibujan los resúmenes numéricos. */
  hasError: boolean;
  countsByStatus: Record<string, number>;
  totalsByCurrency: Record<string, number>;
}

export const PurchaseOrderFilters: React.FC<PurchaseOrderFiltersProps> = ({
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
  totalsByCurrency,
}) => (
  <div className="no-print space-y-4 mb-4 shrink-0">
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[220px]">
        <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Referencia, proveedor o solicitante..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Todos</option>
          {PURCHASE_ORDER_STATUSES.map((s) => (
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
      accent="teal"
      label="órdenes"
    />

    {!hasError && (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {PURCHASE_ORDER_STATUSES.map((s) => (
          <div key={s} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <p className="text-xs text-slate-500">{s}</p>
            <p className="text-xl font-bold text-slate-800">{countsByStatus[s] || 0}</p>
          </div>
        ))}
      </div>
    )}

    {!hasError && Object.keys(totalsByCurrency).length > 0 && (
      <div className="flex flex-wrap gap-3">
        {Object.entries(totalsByCurrency).map(([currency, amount]) => (
          <div
            key={currency}
            className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2 text-sm text-teal-800"
          >
            <span className="font-medium">Total {currency}:</span> {amount.toFixed(2)}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default PurchaseOrderFilters;
