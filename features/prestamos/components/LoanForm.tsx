// =============================================================================
// Formulario de préstamo: datos a la izquierda, selector de equipos a la
// derecha.
//
// Dos campos de fecha de devolución que no son lo mismo y conviene no
// confundir: la *esperada* es un compromiso (`date`), la *real* es el cierre
// efectivo (`datetime-local`) y normalmente la rellena la devolución parcial,
// no una persona escribiéndola.
// =============================================================================

import React from 'react';
import { User, UserPlus } from 'lucide-react';
import { Employee, InventoryItem } from '@/types';
import ItemPicker from '@/shared/components/ItemPicker';
import { controlClass } from '@/shared/components/ui/Field';

const inputCls = controlClass('orange');
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

interface LoanFormProps {
  isEditing: boolean;
  employees: Employee[];
  availableItems: InventoryItem[];

  name: string;
  onNameChange: (v: string) => void;
  fechaPrestamo: string;
  onFechaPrestamoChange: (v: string) => void;
  solicitanteId: string;
  onSolicitanteChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onAddQuickEmployee: () => void;
  borrowerContact: string;
  responsableId: string;
  onResponsableChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  entregadoporId: string;
  onEntregadoporChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  fechaEsperadaDevolucion: string;
  onFechaEsperadaChange: (v: string) => void;
  fechaHoraDevolucion: string;
  onFechaHoraDevolucionChange: (v: string) => void;
  observations: string;
  onObservationsChange: (v: string) => void;

  selectedItemIds: Set<string>;
  onToggleItem: (id: string) => void;
  itemSearch: string;
  onItemSearchChange: (v: string) => void;

  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const LoanForm: React.FC<LoanFormProps> = ({
  isEditing,
  employees,
  availableItems,
  name,
  onNameChange,
  fechaPrestamo,
  onFechaPrestamoChange,
  solicitanteId,
  onSolicitanteChange,
  onAddQuickEmployee,
  borrowerContact,
  responsableId,
  onResponsableChange,
  entregadoporId,
  onEntregadoporChange,
  fechaEsperadaDevolucion,
  onFechaEsperadaChange,
  fechaHoraDevolucion,
  onFechaHoraDevolucionChange,
  observations,
  onObservationsChange,
  selectedItemIds,
  onToggleItem,
  itemSearch,
  onItemSearchChange,
  saving,
  onSubmit,
}) => (
  <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden no-print">
    <div className="lg:col-span-1 h-full overflow-y-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2 border-b pb-2">
          <User size={20} className="text-orange-500" />{' '}
          {isEditing ? 'Editar Préstamo' : 'Nuevo Préstamo'}
        </h2>

        <form id="loanForm" onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Referencia</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Ej: Préstamo Cámaras Evento X"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Fecha de Préstamo</label>
            <input
              type="date"
              required
              value={fechaPrestamo}
              onChange={(e) => onFechaPrestamoChange(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Solicitante (Empleado)</label>
            <div className="flex gap-2">
              <select
                required
                value={solicitanteId}
                onChange={onSolicitanteChange}
                className={inputCls}
              >
                <option value="">Seleccionar Empleado</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onAddQuickEmployee}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg"
                title="Nuevo Empleado"
              >
                <UserPlus size={20} />
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Departamento</label>
            {/* Se rellena solo al elegir el solicitante: es su área. */}
            <input
              type="text"
              readOnly
              value={borrowerContact}
              className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg outline-none cursor-not-allowed"
            />
          </div>

          <div>
            <label className={labelCls}>Responsable</label>
            <select
              required
              value={responsableId}
              onChange={onResponsableChange}
              className={inputCls}
            >
              <option value="">Seleccionar Solicitante</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Entregado Por</label>
            <select
              required
              value={entregadoporId}
              onChange={onEntregadoporChange}
              className={inputCls}
            >
              <option value="">Seleccionar Autorizador</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Fecha Esperada de Devolución</label>
            <input
              type="date"
              value={fechaEsperadaDevolucion}
              onChange={(e) => onFechaEsperadaChange(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Fecha Real de Devolución (Cierre)</label>
            <input
              type="datetime-local"
              value={fechaHoraDevolucion}
              onChange={(e) => onFechaHoraDevolucionChange(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Observaciones</label>
            <textarea
              value={observations}
              onChange={(e) => onObservationsChange(e.target.value)}
              className={inputCls}
              rows={3}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-600 text-sm">Equipos Seleccionados:</span>
              <span className="font-bold text-slate-900 bg-orange-100 px-2 py-0.5 rounded text-sm">
                {selectedItemIds.size}
              </span>
            </div>
            <button
              type="submit"
              disabled={saving || selectedItemIds.size === 0}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-orange-500/20"
            >
              {saving ? 'Procesando...' : isEditing ? 'Guardar Cambios' : 'Confirmar Préstamo'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <ItemPicker
      className="lg:col-span-2"
      items={availableItems}
      selectedIds={selectedItemIds}
      onToggle={onToggleItem}
      accent="orange"
      search={itemSearch}
      onSearchChange={onItemSearchChange}
      renderBadge={(item) =>
        item.status === 'asignado' ? (
          <span className="font-bold bg-indigo-50 text-indigo-600 px-1 rounded text-[10px]">
            ASIGNADO
          </span>
        ) : null
      }
    />
  </div>
);

export default LoanForm;
