// =============================================================================
// Estado y acciones del módulo de Solicitudes de Compra.
//
// Es el más cargado de los cuatro porque tiene tres cosas que los otros no:
//
//   · un flujo de 11 estados con transiciones válidas (el servicio las valida);
//   · un histórico append-only que se recarga junto al detalle;
//   · el selector "Actuando como", que decide qué botones de decisión se ven.
//
// Ese último NO es seguridad: es un selector de UI sin autenticación, guardado
// en sessionStorage. La regla real de permisos vive en el rol del usuario API
// de EspoCRM (ver ARCHITECTURE.md).
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Employee,
  PurchaseFlowRole,
  PurchaseRequest,
  PurchaseRequestHistoryEntry,
  PurchaseRequestStatus,
} from '@/types';
import { getEmployees } from '@/shared/api/inventoryService';
import {
  approvePurchaseRequest,
  cancelPurchaseRequest,
  createPurchaseRequest,
  getPurchaseRequest,
  getPurchaseRequestErrorMessage,
  getPurchaseRequestHistory,
  getPurchaseRequests,
  rejectPurchaseRequest,
  submitPurchaseRequest,
  updatePurchaseRequest,
} from '@/features/compras/solicitudes/purchaseRequestService';
import { downloadXlsx, formatDate, isWithinDateRange, rangeSuffix } from '@/shared/utils/reportUtils';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import type { ConfirmDialogState } from '@/shared/components/ConfirmDialog';
import type { PurchaseRequestFormValues } from '@/features/compras/solicitudes/PurchaseRequestForm';

export type PurchaseRequestViewMode = 'list' | 'form';

/** Estados que el resumen agrupa bajo "En proceso de compra". */
export const IN_PROGRESS_STATUSES: PurchaseRequestStatus[] = [
  'EN_COTIZACION',
  'COTIZADA',
  'EN_EVALUACION',
  'APROBADA_PARA_COMPRA',
  'ORDEN_GENERADA',
];

const ACTING_AS_KEY = 'purchaseFlow.actingAs';

interface ActingAs {
  role: PurchaseFlowRole;
  employeeId: string;
}

/**
 * Lee el rol activo de sessionStorage (no localStorage: se olvida al cerrar la
 * pestaña, a propósito, porque no es una sesión real).
 */
function loadActingAs(): ActingAs {
  try {
    const raw = sessionStorage.getItem(ACTING_AS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ActingAs>;
      return {
        role: (parsed.role as PurchaseFlowRole) || 'SOLICITANTE',
        employeeId: parsed.employeeId || '',
      };
    }
  } catch {
    // sessionStorage no disponible o JSON corrupto: se arranca por defecto.
  }
  return { role: 'SOLICITANTE', employeeId: '' };
}

interface Options {
  initialRequestId?: string;
  onConsumeInitialRequest?: () => void;
}

export function usePurchaseRequestManager({ initialRequestId, onConsumeInitialRequest }: Options) {
  const [viewMode, setViewMode] = useState<PurchaseRequestViewMode>('list');

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

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    initialRequestId || null,
  );
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [history, setHistory] = useState<PurchaseRequestHistoryEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [editingRequest, setEditingRequest] = useState<PurchaseRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [actingRole, setActingRole] = useState<PurchaseFlowRole>(() => loadActingAs().role);
  const [actingEmployeeId, setActingEmployeeId] = useState<string>(() => loadActingAs().employeeId);
  const [decisionComment, setDecisionComment] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        ACTING_AS_KEY,
        JSON.stringify({ role: actingRole, employeeId: actingEmployeeId }),
      );
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
        setError(
          getPurchaseRequestErrorMessage(err, 'No se pudo cargar el detalle de la solicitud.'),
        );
      } finally {
        setLoadingDetail(false);
      }
    };
    loadDetail();
  }, [selectedRequestId, setError]);

  /** Vuelve a traer detalle + histórico de una solicitud ya seleccionada. */
  const reloadSelectedDetail = async (id: string) => {
    const [detail, hist] = await Promise.all([
      getPurchaseRequest(id),
      getPurchaseRequestHistory(id),
    ]);
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
        const requesterName =
          employees.find((e) => e.id === values.requesterId)?.name || 'Solicitante';
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

  const handleCancelRequest = (request: PurchaseRequest) => {
    setConfirmState({
      message: `¿Cancelar la solicitud ${request.code}? Esta acción no se puede deshacer.`,
      tone: 'danger',
      confirmLabel: 'Cancelar solicitud',
      onConfirm: () => doCancelRequest(request),
    });
  };

  const doApprove = async (request: PurchaseRequest) => {
    setConfirmState(null);
    setDeciding(true);
    setError(null);
    try {
      await approvePurchaseRequest(
        request.id,
        actingEmployeeName,
        decisionComment.trim() || undefined,
      );
      setDecisionComment('');
      await refresh();
      await reloadSelectedDetail(request.id);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'No se pudo aprobar la solicitud.'));
    } finally {
      setDeciding(false);
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

  const handleExport = async () => {
    const header = [
      'Código', 'Fecha', 'Solicitante', 'Área', 'Cargo', 'Jefe inmediato', 'Estado', 'Motivo',
    ];
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

  const isTerminal = (s: PurchaseRequestStatus) =>
    s === 'RECHAZADA' || s === 'FINALIZADA' || s === 'CANCELADA';

  const canEdit = !!selectedRequest && selectedRequest.status === 'BORRADOR';
  const canSubmit =
    !!selectedRequest && selectedRequest.status === 'BORRADOR' && selectedRequest.lines.length > 0;
  const canCancel = !!selectedRequest && !isTerminal(selectedRequest.status);
  // Aprobar/rechazar requiere estar "actuando como" JEFE (sin seguridad real).
  const canDecide =
    !!selectedRequest &&
    selectedRequest.status === 'PENDIENTE_APROBACION' &&
    actingRole === 'JEFE';
  // Avisa si quien decide no es el jefe que figura en la solicitud.
  const supervisorMismatch =
    !!selectedRequest && !!actingEmployeeId && actingEmployeeId !== selectedRequest.supervisorId;

  return {
    viewMode,
    setViewMode,
    requests,
    employees,
    loading,
    error,
    setError,
    refresh,
    filteredRequests,
    countsByStatus,
    selectedRequestId,
    setSelectedRequestId,
    selectedRequest,
    history,
    loadingDetail,
    reloadSelectedDetail,
    editingRequest,
    setEditingRequest,
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
    actingRole,
    setActingRole,
    actingEmployeeId,
    setActingEmployeeId,
    actingEmployeeName,
    decisionComment,
    setDecisionComment,
    deciding,
    canEdit,
    canSubmit,
    canCancel,
    canDecide,
    supervisorMismatch,
    handleCreate,
    handleEditStart,
    handleSaveRequest,
    handleSubmitForApproval,
    handleCancelRequest,
    handleApprove,
    handleReject,
    handleExport,
  };
}
