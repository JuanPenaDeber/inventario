import React, { useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart,
  Search,
  Plus,
  Printer,
  Ban,
  Edit,
  PackageCheck,
  Building2,
  Calendar,
  FileText,
  X,
} from 'lucide-react';
import { PurchaseOrder, PurchaseOrderStatus, PURCHASE_ORDER_STATUSES } from '../types';
import {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  getPurchaseOrderErrorMessage,
} from '../services/purchaseOrderService';
import { isWithinDateRange, downloadXlsx, formatDate, rangeSuffix } from '../services/reportUtils';
import DateRangeBar from './DateRangeBar';
import PurchaseOrderForm, { PurchaseOrderFormValues } from './PurchaseOrderForm';

const STATUS_CHIP: Record<PurchaseOrderStatus, string> = {
  BORRADOR: 'text-slate-600 border-slate-300 bg-slate-50',
  SOLICITADA: 'text-amber-600 border-amber-300 bg-amber-50',
  APROBADA: 'text-blue-600 border-blue-300 bg-blue-50',
  RECIBIDA: 'text-green-600 border-green-300 bg-green-50',
  CANCELADA: 'text-red-600 border-red-300 bg-red-50',
};

type ViewMode = 'list' | 'form';

interface PurchaseOrderManagerProps {
  /** Referencia a buscar al montar (llegada desde otro módulo, ej. Solicitudes de Compra). */
  initialSearch?: string;
  /** Avisa al padre que ya se aplicó `initialSearch`, para no reaplicarla en una visita posterior. */
  onConsumeInitialSearch?: () => void;
}

const PurchaseOrderManager: React.FC<PurchaseOrderManagerProps> = ({ initialSearch, onConsumeInitialSearch }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState(initialSearch || '');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPurchaseOrders();
      setOrders(data);
    } catch (err) {
      setError(getPurchaseOrderErrorMessage(err, 'No se pudieron cargar las órdenes de compra.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

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
  }, [selectedOrderId]);

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
    setEditingOrder(null);
    setViewMode('form');
  };

  const handleEditStart = async (order: PurchaseOrder) => {
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

  const handleCancelOrder = async (order: PurchaseOrder) => {
    if (!window.confirm(`¿Cancelar la orden ${order.reference}? Esta acción no se puede deshacer.`)) return;
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

  const handleReceive = async () => {
    if (!selectedOrder) return;

    // Validación: la cantidad recibida no puede ser negativa ni superar la solicitada.
    for (const line of selectedOrder.lines) {
      const qty = receivedQuantities[line.id] ?? line.quantityReceived;
      if (!Number.isFinite(qty) || qty < 0 || qty > line.quantityRequested) {
        setError(`La cantidad recibida de "${line.description}" debe estar entre 0 y ${line.quantityRequested}.`);
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

  const handleExport = () => {
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
    downloadXlsx(
      `ordenes_compra_${rangeSuffix(startDate, endDate)}.xlsx`,
      'OrdenesCompra',
      [header, ...rows],
      [16, 24, 16, 16, 20, 10, 14, 14, 14, 14],
    );
  };

  const handlePrint = () => window.print();

  // Solo se recibe mercadería de una orden ya APROBADA (ver receivePurchaseOrder,
  // que aplica la misma regla del lado del servicio).
  const canReceive = !!selectedOrder && selectedOrder.status === 'APROBADA' && selectedOrder.lines.length > 0;

  // RECIBIDA y CANCELADA son estados terminales: no se editan ni se cancelan.
  const canEdit = !!selectedOrder && selectedOrder.status !== 'CANCELADA' && selectedOrder.status !== 'RECIBIDA';
  const canCancel = canEdit;

  // --- Render ---

  if (viewMode === 'form') {
    return (
      <PurchaseOrderForm
        initialData={editingOrder || undefined}
        onSave={handleSaveOrder}
        onCancel={() => { setViewMode('list'); setEditingOrder(null); }}
        saving={saving}
      />
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">

      {/* --- VISTA DE IMPRESIÓN --- */}
      {selectedOrder && (
        <div className="hidden-on-screen print-area bg-white text-black">
          <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-center">
            <img src="http://172.20.16.38/fotos/edlogo.png" className="h-12" alt="Logo" />
            <div className="text-right">
              <h1 className="text-xl font-bold uppercase">Orden de Compra</h1>
              <p className="text-xs font-mono mt-1">Ref: {selectedOrder.reference}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm border-t border-b border-black py-4 mb-6">
            <div>
              <span className="font-bold block text-gray-500 text-xs uppercase">Proveedor</span>
              <span className="text-lg">{selectedOrder.providerName || selectedOrder.providerId}</span>
            </div>
            <div>
              <span className="font-bold block text-gray-500 text-xs uppercase">Solicitante</span>
              <span className="text-lg">{selectedOrder.requestedBy}</span>
            </div>
            <div className="mt-2">
              <span className="font-bold block text-gray-500 text-xs uppercase">Fecha de Solicitud</span>
              <span>{formatDate(selectedOrder.requestDate)}</span>
            </div>
            <div className="mt-2">
              <span className="font-bold block text-gray-500 text-xs uppercase">Fecha Esperada</span>
              <span>{selectedOrder.expectedDate ? formatDate(selectedOrder.expectedDate) : 'Indefinido'}</span>
            </div>
          </div>

          {selectedOrder.notes && (
            <div className="mb-6 p-3 bg-gray-50 border border-gray-200 text-sm">
              <p className="font-bold text-xs uppercase text-gray-500 mb-1">Observaciones</p>
              <p>{selectedOrder.notes}</p>
            </div>
          )}

          <table className="w-full border-collapse border border-black mb-4 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-2 text-left">Producto</th>
                <th className="border border-black p-2 text-left">Categoría</th>
                <th className="border border-black p-2 text-right">Cant.</th>
                <th className="border border-black p-2 text-right">P. Unit.</th>
                <th className="border border-black p-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {selectedOrder.lines.map((line) => (
                <tr key={line.id || line.description}>
                  <td className="border border-black p-2">{line.description}</td>
                  <td className="border border-black p-2">{line.category}</td>
                  <td className="border border-black p-2 text-right">{line.quantityRequested}</td>
                  <td className="border border-black p-2 text-right">{line.unitPrice.toFixed(2)}</td>
                  <td className="border border-black p-2 text-right">{line.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-12">
            <div className="w-64 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{selectedOrder.currency} {selectedOrder.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Impuesto ({selectedOrder.taxRate}%)</span><span>{selectedOrder.currency} {selectedOrder.taxAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-base border-t border-black pt-1"><span>Total</span><span>{selectedOrder.currency} {selectedOrder.total.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="mt-auto grid grid-cols-2 gap-8 text-center text-xs pt-12">
            <div>
              <div className="border-t border-black pt-2 mx-4 mb-1"></div>
              <p className="font-bold uppercase">{selectedOrder.requestedBy}</p>
              <p className="text-gray-500">Solicitante</p>
            </div>
            <div>
              <div className="border-t border-black pt-2 mx-4 mb-1"></div>
              <p className="font-bold uppercase">{selectedOrder.providerName || selectedOrder.providerId}</p>
              <p className="text-gray-500">Proveedor</p>
            </div>
          </div>
        </div>
      )}

      {/* Encabezado */}
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
          onClick={handleCreate}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm shadow-teal-500/30"
        >
          <Plus size={18} /> Nueva Orden
        </button>
      </div>

      {error && (
        <div className="no-print mb-4 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      <div className="no-print space-y-4 mb-4 shrink-0">
        {/* Búsqueda + estado */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Referencia, proveedor o solicitante..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">Todos</option>
              {PURCHASE_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Fecha + exportar */}
        <DateRangeBar
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
          onExport={handleExport}
          shown={filteredOrders.length}
          total={orders.length}
          accent="teal"
          label="órdenes"
        />

        {/* Resumen de totales */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {PURCHASE_ORDER_STATUSES.map((s) => (
            <div key={s} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
              <p className="text-xs text-slate-500">{s}</p>
              <p className="text-xl font-bold text-slate-800">{countsByStatus[s] || 0}</p>
            </div>
          ))}
        </div>
        {Object.keys(totalsByCurrency).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(totalsByCurrency).map(([currency, total]: [string, number]) => (
              <div key={currency} className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2 text-sm text-teal-800">
                <span className="font-medium">Total {currency}:</span> {total.toFixed(2)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- MASTER DETAIL --- */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 no-print">

        {/* Lista (izquierda) */}
        <div className="w-full md:w-1/3 border-r border-slate-200 flex flex-col overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando órdenes...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No hay órdenes de compra registradas.</div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = order.id === selectedOrderId;
              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-teal-50/60 border-l-4 border-l-teal-500' : 'border-l-4 border-l-transparent'}`}
                >
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h3 className={`font-medium text-sm truncate ${isSelected ? 'text-teal-900' : 'text-slate-800'}`}>{order.reference}</h3>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${STATUS_CHIP[order.status]}`}>{order.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1 truncate">{order.providerName || 'Sin proveedor'}</p>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{formatDate(order.requestDate)}</span>
                    <span className="font-medium text-slate-600">{order.currency} {order.total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detalle (derecha) */}
        <div className="w-full md:w-2/3 flex flex-col bg-slate-50/30 overflow-y-auto">
          {selectedOrder ? (
            <>
              <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-800 truncate">{selectedOrder.reference}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><Building2 size={14} /> {selectedOrder.providerName || selectedOrder.providerId}</span>
                    <span className="flex items-center gap-1"><Calendar size={14} /> {formatDate(selectedOrder.requestDate)}</span>
                  </div>
                  <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-bold border ${STATUS_CHIP[selectedOrder.status]}`}>{selectedOrder.status}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  {canEdit && (
                    <button onClick={() => handleEditStart(selectedOrder)} className="p-2 border rounded hover:bg-slate-50 text-slate-600" title="Editar">
                      <Edit size={18} />
                    </button>
                  )}
                  <button onClick={handlePrint} className="p-2 border rounded hover:bg-slate-50 text-slate-600" title="Imprimir">
                    <Printer size={18} />
                  </button>
                  {canCancel && (
                    <button onClick={() => handleCancelOrder(selectedOrder)} className="p-2 border rounded hover:bg-red-50 text-red-600 border-red-200" title="Cancelar orden">
                      <Ban size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {selectedOrder.notes && (
                  <div className="mb-6 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
                    <span className="font-bold">Observaciones:</span> {selectedOrder.notes}
                  </div>
                )}

                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 flex items-center gap-2"><FileText size={16} /> Detalle de productos</h3>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto custom-scrollbar">
                  {loadingDetail ? (
                    <div className="p-8 text-center text-slate-400">Cargando detalle...</div>
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
                        {selectedOrder.lines.length === 0 ? (
                          <tr><td colSpan={6} className="p-4 text-center text-slate-400">Sin productos.</td></tr>
                        ) : (
                          selectedOrder.lines.map((line) => (
                            <tr key={line.id || line.description}>
                              <td className="px-4 py-3 font-medium">{line.description}</td>
                              <td className="px-4 py-3 text-slate-500">{line.category}</td>
                              <td className="px-4 py-3 text-right">{line.quantityRequested}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={line.quantityReceived >= line.quantityRequested ? 'text-green-600 font-medium' : 'text-amber-600'}>
                                  {line.quantityReceived}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">{selectedOrder.currency} {line.unitPrice.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-medium">{selectedOrder.currency} {line.subtotal.toFixed(2)}</td>
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
                      <span>Subtotal</span><span>{selectedOrder.currency} {selectedOrder.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Impuesto ({selectedOrder.taxRate}%)</span><span>{selectedOrder.currency} {selectedOrder.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-1">
                      <span>Total</span><span>{selectedOrder.currency} {selectedOrder.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Recepción (total o parcial). No crea equipos automáticamente. */}
                {canReceive && (
                  <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                      <PackageCheck size={16} /> Registrar recepción
                    </h3>
                    <p className="text-xs text-slate-500 mb-3">
                      Indica la cantidad total recibida por producto (permite recepción parcial). Esto no crea equipos en el inventario automáticamente.
                    </p>
                    <div className="space-y-2">
                      {selectedOrder.lines.map((line) => (
                        <div key={line.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex-1 truncate">{line.description}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">de {line.quantityRequested}</span>
                          <input
                            type="number"
                            min={0}
                            max={line.quantityRequested}
                            value={receivedQuantities[line.id] ?? line.quantityReceived}
                            onChange={(e) =>
                              setReceivedQuantities((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))
                            }
                            className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-right focus:ring-2 focus:ring-teal-500 outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={handleReceive}
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
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart size={48} className="opacity-20 mb-4" />
              <p>Selecciona una orden para ver el detalle</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderManager;
