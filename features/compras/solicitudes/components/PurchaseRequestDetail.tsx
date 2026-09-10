// =============================================================================
// Panel de detalle de una solicitud de compra.
//
// Tiene cuatro bloques apilados: los datos, la caja de decisión del jefe (solo
// si corresponde), el detalle de productos, el panel de proformas y el
// histórico. El de decisión es el único que sabe de permisos, y lo hace con lo
// que le llega en `canDecide` — la regla vive en el hook, no aquí.
// =============================================================================

import React from 'react';
import {
  User,
  Calendar,
  Edit,
  Send,
  Ban,
  UserCog,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  FileText,
  Clock,
} from 'lucide-react';
import {
  Role,
  PurchaseRequest,
  PurchaseRequestHistoryEntry,
  PurchaseRequestStatus,
} from '@/types';
import { formatDate, formatDateTime } from '@/shared/utils/reportUtils';
import StatusChip from '@/shared/components/ui/StatusChip';
import { LoadingState } from '@/shared/components/ui/States';
import { controlClass } from '@/shared/components/ui/Field';
import ProformaPanel from '@/features/compras/proformas/ProformaPanel';

const textareaCls = controlClass('cyan');

interface PurchaseRequestDetailProps {
  request: PurchaseRequest;
  history: PurchaseRequestHistoryEntry[];
  loadingDetail: boolean;
  statusTones: Record<PurchaseRequestStatus, string>;

  canEdit: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  onEdit: (request: PurchaseRequest) => void;
  onSubmitForApproval: (request: PurchaseRequest) => void;
  onCancelRequest: (request: PurchaseRequest) => void;

  canDecide: boolean;
  actingRole: Role;
  actingEmployeeId: string;
  actingEmployeeName: string;
  supervisorMismatch: boolean;
  decisionComment: string;
  onDecisionCommentChange: (v: string) => void;
  deciding: boolean;
  onApprove: (request: PurchaseRequest) => void;
  onReject: (request: PurchaseRequest) => void;

  onNavigateToOrder?: (reference: string) => void;
  onRequestUpdated: (updated: PurchaseRequest) => void | Promise<void>;
}

export const PurchaseRequestDetail: React.FC<PurchaseRequestDetailProps> = ({
  request,
  history,
  loadingDetail,
  statusTones,
  canEdit,
  canSubmit,
  canCancel,
  onEdit,
  onSubmitForApproval,
  onCancelRequest,
  canDecide,
  actingRole,
  actingEmployeeId,
  actingEmployeeName,
  supervisorMismatch,
  decisionComment,
  onDecisionCommentChange,
  deciding,
  onApprove,
  onReject,
  onNavigateToOrder,
  onRequestUpdated,
}) => (
  <>
    <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-slate-800 truncate">{request.code}</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-1">
          <span className="flex items-center gap-1">
            <User size={14} /> {request.requesterName} ({request.position})
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={14} /> {formatDate(request.requestDate)}
          </span>
        </div>
        <StatusChip
          status={request.status}
          tone={statusTones[request.status]}
          size="md"
          className="inline-block mt-2"
        />
      </div>
      <div className="flex gap-2 shrink-0">
        {canEdit && (
          <button
            onClick={() => onEdit(request)}
            className="p-2 border rounded hover:bg-slate-50 text-slate-600"
            title="Editar"
          >
            <Edit size={18} />
          </button>
        )}
        {canSubmit && (
          <button
            onClick={() => onSubmitForApproval(request)}
            className="p-2 border rounded hover:bg-cyan-50 text-cyan-600 border-cyan-200"
            title="Enviar a aprobación"
          >
            <Send size={18} />
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancelRequest(request)}
            className="p-2 border rounded hover:bg-red-50 text-red-600 border-red-200"
            title="Cancelar solicitud"
          >
            <Ban size={18} />
          </button>
        )}
      </div>
    </div>

    <div className="flex-1 p-6 space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm text-slate-700">
        <p>
          <span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">
            Área / Departamento
          </span>
          {request.area}
        </p>
        <p className="mt-3">
          <span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">
            Jefe inmediato
          </span>
          {request.supervisorName}
        </p>
        <p className="mt-3">
          <span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">
            Motivo / Justificación
          </span>
          {request.reason}
        </p>
        {request.rejectionReason && (
          <p className="mt-3 text-rose-700">
            <span className="font-bold text-rose-500 text-xs uppercase block mb-0.5">
              Motivo de rechazo
            </span>
            {request.rejectionReason}
          </p>
        )}
      </div>

      {canDecide && (
        <div className="bg-white rounded-xl border border-cyan-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <UserCog size={16} /> Decisión del jefe inmediato
          </h3>

          {!actingEmployeeId && (
            <p className="mb-3 text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={14} /> Elegí quién sos en "Quién soy" (arriba de todo) para poder
              aprobar o rechazar.
            </p>
          )}
          {supervisorMismatch && (
            <p className="mb-3 text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={14} />
              El jefe inmediato registrado es{' '}
              <strong className="mx-1">{request.supervisorName}</strong>, pero quien decide es{' '}
              <strong className="mx-1">{actingEmployeeName}</strong>. Se permite igual —cualquier
              JEFE puede aprobar—, pero verificá que sea correcto.
            </p>
          )}

          <label className="block text-xs font-medium text-slate-500 mb-1">
            Comentario (opcional para aprobar, obligatorio para rechazar)
          </label>
          <textarea
            value={decisionComment}
            onChange={(e) => onDecisionCommentChange(e.target.value)}
            rows={2}
            className={textareaCls}
          />

          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => onReject(request)}
              disabled={deciding || !actingEmployeeId}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              <XCircle size={18} /> Rechazar
            </button>
            <button
              onClick={() => onApprove(request)}
              disabled={deciding || !actingEmployeeId}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              <CheckCircle2 size={18} /> Aprobar
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
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
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3">Área destino</th>
                  <th className="px-4 py-3">Prioridad</th>
                  <th className="px-4 py-3">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {request.lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-400">
                      Sin productos.
                    </td>
                  </tr>
                ) : (
                  request.lines.map((line) => (
                    <tr key={line.id || line.product}>
                      <td className="px-4 py-3 font-medium">{line.product}</td>
                      <td className="px-4 py-3 text-right">{line.quantity}</td>
                      <td className="px-4 py-3">{line.unit}</td>
                      <td className="px-4 py-3">{line.targetArea || '—'}</td>
                      <td className="px-4 py-3">{line.priority || '—'}</td>
                      <td className="px-4 py-3">{line.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ProformaPanel
        request={request}
        actingRole={actingRole}
        actingEmployeeName={actingEmployeeName}
        onNavigateToOrder={onNavigateToOrder}
        onRequestUpdated={onRequestUpdated}
      />

      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
          <Clock size={16} /> Histórico
        </h3>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {history.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              Sin movimientos registrados.
            </div>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="p-3 text-sm flex justify-between gap-3">
                <div>
                  <p className="text-slate-800">
                    <span className="font-medium">{entry.actorName}</span> · {entry.action}
                  </p>
                  {entry.details && <p className="text-xs text-slate-500 mt-0.5">{entry.details}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">{formatDateTime(entry.date)}</p>
                  <StatusChip
                    status={entry.status}
                    tone={statusTones[entry.status]}
                    className="inline-block mt-1"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  </>
);

export default PurchaseRequestDetail;
