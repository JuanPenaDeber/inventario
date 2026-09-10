// =============================================================================
// Estado y acciones del módulo de Órdenes de Compra.
//
// Particularidad frente a Asignaciones: la lista trae las órdenes SIN líneas y
// el detalle completo llega en un segundo viaje (`getPurchaseOrder`). Por eso
// conviven `selectedOrderId` (lo que el usuario eligió) y `selectedOrder` (lo
// que el servidor devolvió). Confundirlos es el error fácil de este módulo.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { PurchaseOrder } from '@/types';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderErrorMessage,
  receivePurchaseOrder,
  updatePurchaseOrder,
} from '@/features/compras/ordenes/purchaseOrderService';
import { downloadXlsx, formatDate, isWithinDateRange, rangeSuffix } from '@/shared/utils/reportUtils';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import type { ConfirmDialogState } from '@/shared/components/ConfirmDialog';
import type { PurchaseOrderFormValues } from '@/features/compras/ordenes/PurchaseOrderForm';

export type PurchaseOrderViewMode = 'list' | 'form';

interface Options {
  initialSearch?: string;
  onConsumeInitialSearch?: () => void;
}

export function usePurchaseOrderManager({ initialSearch, onConsumeInitialSearch }: Options) {
  const { can } = useCurrentUser();
  // Antes cualquier rol (incluido CONSULTA) podía crear, editar, cancelar o
  // recibir una orden de compra — la única regla era la máquina de estados
  // (canEdit/canCancel/canReceive más abajo), sin ningún control de rol.
  // order.manage/order.cancel/order.receive en permissions.ts ya lo limitan.
  const canManageOrders = can('order.manage');
  const canCancelOrders = can('order.cancel');
  const canReceiveOrders = can('order.receive');
  const [viewMode, setViewMode] = useState<PurchaseOrderViewMode>('list');

  const {
    data: orders,
    loading,
    error,
    setError,
    refresh,
  } = useAsyncData<PurchaseOrder[]>(getPurchaseOrders, [], {
    errorMessage: 'No se pudieron cargar las órdenes de compra.',
    getErrorMessage: getPurchaseOrderErrorMessage,
  });

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  const [search, setSearch] = useState(initialSearch || '');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState(false);

  // Consume la búsqueda inicial (llegada por navegación cruzada) una sola vez.
  useEffect(() => {
    if (initialSearch) onConsumeInitialSearch?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trae el detalle (con líneas) cuando se selecciona una orden en la lista.
  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedOrderId) {
        setSelectedOrder(null);
        return;
      }
      setLoadingDetail(true);
      try {
        const detail = await getPurchaseOrder(selectedOrderId);
        setSelectedOrder(detail);
        const initialQuantities: Record<string, number> = {};
        detail?.lines.forEach((l) => {
          initialQuantities[l.id] = l.quantityReceived;
        });
        setReceivedQuantities(initialQuantities);
      } catch (err) {
        setError(getPurchaseOrderErrorMessage(err, 'No se pudo cargar el detalle de la orden.'));
      } finally {
        setLoadingDetail(false);
      }
    };
    loadDetail();
  }, [selectedOrderId, setError]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        const matchesSearch =
          !q ||
          o.reference.toLowerCase().includes(q) ||
          (o.providerName || '').toLowerCase().includes(q) ||
          o.requestedBy.toLowerCase().includes(q);
        const matchesStatus = !statusFilter || o.status === statusFilter;
        const matchesDate = isWithinDateRange(o.requestDate, startDate, endDate);
        return matchesSearch && matchesStatus && matchesDate;
      })
      .sort((a, b) => (b.requestDate || '').localeCompare(a.requestDate || ''));
  }, [orders, search, statusFilter, startDate, endDate]);

  // Suma de totales por moneda (se excluyen las canceladas del resumen monetario).
  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      if (o.status === 'CANCELADA') return;
      totals[o.currency] = (totals[o.currency] || 0) + o.total;
    });
    return totals;
  }, [filteredOrders]);

  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [filteredOrders]);

  // --- Acciones ---

  const handleCreate = () => {
    if (!canManageOrders) return;
    setEditingOrder(null);
    setViewMode('form');
  };

  const handleEditStart = async (order: PurchaseOrder) => {
    if (!canManageOrders) return;
    setLoadingDetail(true);
    setError(null);
    try {
      const detail = await getPurchaseOrder(order.id);
      setEditingOrder(detail);
      setViewMode('form');
    } catch (err) {
      setError(getPurchaseOrderErrorMessage(err, 'No se pudo cargar la orden para editar.'));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveOrder = async (values: PurchaseOrderFormValues) => {
    if (!canManageOrders) return;
    setSaving(true);
    setError(null);
    try {
      if (values.id) {
        await updatePurchaseOrder(values.id, {
          reference: values.reference,
          providerId: values.providerId,
          requestDate: values.requestDate,
          expectedDate: values.expectedDate || undefined,
          requestedBy: values.requestedBy,
          currency: values.currency,
          notes: values.notes,
          status: values.status,
          // Necesario para que el servicio valide que el cambio de estado sea
          // una transición coherente (ver isValidStatusTransition).
          previousStatus: editingOrder?.status,
          taxRate: values.taxRate,
          lines: values.lines,
        });
        setSelectedOrderId(values.id);
      } else {
        const created = await createPurchaseOrder({
          reference: values.reference,
          providerId: values.providerId,
          requestDate: values.requestDate,
          expectedDate: values.expectedDate || undefined,
          requestedBy: values.requestedBy,
          currency: values.currency,
          notes: values.notes,
          status: values.status,
          taxRate: values.taxRate,
          lines: values.lines.map((l) => ({
            description: l.description,
            category: l.category,
            quantityRequested: l.quantityRequested,
            unitPrice: l.unitPrice,
          })),
        });
        setSelectedOrderId(created.id);
      }
      await refresh();
      setViewMode('list');
      setEditingOrder(null);
    } catch (err) {
      setError(getPurchaseOrderErrorMessage(err, 'No se pudo guardar la orden de compra.'));
    } finally {
      setSaving(false);
    }
  };

  const doCancelOrder = async (order: PurchaseOrder) => {
    setConfirmState(null);
    setError(null);
    try {
      await cancelPurchaseOrder(order.id);
      await refresh();
      if (selectedOrderId === order.id) {
        const detail = await getPurchaseOrder(order.id);
        setSelectedOrder(detail);
      }
    } catch (err) {
      setError(getPurchaseOrderErrorMessage(err, 'No se pudo cancelar la orden.'));
    }
  };

  const handleCancelOrder = (order: PurchaseOrder) => {
    if (!canCancelOrders) return;
    setConfirmState({
      message: `¿Cancelar la orden ${order.reference}? Esta acción no se puede deshacer.`,
      tone: 'danger',
      confirmLabel: 'Cancelar orden',
      onConfirm: () => doCancelOrder(order),
    });
  };

  const handleReceive = async () => {
    if (!selectedOrder || !canReceiveOrders) return;

    // La cantidad recibida no puede ser negativa ni superar la solicitada.
    for (const line of selectedOrder.lines) {
      const qty = receivedQuantities[line.id] ?? line.quantityReceived;
      if (!Number.isFinite(qty) || qty < 0 || qty > line.quantityRequested) {
        setError(
          `La cantidad recibida de "${line.description}" debe estar entre 0 y ${line.quantityRequested}.`,
        );
        return;
      }
    }

    const receipts = selectedOrder.lines.map((line) => ({
      lineId: line.id,
      quantityReceived: receivedQuantities[line.id] ?? line.quantityReceived,
    }));

    setReceiving(true);
    setError(null);
    try {
      await receivePurchaseOrder(selectedOrder.id, receipts);
      await refresh();
      const detail = await getPurchaseOrder(selectedOrder.id);
      setSelectedOrder(detail);
    } catch (err) {
      setError(getPurchaseOrderErrorMessage(err, 'No se pudo registrar la recepción.'));
    } finally {
      setReceiving(false);
    }
  };

  const handleExport = async () => {
    const header = [
      'Referencia', 'Proveedor', 'Fecha solicitud', 'Fecha esperada',
      'Solicitante', 'Moneda', 'Estado', 'Subtotal', 'Impuesto', 'Total',
    ];
    const rows = filteredOrders.map((o) => [
      o.reference,
      o.providerName || o.providerId,
      formatDate(o.requestDate),
      formatDate(o.expectedDate),
      o.requestedBy,
      o.currency,
      o.status,
      o.subtotal,
      o.taxAmount,
      o.total,
    ]);
    await downloadXlsx(
      `ordenes_compra_${rangeSuffix(startDate, endDate)}.xlsx`,
      'OrdenesCompra',
      [header, ...rows],
      [16, 24, 16, 16, 20, 10, 14, 14, 14, 14],
    );
  };

  const handlePrint = () => window.print();

  // Solo se recibe mercadería de una orden ya APROBADA (ver receivePurchaseOrder,
  // que aplica la misma regla del lado del servicio) Y con el rol adecuado.
  const canReceive =
    canReceiveOrders &&
    !!selectedOrder &&
    selectedOrder.status === 'APROBADA' &&
    selectedOrder.lines.length > 0;

  // RECIBIDA y CANCELADA son estados terminales: no se editan ni se cancelan.
  const canEdit =
    canManageOrders &&
    !!selectedOrder &&
    selectedOrder.status !== 'CANCELADA' &&
    selectedOrder.status !== 'RECIBIDA';
  const canCancel =
    canCancelOrders &&
    !!selectedOrder &&
    selectedOrder.status !== 'CANCELADA' &&
    selectedOrder.status !== 'RECIBIDA';

  return {
    viewMode,
    setViewMode,
    orders,
    loading,
    error,
    setError,
    filteredOrders,
    totalsByCurrency,
    countsByStatus,
    selectedOrderId,
    setSelectedOrderId,
    selectedOrder,
    loadingDetail,
    editingOrder,
    setEditingOrder,
    saving,
    confirmState,
    setConfirmState,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    receivedQuantities,
    setReceivedQuantities,
    receiving,
    canManageOrders,
    canReceive,
    canEdit,
    canCancel,
    handleCreate,
    handleEditStart,
    handleSaveOrder,
    handleCancelOrder,
    handleReceive,
    handleExport,
    handlePrint,
    refresh,
  };
}
