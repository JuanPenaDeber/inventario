// =============================================================================
// Servicio de Solicitudes de Compra — Fase 1 (solicitud, líneas, estados base
// e histórico auditable) + Fase 2 (aprobación/rechazo del jefe inmediato,
// regla de auto-aprobación). Apunta a EspoCRM (entidad configurable, por
// defecto "CSolicitudCompra"), siguiendo el mismo patrón que
// purchaseOrderService.ts: el navegador habla DIRECTO con EspoCRM, así que el
// proyecto sigue siendo 100% estático.
//
// Fase 2 — notas de diseño:
//   - No hay login ni roles reales en el proyecto (ver README.md). El "actor"
//     de una aprobación/rechazo es el nombre de un empleado elegido a mano en
//     un selector "Actuando como" (components/PurchaseRequestManager.tsx),
//     sin ninguna validación de que sea realmente el jefe inmediato.
//   - Regla de auto-aprobación: si solicitanteId === jefeInmediatoId,
//     submitPurchaseRequest() pasa la solicitud por PENDIENTE_APROBACION y de
//     inmediato la aprueba automáticamente, dejando ambos pasos en el
//     histórico (transparencia total del porqué).
//
// Fase 3 — notas de diseño (proformas, comparación, selección y orden de compra):
//   - Las proformas viven en services/proformaService.ts (aislado). Este
//     archivo solo las usa para: (a) exigir al menos una proforma antes de
//     marcar la solicitud como COTIZADA, y (b) al seleccionar la ganadora,
//     tomar su proveedor/líneas para generar la Orden de Compra.
//   - startQuotation/markAsQuoted/selectProforma/generatePurchaseOrder/
//     finalizeRequest recorren el resto del flujo de 11 estados. Cada uno
//     valida la transición contra STATUS_TRANSITIONS antes de mutar nada.
//   - generatePurchaseOrder() llama a purchaseOrderService.createPurchaseOrder
//     (integración explícitamente decidida con el usuario): la Orden de
//     Compra generada es una PurchaseOrder real, no un dato simulado.
//   - Nuevos campos en la cabecera (ver bloque de campos más abajo):
//     proformaSeleccionadaId, justificacionSeleccion, observacionesSeleccion,
//     ordenCompraId, ordenCompraReferencia.
//
// Fase 4: permisos por rol reales y sugerencias por área/cargo (estas últimas
// SÍ implementadas, en services/suggestionService.ts) — ver README.md.
//
// =============================================================================
// CONTRATO PENDIENTE DE CONFIRMAR CON EL BACKEND (EspoCRM)
// =============================================================================
// Esta entidad TODAVÍA NO EXISTE en EspoCRM. Los nombres de entidad, de campos
// y los sub-recursos son SUPOSICIONES razonables (mismo patrón que
// CPrestamo/CAsignacion/COrdenCompra), centralizadas en las constantes de
// este archivo (ENTITY, LINES_SUBRESOURCE, HISTORY_SUBRESOURCE, FIELDS,
// LINE_FIELDS, HISTORY_FIELDS) para que ajustarlas no requiera tocar el resto
// del código.
//
// Entidad cabecera (por defecto "CSolicitudCompra"), campos esperados:
//   - name                (string)  Código de la solicitud (lo genera el frontend)
//   - fechaSolicitud      (date)    YYYY-MM-DD
//   - solicitanteId       (link -> CRegistroEmpleados)
//   - solicitanteName     (string, autogenerado por EspoCRM)
//   - area                (string)  Área/departamento del solicitante
//   - cargo               (string)  Cargo del solicitante (texto libre: el
//                                   Employee actual no tiene este campo)
//   - jefeInmediatoId     (link -> CRegistroEmpleados)
//   - jefeInmediatoName   (string, autogenerado por EspoCRM)
//   - motivo              (text)    Justificación de la compra
//   - estado              (enum)    Ver PurchaseRequestStatus en types.ts
//   - motivoRechazo       (text)    Obligatorio cuando estado = RECHAZADA (Fase 2)
//   - proformaSeleccionadaId    (link -> CProforma, Fase 3)
//   - justificacionSeleccion    (text, Fase 3)
//   - observacionesSeleccion    (text, Fase 3)
//   - ordenCompraId             (link -> COrdenCompra, Fase 3)
//   - ordenCompraReferencia     (string, Fase 3)
//
// Sub-recurso de líneas: GET/POST /{ENTITY}/{id}/detalle,
//                         PUT/DELETE /{ENTITY}/{id}/detalle/{lineaId}
//   - producto            (string)
//   - cantidad            (int)
//   - unidad              (string)
//   - areaDestino         (string, opcional)
//   - observaciones       (string, opcional)
//   - prioridad           (string, opcional: BAJA | MEDIA | ALTA)
//
// Sub-recurso de histórico (append-only, NUNCA se expone PUT/DELETE desde
// este servicio a propósito — es la forma de garantizar que "el histórico no
// se pueda eliminar desde la interfaz normal"):
//   GET/POST /{ENTITY}/{id}/historial
//   - usuario             (string)  Nombre de quien realizó la acción
//   - accion              (string)  Ej. "Creó la solicitud"
//   - estado              (string)  Estado resultante tras la acción
//   - detalle             (string, opcional)
//
// Si el backend modela esto distinto, ajustar únicamente las constantes y las
// funciones mapRequest/mapLine/mapHistoryEntry/buildRequestPayload/
// buildLinePayload de este archivo.
// =============================================================================

import { PurchaseRequest, PurchaseRequestLine, PurchaseRequestHistoryEntry, PurchaseRequestStatus } from '../types';
import { getProformas, getProforma } from './proformaService';
import { createPurchaseOrder } from './purchaseOrderService';
import { EspoApiError as ApiError, getEspoErrorMessage, createEspoFetch } from './espoClient';

// --- CONFIGURACIÓN ----------------------------------------------------------

export const PURCHASE_REQUESTS_API_URL =
  import.meta.env.VITE_PURCHASE_REQUESTS_API_URL ??
  'http://local.grupoeldeber.com/api/v1';

const ENTITY = import.meta.env.VITE_PURCHASE_REQUEST_ENTITY ?? 'CSolicitudCompra';
const LINES_SUBRESOURCE =
  import.meta.env.VITE_PURCHASE_REQUEST_LINES_SUBRESOURCE ?? 'detalle';
const HISTORY_SUBRESOURCE =
  import.meta.env.VITE_PURCHASE_REQUEST_HISTORY_SUBRESOURCE ?? 'historial';


const LIST_PAGE_SIZE = 200;
// Tope de páginas al recorrer el listado completo (ver getPurchaseRequests).
const MAX_LIST_PAGES = 25; // 25 * 200 = 5000 solicitudes como máximo

export const PRIORITIES = ['BAJA', 'MEDIA', 'ALTA'] as const;

const FIELDS = {
  CODE: 'name',
  REQUEST_DATE: 'fechaSolicitud',
  REQUESTER_ID: 'solicitanteId',
  REQUESTER_NAME: 'solicitanteName',
  AREA: 'area',
  POSITION: 'cargo',
  SUPERVISOR_ID: 'jefeInmediatoId',
  SUPERVISOR_NAME: 'jefeInmediatoName',
  REASON: 'motivo',
  STATUS: 'estado',
  REJECTION_REASON: 'motivoRechazo',
  // --- Fase 3 ---
  SELECTED_PROFORMA_ID: 'proformaSeleccionadaId',
  SELECTION_JUSTIFICATION: 'justificacionSeleccion',
  SELECTION_NOTES: 'observacionesSeleccion',
  GENERATED_ORDER_ID: 'ordenCompraId',
  GENERATED_ORDER_REFERENCE: 'ordenCompraReferencia',
} as const;

const LINE_FIELDS = {
  PRODUCT: 'producto',
  QUANTITY: 'cantidad',
  UNIT: 'unidad',
  TARGET_AREA: 'areaDestino',
  NOTES: 'observaciones',
  PRIORITY: 'prioridad',
} as const;

const HISTORY_FIELDS = {
  ACTOR: 'usuario',
  ACTION: 'accion',
  STATUS: 'estado',
  DETAILS: 'detalle',
} as const;

// --- TIPOS DE ENTRADA --------------------------------------------------------

export interface PurchaseRequestLineInput {
  product: string;
  quantity: number;
  unit: string;
  targetArea?: string;
  notes?: string;
  priority?: PurchaseRequest['lines'][number]['priority'];
}

export interface CreatePurchaseRequestInput {
  requestDate: string;
  requesterId: string;
  area: string;
  position: string;
  supervisorId: string;
  reason: string;
  lines: PurchaseRequestLineInput[];
}

export interface UpdatePurchaseRequestInput {
  requestDate?: string;
  requesterId?: string;
  area?: string;
  position?: string;
  supervisorId?: string;
  reason?: string;
  // Reemplazo completo de líneas: se calculan altas/bajas/cambios contra las
  // líneas actuales en el backend (ver syncPurchaseRequestLines).
  lines?: PurchaseRequestLine[];
}

// --- FLUJO DE ESTADOS --------------------------------------------------------
// BORRADOR -> PENDIENTE_APROBACION -> APROBADA -> EN_COTIZACION -> COTIZADA ->
// EN_EVALUACION -> APROBADA_PARA_COMPRA -> ORDEN_GENERADA -> FINALIZADA.
// CANCELADA es alcanzable desde cualquier estado que no sea terminal.
// RECHAZADA, FINALIZADA y CANCELADA son terminales. Esta Fase 1 solo expone
// funciones para llegar hasta PENDIENTE_APROBACION o CANCELADA; el resto del
// mapa ya queda definido para que las fases siguientes no tengan que tocar
// esta parte del contrato.
const STATUS_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  BORRADOR: ['PENDIENTE_APROBACION', 'CANCELADA'],
  PENDIENTE_APROBACION: ['APROBADA', 'RECHAZADA', 'CANCELADA'],
  APROBADA: ['EN_COTIZACION', 'CANCELADA'],
  RECHAZADA: [],
  EN_COTIZACION: ['COTIZADA', 'CANCELADA'],
  COTIZADA: ['EN_EVALUACION', 'CANCELADA'],
  EN_EVALUACION: ['APROBADA_PARA_COMPRA', 'CANCELADA'],
  APROBADA_PARA_COMPRA: ['ORDEN_GENERADA', 'CANCELADA'],
  ORDEN_GENERADA: ['FINALIZADA', 'CANCELADA'],
  FINALIZADA: [],
  CANCELADA: [],
};

/** ¿Se puede pasar de `from` a `to`? Quedarse en el mismo estado siempre es válido. */
export function isValidStatusTransition(from: PurchaseRequestStatus, to: PurchaseRequestStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Regla especial de la Fase 2: si el solicitante es también su propio jefe
 * inmediato, puede aprobarse a sí mismo sin requerir una segunda aprobación.
 */
export function isSelfSupervised(requesterId: string, supervisorId: string): boolean {
  return !!requesterId && requesterId === supervisorId;
}

// --- MANEJO DE ERRORES Y FETCH (ver services/espoClient.ts) -----------------

/** Traduce el error a un mensaje legible para el usuario. */
export function getPurchaseRequestErrorMessage(error: unknown, fallback: string): string {
  return getEspoErrorMessage(
    error,
    fallback,
    'Sin permiso sobre las solicitudes de compra. Revisa el rol del usuario API en EspoCRM.',
  );
}

const espoFetch = createEspoFetch(PURCHASE_REQUESTS_API_URL);

// --- UTILIDADES --------------------------------------------------------------

function espoToIso(s?: string | null): string | undefined {
  if (!s) return undefined;
  return s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
}

/**
 * Genera un código legible para una solicitud nueva (SC-AAAAMMDD-HHMMSS).
 * No es un correlativo real: mientras el backend no exponga una secuencia
 * propia (autonumber/contador), esto evita colisiones sin depender de él.
 */
function generateRequestCode(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `SC-${datePart}-${timePart}`;
}

// --- MAPEO EspoCRM <-> Frontend ---------------------------------------------

function mapLine(raw: any): PurchaseRequestLine {
  return {
    id: raw.id ?? '',
    product: raw[LINE_FIELDS.PRODUCT] ?? '',
    quantity: Number(raw[LINE_FIELDS.QUANTITY] ?? 0),
    unit: raw[LINE_FIELDS.UNIT] ?? '',
    targetArea: raw[LINE_FIELDS.TARGET_AREA] ?? undefined,
    notes: raw[LINE_FIELDS.NOTES] ?? undefined,
    priority: raw[LINE_FIELDS.PRIORITY] ?? undefined,
  };
}

function mapHistoryEntry(raw: any): PurchaseRequestHistoryEntry {
  return {
    id: raw.id ?? '',
    date: espoToIso(raw.createdAt) ?? '',
    actorName: raw[HISTORY_FIELDS.ACTOR] ?? '',
    action: raw[HISTORY_FIELDS.ACTION] ?? '',
    status: (raw[HISTORY_FIELDS.STATUS] ?? 'BORRADOR') as PurchaseRequestStatus,
    details: raw[HISTORY_FIELDS.DETAILS] ?? undefined,
  };
}

function mapRequest(raw: any, lines: PurchaseRequestLine[] = []): PurchaseRequest {
  return {
    id: raw.id ?? '',
    code: raw[FIELDS.CODE] ?? '',
    requestDate: raw[FIELDS.REQUEST_DATE] ?? '',
    requesterId: raw[FIELDS.REQUESTER_ID] ?? '',
    requesterName: raw[FIELDS.REQUESTER_NAME] ?? '',
    area: raw[FIELDS.AREA] ?? '',
    position: raw[FIELDS.POSITION] ?? '',
    supervisorId: raw[FIELDS.SUPERVISOR_ID] ?? '',
    supervisorName: raw[FIELDS.SUPERVISOR_NAME] ?? '',
    reason: raw[FIELDS.REASON] ?? '',
    status: (raw[FIELDS.STATUS] ?? 'BORRADOR') as PurchaseRequestStatus,
    rejectionReason: raw[FIELDS.REJECTION_REASON] ?? undefined,
    selectedProformaId: raw[FIELDS.SELECTED_PROFORMA_ID] ?? undefined,
    selectionJustification: raw[FIELDS.SELECTION_JUSTIFICATION] ?? undefined,
    selectionNotes: raw[FIELDS.SELECTION_NOTES] ?? undefined,
    generatedOrderId: raw[FIELDS.GENERATED_ORDER_ID] ?? undefined,
    generatedOrderReference: raw[FIELDS.GENERATED_ORDER_REFERENCE] ?? undefined,
    lines,
    createdAt: espoToIso(raw.createdAt),
    updatedAt: espoToIso(raw.modifiedAt),
  };
}

function buildRequestPayload(input: {
  code?: string;
  requestDate?: string;
  requesterId?: string;
  area?: string;
  position?: string;
  supervisorId?: string;
  reason?: string;
  status?: PurchaseRequestStatus;
  rejectionReason?: string;
  selectedProformaId?: string;
  selectionJustification?: string;
  selectionNotes?: string;
  generatedOrderId?: string;
  generatedOrderReference?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.code !== undefined) payload[FIELDS.CODE] = input.code;
  if (input.requestDate !== undefined) payload[FIELDS.REQUEST_DATE] = input.requestDate || null;
  if (input.requesterId !== undefined) payload[FIELDS.REQUESTER_ID] = input.requesterId || null;
  if (input.area !== undefined) payload[FIELDS.AREA] = input.area || null;
  if (input.position !== undefined) payload[FIELDS.POSITION] = input.position || null;
  if (input.supervisorId !== undefined) payload[FIELDS.SUPERVISOR_ID] = input.supervisorId || null;
  if (input.reason !== undefined) payload[FIELDS.REASON] = input.reason || null;
  if (input.status !== undefined) payload[FIELDS.STATUS] = input.status;
  if (input.rejectionReason !== undefined) payload[FIELDS.REJECTION_REASON] = input.rejectionReason || null;
  if (input.selectedProformaId !== undefined) payload[FIELDS.SELECTED_PROFORMA_ID] = input.selectedProformaId || null;
  if (input.selectionJustification !== undefined)
    payload[FIELDS.SELECTION_JUSTIFICATION] = input.selectionJustification || null;
  if (input.selectionNotes !== undefined) payload[FIELDS.SELECTION_NOTES] = input.selectionNotes || null;
  if (input.generatedOrderId !== undefined) payload[FIELDS.GENERATED_ORDER_ID] = input.generatedOrderId || null;
  if (input.generatedOrderReference !== undefined)
    payload[FIELDS.GENERATED_ORDER_REFERENCE] = input.generatedOrderReference || null;
  return payload;
}

function buildLinePayload(line: {
  product: string;
  quantity: number;
  unit: string;
  targetArea?: string;
  notes?: string;
  priority?: string;
}): Record<string, unknown> {
  return {
    [LINE_FIELDS.PRODUCT]: line.product,
    [LINE_FIELDS.QUANTITY]: line.quantity,
    [LINE_FIELDS.UNIT]: line.unit,
    [LINE_FIELDS.TARGET_AREA]: line.targetArea || null,
    [LINE_FIELDS.NOTES]: line.notes || null,
    [LINE_FIELDS.PRIORITY]: line.priority || null,
  };
}

function validateLines(lines: { product: string; quantity: number; unit: string }[]): void {
  if (lines.length === 0) {
    throw new Error('La solicitud debe tener al menos un producto.');
  }
  for (const line of lines) {
    if (!line.product.trim()) {
      throw new Error('Todos los productos deben tener descripción.');
    }
    if (!Number.isFinite(line.quantity) || !Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`La cantidad de "${line.product}" debe ser un entero mayor a 0.`);
    }
    if (!line.unit.trim()) {
      throw new Error(`Falta la unidad de medida de "${line.product}".`);
    }
  }
}

// --- CACHÉ EN MEMORIA (mismo patrón que inventoryService.ts/purchaseOrderService.ts) ---

const CACHE_TTL_MS = 60_000; // 60s

interface ListCacheEntry {
  data?: PurchaseRequest[];
  ts: number;
  inflight?: Promise<PurchaseRequest[]>;
}

let listCache: ListCacheEntry | null = null;

export function invalidatePurchaseRequestsCache(): void {
  listCache = null;
}

async function cachedList(fetcher: () => Promise<PurchaseRequest[]>): Promise<PurchaseRequest[]> {
  const now = Date.now();
  if (listCache?.data !== undefined && now - listCache.ts < CACHE_TTL_MS) {
    return listCache.data;
  }
  if (listCache?.inflight) {
    return listCache.inflight;
  }
  const inflight = fetcher()
    .then((data) => {
      listCache = { data, ts: Date.now() };
      return data;
    })
    .catch((err) => {
      listCache = null;
      throw err;
    });
  listCache = { ts: now, inflight, data: listCache?.data };
  return inflight;
}

// --- HISTÓRICO (append-only) -------------------------------------------------

/** Agrega una entrada al histórico de la solicitud. Nunca se expone edición ni borrado. */
async function appendHistoryEntry(
  requestId: string,
  actorName: string,
  action: string,
  status: PurchaseRequestStatus,
  details?: string,
): Promise<void> {
  const payload = {
    [HISTORY_FIELDS.ACTOR]: actorName,
    [HISTORY_FIELDS.ACTION]: action,
    [HISTORY_FIELDS.STATUS]: status,
    [HISTORY_FIELDS.DETAILS]: details || null,
  };
  await espoFetch(`/${ENTITY}/${requestId}/${HISTORY_SUBRESOURCE}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Histórico de una solicitud, ordenado del más antiguo al más reciente. */
export async function getPurchaseRequestHistory(requestId: string): Promise<PurchaseRequestHistoryEntry[]> {
  try {
    const res = await espoFetch(`/${ENTITY}/${requestId}/${HISTORY_SUBRESOURCE}`);
    const data = await res.json();
    const rawEntries = Array.isArray(data) ? data : (data.list ?? []);
    return rawEntries
      .map(mapHistoryEntry)
      .sort((a: PurchaseRequestHistoryEntry, b: PurchaseRequestHistoryEntry) => a.date.localeCompare(b.date));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

// --- SOLICITUDES DE COMPRA ---------------------------------------------------

/** Lista todas las solicitudes de compra (orden descendente por fecha de creación). */
export async function getPurchaseRequests(): Promise<PurchaseRequest[]> {
  return cachedList(async () => {
    // Recorre todas las páginas: con maxSize fijo, una sola página se
    // quedaría corta (y en silencio) apenas hubiera más de LIST_PAGE_SIZE
    // solicitudes registradas.
    const all: any[] = [];
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const params = new URLSearchParams({
        maxSize: String(LIST_PAGE_SIZE),
        offset: String(page * LIST_PAGE_SIZE),
        orderBy: 'createdAt',
        order: 'desc',
      });
      const res = await espoFetch(`/${ENTITY}?${params.toString()}`);
      const data = await res.json();
      const list = data.list ?? [];
      all.push(...list);
      if (list.length < LIST_PAGE_SIZE) break;
    }
    return all.map((raw: any) => mapRequest(raw));
  });
}

export async function getPurchaseRequestLines(requestId: string): Promise<PurchaseRequestLine[]> {
  try {
    const res = await espoFetch(`/${ENTITY}/${requestId}/${LINES_SUBRESOURCE}`);
    const data = await res.json();
    const rawLines = Array.isArray(data) ? data : (data.list ?? []);
    return rawLines.map(mapLine);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

/** Trae una solicitud con su detalle de líneas. Devuelve null si no existe (404). */
export async function getPurchaseRequest(id: string): Promise<PurchaseRequest | null> {
  try {
    const res = await espoFetch(`/${ENTITY}/${id}`);
    const header = await res.json();
    const lines = await getPurchaseRequestLines(id);
    return mapRequest(header, lines);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Crea una solicitud en estado BORRADOR, con código autogenerado. */
export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
  requesterName: string,
): Promise<PurchaseRequest> {
  validateLines(input.lines);

  const code = generateRequestCode();
  const headerPayload = buildRequestPayload({
    code,
    requestDate: input.requestDate,
    requesterId: input.requesterId,
    area: input.area,
    position: input.position,
    supervisorId: input.supervisorId,
    reason: input.reason,
    status: 'BORRADOR',
  });

  const res = await espoFetch(`/${ENTITY}`, {
    method: 'POST',
    body: JSON.stringify(headerPayload),
  });
  const savedHeader = await res.json();
  const requestId = savedHeader.id;

  // Se crean secuencialmente para no depender de que el backend soporte
  // creación en lote de líneas (contrato no confirmado).
  const savedLines: PurchaseRequestLine[] = [];
  for (const line of input.lines) {
    const lineRes = await espoFetch(`/${ENTITY}/${requestId}/${LINES_SUBRESOURCE}`, {
      method: 'POST',
      body: JSON.stringify(buildLinePayload(line)),
    });
    savedLines.push(mapLine(await lineRes.json()));
  }

  await appendHistoryEntry(requestId, requesterName, 'Creó la solicitud', 'BORRADOR');

  invalidatePurchaseRequestsCache();
  return mapRequest(savedHeader, savedLines);
}

/**
 * Compara las líneas nuevas contra las existentes en el backend y aplica
 * altas (sin id), bajas (id existente ausente en la lista nueva) y cambios
 * (id presente en ambas). Mismo patrón de diff que purchaseOrderService.ts.
 */
async function syncPurchaseRequestLines(requestId: string, newLines: PurchaseRequestLine[]): Promise<void> {
  const current = await getPurchaseRequestLines(requestId);
  const newIds = new Set(newLines.filter((l) => l.id).map((l) => l.id));

  const toDelete = current.filter((l) => l.id && !newIds.has(l.id));
  const toUpdate = newLines.filter((l) => l.id);
  const toCreate = newLines.filter((l) => !l.id);

  for (const line of toDelete) {
    await espoFetch(`/${ENTITY}/${requestId}/${LINES_SUBRESOURCE}/${line.id}`, { method: 'DELETE' });
  }
  for (const line of toUpdate) {
    await espoFetch(`/${ENTITY}/${requestId}/${LINES_SUBRESOURCE}/${line.id}`, {
      method: 'PUT',
      body: JSON.stringify(buildLinePayload(line)),
    });
  }
  for (const line of toCreate) {
    await espoFetch(`/${ENTITY}/${requestId}/${LINES_SUBRESOURCE}`, {
      method: 'POST',
      body: JSON.stringify(buildLinePayload(line)),
    });
  }
}

/**
 * Actualiza una solicitud. Regla de negocio: una solicitud ya enviada no se
 * puede modificar libremente, así que solo se permite mientras esté en
 * BORRADOR (si se necesita corregir algo después de enviarla, el flujo
 * correcto es cancelarla y crear una nueva).
 */
export async function updatePurchaseRequest(
  id: string,
  updates: UpdatePurchaseRequestInput,
  actorName: string,
): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (current.status !== 'BORRADOR') {
    throw new Error(`No se puede modificar una solicitud en estado "${current.status}" (solo se edita en BORRADOR).`);
  }

  if (updates.lines) {
    validateLines(updates.lines);
  }

  const headerPayload = buildRequestPayload({
    requestDate: updates.requestDate,
    requesterId: updates.requesterId,
    area: updates.area,
    position: updates.position,
    supervisorId: updates.supervisorId,
    reason: updates.reason,
  });

  if (Object.keys(headerPayload).length > 0) {
    await espoFetch(`/${ENTITY}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(headerPayload),
    });
  }

  if (updates.lines) {
    await syncPurchaseRequestLines(id, updates.lines);
  }

  await appendHistoryEntry(id, actorName, 'Editó la solicitud', current.status);

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

/**
 * Envía la solicitud a aprobación (BORRADOR -> PENDIENTE_APROBACION).
 *
 * Regla de auto-aprobación (Fase 2): si el solicitante es también su propio
 * jefe inmediato, no tiene sentido esperar una segunda aprobación de la misma
 * persona. En ese caso, justo después de quedar PENDIENTE_APROBACION, la
 * solicitud se aprueba automáticamente, dejando ambos pasos en el histórico
 * para que quede claro qué pasó y por qué.
 */
export async function submitPurchaseRequest(id: string, actorName: string): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'PENDIENTE_APROBACION')) {
    throw new Error(`No se puede enviar a aprobación una solicitud en estado "${current.status}".`);
  }
  if (current.lines.length === 0) {
    throw new Error('La solicitud debe tener al menos un producto antes de enviarla.');
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'PENDIENTE_APROBACION' as PurchaseRequestStatus }),
  });
  await appendHistoryEntry(id, actorName, 'Envió la solicitud para aprobación', 'PENDIENTE_APROBACION');

  if (isSelfSupervised(current.requesterId, current.supervisorId)) {
    await espoFetch(`/${ENTITY}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ [FIELDS.STATUS]: 'APROBADA' as PurchaseRequestStatus }),
    });
    await appendHistoryEntry(
      id,
      current.requesterName || actorName,
      'Se autoaprobó',
      'APROBADA',
      'La solicitud fue aprobada por el mismo solicitante debido a que posee la autoridad correspondiente.',
    );
  }

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

/** Cancela una solicitud. No es un borrado físico: se conserva para el histórico. */
export async function cancelPurchaseRequest(id: string, actorName: string): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'CANCELADA')) {
    throw new Error(`No se puede cancelar una solicitud en estado "${current.status}".`);
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'CANCELADA' as PurchaseRequestStatus }),
  });
  await appendHistoryEntry(id, actorName, 'Canceló la solicitud', 'CANCELADA');

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

// --- APROBACIÓN (Fase 2) -----------------------------------------------------
// No hay login ni roles reales todavía: `approverName` es el nombre de quien
// el usuario eligió en el selector "Actuando como" de la UI (ver
// components/PurchaseRequestManager.tsx), sin validar que sea realmente el
// jefe inmediato registrado en la solicitud. Es una decisión deliberada (ver
// README.md) hasta que la Fase 4 traiga permisos reales.

/** Aprueba una solicitud pendiente (PENDIENTE_APROBACION -> APROBADA). */
export async function approvePurchaseRequest(
  id: string,
  approverName: string,
  comment?: string,
): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'APROBADA')) {
    throw new Error(`No se puede aprobar una solicitud en estado "${current.status}".`);
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'APROBADA' as PurchaseRequestStatus }),
  });
  await appendHistoryEntry(id, approverName, 'Aprobó la solicitud', 'APROBADA', comment);

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

/**
 * Rechaza una solicitud pendiente (PENDIENTE_APROBACION -> RECHAZADA).
 * El motivo es obligatorio (regla de negocio #7 del pedido original).
 */
export async function rejectPurchaseRequest(
  id: string,
  approverName: string,
  reason: string,
): Promise<PurchaseRequest | null> {
  if (!reason.trim()) {
    throw new Error('El motivo de rechazo es obligatorio.');
  }

  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'RECHAZADA')) {
    throw new Error(`No se puede rechazar una solicitud en estado "${current.status}".`);
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(buildRequestPayload({ status: 'RECHAZADA', rejectionReason: reason.trim() })),
  });
  await appendHistoryEntry(id, approverName, 'Rechazó la solicitud', 'RECHAZADA', reason.trim());

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

// --- HISTÓRICO PÚBLICO (usado por otros servicios/UI) ------------------------

/**
 * Punto de entrada público para que otro código (p.ej. después de registrar
 * una proforma en proformaService.ts) deje constancia en el histórico de la
 * solicitud, sin que proformaService necesite conocer los detalles de cómo se
 * escribe el histórico.
 */
export async function logPurchaseRequestEvent(
  requestId: string,
  actorName: string,
  action: string,
  status: PurchaseRequestStatus,
  details?: string,
): Promise<void> {
  await appendHistoryEntry(requestId, actorName, action, status, details);
}

// --- COTIZACIÓN, SELECCIÓN Y ORDEN DE COMPRA (Fase 3) ------------------------
// No hay permisos reales: estas acciones se muestran en la UI cuando el
// usuario está "actuando como" COMPRAS, pero el servicio no lo exige.

/** Inicia la etapa de cotización (APROBADA -> EN_COTIZACION). */
export async function startQuotation(id: string, actorName: string): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'EN_COTIZACION')) {
    throw new Error(`No se puede iniciar la cotización de una solicitud en estado "${current.status}".`);
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'EN_COTIZACION' as PurchaseRequestStatus }),
  });
  await appendHistoryEntry(id, actorName, 'Inició la etapa de cotización', 'EN_COTIZACION');

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

/** Marca que ya se recolectaron las proformas necesarias (EN_COTIZACION -> COTIZADA). */
export async function markAsQuoted(id: string, actorName: string): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'COTIZADA')) {
    throw new Error(`No se puede marcar como cotizada una solicitud en estado "${current.status}".`);
  }
  const proformas = (await getProformas(id)).filter((p) => !p.voided);
  if (proformas.length === 0) {
    throw new Error('Registra al menos una proforma (no anulada) antes de marcar la solicitud como cotizada.');
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'COTIZADA' as PurchaseRequestStatus }),
  });
  await appendHistoryEntry(id, actorName, 'Marcó la solicitud como cotizada', 'COTIZADA', `${proformas.length} proforma(s) registrada(s).`);

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

/**
 * Selecciona la proforma ganadora. No tiene por qué ser la más barata — por
 * eso la justificación es obligatoria (sección 6 del pedido original).
 * Avanza COTIZADA -> EN_EVALUACION -> APROBADA_PARA_COMPRA en la misma
 * llamada, dejando ambos pasos en el histórico.
 */
export async function selectProforma(
  id: string,
  proformaId: string,
  justification: string,
  actorName: string,
  notes?: string,
): Promise<PurchaseRequest | null> {
  if (!justification.trim()) {
    throw new Error('La justificación de la selección es obligatoria.');
  }

  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'EN_EVALUACION')) {
    throw new Error(`No se puede evaluar proformas de una solicitud en estado "${current.status}".`);
  }

  const proforma = await getProforma(id, proformaId);
  if (!proforma) {
    throw new Error('La proforma seleccionada no existe o no pertenece a esta solicitud.');
  }
  if (proforma.voided) {
    throw new Error('No se puede seleccionar una proforma anulada.');
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'EN_EVALUACION' as PurchaseRequestStatus }),
  });
  await appendHistoryEntry(id, actorName, 'Pasó a evaluación de proformas', 'EN_EVALUACION');

  if (!isValidStatusTransition('EN_EVALUACION', 'APROBADA_PARA_COMPRA')) {
    throw new Error('Transición interna inválida hacia APROBADA_PARA_COMPRA.');
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(
      buildRequestPayload({
        status: 'APROBADA_PARA_COMPRA',
        selectedProformaId: proformaId,
        selectionJustification: justification.trim(),
        selectionNotes: notes,
      }),
    ),
  });
  await appendHistoryEntry(
    id,
    actorName,
    `Seleccionó la proforma de ${proforma.providerName || proforma.providerId}`,
    'APROBADA_PARA_COMPRA',
    justification.trim(),
  );

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

/**
 * Genera la Orden de Compra a partir de la proforma seleccionada
 * (APROBADA_PARA_COMPRA -> ORDEN_GENERADA). Reutiliza purchaseOrderService.ts
 * — la orden generada es una PurchaseOrder real, con las mismas reglas de
 * estado/recepción que el resto del módulo de Órdenes de Compra.
 */
export async function generatePurchaseOrder(id: string, actorName: string): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'ORDEN_GENERADA')) {
    throw new Error(`No se puede generar la orden de compra de una solicitud en estado "${current.status}".`);
  }
  if (!current.selectedProformaId) {
    throw new Error('Selecciona una proforma antes de generar la orden de compra.');
  }

  const proforma = await getProforma(id, current.selectedProformaId);
  if (!proforma) {
    throw new Error('La proforma seleccionada ya no está disponible.');
  }

  const order = await createPurchaseOrder({
    reference: `OC-${current.code}`,
    providerId: proforma.providerId,
    requestDate: new Date().toISOString().slice(0, 10),
    requestedBy: current.requesterName,
    currency: proforma.currency,
    notes: `Generada automáticamente desde la solicitud de compra ${current.code}.`,
    status: 'SOLICITADA',
    taxRate: proforma.taxRate,
    lines: proforma.lines.map((l) => ({
      description: l.product,
      category: '',
      quantityRequested: l.quantity,
      unitPrice: l.unitPrice,
    })),
  });

  // La orden de compra YA se creó en este punto. Si lo que sigue falla, no la
  // deshacemos (no hay una operación de "deshacer creación" segura contra
  // EspoCRM) — en vez de un error genérico, avisamos exactamente qué quedó
  // desincronizado para que se pueda revisar a mano.
  try {
    await espoFetch(`/${ENTITY}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(
        buildRequestPayload({
          status: 'ORDEN_GENERADA',
          generatedOrderId: order.id,
          generatedOrderReference: order.reference,
        }),
      ),
    });
    await appendHistoryEntry(
      id,
      actorName,
      'Generó la orden de compra',
      'ORDEN_GENERADA',
      order.reference,
    );
  } catch (err) {
    throw new Error(
      `Se generó la orden de compra "${order.reference}" correctamente, pero no se pudo actualizar ` +
      `la solicitud ${current.code} (quedó desincronizada). Verifica manualmente ambos registros.`,
      { cause: err },
    );
  }

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}

/** Cierra el ciclo de la solicitud (ORDEN_GENERADA -> FINALIZADA). */
export async function finalizeRequest(id: string, actorName: string): Promise<PurchaseRequest | null> {
  const current = await getPurchaseRequest(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'FINALIZADA')) {
    throw new Error(`No se puede finalizar una solicitud en estado "${current.status}".`);
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'FINALIZADA' as PurchaseRequestStatus }),
  });
  await appendHistoryEntry(id, actorName, 'Finalizó la solicitud', 'FINALIZADA');

  invalidatePurchaseRequestsCache();
  return getPurchaseRequest(id);
}
