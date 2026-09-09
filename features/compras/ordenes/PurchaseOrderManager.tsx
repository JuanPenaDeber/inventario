// =============================================================================
// Módulo de Órdenes de Compra: solicitudes a proveedores y su recepción.
//
// Orquestador. Lo demás vive donde corresponde:
//
//   usePurchaseOrderManager.ts        estado, llamadas al servidor y acciones
//   PurchaseOrderForm                 alta y edición (ya existía aparte)
//   components/PurchaseOrderFilters   búsqueda, estado, fechas y resúmenes
//   components/PurchaseOrderDetail    panel derecho + registro de recepción
//   components/PurchaseOrderPrintDoc  la orden que sale por impresora
// =============================================================================

import React from 'react';
import { ShoppingCart, Plus, RefreshCw, X } from 'lucide-react';
import { PurchaseOrderStatus } from '@/types';
import { formatDate } from '@/shared/utils/reportUtils';
import MasterDetail from '@/shared/components/MasterDetail';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { NoSelection } from '@/shared/components/ui/States';
import StatusChip from '@/shared/components/ui/StatusChip';
import PurchaseOrderForm from '@/features/compras/ordenes/PurchaseOrderForm';
import { usePurchaseOrderManager } from '@/features/compras/ordenes/usePurchaseOrderManager';
import PurchaseOrderFilters from '@/features/compras/ordenes/components/PurchaseOrderFilters';
import PurchaseOrderDetail from '@/features/compras/ordenes/components/PurchaseOrderDetail';
import PurchaseOrderPrintDoc from '@/features/compras/ordenes/components/PurchaseOrderPrintDoc';

const STATUS_CHIP: Record<PurchaseOrderStatus, string> = {
  BORRADOR: 'text-slate-600 border-slate-300 bg-slate-50',
  SOLICITADA: 'text-amber-600 border-amber-300 bg-amber-50',
  APROBADA: 'text-blue-600 border-blue-300 bg-blue-50',
  RECIBIDA: 'text-green-600 border-green-300 bg-green-50',
  CANCELADA: 'text-red-600 border-red-300 bg-red-50',
};

interface PurchaseOrderManagerProps {
  /** Referencia a buscar al montar (llegada desde otro módulo, ej. Solicitudes de Compra). */
  initialSearch?: string;
  /** Avisa al padre que ya se aplicó `initialSearch`, para no reaplicarla en una visita posterior. */
  onConsumeInitialSearch?: () => void;
}

const PurchaseOrderManager: React.FC<PurchaseOrderManagerProps> = ({
  initialSearch,
  onConsumeInitialSearch,
}) => {
  const m = usePurchaseOrderManager({ initialSearch, onConsumeInitialSearch });

  if (m.viewMode === 'form') {
    return (
      <PurchaseOrderForm
        initialData={m.editingOrder || undefined}
        onSave={m.handleSaveOrder}
        onCancel={() => {
          m.setViewMode('list');
          m.setEditingOrder(null);
        }}
        saving={m.saving}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col">
      {m.selectedOrder && <PurchaseOrderPrintDoc order={m.selectedOrder} />}

      <div className="flex justify-between items-center mb-6 shrink-0 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-100 text-teal-600 rounded-xl">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Órdenes de Compra</h1>
            <p className="text-slate-500 text-sm">Solicitudes de compra a proveedores.</p>
          </div>
        </div>
        <button
          onClick={m.handleCreate}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm shadow-teal-500/30"
        >
          <Plus size={18} /> Nueva Orden
        </button>
      </div>

      {m.error && (
        <div className="no-print mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{m.error}</span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={m.refresh}
              className="inline-flex items-center gap-1.5 font-medium hover:text-red-900"
            >
              <RefreshCw size={14} /> Reintentar
            </button>
            <button onClick={() => m.setError(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <PurchaseOrderFilters
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
        shown={m.filteredOrders.length}
        total={m.orders.length}
        hasError={!!m.error}
        countsByStatus={m.countsByStatus}
        totalsByCurrency={m.totalsByCurrency}
      />

      <MasterDetail
        items={m.filteredOrders}
        selectedId={m.selectedOrderId}
        onSelect={m.setSelectedOrderId}
        accent="teal"
        loading={m.loading}
        loadingMessage="Cargando órdenes..."
        emptyMessage="No hay órdenes de compra registradas."
        emptyDetail={
          <NoSelection icon={ShoppingCart} message="Selecciona una orden para ver el detalle" />
        }
        renderRow={(order, isSelected) => (
          <>
            <div className="flex justify-between items-start mb-1 gap-2">
              <h3
                className={`font-medium text-sm truncate ${isSelected ? 'text-teal-900' : 'text-slate-800'}`}
              >
                {order.reference}
              </h3>
              <StatusChip status={order.status} tone={STATUS_CHIP[order.status]} />
            </div>
            <p className="text-xs text-slate-500 mb-1 truncate">
              {order.providerName || 'Sin proveedor'}
            </p>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{formatDate(order.requestDate)}</span>
              <span className="font-medium text-slate-600">
                {order.currency} {order.total.toFixed(2)}
              </span>
            </div>
          </>
        )}
        // Ignora el elemento de la lista a propósito: la lista trae órdenes sin
        // líneas y el detalle completo llega por separado en `selectedOrder`
        // (getPurchaseOrder). Mientras ese segundo viaje está en curso se
        // muestra el mismo marcador que cuando no hay nada seleccionado.
        renderDetail={() =>
          !m.selectedOrder ? (
            <NoSelection icon={ShoppingCart} message="Selecciona una orden para ver el detalle" />
          ) : (
            <PurchaseOrderDetail
              order={m.selectedOrder}
              statusTones={STATUS_CHIP}
              loadingDetail={m.loadingDetail}
              canEdit={m.canEdit}
              canCancel={m.canCancel}
              canReceive={m.canReceive}
              onEdit={m.handleEditStart}
              onPrint={m.handlePrint}
              onCancel={m.handleCancelOrder}
              receivedQuantities={m.receivedQuantities}
              onReceivedQuantityChange={(lineId, quantity) =>
                m.setReceivedQuantities((prev) => ({ ...prev, [lineId]: quantity }))
              }
              receiving={m.receiving}
              onReceive={m.handleReceive}
            />
          )
        }
      />

      <ConfirmDialog state={m.confirmState} onCancel={() => m.setConfirmState(null)} />
    </div>
  );
};

export default PurchaseOrderManager;
