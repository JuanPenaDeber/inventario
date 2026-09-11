// =============================================================================
// Módulo de Solicitudes de Compra.
//
// Flujo completo: solicitud → aprobación → cotización → selección → orden.
// Este archivo es solo el orquestador; lo demás vive donde corresponde:
//
//   usePurchaseRequestManager.ts        estado, flujo de estados y acciones
//   PurchaseRequestForm                 alta y edición (ya existía aparte)
//   components/PurchaseRequestFilters   "Actuando como", filtros y resumen
//   components/PurchaseRequestDetail    panel derecho: datos, decisión,
//                                       productos, proformas e histórico
// =============================================================================

import React from 'react';
import { FileText, Plus } from 'lucide-react';
import { PurchaseRequestStatus } from '@/types';
import { formatDate } from '@/shared/utils/reportUtils';
import MasterDetail from '@/shared/components/MasterDetail';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { NoSelection, ErrorBanner } from '@/shared/components/ui/States';
import StatusChip from '@/shared/components/ui/StatusChip';
import PurchaseRequestForm from '@/features/compras/solicitudes/PurchaseRequestForm';
import { usePurchaseRequestManager } from '@/features/compras/solicitudes/usePurchaseRequestManager';
import PurchaseRequestFilters from '@/features/compras/solicitudes/components/PurchaseRequestFilters';
import PurchaseRequestDetail from '@/features/compras/solicitudes/components/PurchaseRequestDetail';

const STATUS_CHIP: Record<PurchaseRequestStatus, string> = {
  BORRADOR: 'text-slate-600 border-slate-300 bg-slate-50',
  PENDIENTE_APROBACION: 'text-amber-600 border-amber-300 bg-amber-50',
  APROBADA: 'text-emerald-600 border-emerald-300 bg-emerald-50',
  RECHAZADA: 'text-rose-600 border-rose-300 bg-rose-50',
  EN_COTIZACION: 'text-blue-600 border-blue-300 bg-blue-50',
  COTIZADA: 'text-indigo-600 border-indigo-300 bg-indigo-50',
  EN_EVALUACION: 'text-violet-600 border-violet-300 bg-violet-50',
  APROBADA_PARA_COMPRA: 'text-teal-600 border-teal-300 bg-teal-50',
  ORDEN_GENERADA: 'text-cyan-600 border-cyan-300 bg-cyan-50',
  FINALIZADA: 'text-green-600 border-green-300 bg-green-50',
  CANCELADA: 'text-red-600 border-red-300 bg-red-50',
};

interface PurchaseRequestManagerProps {
  /** Id de solicitud a preseleccionar al montar (llegada desde otro módulo, ej. el Dashboard). */
  initialRequestId?: string;
  /** Avisa al padre que ya se aplicó `initialRequestId`, para no reaplicarlo en una visita posterior. */
  onConsumeInitialRequest?: () => void;
  /** Navega al módulo de Órdenes de Compra ya buscando la referencia dada (ver ProformaPanel). */
  onNavigateToOrder?: (reference: string) => void;
}

const PurchaseRequestManager: React.FC<PurchaseRequestManagerProps> = ({
  initialRequestId,
  onConsumeInitialRequest,
  onNavigateToOrder,
}) => {
  const m = usePurchaseRequestManager({ initialRequestId, onConsumeInitialRequest });

  if (m.viewMode === 'form') {
    return (
      <PurchaseRequestForm
        initialData={m.editingRequest || undefined}
        onSave={m.handleSaveRequest}
        onCancel={() => {
          m.setViewMode('list');
          m.setEditingRequest(null);
        }}
        saving={m.saving}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-100 text-cyan-600 rounded-xl">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Solicitudes de Compra</h1>
            <p className="text-slate-500 text-sm">
              Solicitud → aprobación → cotización → selección → orden de compra.
            </p>
          </div>
        </div>
        <button
          onClick={m.handleCreate}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm shadow-cyan-500/30"
        >
          <Plus size={18} /> Nueva Solicitud
        </button>
      </div>

      {m.error && (
        <ErrorBanner
          message={m.error}
          onRetry={m.refresh}
          onDismiss={() => m.setError(null)}
          className="mb-4"
        />
      )}

      <PurchaseRequestFilters
        search={m.search}
        onSearchChange={m.setSearch}
        statusFilter={m.statusFilter}
        onStatusFilterChange={m.setStatusFilter}
        startDate={m.startDate}
        endDate={m.endDate}
        onDateChange={(s, e) => {
          m.setStartDate(s);
          m.setEndDate(e);
        }}
        onExport={m.handleExport}
        shown={m.filteredRequests.length}
        total={m.requests.length}
        hasError={!!m.error}
        countsByStatus={m.countsByStatus}
      />

      <MasterDetail
        items={m.filteredRequests}
        selectedId={m.selectedRequestId}
        onSelect={m.setSelectedRequestId}
        accent="cyan"
        // Este módulo no tiene acta imprimible propia: si se ocultara al
        // imprimir, la hoja saldría en blanco.
        hideOnPrint={false}
        loading={m.loading}
        loadingMessage="Cargando solicitudes..."
        emptyMessage="No hay solicitudes de compra registradas."
        emptyDetail={
          <NoSelection icon={FileText} message="Selecciona una solicitud para ver el detalle" />
        }
        renderRow={(request, isSelected) => (
          <>
            <div className="flex justify-between items-start mb-1 gap-2">
              <h3
                className={`font-medium text-sm truncate ${isSelected ? 'text-cyan-900' : 'text-slate-800'}`}
              >
                {request.code}
              </h3>
              <StatusChip status={request.status} tone={STATUS_CHIP[request.status]} />
            </div>
            <p className="text-xs text-slate-500 mb-1 truncate">
              {request.requesterName} · {request.area}
            </p>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{formatDate(request.requestDate)}</span>
              <span>{request.lines.length ? `${request.lines.length} producto(s)` : ''}</span>
            </div>
          </>
        )}
        // Igual que en Órdenes: la lista trae las solicitudes sin el detalle
        // completo, que llega aparte en `selectedRequest` junto con su
        // histórico. Por eso se ignora el elemento que pasa MasterDetail.
        renderDetail={() =>
          !m.selectedRequest ? (
            <NoSelection icon={FileText} message="Selecciona una solicitud para ver el detalle" />
          ) : (
            <PurchaseRequestDetail
              request={m.selectedRequest}
              history={m.history}
              loadingDetail={m.loadingDetail}
              statusTones={STATUS_CHIP}
              canEdit={m.canEdit}
              canSubmit={m.canSubmit}
              canCancel={m.canCancel}
              onEdit={m.handleEditStart}
              onSubmitForApproval={m.handleSubmitForApproval}
              onCancelRequest={m.handleCancelRequest}
              canDecide={m.canDecide}
              actingRole={m.actingRole}
              actingEmployeeId={m.actingEmployeeId}
              actingEmployeeName={m.actingEmployeeName}
              supervisorMismatch={m.supervisorMismatch}
              decisionComment={m.decisionComment}
              onDecisionCommentChange={m.setDecisionComment}
              deciding={m.deciding}
              onApprove={m.handleApprove}
              onReject={m.handleReject}
              onNavigateToOrder={onNavigateToOrder}
              onRequestUpdated={async (updated) => {
                await m.refresh();
                await m.reloadSelectedDetail(updated.id);
              }}
            />
          )
        }
      />

      <ConfirmDialog
        state={m.confirmState}
        onCancel={() => m.setConfirmState(null)}
        busy={m.deciding}
      />
    </div>
  );
};

export default PurchaseRequestManager;
