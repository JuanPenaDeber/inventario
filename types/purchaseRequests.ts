// --- PURCHASE REQUEST (SOLICITUD DE COMPRA) ---
// Flujo completo de 11 estados (ver services/purchaseRequestService.ts para
// las transiciones válidas). La Fase 1 solo implementa acciones hasta
// PENDIENTE_APROBACION/CANCELADA; el resto del flujo (aprobación, cotización,
// comparación, selección, orden de compra) se habilita en fases siguientes,
// pero el enum ya contempla todos los estados para no romper tipos después.
export type PurchaseRequestStatus =
  | 'BORRADOR'
  | 'PENDIENTE_APROBACION'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'EN_COTIZACION'
  | 'COTIZADA'
  | 'EN_EVALUACION'
  | 'APROBADA_PARA_COMPRA'
  | 'ORDEN_GENERADA'
  | 'FINALIZADA'
  | 'CANCELADA';

export const PURCHASE_REQUEST_STATUSES: PurchaseRequestStatus[] = [
  'BORRADOR',
  'PENDIENTE_APROBACION',
  'APROBADA',
  'RECHAZADA',
  'EN_COTIZACION',
  'COTIZADA',
  'EN_EVALUACION',
  'APROBADA_PARA_COMPRA',
  'ORDEN_GENERADA',
  'FINALIZADA',
  'CANCELADA',
];

export type PurchaseRequestPriority = 'BAJA' | 'MEDIA' | 'ALTA';

export interface PurchaseRequestLine {
  // Vacío para líneas nuevas que aún no existen en el backend.
  id: string;
  product: string;
  quantity: number;
  unit: string;
  targetArea?: string; // Área destino (opcional)
  notes?: string;
  priority?: PurchaseRequestPriority;
}

/** Entrada de histórico inmutable: el servicio solo expone creación (POST), nunca edición ni borrado. */
export interface PurchaseRequestHistoryEntry {
  id: string;
  date: string;
  actorName: string;
  action: string;
  status: PurchaseRequestStatus;
  details?: string;
}

export interface PurchaseRequest {
  id: string;
  code: string; // Generado automáticamente (ver purchaseRequestService.ts)
  requestDate: string;
  requesterId: string;
  requesterName: string;
  area: string;
  position: string; // Cargo del solicitante
  supervisorId: string; // Jefe inmediato
  supervisorName: string;
  reason: string; // Motivo/justificación de la compra
  status: PurchaseRequestStatus;
  rejectionReason?: string; // Obligatorio cuando status = RECHAZADA (Fase 2)
  // --- Fase 3: selección de proforma y orden de compra generada ---
  selectedProformaId?: string;
  selectionJustification?: string;
  selectionNotes?: string;
  generatedOrderId?: string; // id de la PurchaseOrder generada (services/purchaseOrderService.ts)
  generatedOrderReference?: string;
  lines: PurchaseRequestLine[];
  createdAt?: string;
  updatedAt?: string;
}
