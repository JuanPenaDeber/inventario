// =============================================================================
// "Actuando como", filtros y resumen de Solicitudes de Compra.
//
// El selector "Actuando como" NO es autenticación: elige qué acciones se
// muestran, nada más. Está aquí arriba, visible, precisamente para que quede
// claro que es una simulación de roles y no una sesión (ver ARCHITECTURE.md).
//
// Los contadores se ocultan cuando la carga falló: mostrar ceros junto a un
// aviso de error se lee como "hay cero solicitudes" (ver PurchaseDashboard.tsx).
// =============================================================================

import React from 'react';
import { Search, UserCog } from 'lucide-react';
import {
  Employee,
  PurchaseFlowRole,
  PurchaseRequestStatus,
  PURCHASE_FLOW_ROLES,
  PURCHASE_REQUEST_STATUSES,
} from '@/types';
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
  employees: Employee[];
  actingRole: PurchaseFlowRole;
  onActingRoleChange: (role: PurchaseFlowRole) => void;
  actingEmployeeId: string;
  onActingEmployeeChange: (id: string) => void;

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
  employees,
  actingRole,
  onActingRoleChange,
  actingEmployeeId,
  onActingEmployeeChange,
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
  <>
    <div className="mb-4 shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <UserCog size={16} className="text-slate-400" />
      <span className="text-slate-500">Actuando como:</span>
      <select
        value={actingRole}
        onChange={(e) => onActingRoleChange(e.target.value as PurchaseFlowRole)}
        className="px-2 py-1 border border-slate-200 rounded-md bg-slate-50 text-slate-700"
      >
        {PURCHASE_FLOW_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        value={actingEmployeeId}
        onChange={(e) => onActingEmployeeChange(e.target.value)}
        className="px-2 py-1 border border-slate-200 rounded-md bg-slate-50 text-slate-700"
      >
        <option value="">Sin seleccionar</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
          </option>
        ))}
      </select>
    </div>

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
  </>
);

export default PurchaseRequestFilters;
