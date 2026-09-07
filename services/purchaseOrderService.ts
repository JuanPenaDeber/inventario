// =============================================================================
// Servicio de Órdenes de Compra — apunta a EspoCRM (entidad configurable,
// por defecto "COrdenCompra"). Sigue el mismo patrón que incidentsService.ts:
// el navegador habla DIRECTO con EspoCRM, así que el proyecto sigue siendo
// 100% estático (npm run build + copiar dist/).
//
// =============================================================================
// CONTRATO PENDIENTE DE CONFIRMAR CON EL BACKEND (EspoCRM)
// =============================================================================
// Esta entidad TODAVÍA NO EXISTE en EspoCRM. Los nombres de entidad, de campos
// y el sub-recurso de líneas son SUPOSICIONES razonables (siguiendo el patrón
// de CPrestamo/CAsignacion) y deben confirmarse/crearse en el backend antes de
// integrar contra el EspoCRM real. Todos están centralizados en las constantes
// de este archivo (ENTITY, LINES_SUBRESOURCE, FIELDS, LINE_FIELDS) para que
// ajustarlos no requiera tocar el resto del código.
//
// Entidad cabecera (por defecto "COrdenCompra"), campos esperados:
//   - name                 (string)  Número/referencia de la orden
//   - proveedorId          (string)  Link a CProveedor
//   - proveedorName        (string)  Nombre del proveedor (lo agrega EspoCRM
//                                    automáticamente en los campos link-*)
//   - fechaSolicitud       (date)    YYYY-MM-DD
//   - fechaEsperada        (date)    YYYY-MM-DD, opcional
//   - solicitante          (string)  Nombre de quien solicita
//   - moneda               (string)  Ej. "BOB", "USD"
//   - observaciones        (text)    Opcional
//   - estado               (enum)    BORRADOR | SOLICITADA | APROBADA | RECIBIDA | CANCELADA
//   - subtotal             (float)   Suma de subtotales de línea
//   - impuestoPorcentaje   (float)   % de impuesto aplicado
//   - impuestoMonto        (float)   Monto de impuesto calculado
//   - total                (float)   subtotal + impuestoMonto
//
// Sub-recurso de líneas: GET/POST /{ENTITY}/{id}/lineas,
//                         PUT/DELETE /{ENTITY}/{id}/lineas/{lineId}
//   - descripcion          (string)
//   - categoria            (string)
//   - cantidadSolicitada   (int)
//   - cantidadRecibida     (int)     Debe iniciar en 0
//   - precioUnitario       (float)
//   - subtotal             (float)   cantidadSolicitada * precioUnitario
//
// Si el backend modela las líneas de otra forma (p.ej. un campo JSON en la
// cabecera, o una entidad relacionada con otro nombre), ajustar únicamente
// las constantes ENTITY/LINES_SUBRESOURCE/FIELDS/LINE_FIELDS y las funciones
// mapOrder/mapLine/buildOrderPayload/buildLinePayload de este archivo.
//
// IMPORTANTE: No se crean equipos (CEquipo) automáticamente al recibir una
// orden. El campo PurchaseOrderLine.createdItemId queda reservado para ese
// enlace futuro, pero la creación real debe habilitarse cuando el contrato
// de creación de equipos a partir de una recepción esté confirmado.
// =============================================================================

import { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '../types';

// --- CONFIGURACIÓN ----------------------------------------------------------

// URL base de EspoCRM. Sobreescribible con VITE_PURCHASE_ORDERS_API_URL en el .env.
export const PURCHASE_ORDERS_API_URL =
  (import.meta as any).env?.VITE_PURCHASE_ORDERS_API_URL ??
  'http://local.grupoeldeber.com/api/v1';

// Nombre de la entidad en EspoCRM y del sub-recurso de líneas (ver nota de
// contrato pendiente arriba). Ambos configurables sin tocar el resto del código.
const ENTITY = (import.meta as any).env?.VITE_PURCHASE_ORDER_ENTITY ?? 'COrdenCompra';
const LINES_SUBRESOURCE =
  (import.meta as any).env?.VITE_PURCHASE_ORDER_LINES_SUBRESOURCE ?? 'lineas';

// API key del usuario "inventario" en EspoCRM (misma usada por el resto de la app).
const API_KEY = '2b4fd11376a17549cba81c63a8840727';

const HEADERS = {
  'X-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

// % de impuesto por defecto al crear una orden nueva. Editable en el formulario.
export const DEFAULT_TAX_RATE_PERCENT = Number(
  (import.meta as any).env?.VITE_PURCHASE_ORDER_TAX_RATE ?? 13,
);

// Monedas sugeridas para el desplegable (campo Varchar en EspoCRM: no limita).
export const CURRENCIES = ['BOB', 'USD'] as const;

// Cantidad de resultados a traer en el listado.
const LIST_PAGE_SIZE = 200;
// Tope de páginas al recorrer el listado completo (ver getPurchaseOrders):
// evita un bucle indefinido si EspoCRM devolviera siempre "list" lleno.
const MAX_LIST_PAGES = 25; // 25 * 200 = 5000 órdenes como máximo

// Mapeo de campos del frontend -> nombres de campo asumidos en EspoCRM.
const FIELDS = {
  REFERENCE: 'name',
  PROVIDER_ID: 'proveedorId',
  PROVIDER_NAME: 'proveedorName',
  REQUEST_DATE: 'fechaSolicitud',
  EXPECTED_DATE: 'fechaEsperada',
  REQUESTED_BY: 'solicitante',
  CURRENCY: 'moneda',
  NOTES: 'observaciones',
  STATUS: 'estado',
  SUBTOTAL: 'subtotal',
  TAX_RATE: 'impuestoPorcentaje',
  TAX_AMOUNT: 'impuestoMonto',
  TOTAL: 'total',
} as const;

const LINE_FIELDS = {
  DESCRIPTION: 'descripcion',
  CATEGORY: 'categoria',
  QUANTITY_REQUESTED: 'cantidadSolicitada',
  QUANTITY_RECEIVED: 'cantidadRecibida',
  UNIT_PRICE: 'precioUnitario',
  SUBTOTAL: 'subtotal',
} as const;

// --- TIPOS DE ENTRADA (para crear/actualizar) --------------------------------

export interface PurchaseOrderLineInput {
  description: string;
  category: string;
  quantityRequested: number;
  unitPrice: number;
}

export interface CreatePurchaseOrderInput {
  reference: string;
  providerId: string;
  requestDate: string;
  expectedDate?: string;
  requestedBy: string;
  currency: string;
  notes?: string;
  status?: PurchaseOrderStatus;
  taxRate?: number;
  lines: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderInput {
  reference?: string;
  providerId?: string;
  requestDate?: string;
  expectedDate?: string;
  requestedBy?: string;
  currency?: string;
  notes?: string;
  status?: PurchaseOrderStatus;
  // Estado actual conocido por el llamador (p.ej. el que se mostraba en el
  // formulario antes de editar). Requerido junto con `status` para validar
  // que la transición sea coherente (ver isValidStatusTransition). Si se
  // envía `status` sin `previousStatus`, la transición NO se valida aquí.
  previousStatus?: PurchaseOrderStatus;
  taxRate?: number;
  // Reemplazo completo de líneas: se calculan altas/bajas/cambios contra las
  // líneas actuales en el backend (ver syncPurchaseOrderLines).
  lines?: PurchaseOrderLine[];
}

export interface ReceiveLineInput {
  lineId: string;
  quantityReceived: number;
}

// --- FLUJO DE ESTADOS --------------------------------------------------------
// Flujo lineal: BORRADOR -> SOLICITADA -> APROBADA -> RECIBIDA.
// CANCELADA es alcanzable desde cualquier estado excepto RECIBIDA (una orden
// ya recibida no se cancela). RECIBIDA y CANCELADA son estados terminales:
// no permiten ninguna otra transición. No hay saltos hacia atrás.
const STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  BORRADOR: ['SOLICITADA', 'CANCELADA'],
  SOLICITADA: ['APROBADA', 'CANCELADA'],
  APROBADA: ['RECIBIDA', 'CANCELADA'],
  RECIBIDA: [],
  CANCELADA: [],
};

/** ¿Se puede pasar de `from` a `to`? Quedarse en el mismo estado siempre es válido. */
export function isValidStatusTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Estados que puede elegir el usuario desde `current` (incluye quedarse igual). */
export function getSelectableStatuses(current: PurchaseOrderStatus): PurchaseOrderStatus[] {
  return [current, ...STATUS_TRANSITIONS[current]];
}

/** Estados válidos para el `estado` inicial de una orden recién creada. */
export const INITIAL_STATUSES: PurchaseOrderStatus[] = ['BORRADOR', 'SOLICITADA'];

// --- MANEJO DE ERRORES ------------------------------------------------------

class ApiError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(reason || `HTTP ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

/** Traduce el error a un mensaje legible para el usuario. */
export function getPurchaseOrderErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return 'Sin permiso sobre las órdenes de compra. Revisa el rol del usuario API en EspoCRM.';
    if (error.reason) return error.reason;
    return fallback;
  }
  if (error instanceof TypeError) {
    return 'No se pudo conectar con el servidor. Verifica la red o que EspoCRM esté activo.';
  }
  // Errores de validación propios de este servicio (transiciones de estado,
  // cantidades inválidas, etc.) llevan su mensaje ya listo para el usuario.
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/** Wrapper de fetch con la API key de EspoCRM y errores normalizados. */
async function espoFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${PURCHASE_ORDERS_API_URL}${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const reason = res.headers.get('X-Status-Reason') ?? '';
    throw new ApiError(res.status, reason);
  }
  return res;
}

// --- CÁLCULOS (compartidos entre el servicio y el formulario) --------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Subtotal de una línea: cantidad solicitada * precio unitario. */
export function calculateLineSubtotal(quantityRequested: number, unitPrice: number): number {
  return round2((quantityRequested || 0) * (unitPrice || 0));
}

/** Subtotal, impuesto y total de la orden a partir de sus líneas. */
export function calculateOrderTotals(
  lines: { subtotal: number }[],
  taxRatePercent: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = round2(lines.reduce((sum, l) => sum + (l.subtotal || 0), 0));
  const taxAmount = round2((subtotal * (taxRatePercent || 0)) / 100);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

// --- MAPEO EspoCRM <-> Frontend ---------------------------------------------

function espoToIso(s?: string | null): string | undefined {
  if (!s) return undefined;
  return s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
}

function mapLine(raw: any): PurchaseOrderLine {
  const quantityRequested = Number(raw[LINE_FIELDS.QUANTITY_REQUESTED] ?? 0);
  const quantityReceived = Number(raw[LINE_FIELDS.QUANTITY_RECEIVED] ?? 0);
  const unitPrice = Number(raw[LINE_FIELDS.UNIT_PRICE] ?? 0);
  return {
    id: raw.id ?? '',
    description: raw[LINE_FIELDS.DESCRIPTION] ?? '',
    category: raw[LINE_FIELDS.CATEGORY] ?? '',
    quantityRequested,
    quantityReceived,
    unitPrice,
    subtotal:
      raw[LINE_FIELDS.SUBTOTAL] !== undefined
        ? Number(raw[LINE_FIELDS.SUBTOTAL])
        : calculateLineSubtotal(quantityRequested, unitPrice),
  };
}

function mapOrder(raw: any, lines: PurchaseOrderLine[] = []): PurchaseOrder {
  const taxRate = Number(raw[FIELDS.TAX_RATE] ?? DEFAULT_TAX_RATE_PERCENT);
  const totals = calculateOrderTotals(lines, taxRate);
  return {
    id: raw.id ?? '',
    reference: raw[FIELDS.REFERENCE] ?? '',
    providerId: raw[FIELDS.PROVIDER_ID] ?? '',
    providerName: raw[FIELDS.PROVIDER_NAME] ?? undefined,
    requestDate: raw[FIELDS.REQUEST_DATE] ?? '',
    expectedDate: raw[FIELDS.EXPECTED_DATE] ?? undefined,
    requestedBy: raw[FIELDS.REQUESTED_BY] ?? '',
    currency: raw[FIELDS.CURRENCY] ?? 'BOB',
    notes: raw[FIELDS.NOTES] ?? undefined,
    status: (raw[FIELDS.STATUS] ?? 'BORRADOR') as PurchaseOrderStatus,
    lines,
    taxRate,
    subtotal: raw[FIELDS.SUBTOTAL] !== undefined ? Number(raw[FIELDS.SUBTOTAL]) : totals.subtotal,
    taxAmount: raw[FIELDS.TAX_AMOUNT] !== undefined ? Number(raw[FIELDS.TAX_AMOUNT]) : totals.taxAmount,
    total: raw[FIELDS.TOTAL] !== undefined ? Number(raw[FIELDS.TOTAL]) : totals.total,
    createdAt: espoToIso(raw.createdAt),
    updatedAt: espoToIso(raw.modifiedAt),
  };
}

/** Solo incluye en el payload los campos definidos (soporta creación y updates parciales). */
function buildOrderPayload(input: {
  reference?: string;
  providerId?: string;
  requestDate?: string;
  expectedDate?: string;
  requestedBy?: string;
  currency?: string;
  notes?: string;
  status?: PurchaseOrderStatus;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  total?: number;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.reference !== undefined) payload[FIELDS.REFERENCE] = input.reference;
  if (input.providerId !== undefined) payload[FIELDS.PROVIDER_ID] = input.providerId || null;
  if (input.requestDate !== undefined) payload[FIELDS.REQUEST_DATE] = input.requestDate || null;
  if (input.expectedDate !== undefined) payload[FIELDS.EXPECTED_DATE] = input.expectedDate || null;
  if (input.requestedBy !== undefined) payload[FIELDS.REQUESTED_BY] = input.requestedBy || null;
  if (input.currency !== undefined) payload[FIELDS.CURRENCY] = input.currency || 'BOB';
  if (input.notes !== undefined) payload[FIELDS.NOTES] = input.notes || null;
  if (input.status !== undefined) payload[FIELDS.STATUS] = input.status;
  if (input.subtotal !== undefined) payload[FIELDS.SUBTOTAL] = input.subtotal;
  if (input.taxRate !== undefined) payload[FIELDS.TAX_RATE] = input.taxRate;
  if (input.taxAmount !== undefined) payload[FIELDS.TAX_AMOUNT] = input.taxAmount;
  if (input.total !== undefined) payload[FIELDS.TOTAL] = input.total;
  return payload;
}

function buildLinePayload(line: {
  description: string;
  category: string;
  quantityRequested: number;
  quantityReceived: number;
  unitPrice: number;
  subtotal: number;
}): Record<string, unknown> {
  return {
    [LINE_FIELDS.DESCRIPTION]: line.description,
    [LINE_FIELDS.CATEGORY]: line.category || null,
    [LINE_FIELDS.QUANTITY_REQUESTED]: line.quantityRequested,
    [LINE_FIELDS.QUANTITY_RECEIVED]: line.quantityReceived ?? 0,
    [LINE_FIELDS.UNIT_PRICE]: line.unitPrice,
    [LINE_FIELDS.SUBTOTAL]: line.subtotal,
  };
}

// --- CACHÉ EN MEMORIA (mismo patrón que inventoryService.ts) ---------------

const CACHE_TTL_MS = 60_000; // 60s

interface ListCacheEntry {
  data?: PurchaseOrder[];
  ts: number;
  inflight?: Promise<PurchaseOrder[]>;
}

let listCache: ListCacheEntry | null = null;

/** Invalida la caché del listado. Se llama tras cualquier mutación. */
export function invalidatePurchaseOrdersCache(): void {
  listCache = null;
}

async function cachedList(fetcher: () => Promise<PurchaseOrder[]>): Promise<PurchaseOrder[]> {
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

// --- ÓRDENES DE COMPRA -------------------------------------------------------

/** Lista todas las órdenes de compra (orden descendente por fecha de creación). */
export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  return cachedList(async () => {
    // Recorre todas las páginas: con maxSize fijo, una sola página se
    // quedaría corta (y en silencio) apenas hubiera más de LIST_PAGE_SIZE
    // órdenes registradas.
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
    return all.map((raw: any) => mapOrder(raw));
  });
}

/** Líneas de una orden de compra (sub-recurso). */
export async function getPurchaseOrderLines(orderId: string): Promise<PurchaseOrderLine[]> {
  try {
    const res = await espoFetch(`/${ENTITY}/${orderId}/${LINES_SUBRESOURCE}`);
    const data = await res.json();
    const rawLines = Array.isArray(data) ? data : (data.list ?? []);
    return rawLines.map(mapLine);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

/** Trae una orden con su detalle de líneas. Devuelve null si no existe (404). */
export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  try {
    const res = await espoFetch(`/${ENTITY}/${id}`);
    const header = await res.json();
    const lines = await getPurchaseOrderLines(id);
    return mapOrder(header, lines);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Crea una orden de compra con sus líneas. Calcula subtotal/impuesto/total. */
export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const status = input.status ?? 'BORRADOR';
  if (!INITIAL_STATUSES.includes(status)) {
    throw new Error(`Una orden nueva no puede crearse directamente en estado "${status}".`);
  }

  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE_PERCENT;
  const lines = input.lines.map((l) => ({
    ...l,
    quantityReceived: 0,
    subtotal: calculateLineSubtotal(l.quantityRequested, l.unitPrice),
  }));
  const totals = calculateOrderTotals(lines, taxRate);

  const headerPayload = buildOrderPayload({
    reference: input.reference,
    providerId: input.providerId,
    requestDate: input.requestDate,
    expectedDate: input.expectedDate,
    requestedBy: input.requestedBy,
    currency: input.currency,
    notes: input.notes,
    status,
    taxRate,
    ...totals,
  });

  const res = await espoFetch(`/${ENTITY}`, {
    method: 'POST',
    body: JSON.stringify(headerPayload),
  });
  const savedHeader = await res.json();
  const orderId = savedHeader.id;

  // Se crean secuencialmente para no depender de que el backend soporte
  // creación en lote de líneas (contrato no confirmado).
  const savedLines: PurchaseOrderLine[] = [];
  for (const line of lines) {
    const lineRes = await espoFetch(`/${ENTITY}/${orderId}/${LINES_SUBRESOURCE}`, {
      method: 'POST',
      body: JSON.stringify(buildLinePayload(line)),
    });
    savedLines.push(mapLine(await lineRes.json()));
  }

  invalidatePurchaseOrdersCache();
  return mapOrder(savedHeader, savedLines);
}

/**
 * Compara las líneas nuevas contra las existentes en el backend y aplica
 * altas (sin id), bajas (id existente ausente en la lista nueva) y cambios
 * (id presente en ambas). Mismo patrón de diff que updateLoan/updateAssignment
 * en inventoryService.ts.
 */
async function syncPurchaseOrderLines(orderId: string, newLines: PurchaseOrderLine[]): Promise<void> {
  const current = await getPurchaseOrderLines(orderId);
  const newIds = new Set(newLines.filter((l) => l.id).map((l) => l.id));

  const toDelete = current.filter((l) => l.id && !newIds.has(l.id));
  const toUpdate = newLines.filter((l) => l.id);
  const toCreate = newLines.filter((l) => !l.id);

  for (const line of toDelete) {
    await espoFetch(`/${ENTITY}/${orderId}/${LINES_SUBRESOURCE}/${line.id}`, { method: 'DELETE' });
  }
  for (const line of toUpdate) {
    await espoFetch(`/${ENTITY}/${orderId}/${LINES_SUBRESOURCE}/${line.id}`, {
      method: 'PUT',
      body: JSON.stringify(buildLinePayload(line)),
    });
  }
  for (const line of toCreate) {
    await espoFetch(`/${ENTITY}/${orderId}/${LINES_SUBRESOURCE}`, {
      method: 'POST',
      body: JSON.stringify(buildLinePayload(line)),
    });
  }
}

/** Actualiza cabecera y, si se envían líneas, las sincroniza (altas/bajas/cambios). */
export async function updatePurchaseOrder(
  id: string,
  updates: UpdatePurchaseOrderInput,
): Promise<PurchaseOrder | null> {
  if (
    updates.status !== undefined &&
    updates.previousStatus !== undefined &&
    !isValidStatusTransition(updates.previousStatus, updates.status)
  ) {
    throw new Error(
      `No se puede cambiar el estado de "${updates.previousStatus}" a "${updates.status}".`,
    );
  }

  let totals: { subtotal: number; taxAmount: number; total: number } | undefined;
  let lines: PurchaseOrderLine[] | undefined;
  const taxRate = updates.taxRate;

  if (updates.lines) {
    lines = updates.lines.map((l) => ({
      ...l,
      subtotal: calculateLineSubtotal(l.quantityRequested, l.unitPrice),
    }));
    totals = calculateOrderTotals(lines, taxRate ?? DEFAULT_TAX_RATE_PERCENT);
  }

  const headerPayload = buildOrderPayload({
    reference: updates.reference,
    providerId: updates.providerId,
    requestDate: updates.requestDate,
    expectedDate: updates.expectedDate,
    requestedBy: updates.requestedBy,
    currency: updates.currency,
    notes: updates.notes,
    status: updates.status,
    taxRate,
    ...(totals ?? {}),
  });

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(headerPayload),
  });

  if (lines) {
    await syncPurchaseOrderLines(id, lines);
  }

  invalidatePurchaseOrdersCache();
  return getPurchaseOrder(id);
}

/**
 * Cancela una orden (cambia su estado a CANCELADA). No se implementa un
 * borrado físico: el flujo de estados (BORRADOR..CANCELADA) es el mecanismo
 * de baja, para conservar el historial de compras.
 */
export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const current = await getPurchaseOrder(id);
  if (!current) return null;
  if (!isValidStatusTransition(current.status, 'CANCELADA')) {
    throw new Error(`No se puede cancelar una orden en estado "${current.status}".`);
  }

  await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [FIELDS.STATUS]: 'CANCELADA' as PurchaseOrderStatus }),
  });
  invalidatePurchaseOrdersCache();
  return getPurchaseOrder(id);
}

/**
 * Registra la recepción (total o parcial) de una o más líneas.
 *
 * Actualiza cantidadRecibida por línea y, si TODAS las líneas quedan
 * completamente recibidas, marca la orden como RECIBIDA. Si solo algunas
 * líneas se completan, el estado de la orden se mantiene (recepción parcial)
 * para que quede claro que aún falta mercadería por llegar.
 *
 * NO crea equipos (CEquipo) automáticamente: ver nota de contrato pendiente
 * al inicio del archivo. `PurchaseOrderLine.createdItemId` queda preparado
 * para ese enlace cuando se confirme cómo debe crearse el equipo.
 *
 * Solo se puede recibir una orden en estado APROBADA (la recepción es lo que
 * la mueve a RECIBIDA; no tiene sentido recibir mercadería de una orden que
 * todavía es un borrador, que no fue aprobada, o que ya se canceló).
 */
export async function receivePurchaseOrder(
  orderId: string,
  receipts: ReceiveLineInput[],
): Promise<PurchaseOrder | null> {
  const current = await getPurchaseOrder(orderId);
  if (!current) throw new Error('La orden de compra ya no existe.');
  if (current.status !== 'APROBADA') {
    throw new Error(
      `Solo se puede registrar la recepción de una orden "APROBADA" (estado actual: "${current.status}").`,
    );
  }

  const linesById = new Map(current.lines.map((l) => [l.id, l]));
  for (const receipt of receipts) {
    const line = linesById.get(receipt.lineId);
    if (!line) throw new Error('La línea indicada no pertenece a esta orden.');
    if (
      !Number.isFinite(receipt.quantityReceived) ||
      receipt.quantityReceived < 0 ||
      receipt.quantityReceived > line.quantityRequested
    ) {
      throw new Error(
        `La cantidad recibida de "${line.description}" debe estar entre 0 y ${line.quantityRequested}.`,
      );
    }
  }

  for (const receipt of receipts) {
    await espoFetch(`/${ENTITY}/${orderId}/${LINES_SUBRESOURCE}/${receipt.lineId}`, {
      method: 'PUT',
      body: JSON.stringify({ [LINE_FIELDS.QUANTITY_RECEIVED]: receipt.quantityReceived }),
    });
  }

  const updatedLines = await getPurchaseOrderLines(orderId);
  const fullyReceived =
    updatedLines.length > 0 && updatedLines.every((l) => l.quantityReceived >= l.quantityRequested);

  if (fullyReceived) {
    await espoFetch(`/${ENTITY}/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ [FIELDS.STATUS]: 'RECIBIDA' as PurchaseOrderStatus }),
    });
  }

  invalidatePurchaseOrdersCache();
  return getPurchaseOrder(orderId);
}
