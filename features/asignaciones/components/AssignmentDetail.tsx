// =============================================================================
// Panel de detalle de una asignación: cabecera con acciones y tabla de equipos.
//
// La columna "Estado Actual" compara el empleado del equipo con el de la
// asignación: un equipo puede haber sido reasignado a otra persona después de
// firmada el acta, y el acta sigue existiendo. Distinguirlo es el motivo de que
// esta tabla no sea la misma que la del documento impreso.
// =============================================================================

import React from 'react';
import { Building2, Calendar, Edit, Printer } from 'lucide-react';
import { Assignment, InventoryItem } from '@/types';

interface AssignmentDetailProps {
  assignment: Assignment;
  items: InventoryItem[];
  loadingItems: boolean;
  onEdit: () => void;
  onPrint: () => void;
}

export const AssignmentDetail: React.FC<AssignmentDetailProps> = ({
  assignment,
  items,
  loadingItems,
  onEdit,
  onPrint,
}) => (
  <>
    <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{assignment.employeeName}</h2>
        <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
          <span className="flex items-center gap-1">
            <Building2 size={14} /> {assignment.equipo}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={14} /> {new Date(assignment.fecha).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="p-2 border rounded hover:bg-slate-50 text-slate-600"
          title="Editar Asignación"
        >
          <Edit size={18} />
        </button>
        <button
          onClick={onPrint}
          className="p-2 border rounded hover:bg-slate-50 text-slate-600"
          title="Imprimir Acta"
        >
          <Printer size={18} />
        </button>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto p-6">
      {assignment.description && (
        <div className="mb-6 p-3 ">
          <span className="font-bold">Descripción:</span> {assignment.description}
        </div>
      )}
      {assignment.observacion && (
        <div className="mb-6 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
          <span className="font-bold">Observaciones:</span> {assignment.observacion}
        </div>
      )}

      <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Equipos en Custodia</h3>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loadingItems ? (
          <div className="p-4 text-center text-slate-400">Cargando equipos...</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3">Equipo</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Serial</th>
                <th className="px-4 py-3">Estado Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-center text-slate-400 italic">
                    No hay equipos asociados.
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 font-medium">{i.name}</td>
                    <td className="px-4 py-3">{i.category}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{i.serie}</td>
                    <td className="px-4 py-3">
                      {i.assignedEmployeeId === assignment.employeeId ? (
                        <span className="text-green-600 font-bold text-xs bg-green-50 px-2 py-0.5 rounded">
                          Vigente
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">
                          Reasignado a {i.assignedEmployeeName || 'Nadie'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  </>
);

export default AssignmentDetail;
