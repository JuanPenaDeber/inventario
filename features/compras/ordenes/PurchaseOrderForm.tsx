import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, Provider } from '../types';
import { getProviders } from '../services/inventoryService';
import {
  calculateLineSubtotal,
  calculateOrderTotals,
  DEFAULT_TAX_RATE_PERCENT,
  CURRENCIES,
  INITIAL_STATUSES,
  getSelectableStatuses,
} from '../services/purchaseOrderService';

// Forma unificada que recibe el padre (PurchaseOrderManager) para decidir si
// crea o actualiza. `id` presente => update; ausente => create.
export interface PurchaseOrderFormValues {
  id?: string;
  reference: string;
  providerId: string;
  requestDate: string;
  expectedDate: string;
  requestedBy: string;
  currency: string;
  notes: string;
  status: PurchaseOrderStatus;
  taxRate: number;
  lines: PurchaseOrderLine[];
}

interface PurchaseOrderFormProps {
  initialData?: PurchaseOrder;
  onSave: (values: PurchaseOrderFormValues) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

type LineDraft = PurchaseOrderLine;

const emptyLine = (): LineDraft => ({
  id: '',
  description: '',
  category: '',
  quantityRequested: 1,
  quantityReceived: 0,
  unitPrice: 0,
  subtotal: 0,
});

const today = (): string => new Date().toISOString().slice(0, 10);

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

const PurchaseOrderForm: React.FC<PurchaseOrderFormProps> = ({ initialData, onSave, onCancel, saving = false }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [reference, setReference] = useState('');
  const [providerId, setProviderId] = useState('');
  const [requestDate, setRequestDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [currency, setCurrency] = useState<string>(CURRENCIES[0]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus>('BORRADOR');
  const [taxRate, setTaxRate] = useState<number>(DEFAULT_TAX_RATE_PERCENT);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  useEffect(() => {
    if (initialData) {
      setReference(initialData.reference);
      setProviderId(initialData.providerId);
      setRequestDate(initialData.requestDate || today());
      setExpectedDate(initialData.expectedDate || '');
      setRequestedBy(initialData.requestedBy);
      setCurrency(initialData.currency || CURRENCIES[0]);
      setNotes(initialData.notes || '');
      setStatus(initialData.status);
      setTaxRate(initialData.taxRate ?? DEFAULT_TAX_RATE_PERCENT);
      setLines(initialData.lines.length > 0 ? initialData.lines.map((l) => ({ ...l })) : [emptyLine()]);
    }
  }, [initialData]);

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        next.subtotal = calculateLineSubtotal(next.quantityRequested, next.unitPrice);
        return next;
      }),
    );
    setLineErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index: number) =>
    setLines((prev) => {
      // No se puede quitar una línea con recepción ya registrada: se perdería
      // el historial de lo recibido.
      if (prev.length <= 1 || prev[index].quantityReceived > 0) return prev;
      return prev.filter((_, i) => i !== index);
    });

  const totals = useMemo(() => calculateOrderTotals(lines, taxRate), [lines, taxRate]);

  // Solo se puede elegir el estado actual o una transición válida desde él.
  // Al crear, una orden nueva solo puede arrancar en BORRADOR o SOLICITADA.
  const selectableStatuses = useMemo(
    () => (initialData ? getSelectableStatuses(initialData.status) : INITIAL_STATUSES),
    [initialData],
  );

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    const nextLineErrors: Record<number, string> = {};

    if (!reference.trim()) nextErrors.reference = 'La referencia es obligatoria.';
    if (!providerId) nextErrors.providerId = 'Selecciona un proveedor.';
    if (!requestDate) nextErrors.requestDate = 'La fecha de solicitud es obligatoria.';
    if (!requestedBy.trim()) nextErrors.requestedBy = 'El solicitante es obligatorio.';
    if (expectedDate && requestDate && expectedDate < requestDate) {
      nextErrors.expectedDate = 'La fecha esperada no puede ser anterior a la de solicitud.';
    }
    if (taxRate < 0) nextErrors.taxRate = 'El impuesto no puede ser negativo.';

    if (lines.length === 0) {
      nextErrors.lines = 'Agrega al menos un producto.';
    }

    lines.forEach((line, i) => {
      if (!line.description.trim()) {
        nextLineErrors[i] = 'Falta la descripción.';
      } else if (!Number.isFinite(line.quantityRequested) || line.quantityRequested <= 0 || !Number.isInteger(line.quantityRequested)) {
        nextLineErrors[i] = 'La cantidad debe ser un entero mayor a 0.';
      } else if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        nextLineErrors[i] = 'El precio unitario no puede ser negativo.';
      } else if (line.quantityReceived > line.quantityRequested) {
        nextLineErrors[i] = `La cantidad no puede ser menor a lo ya recibido (${line.quantityReceived}).`;
      }
    });

    setErrors(nextErrors);
    setLineErrors(nextLineErrors);
    return Object.keys(nextErrors).length === 0 && Object.keys(nextLineErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      id: initialData?.id,
      reference: reference.trim(),
      providerId,
      requestDate,
      expectedDate,
      requestedBy: requestedBy.trim(),
      currency,
      notes: notes.trim(),
      status,
      taxRate,
      lines,
    });
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {initialData ? 'Editar orden de compra' : 'Nueva orden de compra'}
          </h1>
          <p className="text-slate-500 text-sm">Completa los datos de la orden y su detalle de productos.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cabecera */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-slate-800 mb-4 border-b pb-2">Datos generales</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Número / Referencia</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => { setReference(e.target.value); clearError('reference'); }}
                placeholder="Ej: OC-2026-0001"
                className={inputCls}
              />
              {errors.reference && <p className="text-xs text-red-600 mt-1">{errors.reference}</p>}
            </div>

            <div>
              <label className={labelCls}>Proveedor</label>
              <select value={providerId} onChange={(e) => { setProviderId(e.target.value); clearError('providerId'); }} className={inputCls}>
                <option value="">Seleccionar proveedor</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.providerId && <p className="text-xs text-red-600 mt-1">{errors.providerId}</p>}
            </div>

            <div>
              <label className={labelCls}>Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus)}
                className={inputCls}
              >
                {selectableStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Solo se muestran los estados a los que se puede pasar desde aquí.
              </p>
            </div>

            <div>
              <label className={labelCls}>Fecha de solicitud</label>
              <input
                type="date"
                value={requestDate}
                onChange={(e) => { setRequestDate(e.target.value); clearError('requestDate'); clearError('expectedDate'); }}
                className={inputCls}
              />
              {errors.requestDate && <p className="text-xs text-red-600 mt-1">{errors.requestDate}</p>}
            </div>

            <div>
              <label className={labelCls}>Fecha esperada</label>
              <input
                type="date"
                value={expectedDate}
                min={requestDate || undefined}
                onChange={(e) => { setExpectedDate(e.target.value); clearError('expectedDate'); }}
                className={inputCls}
              />
              {errors.expectedDate && <p className="text-xs text-red-600 mt-1">{errors.expectedDate}</p>}
            </div>

            <div>
              <label className={labelCls}>Solicitante</label>
              <input
                type="text"
                value={requestedBy}
                onChange={(e) => { setRequestedBy(e.target.value); clearError('requestedBy'); }}
                placeholder="Nombre de quien solicita"
                className={inputCls}
              />
              {errors.requestedBy && <p className="text-xs text-red-600 mt-1">{errors.requestedBy}</p>}
            </div>

            <div>
              <label className={labelCls}>Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Impuesto (%)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={taxRate}
                onChange={(e) => { setTaxRate(Number(e.target.value)); clearError('taxRate'); }}
                className={inputCls}
              />
              {errors.taxRate && <p className="text-xs text-red-600 mt-1">{errors.taxRate}</p>}
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Observaciones</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Detalle de productos */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="font-bold text-slate-800">Detalle de productos</h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              <Plus size={16} /> Agregar producto
            </button>
          </div>

          {errors.lines && <p className="text-xs text-red-600 mb-2">{errors.lines}</p>}

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2 font-semibold">Descripción</th>
                  <th className="py-2 pr-2 font-semibold w-36">Categoría</th>
                  <th className="py-2 pr-2 font-semibold w-24">Cantidad</th>
                  <th className="py-2 pr-2 font-semibold w-32">Precio unit.</th>
                  <th className="py-2 pr-2 font-semibold w-32 text-right">Subtotal</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <React.Fragment key={i}>
                    <tr className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                          placeholder="Ej: Laptop Dell Latitude 5420"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={line.category}
                          onChange={(e) => updateLine(i, { category: e.target.value })}
                          placeholder="Ej: Electrónica"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={line.quantityReceived > 0 ? line.quantityReceived : 1}
                          step="1"
                          value={line.quantityRequested}
                          onChange={(e) => updateLine(i, { quantityRequested: Number(e.target.value) })}
                          className={inputCls}
                          title={line.quantityReceived > 0 ? `Ya se recibieron ${line.quantityReceived}.` : undefined}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-2 text-right font-medium text-slate-700 whitespace-nowrap">
                        {line.subtotal.toFixed(2)}
                      </td>
                      <td className="py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1 || line.quantityReceived > 0}
                          className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={line.quantityReceived > 0 ? 'No se puede quitar: ya tiene recepción registrada.' : 'Quitar producto'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                    {lineErrors[i] && (
                      <tr>
                        <td colSpan={6} className="pb-2 text-xs text-red-600">
                          {lineErrors[i]}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales calculados automáticamente */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-medium">{currency} {totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Impuesto ({taxRate}%)</span>
                <span className="font-medium">{currency} {totals.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-1">
                <span>Total</span>
                <span>{currency} {totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors shadow-sm shadow-teal-500/20"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Save size={18} />
            )}
            {saving ? 'Guardando...' : 'Guardar orden'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseOrderForm;
