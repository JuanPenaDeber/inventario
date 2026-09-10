// =============================================================================
// Panel de detalle de un préstamo, con la devolución equipo por equipo.
//
// La casilla solo aparece en los equipos que todavía no volvieron: un equipo
// devuelto no se puede "des-devolver" desde aquí, y mostrar una casilla marcada
// e inerte invitaba a intentarlo.
//
// El botón de registrar devolución se muestra siempre que el préstamo siga
// activo —aunque no haya nada marcado— y se deshabilita en ese caso, para que
// se vea que la acción existe antes de elegir equipos.
// =============================================================================

import React from 'react';
import {
  User,
  Clock,
  ShieldCheck,
  Edit,
  Printer,
  FileText,
  CheckCircle,
  CheckSquare,
  Square,
} from 'lucide-react';
import { InventoryItem, Loan } from '@/types';
import { LoadingState } from '@/shared/components/ui/States';

interface LoanDetailProps {
  loan: Loan;
  items: InventoryItem[];
  loadingItems: boolean;
  getEmployeeName: (id?: string) => string;

  itemsToReturn: Set<string>;
  onToggleReturn: (itemId: string) => void;
  onPartialReturn: () => void;
  saving: boolean;
  /** loan.return en permissions.ts — SISTEMAS/ADMINISTRADOR. */
  canReturn: boolean;

  onEdit: () => void;
  /** loan.edit en permissions.ts — SISTEMAS/ADMINISTRADOR. */
  canEdit: boolean;
  onPrint: () => void;
}

export const LoanDetail: React.FC<LoanDetailProps> = ({
  loan,
  items,
  loadingItems,
  getEmployeeName,
  itemsToReturn,
  onToggleReturn,
  onPartialReturn,
  saving,
  canReturn,
  onEdit,
  canEdit,
  onPrint,
}) => {
  const devolucionEsperada = loan.fechaEsperadaDevolucion || loan.fechaHoraDevolucion;
  const activo = loan.status !== 'DEVUELTO' && loan.status !== 'FINALIZADO';

  return (
    <>
      <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {getEmployeeName(loan.solicitanteId)}
          </h2>
          <p className="text-sm text-slate-600 font-medium">{loan.name}</p>
          <div className="flex items-center gap-4 text-sm text-slate-500 mt-2">
            <span className="flex items-center gap-1">
              <User size={14} /> {loan.area}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={14} /> Devolución:{' '}
              {devolucionEsperada
                ? new Date(devolucionEsperada).toISOString().split('T')[0]
                : 'Indefinido'}
            </span>
          </div>
          {loan.entregadoporId && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <ShieldCheck size={12} /> Entregado por: {getEmployeeName(loan.entregadoporId)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canEdit && (
          <button
            onClick={onEdit}
            className="p-2 border rounded hover:bg-slate-50 text-slate-600"
            title="Editar"
          >
            <Edit size={18} />
          </button>
          )}
          <button
            onClick={onPrint}
            className="p-2 border rounded hover:bg-slate-50 text-slate-600"
            title="Imprimir"
          >
            <Printer size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loan.description && (
          <div className="mb-6 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
            <span className="font-bold">Observaciones:</span> {loan.description}
          </div>
        )}

        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
          <FileText size={16} /> Equipos Prestados
        </h3>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loadingItems ? (
            <LoadingState message="Cargando equipos..." />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Equipo</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">
                      No hay equipos en este préstamo (Todos devueltos).
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={item.fechaDevolucion ? 'bg-green-50/30' : ''}>
                      <td className="px-4 py-3">
                        {!item.fechaDevolucion && (
                          <button
                            onClick={() => onToggleReturn(item.id)}
                            className="text-slate-300 hover:text-blue-500"
                            aria-label={`Marcar ${item.name} para devolución`}
                          >
                            {itemsToReturn.has(item.id) ? (
                              <CheckSquare size={18} className="text-blue-600" />
                            ) : (
                              <Square size={18} />
                            )}
                          </button>
                        )}
                        {item.fechaDevolucion && (
                          <CheckCircle size={18} className="text-green-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{item.serie}</td>
                      <td className="px-4 py-3">
                        {item.fechaDevolucion ? (
                          <div>
                            <span className="text-green-600 font-bold text-xs bg-green-100 px-2 py-0.5 rounded">
                              DEVUELTO
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {new Date(item.fechaDevolucion).toLocaleDateString()}{' '}
                              {new Date(item.fechaDevolucion).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-orange-600 font-medium text-xs">PENDIENTE</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {activo && items.length > 0 && canReturn && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={onPartialReturn}
              disabled={saving || itemsToReturn.size === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <CheckCircle size={18} />
              Registrar Devolución ({itemsToReturn.size})
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default LoanDetail;
