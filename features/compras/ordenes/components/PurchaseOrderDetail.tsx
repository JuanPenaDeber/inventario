// =============================================================================
// Panel de detalle de una orden de compra.
//
// La tabla de pantalla tiene dos columnas que el documento impreso no tiene
// —"Solicitado" y "Recibido"— porque en pantalla interesa el avance de la
// recepción, y en el papel que se firma interesa lo que se pidió.
//
// El bloque de recepción solo aparece si la orden está APROBADA; la misma regla
// la aplica `receivePurchaseOrder` del lado del servicio, así que esconder el
// bloque es comodidad, no seguridad.
// =============================================================================

import React from 'react';
import { Building2, Calendar, Edit, Printer, Ban, FileText, PackageCheck } from 'lucide-react';
import { PurchaseOrder, PurchaseOrderStatus } from '@/types';
import { LoadingState } from '@/shared/components/ui/States';
import { formatDate } from '@/shared/utils/reportUtils';
import StatusChip from '@/shared/components/ui/StatusChip';

interface PurchaseOrderDetailProps {
  order: PurchaseOrder;
  statusTones: Record<PurchaseOrderStatus, string>;
  loadingDetail: boolean;

  canEdit: boolean;
  canCancel: boolean;
  canReceive: boolean;
  onEdit: (order: PurchaseOrder) => void;
  onPrint: () => void;
  onCancel: (order: PurchaseOrder) => void;

  receivedQuantities: Record<string, number>;
  onReceivedQuantityChange: (lineId: string, quantity: number) => void;
  receiving: boolean;
  onReceive: () => void;
}

export const PurchaseOrderDetail: React.FC<PurchaseOrderDetailProps> = ({
  order,
  statusTones,
  loadingDetail,
  canEdit,
  canCancel,
  canReceive,
  onEdit,
  onPrint,
  onCancel,
  receivedQuantities,
  onReceivedQuantityChange,
  receiving,
  onReceive,
}) => (
  <>
    <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-slate-800 truncate">{order.reference}</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-1">
          <span className="flex items-center gap-1">
            <Building2 size={14} /> {order.providerName || order.providerId}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={14} /> {formatDate(order.requestDate)}
          </span>
        </div>
        <StatusChip
          status={order.status}
          tone={statusTones[order.status]}
          size="md"
          className="inline-block mt-2"
        />
      </div>
      <div className="flex gap-2 shrink-0">
        {canEdit && (
          <button
            onClick={() => onEdit(order)}
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
        {canCancel && (
          <button
            onClick={() => onCancel(order)}
            className="p-2 border rounded hover:bg-red-50 text-red-600 border-red-200"
            title="Cancelar orden"
          >
            <Ban size={18} />
          </button>
        )}
      </div>
    </div>

    <div className="flex-1 p-6">
      {order.notes && (
        <div className="mb-6 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
          <span className="font-bold">Observaciones:</span> {order.notes}
        </div>
      )}

      <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
        <FileText size={16} /> Detalle de productos
      </h3>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto custom-scrollbar">
        {loadingDetail ? (
          <LoadingState message="Cargando detalle..." />
        ) : (
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Solicitado</th>
                <th className="px-4 py-3 text-right">Recibido</th>
                <th className="px-4 py-3 text-right">Precio unit.</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400">
                    Sin productos.
                  </td>
                </tr>
              ) : (
                order.lines.map((line) => (
                  <tr key={line.id || line.description}>
                    <td className="px-4 py-3 font-medium">{line.description}</td>
                    <td className="px-4 py-3 text-slate-500">{line.category}</td>
                    <td className="px-4 py-3 text-right">{line.quantityRequested}</td>
                    <td className="px-4 py-3 text-right">
                      {/* Verde = completo, ámbar = aún falta por recibir. */}
                      <span
                        className={
                          line.quantityReceived >= line.quantityRequested
                            ? 'text-green-600 font-medium'
                            : 'text-amber-600'
                        }
                      >
                        {line.quantityReceived}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {order.currency} {line.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {order.currency} {line.subtotal.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>
              {order.currency} {order.subtotal.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Impuesto ({order.taxRate}%)</span>
            <span>
              {order.currency} {order.taxAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-1">
            <span>Total</span>
            <span>
              {order.currency} {order.total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {canReceive && (
        <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
            <PackageCheck size={16} /> Registrar recepción
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Indica la cantidad total recibida por producto (permite recepción parcial). Esto no crea
            equipos en el inventario automáticamente.
          </p>
          <div className="space-y-2">
            {order.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex-1 truncate">{line.description}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  de {line.quantityRequested}
                </span>
                <input
                  type="number"
                  min={0}
                  max={line.quantityRequested}
                  value={receivedQuantities[line.id] ?? line.quantityReceived}
                  onChange={(e) => onReceivedQuantityChange(line.id, Number(e.target.value))}
                  className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-right focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onReceive}
              disabled={receiving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              {receiving ? 'Guardando...' : 'Registrar recepción'}
            </button>
          </div>
        </div>
      )}
    </div>
  </>
);

export default PurchaseOrderDetail;
