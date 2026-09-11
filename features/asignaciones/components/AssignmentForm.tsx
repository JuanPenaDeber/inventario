// =============================================================================
// Formulario de asignación: datos del empleado a la izquierda, selector de
// equipos a la derecha.
//
// Recibe todo por props desde useAssignmentManager(): no tiene estado propio,
// así que lo que se ve aquí y lo que se guarda no pueden desincronizarse.
// =============================================================================

import React from 'react';
import { User } from 'lucide-react';
import { Employee, InventoryItem } from '@/types';
import ItemPicker from '@/shared/components/ItemPicker';
import { controlClass } from '@/shared/components/ui/Field';

const inputCls = controlClass('indigo');
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

interface AssignmentFormProps {
  isEditing: boolean;
  employees: Employee[];
  availableItems: InventoryItem[];

  name: string;
  onNameChange: (v: string) => void;
  employeeId: string;
  employeeName: string;
  onEmployeeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  equipo: string;
  onEquipoChange: (v: string) => void;
  authorizerId: string;
  onAuthorizerChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  fecha: string;
  onFechaChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  observacion: string;
  onObservacionChange: (v: string) => void;

  selectedItemIds: Set<string>;
  onToggleItem: (id: string) => void;
  itemSearch: string;
  onItemSearchChange: (v: string) => void;

  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const AssignmentForm: React.FC<AssignmentFormProps> = ({
  isEditing,
  employees,
  availableItems,
  name,
  onNameChange,
  employeeId,
  employeeName,
  onEmployeeChange,
  equipo,
  onEquipoChange,
  authorizerId,
  onAuthorizerChange,
  fecha,
  onFechaChange,
  description,
  onDescriptionChange,
  observacion,
  onObservacionChange,
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
          <User size={20} className="text-indigo-500" />{' '}
          {isEditing ? 'Editar Datos' : 'Datos del Empleado'}
        </h2>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Referencia</label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className={inputCls}
              placeholder="Referencia"
            />
          </div>

          <div>
            <label className={labelCls}>Asignado a</label>
            <div className="flex gap-2">
              <select required value={employeeId} onChange={onEmployeeChange} className={inputCls}>
                <option value="">Seleccionar...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Departamento / Area</label>
            <input
              type="text"
              value={equipo}
              onChange={(e) => onEquipoChange(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Entregado Por</label>
            <select required value={authorizerId} onChange={onAuthorizerChange} className={inputCls}>
              <option value="">Seleccionar Autorizador</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Fecha de asignación</label>
            <input
              type="date"
              required
              value={fecha}
              onChange={(e) => onFechaChange(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Descripción</label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Notas adicionales..."
            />
          </div>

          <div>
            <label className={labelCls}>Observaciones</label>
            <textarea
              value={observacion}
              onChange={(e) => onObservacionChange(e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Notas adicionales..."
            />
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <button
              type="submit"
              disabled={saving || selectedItemIds.size === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-2.5 rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all"
            >
              {saving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Generar Acta de Entrega'}
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
      accent="indigo"
      search={itemSearch}
      onSearchChange={onItemSearchChange}
      searchPlaceholder="Buscar equipos..."
      renderBadge={(item) =>
        item.assignedEmployeeName && item.assignedEmployeeName !== employeeName ? (
          <span className="text-orange-600 font-bold bg-orange-50 px-1 rounded">Reasignar</span>
        ) : null
      }
    />
  </div>
);

export default AssignmentForm;
