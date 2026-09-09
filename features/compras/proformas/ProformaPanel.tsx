import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  Paperclip,
  Award,
  ShoppingCart,
  CheckCheck,
  PlayCircle,
  ClipboardCheck,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { Provider, PurchaseRequest, PurchaseFlowRole, Proforma, ProformaLine } from '@/types';
import { getProviders } from '@/shared/api/inventoryService';
import {
  getProformas,
  createProforma,
  voidProforma,
  calculateProformaLineSubtotal,
  calculateProformaTotals,
  calculateExpiryDate,
  getProformaValidity,
  getProformaErrorMessage,
  DEFAULT_PROFORMA_TAX_RATE_PERCENT,
} from '@/features/compras/proformas/proformaService';
import { CURRENCIES } from '@/features/compras/ordenes/purchaseOrderService';
import {
  logPurchaseRequestEvent,
  startQuotation,
  markAsQuoted,
  selectProforma,
  generatePurchaseOrder,
  finalizeRequest,
  getPurchaseRequestErrorMessage,
} from '@/features/compras/solicitudes/purchaseRequestService';
import { formatDate } from '@/shared/utils/reportUtils';
import { controlClass, labelClass } from '@/shared/components/ui/Field';
import StatusChip from '@/shared/components/ui/StatusChip';

const VALIDITY_CHIP: Record<string, string> = {
  VIGENTE: 'text-emerald-600 border-emerald-300 bg-emerald-50',
  PROXIMA_A_VENCER: 'text-amber-600 border-amber-300 bg-amber-50',
  VENCIDA: 'text-red-600 border-red-300 bg-red-50',
};
const VALIDITY_LABEL: Record<string, string> = {
  VIGENTE: 'Vigente',
  PROXIMA_A_VENCER: 'Próxima a vencer',
  VENCIDA: 'Vencida',
};

interface ProformaPanelProps {
  request: PurchaseRequest;
  actingRole: PurchaseFlowRole;
  actingEmployeeName: string;
  /** Se llama cuando una acción cambia el estado/datos de la solicitud (recarga en el padre). */
  onRequestUpdated: (updated: PurchaseRequest) => void;
  /** Si se da, "Ver orden de compra" navega directo en vez de mostrar solo texto. */
  onNavigateToOrder?: (reference: string) => void;
}

type LineDraft = { product: string; quantity: number; unitPrice: number };

const emptyLine = (): LineDraft => ({ product: '', quantity: 1, unitPrice: 0 });
const today = (): string => new Date().toISOString().slice(0, 10);

// El adjunto viaja como base64 dentro de un JSON (~33% más pesado que el
// archivo original); un límite conservador evita payloads gigantes contra
// EspoCRM y que el navegador se cuelgue leyendo el archivo.
const MAX_ATTACHMENT_MB = 5;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

// Clases de campo compartidas (shared/components/ui/Field.tsx). Tamaño 'sm'
// porque este panel va embebido en el detalle de una solicitud, no en una
// página propia: es la diferencia que antes estaba escrita a mano.
const inputCls = controlClass('cyan', 'sm');
const labelCls = labelClass('sm');

const ProformaPanel: React.FC<ProformaPanelProps> = ({ request, actingRole, actingEmployeeName, onRequestUpdated, onNavigateToOrder }) => {
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [validityDays, setValidityDays] = useState(15);
  const [currency, setCurrency] = useState<string>(CURRENCIES[0]);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(DEFAULT_PROFORMA_TAX_RATE_PERCENT);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [selectionNotes, setSelectionNotes] = useState('');

  const [voidingProforma, setVoidingProforma] = useState<Proforma | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pData, provData] = await Promise.all([getProformas(request.id), getProviders()]);
      setProformas(pData);
      setProviders(provData);
    } catch (err) {
      setError(getProformaErrorMessage(err, 'No se pudieron cargar las proformas.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  const resetForm = () => {
    setProviderId('');
    setNumber('');
    setIssueDate(today());
    setValidityDays(15);
    setCurrency(CURRENCIES[0]);
    setDiscount(0);
    setTaxRate(DEFAULT_PROFORMA_TAX_RATE_PERCENT);
    setPaymentTerms('');
    setDeliveryTime('');
    setNotes('');
    setLines([emptyLine()]);
    setAttachmentFile(null);
    setFormError(null);
  };

  const linesWithSubtotal = useMemo(
    () => lines.map((l) => ({ ...l, subtotal: calculateProformaLineSubtotal(l.quantity, l.unitPrice) })),
    [lines],
  );
  const totals = useMemo(
    () => calculateProformaTotals(linesWithSubtotal, discount, taxRate),
    [linesWithSubtotal, discount, taxRate],
  );
  const expiryPreview = useMemo(() => calculateExpiryDate(issueDate, validityDays), [issueDate, validityDays]);

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleCreateProforma = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!providerId) return setFormError('Selecciona el proveedor.');
    if (!number.trim()) return setFormError('El número de proforma es obligatorio.');
    if (!paymentTerms.trim()) return setFormError('Indica las condiciones de pago.');
    if (!deliveryTime.trim()) return setFormError('Indica el tiempo de entrega.');
    if (attachmentFile && attachmentFile.size > MAX_ATTACHMENT_BYTES) {
      return setFormError(`El archivo adjunto supera el máximo de ${MAX_ATTACHMENT_MB} MB. Comprímelo o sube un enlace en observaciones.`);
    }
    for (const l of lines) {
      if (!l.product.trim()) return setFormError('Todos los productos cotizados deben tener descripción.');
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) return setFormError('Las cantidades deben ser mayores a 0.');
      if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) return setFormError('Los precios no pueden ser negativos.');
    }

    setBusy(true);
    try {
      let attachment;
      if (attachmentFile) {
        const dataUrl = await readFileAsDataUrl(attachmentFile);
        attachment = { fileName: attachmentFile.name, mimeType: attachmentFile.type || 'application/octet-stream', dataUrl };
      }

      const provider = providers.find((p) => p.id === providerId);
      const created = await createProforma(
        request.id,
        { providerId, number: number.trim(), issueDate, validityDays, currency, discount, taxRate, paymentTerms: paymentTerms.trim(), deliveryTime: deliveryTime.trim(), notes: notes.trim(), lines },
        actingEmployeeName || 'Compras',
        attachment,
      );

      await logPurchaseRequestEvent(
        request.id,
        actingEmployeeName || 'Compras',
        `Registró una proforma de ${provider?.name || providerId}`,
        request.status,
        `${created.number} · ${created.currency} ${created.total.toFixed(2)}`,
      );

      resetForm();
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(getProformaErrorMessage(err, 'No se pudo registrar la proforma.'));
    } finally {
      setBusy(false);
    }
  };

  const requireActor = (): boolean => {
    if (!actingEmployeeName) {
      setError('Elige un empleado en "Actuando como" antes de continuar.');
      return false;
    }
    return true;
  };

  const handleStartQuotation = async () => {
    if (!requireActor()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await startQuotation(request.id, actingEmployeeName);
      if (updated) onRequestUpdated(updated);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo iniciar la cotización.'));
    } finally {
      setBusy(false);
    }
  };

  const handleMarkAsQuoted = async () => {
    if (!requireActor()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await markAsQuoted(request.id, actingEmployeeName);
      if (updated) onRequestUpdated(updated);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo marcar como cotizada.'));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmVoid = async () => {
    if (!voidingProforma) return;
    if (!requireActor()) return;
    if (!voidReason.trim()) {
      setError('El motivo de anulación es obligatorio.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await voidProforma(voidingProforma.id, voidReason.trim());
      await logPurchaseRequestEvent(
        request.id,
        actingEmployeeName,
        `Anuló la proforma de ${voidingProforma.providerName || voidingProforma.providerId}`,
        request.status,
        voidReason.trim(),
      );
      setVoidingProforma(null);
      setVoidReason('');
      await load();
    } catch (err) {
      setError(getProformaErrorMessage(err, 'No se pudo anular la proforma.'));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSelection = async () => {
    if (!pendingSelectionId) return;
    if (!requireActor()) return;
    if (!justification.trim()) {
      setError('La justificación de la selección es obligatoria.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await selectProforma(request.id, pendingSelectionId, justification, actingEmployeeName, selectionNotes.trim() || undefined);
      if (updated) onRequestUpdated(updated);
      setPendingSelectionId(null);
      setJustification('');
      setSelectionNotes('');
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo registrar la selección.'));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateOrder = async () => {
    if (!requireActor()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await generatePurchaseOrder(request.id, actingEmployeeName);
      if (updated) onRequestUpdated(updated);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo generar la orden de compra.'));
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!requireActor()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await finalizeRequest(request.id, actingEmployeeName);
      if (updated) onRequestUpdated(updated);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo finalizar la solicitud.'));
    } finally {
      setBusy(false);
    }
  };

  const isCompras = actingRole === 'COMPRAS';
  const activeProformas = proformas.filter((p) => !p.voided);
  const canAddProforma = isCompras && (request.status === 'EN_COTIZACION' || request.status === 'COTIZADA');
  const canStartQuotation = isCompras && request.status === 'APROBADA';
  const canMarkAsQuoted = isCompras && request.status === 'EN_COTIZACION' && activeProformas.length > 0;
  const canSelect = isCompras && (request.status === 'COTIZADA' || request.status === 'EN_EVALUACION');
  const canGenerateOrder = isCompras && request.status === 'APROBADA_PARA_COMPRA';
  const canFinalize = (isCompras || actingRole === 'ADMINISTRADOR') && request.status === 'ORDEN_GENERADA';

  // Unión de productos cotizados en cualquier proforma, para la tabla comparativa.
  const comparisonProducts = useMemo(() => {
    const set = new Set<string>();
    proformas.forEach((p) => p.lines.forEach((l: ProformaLine) => set.add(l.product)));
    return Array.from(set);
  }, [proformas]);

  const findLine = (p: Proforma, product: string) => p.lines.find((l) => l.product === product);

  if (request.status === 'BORRADOR' || request.status === 'PENDIENTE_APROBACION' || request.status === 'RECHAZADA' || request.status === 'CANCELADA') {
    return null; // Etapa de cotización no aplica todavía (o ya no aplica) a este estado.
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
            <Building2 size={16} /> Proformas de proveedores
          </h3>
          <div className="flex flex-wrap gap-2">
            {canStartQuotation && (
              <button onClick={handleStartQuotation} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white rounded-lg">
                <PlayCircle size={14} /> Iniciar cotización
              </button>
            )}
            {canAddProforma && (
              <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">
                <Plus size={14} /> {showForm ? 'Cancelar' : 'Registrar proforma'}
              </button>
            )}
            {canMarkAsQuoted && (
              <button onClick={handleMarkAsQuoted} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg">
                <ClipboardCheck size={14} /> Marcar como cotizada
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-400 text-sm">Cargando proformas...</div>
        ) : proformas.length === 0 && !showForm ? (
          <p className="text-sm text-slate-400">Aún no se registraron proformas para esta solicitud.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
            {proformas.map((p) => {
              const validity = getProformaValidity(p.expiryDate);
              const isSelected = request.selectedProformaId === p.id;
              return (
                <div key={p.id} className={`p-3 rounded-lg border text-sm ${p.voided ? 'border-slate-200 bg-slate-50 opacity-60' : isSelected ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className={`font-medium text-slate-800 truncate ${p.voided ? 'line-through' : ''}`}>{p.providerName || p.providerId}</p>
                      <p className="text-xs text-slate-500">#{p.number}</p>
                    </div>
                    {p.voided ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300">
                        <Ban size={11} /> ANULADA
                      </span>
                    ) : isSelected ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                        <Award size={11} /> SELECCIONADA
                      </span>
                    ) : isCompras && (request.status === 'EN_COTIZACION' || request.status === 'COTIZADA') ? (
                      <button
                        onClick={() => { setVoidingProforma(p); setVoidReason(''); setError(null); }}
                        disabled={busy}
                        title="Anular proforma"
                        className="shrink-0 p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Ban size={14} />
                      </button>
                    ) : null}
                  </div>
                  {p.voided && p.voidReason && (
                    <p className="mt-1 text-xs text-slate-500 italic">Motivo: {p.voidReason}</p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>Emisión: {formatDate(p.issueDate)}</span>
                    <span>Entrega: {p.deliveryTime || '—'}</span>
                    <span className="flex items-center gap-1">
                      Vence: {formatDate(p.expiryDate)}
                      <StatusChip status={VALIDITY_LABEL[validity]} tone={VALIDITY_CHIP[validity]} />
                    </span>
                    <span>Pago: {p.paymentTerms || '—'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`font-bold text-slate-800 ${p.voided ? 'line-through' : ''}`}>{p.currency} {p.total.toFixed(2)}</span>
                    {p.attachmentName && (
                      <span className="flex items-center gap-1 text-xs text-slate-400"><Paperclip size={12} /> {p.attachmentName}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {voidingProforma && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Ban size={15} className="text-red-500" />
              Anular proforma de {voidingProforma.providerName || voidingProforma.providerId}
            </h4>
            <label className={labelCls}>Motivo de anulación (obligatorio)</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={2}
              autoFocus
              className={inputCls}
              placeholder="Ej: precio cargado por error, proveedor se retractó..."
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => { setVoidingProforma(null); setVoidReason(''); }}
                className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmVoid}
                disabled={busy}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg font-medium"
              >
                Confirmar anulación
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreateProforma} className="mt-3 border-t border-slate-200 pt-3 space-y-3">
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Proveedor</label>
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>N.º de proforma</label>
                <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fecha de emisión</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Validez (días)</label>
                <input type="number" min={1} value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} className={inputCls} />
                <p className="text-[11px] text-slate-400 mt-0.5">Vence: {expiryPreview ? formatDate(expiryPreview) : '—'}</p>
              </div>
              <div>
                <label className={labelCls}>Moneda</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Descuento</label>
                <input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Impuesto (%)</label>
                <input type="number" min={0} step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tiempo de entrega</label>
                <input type="text" placeholder="Ej: 5 días" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Condiciones de pago</label>
                <input type="text" placeholder="Ej: Contado, 30 días crédito" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Archivo adjunto (PDF, Excel, Word, imagen — máx. {MAX_ATTACHMENT_MB} MB)</label>
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} className="text-xs" />
                {attachmentFile && attachmentFile.size > MAX_ATTACHMENT_BYTES && (
                  <p className="text-xs text-red-600 mt-1">
                    {(attachmentFile.size / (1024 * 1024)).toFixed(1)} MB supera el máximo de {MAX_ATTACHMENT_MB} MB.
                  </p>
                )}
              </div>
              <div className="col-span-2 md:col-span-4">
                <label className={labelCls}>Observaciones</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className={labelCls}>Productos cotizados</label>
                <button type="button" onClick={addLine} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">+ Agregar producto</button>
              </div>
              <div className="space-y-2">
                {linesWithSubtotal.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input type="text" placeholder="Producto" value={line.product} onChange={(e) => updateLine(i, { product: e.target.value })} className={`${inputCls} col-span-6`} />
                    <input type="number" min={1} placeholder="Cant." value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className={`${inputCls} col-span-2`} />
                    <input type="number" min={0} step="0.01" placeholder="Precio" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} className={`${inputCls} col-span-2`} />
                    <span className="col-span-1 text-xs text-slate-600 text-right">{line.subtotal.toFixed(2)}</span>
                    <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="col-span-1 text-slate-400 hover:text-red-600 disabled:opacity-30 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end text-sm text-slate-600 gap-4">
              <span>Subtotal: {totals.subtotal.toFixed(2)}</span>
              <span>Impuesto: {totals.taxAmount.toFixed(2)}</span>
              <span className="font-bold text-slate-900">Total: {currency} {totals.total.toFixed(2)}</span>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={busy} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium">
                {busy ? 'Guardando...' : 'Guardar proforma'}
              </button>
            </div>
          </form>
        )}
      </div>

      {proformas.length > 0 && (request.status === 'COTIZADA' || request.status === 'EN_EVALUACION' || request.status === 'APROBADA_PARA_COMPRA' || request.status === 'ORDEN_GENERADA' || request.status === 'FINALIZADA') && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 overflow-x-auto custom-scrollbar">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">Comparación de proformas</h3>
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left border-b border-slate-200">
                <th className="py-2 pr-2">Producto</th>
                {proformas.map((p) => (
                  <th key={p.id} className={`py-2 px-2 text-right ${p.voided ? 'text-slate-400 line-through' : ''}`}>
                    {p.providerName || p.providerId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonProducts.map((product) => (
                <tr key={product} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-medium">{product}</td>
                  {proformas.map((p) => {
                    const line = findLine(p, product);
                    return <td key={p.id} className="py-2 px-2 text-right">{line ? `${p.currency} ${line.subtotal.toFixed(2)}` : '—'}</td>;
                  })}
                </tr>
              ))}
              <tr className="border-b border-slate-100 text-slate-500">
                <td className="py-2 pr-2">Entrega</td>
                {proformas.map((p) => <td key={p.id} className="py-2 px-2 text-right">{p.deliveryTime || '—'}</td>)}
              </tr>
              <tr className="font-bold text-slate-900">
                <td className="py-2 pr-2">Total</td>
                {proformas.map((p) => <td key={p.id} className="py-2 px-2 text-right">{p.currency} {p.total.toFixed(2)}</td>)}
              </tr>
              {canSelect && (
                <tr>
                  <td className="py-2 pr-2"></td>
                  {proformas.map((p) => (
                    <td key={p.id} className="py-2 px-2 text-right">
                      {p.voided ? (
                        <span className="text-xs text-slate-400 italic">Anulada</span>
                      ) : (
                        <button
                          onClick={() => setPendingSelectionId(p.id)}
                          disabled={busy || request.selectedProformaId === p.id}
                          className="text-xs px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium"
                        >
                          {request.selectedProformaId === p.id ? 'Elegida' : 'Elegir'}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>

          {pendingSelectionId && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-sm text-slate-600 mb-2 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                La proforma seleccionada no tiene que ser la más barata, pero debes justificar la elección.
              </p>
              <label className={labelCls}>Justificación (obligatoria)</label>
              <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} className={inputCls} />
              <label className={`${labelCls} mt-2`}>Observaciones (opcional)</label>
              <textarea value={selectionNotes} onChange={(e) => setSelectionNotes(e.target.value)} rows={2} className={inputCls} />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setPendingSelectionId(null)} className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">Cancelar</button>
                <button onClick={handleConfirmSelection} disabled={busy} className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium">Confirmar selección</button>
              </div>
            </div>
          )}

          {request.selectedProformaId && request.selectionJustification && (
            <div className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600">
              <p><span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">Justificación de la selección</span>{request.selectionJustification}</p>
              {request.selectionNotes && <p className="mt-2"><span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">Observaciones</span>{request.selectionNotes}</p>}
            </div>
          )}
        </div>
      )}

      {canGenerateOrder && (
        <div className="bg-white rounded-xl border border-cyan-200 shadow-sm p-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">La proforma ya fue seleccionada. Genera la orden de compra para continuar.</p>
          <button onClick={handleGenerateOrder} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg font-medium">
            <ShoppingCart size={18} /> Generar orden de compra
          </button>
        </div>
      )}

      {request.generatedOrderReference && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center justify-between gap-3 text-sm text-teal-800">
          <span>Orden de compra generada: <strong>{request.generatedOrderReference}</strong>.</span>
          {onNavigateToOrder ? (
            <button
              onClick={() => onNavigateToOrder(request.generatedOrderReference!)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
            >
              <ShoppingCart size={14} /> Ver orden de compra
            </button>
          ) : (
            <span>Búscala en "Órdenes de compra" para darle seguimiento a la recepción.</span>
          )}
        </div>
      )}

      {canFinalize && (
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">Cuando la compra esté completa, cierra el ciclo de esta solicitud.</p>
          <button onClick={handleFinalize} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white rounded-lg font-medium">
            <CheckCheck size={18} /> Marcar como finalizada
          </button>
        </div>
      )}
    </div>
  );
};

export default ProformaPanel;
