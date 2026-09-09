import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Save, Send, Lightbulb } from 'lucide-react';
import { PurchaseRequest, PurchaseRequestLine, Employee, ProductSuggestion } from '@/types';
import { getEmployees } from '@/shared/api/inventoryService';
import { PRIORITIES } from '@/features/compras/solicitudes/purchaseRequestService';
import { getProductSuggestions, matchSuggestions } from '@/features/compras/sugerencias/suggestionService';

// Forma unificada que recibe el padre (PurchaseRequestManager) para decidir
// si crea o actualiza. `id` presente => update; ausente => create.
// `submitForApproval` le indica al padre si, además de guardar, debe enviar
// la solicitud a aprobación (BORRADOR -> PENDIENTE_APROBACION).
export interface PurchaseRequestFormValues {
  id?: string;
  requestDate: string;
  requesterId: string;
  area: string;
  position: string;
  supervisorId: string;
  reason: string;
  lines: PurchaseRequestLine[];
  submitForApproval: boolean;
}

interface PurchaseRequestFormProps {
  initialData?: PurchaseRequest;
  onSave: (values: PurchaseRequestFormValues) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

type LineDraft = PurchaseRequestLine;

const emptyLine = (): LineDraft => ({
  id: '',
  product: '',
  quantity: 1,
  unit: '',
  targetArea: '',
  notes: '',
  priority: undefined,
});

const today = (): string => new Date().toISOString().slice(0, 10);

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none bg-white';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

const PurchaseRequestForm: React.FC<PurchaseRequestFormProps> = ({ initialData, onSave, onCancel, saving = false }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requestDate, setRequestDate] = useState(today());
  const [requesterId, setRequesterId] = useState('');
  const [area, setArea] = useState('');
  const [position, setPosition] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);

  useEffect(() => {
    getEmployees().then(setEmployees);
    getProductSuggestions().then(setSuggestions).catch(() => setSuggestions([]));
  }, []);

  // Sugerencias configurables por Administrador (sección 7 del pedido), según
  // el área y cargo ya escritos en el formulario.
  const matchingSuggestions = useMemo(
    () => matchSuggestions(suggestions, area, position),
    [suggestions, area, position],
  );

  const applySuggestion = (product: string) => {
    setLines((prev) => {
      // Si la única línea sigue vacía, la completa; si no, agrega una nueva.
      if (prev.length === 1 && !prev[0].product.trim()) {
        return [{ ...prev[0], product }];
      }
      if (prev.some((l) => l.product.trim().toLowerCase() === product.trim().toLowerCase())) {
        return prev; // Ya está agregado, no duplicar.
      }
      return [...prev, { ...emptyLine(), product }];
    });
  };

  useEffect(() => {
    if (initialData) {
      setRequestDate(initialData.requestDate || today());
      setRequesterId(initialData.requesterId);
      setArea(initialData.area);
      setPosition(initialData.position);
      setSupervisorId(initialData.supervisorId);
      setReason(initialData.reason);
      setLines(initialData.lines.length > 0 ? initialData.lines.map((l) => ({ ...l })) : [emptyLine()]);
    }
  }, [initialData]);

  const handleRequesterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const empId = e.target.value;
    setRequesterId(empId);
    clearError('requesterId');
    const emp = employees.find((x) => x.id === empId);
    if (emp) {
      setArea(emp.equipo);
      clearError('area');
    }
  };

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
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
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const canEditLines = !initialData || initialData.status === 'BORRADOR';

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    const nextLineErrors: Record<number, string> = {};

    if (!requestDate) nextErrors.requestDate = 'La fecha de solicitud es obligatoria.';
    if (!requesterId) nextErrors.requesterId = 'Selecciona el solicitante.';
    if (!area.trim()) nextErrors.area = 'El área/departamento es obligatorio.';
    if (!position.trim()) nextErrors.position = 'El cargo es obligatorio.';
    if (!supervisorId) nextErrors.supervisorId = 'Selecciona el jefe inmediato.';
    if (!reason.trim()) nextErrors.reason = 'El motivo de la compra es obligatorio.';

    if (lines.length === 0) {
      nextErrors.lines = 'Agrega al menos un producto.';
    }

    lines.forEach((line, i) => {
      if (!line.product.trim()) {
        nextLineErrors[i] = 'Falta la descripción del producto.';
      } else if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isInteger(line.quantity)) {
        nextLineErrors[i] = 'La cantidad debe ser un entero mayor a 0.';
      } else if (!line.unit.trim()) {
        nextLineErrors[i] = 'Falta la unidad de medida.';
      }
    });

    setErrors(nextErrors);
    setLineErrors(nextLineErrors);
    return Object.keys(nextErrors).length === 0 && Object.keys(nextLineErrors).length === 0;
  };

  const submitValues = (submitForApproval: boolean) => {
    if (!validate()) return;
    onSave({
      id: initialData?.id,
      requestDate,
      requesterId,
      area: area.trim(),
      position: position.trim(),
      supervisorId,
      reason: reason.trim(),
      lines,
      submitForApproval,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitValues(false);
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
            {initialData ? `Editar solicitud ${initialData.code}` : 'Nueva solicitud de compra'}
          </h1>
          <p className="text-slate-500 text-sm">
            {initialData
              ? 'Solo se puede editar mientras la solicitud está en BORRADOR.'
              : 'El código se genera automáticamente al guardar.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cabecera */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-slate-800 mb-4 border-b pb-2">Datos generales</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Fecha de solicitud</label>
              <input
                type="date"
                value={requestDate}
                onChange={(e) => { setRequestDate(e.target.value); clearError('requestDate'); }}
                className={inputCls}
              />
              {errors.requestDate && <p className="text-xs text-red-600 mt-1">{errors.requestDate}</p>}
            </div>

            <div>
              <label className={labelCls}>Solicitante</label>
              <select value={requesterId} onChange={handleRequesterChange} className={inputCls}>
                <option value="">Seleccionar empleado</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              {errors.requesterId && <p className="text-xs text-red-600 mt-1">{errors.requesterId}</p>}
            </div>

            <div>
              <label className={labelCls}>Área / Departamento</label>
              <input
                type="text"
                value={area}
                onChange={(e) => { setArea(e.target.value); clearError('area'); }}
                className={inputCls}
              />
              {errors.area && <p className="text-xs text-red-600 mt-1">{errors.area}</p>}
            </div>

            <div>
              <label className={labelCls}>Cargo</label>
              <input
                type="text"
                value={position}
                onChange={(e) => { setPosition(e.target.value); clearError('position'); }}
                placeholder="Ej: Analista de Sistemas"
                className={inputCls}
              />
              {errors.position && <p className="text-xs text-red-600 mt-1">{errors.position}</p>}
            </div>

            <div>
              <label className={labelCls}>Jefe inmediato</label>
              <select
                value={supervisorId}
                onChange={(e) => { setSupervisorId(e.target.value); clearError('supervisorId'); }}
                className={inputCls}
              >
                <option value="">Seleccionar empleado</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              {errors.supervisorId && <p className="text-xs text-red-600 mt-1">{errors.supervisorId}</p>}
              {requesterId && supervisorId && requesterId === supervisorId && (
                <p className="text-xs text-cyan-700 mt-1">
                  El solicitante es su propio jefe inmediato: podrá autoaprobarse.
                </p>
              )}
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Motivo / Justificación</label>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); clearError('reason'); }}
                rows={2}
                className={inputCls}
              />
              {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason}</p>}
            </div>
          </div>
        </div>

        {/* Detalle de productos */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="font-bold text-slate-800">Detalle de productos</h2>
            {canEditLines && (
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-700"
              >
                <Plus size={16} /> Agregar producto
              </button>
            )}
          </div>

          {errors.lines && <p className="text-xs text-red-600 mb-2">{errors.lines}</p>}

          {canEditLines && matchingSuggestions.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Lightbulb size={14} className="text-amber-500" /> Sugeridos para {position}:
              </span>
              {matchingSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applySuggestion(s.product)}
                  className="text-xs px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                >
                  + {s.product}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2 font-semibold">Producto / Descripción</th>
                  <th className="py-2 pr-2 font-semibold w-24">Cantidad</th>
                  <th className="py-2 pr-2 font-semibold w-28">Unidad</th>
                  <th className="py-2 pr-2 font-semibold w-32">Área destino</th>
                  <th className="py-2 pr-2 font-semibold w-28">Prioridad</th>
                  <th className="py-2 pr-2 font-semibold">Observaciones</th>
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
                          disabled={!canEditLines}
                          value={line.product}
                          onChange={(e) => updateLine(i, { product: e.target.value })}
                          placeholder="Ej: Computadora portátil"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={1}
                          step="1"
                          disabled={!canEditLines}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          disabled={!canEditLines}
                          value={line.unit}
                          onChange={(e) => updateLine(i, { unit: e.target.value })}
                          placeholder="Unidad"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          disabled={!canEditLines}
                          value={line.targetArea || ''}
                          onChange={(e) => updateLine(i, { targetArea: e.target.value })}
                          placeholder="Opcional"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          disabled={!canEditLines}
                          value={line.priority || ''}
                          onChange={(e) => updateLine(i, { priority: (e.target.value || undefined) as LineDraft['priority'] })}
                          className={inputCls}
                        >
                          <option value="">-</option>
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          disabled={!canEditLines}
                          value={line.notes || ''}
                          onChange={(e) => updateLine(i, { notes: e.target.value })}
                          placeholder="Opcional"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-2 text-center">
                        {canEditLines && (
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            disabled={lines.length === 1}
                            className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Quitar producto"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {lineErrors[i] && (
                      <tr>
                        <td colSpan={7} className="pb-2 text-xs text-red-600">{lineErrors[i]}</td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <Save size={18} />
            {saving ? 'Guardando...' : 'Guardar borrador'}
          </button>
          <button
            type="button"
            onClick={() => submitValues(true)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors shadow-sm shadow-cyan-500/20"
          >
            <Send size={18} />
            {saving ? 'Enviando...' : 'Enviar a aprobación'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseRequestForm;
