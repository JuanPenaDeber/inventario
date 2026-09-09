import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Search,
  Plus,
  Ban,
  Edit,
  Send,
  User,
  Calendar,
  Clock,
  X,
  UserCog,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  Employee,
  PurchaseRequest,
  PurchaseRequestStatus,
  PURCHASE_REQUEST_STATUSES,
  PurchaseFlowRole,
  PURCHASE_FLOW_ROLES,
} from '@/types';
import { getEmployees } from '@/shared/api/inventoryService';
import {
  getPurchaseRequests,
  getPurchaseRequest,
  getPurchaseRequestHistory,
  createPurchaseRequest,
  updatePurchaseRequest,
  submitPurchaseRequest,
  cancelPurchaseRequest,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  getPurchaseRequestErrorMessage,
} from '@/features/compras/solicitudes/purchaseRequestService';
import { isWithinDateRange, downloadXlsx, formatDate, formatDateTime, rangeSuffix } from '@/shared/utils/reportUtils';
import DateRangeBar from '@/shared/components/DateRangeBar';
import PurchaseRequestForm, { PurchaseRequestFormValues } from '@/features/compras/solicitudes/PurchaseRequestForm';
import ProformaPanel from '@/features/compras/proformas/ProformaPanel';
import ConfirmDialog, { ConfirmDialogState } from '@/shared/components/ConfirmDialog';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import type { PurchaseRequestHistoryEntry } from '@/types';

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

// Estados que ya tienen acciones en la Fase 1. El resto del flujo (cotización,
// comparación, orden de compra...) se habilita en fases siguientes.
const IN_PROGRESS_STATUSES: PurchaseRequestStatus[] = [
  'EN_COTIZACION', 'COTIZADA', 'EN_EVALUACION', 'APROBADA_PARA_COMPRA', 'ORDEN_GENERADA', 'FINALIZADA',
];

// --- "Actuando como" (Fase 2) -----------------------------------------------
// Selector ligero SIN seguridad real: no hay login, así que cualquiera puede
// elegir cualquier rol/empleado. Solo sirve para decidir qué acciones se
// muestran (aprobar/rechazar requiere rol JEFE) y para registrar un nombre
// como actor de esas acciones. Se persiste en sessionStorage por comodidad
// (dura la pestaña, no el usuario). Ver README.md.
const ACTING_AS_KEY = 'purchaseFlow.actingAs';

interface ActingAs {
  role: PurchaseFlowRole;
  employeeId: string;
}

function loadActingAs(): ActingAs {
  try {
    const raw = sessionStorage.getItem(ACTING_AS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.role === 'string' && typeof parsed.employeeId === 'string') {
        return parsed;
      }
    }
  } catch {
    // sessionStorage puede fallar (modo privado, etc.) — se usa el valor por defecto.
  }
  return { role: 'SOLICITANTE', employeeId: '' };
}

type ViewMode = 'list' | 'form';

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
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const {
    data: { requests, employees },
    loading,
    error,
    setError,
    refresh,
  } = useAsyncData<{ requests: PurchaseRequest[]; employees: Employee[] }>(
    async () => {
      const [reqData, empData] = await Promise.all([getPurchaseRequests(), getEmployees()]);
      return { requests: reqData, employees: empData };
    },
    { requests: [], employees: [] },
    {
      errorMessage: 'No se pudieron cargar las solicitudes de compra.',
      getErrorMessage: getPurchaseRequestErrorMessage,
    },
  );

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(initialRequestId || null);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [history, setHistory] = useState<PurchaseRequestHistoryEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [editingRequest, setEditingRequest] = useState<PurchaseRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // "Actuando como" (Fase 2) — ver nota junto a loadActingAs().
  const [actingRole, setActingRole] = useState<PurchaseFlowRole>(() => loadActingAs().role);
  const [actingEmployeeId, setActingEmployeeId] = useState<string>(() => loadActingAs().employeeId);
  const [decisionComment, setDecisionComment] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(ACTING_AS_KEY, JSON.stringify({ role: actingRole, employeeId: actingEmployeeId }));
    } catch {
      // Sin persistencia si sessionStorage no está disponible; no es crítico.
    }
  }, [actingRole, actingEmployeeId]);

  const actingEmployeeName = useMemo(
    () => employees.find((e) => e.id === actingEmployeeId)?.name || '',
    [employees, actingEmployeeId],
  );

  // Consume la solicitud inicial (llegada por navegación cruzada) una sola vez.
  useEffect(() => {
    if (initialRequestId) onConsumeInitialRequest?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadDetail = async () => {
      setDecisionComment('');
      if (!selectedRequestId) {
        setSelectedRequest(null);
        setHistory([]);
        return;
      }
      setLoadingDetail(true);
      try {
        const [detail, hist] = await Promise.all([
          getPurchaseRequest(selectedRequestId),
          getPurchaseRequestHistory(selectedRequestId),
        ]);
        setSelectedRequest(detail);
        setHistory(hist);
      } catch (err) {
        setError(getPurchaseRequestErrorMessage(err, 'No se pudo cargar el detalle de la solicitud.'));
      } finally {
        setLoadingDetail(false);
      }
    };
    loadDetail();
  }, [selectedRequestId, setError]);

  /** Vuelve a traer detalle + histórico de una solicitud ya seleccionada. */
  const reloadSelectedDetail = async (id: string) => {
    const [detail, hist] = await Promise.all([getPurchaseRequest(id), getPurchaseRequestHistory(id)]);
    setSelectedRequest(detail);
    setHistory(hist);
  };

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests
      .filter((r) => {
        const matchesSearch =
          !q ||
          r.code.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          r.area.toLowerCase().includes(q) ||
          r.position.toLowerCase().includes(q) ||
          r.supervisorName.toLowerCase().includes(q) ||
          r.lines.some((l) => l.product.toLowerCase().includes(q));
        const matchesStatus = !statusFilter || r.status === statusFilter;
        const matchesDate = isWithinDateRange(r.requestDate, startDate, endDate);
        return matchesSearch && matchesStatus && matchesDate;
      })
      .sort((a, b) => (b.requestDate || '').localeCompare(a.requestDate || ''));
  }, [requests, search, statusFilter, startDate, endDate]);

  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = { EN_PROCESO: 0 };
    filteredRequests.forEach((r) => {
      if (IN_PROGRESS_STATUSES.includes(r.status)) {
        counts.EN_PROCESO += 1;
      } else {
        counts[r.status] = (counts[r.status] || 0) + 1;
      }
    });
    return counts;
  }, [filteredRequests]);

  // --- Acciones ---

  const handleCreate = () => {
    setEditingRequest(null);
    setViewMode('form');
  };

  const handleEditStart = async (request: PurchaseRequest) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const detail = await getPurchaseRequest(request.id);
      setEditingRequest(detail);
      setViewMode('form');
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo cargar la solicitud para editar.'));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveRequest = async (values: PurchaseRequestFormValues) => {
    setSaving(true);
    setError(null);
    try {
      let requestId = values.id;
      if (values.id) {
        // El actor conocido en Fase 1 es el propio solicitante de la solicitud
        // (todavía no hay login/roles reales: ver Fase 2/4).
        const actorName = editingRequest?.requesterName || 'Solicitante';
        await updatePurchaseRequest(
          values.id,
          {
            requestDate: values.requestDate,
            requesterId: values.requesterId,
            area: values.area,
            position: values.position,
            supervisorId: values.supervisorId,
            reason: values.reason,
            lines: values.lines,
          },
          actorName,
        );
      } else {
        const requesterName = employees.find((e) => e.id === values.requesterId)?.name || 'Solicitante';
        const created = await createPurchaseRequest(
          {
            requestDate: values.requestDate,
            requesterId: values.requesterId,
            area: values.area,
            position: values.position,
            supervisorId: values.supervisorId,
            reason: values.reason,
            lines: values.lines,
          },
          requesterName,
        );
        requestId = created.id;
      }

      if (values.submitForApproval && requestId) {
        const actorName =
          employees.find((e) => e.id === values.requesterId)?.name ||
          editingRequest?.requesterName ||
          'Solicitante';
        await submitPurchaseRequest(requestId, actorName);
      }

      setSelectedRequestId(requestId || null);
      await refresh();
      setViewMode('list');
      setEditingRequest(null);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo guardar la solicitud de compra.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async (request: PurchaseRequest) => {
    setError(null);
    try {
      await submitPurchaseRequest(request.id, request.requesterName);
      await refresh();
      if (selectedRequestId === request.id) await reloadSelectedDetail(request.id);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo enviar la solicitud a aprobación.'));
    }
  };

  const handleCancelRequest = (request: PurchaseRequest) => {
    setConfirmState({
      message: `¿Cancelar la solicitud ${request.code}? Esta acción no se puede deshacer.`,
      tone: 'danger',
      confirmLabel: 'Cancelar solicitud',
      onConfirm: () => doCancelRequest(request),
    });
  };

  const doCancelRequest = async (request: PurchaseRequest) => {
    setConfirmState(null);
    setError(null);
    try {
      await cancelPurchaseRequest(request.id, request.requesterName);
      await refresh();
      if (selectedRequestId === request.id) await reloadSelectedDetail(request.id);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo cancelar la solicitud.'));
    }
  };

  const handleApprove = (request: PurchaseRequest) => {
    if (!actingEmployeeName) {
      setError('Elige quién está "actuando como" jefe antes de aprobar.');
      return;
    }
    setConfirmState({
      message: `¿Aprobar la solicitud ${request.code}?`,
      confirmLabel: 'Aprobar',
      onConfirm: () => doApprove(request),
    });
  };

  const doApprove = async (request: PurchaseRequest) => {
    setConfirmState(null);
    setDeciding(true);
    setError(null);
    try {
      await approvePurchaseRequest(request.id, actingEmployeeName, decisionComment.trim() || undefined);
      setDecisionComment('');
      await refresh();
      await reloadSelectedDetail(request.id);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo aprobar la solicitud.'));
    } finally {
      setDeciding(false);
    }
  };

  const handleReject = (request: PurchaseRequest) => {
    if (!actingEmployeeName) {
      setError('Elige quién está "actuando como" jefe antes de rechazar.');
      return;
    }
    if (!decisionComment.trim()) {
      setError('El motivo de rechazo es obligatorio.');
      return;
    }
    setConfirmState({
      message: `¿Rechazar la solicitud ${request.code}? Esta acción no se puede deshacer.`,
      tone: 'danger',
      confirmLabel: 'Rechazar',
      onConfirm: () => doReject(request),
    });
  };

  const doReject = async (request: PurchaseRequest) => {
    setConfirmState(null);
    setDeciding(true);
    setError(null);
    try {
      await rejectPurchaseRequest(request.id, actingEmployeeName, decisionComment.trim());
      setDecisionComment('');
      await refresh();
      await reloadSelectedDetail(request.id);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo rechazar la solicitud.'));
    } finally {
      setDeciding(false);
    }
  };

  const handleExport = async () => {
    const header = ['Código', 'Fecha', 'Solicitante', 'Área', 'Cargo', 'Jefe inmediato', 'Estado', 'Motivo'];
    const rows = filteredRequests.map((r) => [
      r.code,
      formatDate(r.requestDate),
      r.requesterName,
      r.area,
      r.position,
      r.supervisorName,
      r.status,
      r.reason,
    ]);
    await downloadXlsx(
      `solicitudes_compra_${rangeSuffix(startDate, endDate)}.xlsx`,
      'SolicitudesCompra',
      [header, ...rows],
      [18, 14, 22, 18, 20, 22, 20, 40],
    );
  };

  const canEdit = !!selectedRequest && selectedRequest.status === 'BORRADOR';
  const canSubmit = !!selectedRequest && selectedRequest.status === 'BORRADOR' && selectedRequest.lines.length > 0;
  const isTerminal = (s: PurchaseRequestStatus) => s === 'RECHAZADA' || s === 'FINALIZADA' || s === 'CANCELADA';
  const canCancel = !!selectedRequest && !isTerminal(selectedRequest.status);
  // Aprobar/rechazar requiere estar "actuando como" JEFE (Fase 2, sin seguridad real).
  const canDecide = !!selectedRequest && selectedRequest.status === 'PENDIENTE_APROBACION' && actingRole === 'JEFE';
  const supervisorMismatch =
    !!selectedRequest && !!actingEmployeeId && actingEmployeeId !== selectedRequest.supervisorId;

  // --- Render ---

  if (viewMode === 'form') {
    return (
      <PurchaseRequestForm
        initialData={editingRequest || undefined}
        onSave={handleSaveRequest}
        onCancel={() => { setViewMode('list'); setEditingRequest(null); }}
        saving={saving}
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
            <p className="text-slate-500 text-sm">Solicitud → aprobación → cotización → selección → orden de compra.</p>
          </div>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm shadow-cyan-500/30"
        >
          <Plus size={18} /> Nueva Solicitud
        </button>
      </div>

      {/* "Actuando como" — selector ligero sin seguridad real (ver README.md) */}
      <div className="mb-4 shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <UserCog size={16} className="text-slate-400" />
        <span className="text-slate-500">Actuando como:</span>
        <select
          value={actingRole}
          onChange={(e) => setActingRole(e.target.value as PurchaseFlowRole)}
          className="px-2 py-1 border border-slate-200 rounded-md bg-slate-50 text-slate-700"
        >
          {PURCHASE_FLOW_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={actingEmployeeId}
          onChange={(e) => setActingEmployeeId(e.target.value)}
          className="px-2 py-1 border border-slate-200 rounded-md bg-slate-50 text-slate-700"
        >
          <option value="">Sin seleccionar</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </select>
        {/* <span className="text-xs text-slate-400">
          Sin contraseña ni validación real — solo decide qué acciones se muestran.
        </span> */}
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={refresh} className="inline-flex items-center gap-1.5 font-medium hover:text-red-900">
              <RefreshCw size={14} /> Reintentar
            </button>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        </div>
      )}

      <div className="space-y-4 mb-4 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Código, solicitante, área, cargo, jefe o producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Todos</option>
              {PURCHASE_REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <DateRangeBar
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
          onExport={handleExport}
          shown={filteredRequests.length}
          total={requests.length}
          accent="cyan"
          label="solicitudes"
        />

        {/* Oculto si la carga falló, para no mostrar ceros que parezcan
            datos reales (ver PurchaseDashboard.tsx). */}
        {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {(['BORRADOR', 'PENDIENTE_APROBACION', 'APROBADA', 'RECHAZADA', 'CANCELADA'] as PurchaseRequestStatus[]).map((s) => (
            <div key={s} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
              <p className="text-xs text-slate-500">{s.replace(/_/g, ' ')}</p>
              <p className="text-xl font-bold text-slate-800">{countsByStatus[s] || 0}</p>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <p className="text-xs text-slate-500">En proceso de compra</p>
            <p className="text-xl font-bold text-slate-800">{countsByStatus.EN_PROCESO || 0}</p>
          </div>
        </div>
        )}
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 bg-white rounded-xl shadow-sm border border-slate-200">
        {/* Lista */}
        <div className="w-full md:w-1/3 border-r border-slate-200 flex flex-col md:max-h-[calc(100vh-8rem)] md:overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando solicitudes...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No hay solicitudes de compra registradas.</div>
          ) : (
            filteredRequests.map((request) => {
              const isSelected = request.id === selectedRequestId;
              return (
                <div
                  key={request.id}
                  onClick={() => setSelectedRequestId(request.id)}
                  className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${isSelected ? 'bg-cyan-50/60 border-l-4 border-l-cyan-500' : 'border-l-4 border-l-transparent'}`}
                >
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h3 className={`font-medium text-sm truncate ${isSelected ? 'text-cyan-900' : 'text-slate-800'}`}>{request.code}</h3>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${STATUS_CHIP[request.status]}`}>
                      {request.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1 truncate">{request.requesterName} · {request.area}</p>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{formatDate(request.requestDate)}</span>
                    <span>{request.lines.length ? `${request.lines.length} producto(s)` : ''}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detalle */}
        <div className="w-full md:w-2/3 flex flex-col bg-slate-50/30">
          {selectedRequest ? (
            <>
              <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-800 truncate">{selectedRequest.code}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><User size={14} /> {selectedRequest.requesterName} ({selectedRequest.position})</span>
                    <span className="flex items-center gap-1"><Calendar size={14} /> {formatDate(selectedRequest.requestDate)}</span>
                  </div>
                  <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-bold border ${STATUS_CHIP[selectedRequest.status]}`}>
                    {selectedRequest.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  {canEdit && (
                    <button onClick={() => handleEditStart(selectedRequest)} className="p-2 border rounded hover:bg-slate-50 text-slate-600" title="Editar">
                      <Edit size={18} />
                    </button>
                  )}
                  {canSubmit && (
                    <button onClick={() => handleSubmitForApproval(selectedRequest)} className="p-2 border rounded hover:bg-cyan-50 text-cyan-600 border-cyan-200" title="Enviar a aprobación">
                      <Send size={18} />
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={() => handleCancelRequest(selectedRequest)} className="p-2 border rounded hover:bg-red-50 text-red-600 border-red-200" title="Cancelar solicitud">
                      <Ban size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 p-6 space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm text-slate-700">
                  <p><span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">Área / Departamento</span>{selectedRequest.area}</p>
                  <p className="mt-3"><span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">Jefe inmediato</span>{selectedRequest.supervisorName}</p>
                  <p className="mt-3"><span className="font-bold text-slate-500 text-xs uppercase block mb-0.5">Motivo / Justificación</span>{selectedRequest.reason}</p>
                  {selectedRequest.rejectionReason && (
                    <p className="mt-3 text-rose-700"><span className="font-bold text-rose-500 text-xs uppercase block mb-0.5">Motivo de rechazo</span>{selectedRequest.rejectionReason}</p>
                  )}
                </div>

                {canDecide && (
                  <div className="bg-white rounded-xl border border-cyan-200 shadow-sm p-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                      <UserCog size={16} /> Decisión del jefe inmediato
                    </h3>

                    {!actingEmployeeId && (
                      <p className="mb-3 text-sm text-amber-700 flex items-center gap-2">
                        <AlertTriangle size={14} /> Elige un empleado en "Actuando como" para poder aprobar o rechazar.
                      </p>
                    )}
                    {supervisorMismatch && (
                      <p className="mb-3 text-sm text-amber-700 flex items-center gap-2">
                        <AlertTriangle size={14} />
                        El jefe inmediato registrado es <strong className="mx-1">{selectedRequest.supervisorName}</strong>,
                        pero estás actuando como <strong className="mx-1">{actingEmployeeName}</strong>. Se permite igual
                        (sin seguridad real en esta fase), pero verifica que sea correcto.
                      </p>
                    )}

                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Comentario (opcional para aprobar, obligatorio para rechazar)
                    </label>
                    <textarea
                      value={decisionComment}
                      onChange={(e) => setDecisionComment(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
                    />

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => handleReject(selectedRequest)}
                        disabled={deciding || !actingEmployeeId}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
                      >
                        <XCircle size={18} /> Rechazar
                      </button>
                      <button
                        onClick={() => handleApprove(selectedRequest)}
                        disabled={deciding || !actingEmployeeId}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
                      >
                        <CheckCircle2 size={18} /> Aprobar
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><FileText size={16} /> Detalle de productos</h3>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto custom-scrollbar">
                    {loadingDetail ? (
                      <div className="p-8 text-center text-slate-400">Cargando detalle...</div>
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
                          {selectedRequest.lines.length === 0 ? (
                            <tr><td colSpan={6} className="p-4 text-center text-slate-400">Sin productos.</td></tr>
                          ) : (
                            selectedRequest.lines.map((line) => (
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
                  request={selectedRequest}
                  actingRole={actingRole}
                  actingEmployeeName={actingEmployeeName}
                  onNavigateToOrder={onNavigateToOrder}
                  onRequestUpdated={async (updated) => {
                    await refresh();
                    await reloadSelectedDetail(updated.id);
                  }}
                />

                <div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><Clock size={16} /> Histórico</h3>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                    {history.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-sm">Sin movimientos registrados.</div>
                    ) : (
                      history.map((entry) => (
                        <div key={entry.id} className="p-3 text-sm flex justify-between gap-3">
                          <div>
                            <p className="text-slate-800"><span className="font-medium">{entry.actorName}</span> · {entry.action}</p>
                            {entry.details && <p className="text-xs text-slate-500 mt-0.5">{entry.details}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-slate-400">{formatDateTime(entry.date)}</p>
                            <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${STATUS_CHIP[entry.status]}`}>
                              {entry.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-[400px] flex flex-col items-center justify-center text-slate-400">
              <FileText size={48} className="opacity-20 mb-4" />
              <p>Selecciona una solicitud para ver el detalle</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} busy={deciding} />
    </div>
  );
};

export default PurchaseRequestManager;
