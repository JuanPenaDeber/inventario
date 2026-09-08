// =============================================================================
// Servicio de Proformas / Cotizaciones — Fase 3. Cada solicitud de compra
// (CSolicitudCompra, ver purchaseRequestService.ts) puede tener varias
// proformas de distintos proveedores. Una proforma, una vez registrada, NO SE
// EDITA: si hubo un error al capturarla, se registra una proforma corregida.
// Así el histórico de cotizaciones recibidas queda íntegro sin necesidad de
// un mecanismo de auditoría de ediciones.
//
// Apunta a EspoCRM directamente, igual que el resto de servicios de este
// proyecto (100% estático, sin backend propio).
//
// =============================================================================
// CONTRATO PENDIENTE DE CONFIRMAR CON EL BACKEND (EspoCRM)
// =============================================================================
// Ninguna de estas entidades existe todavía. Se asume el modelo relacional
// típico de EspoCRM (una entidad real por cada "sub-recurso", enlazada por un
// campo link), NO un JSON embebido:
//
//   CSolicitudCompra (1) --- (N) CProforma (1) --- (N) CProformaDetalle
//
// Nombres configurables vía constantes/env, mismo patrón que el resto de
// servicios de este proyecto:
//
//   GET/POST /{CSolicitudCompra}/{solicitudId}/proformas   -> CProforma
//   GET/POST /{CProforma}/{proformaId}/lineas              -> CProformaDetalle
//
// Campos esperados en CProforma:
//   - proveedorId          (link -> CProveedor)
//   - proveedorName        (string, autogenerado por EspoCRM)
//   - numero               (string)  Número de proforma/cotización del proveedor
//   - fechaEmision         (date)
//   - diasValidez          (int)
//   - fechaVencimiento     (date)    fechaEmision + diasValidez (se envía ya calculada)
//   - moneda               (string)
//   - descuento            (float)
//   - impuestoPorcentaje   (float)
//   - impuestoMonto        (float)
//   - subtotal             (float)
//   - total                (float)
//   - condicionesPago      (string)
//   - tiempoEntrega        (string)
//   - observaciones        (text, opcional)
//   - archivoId            (string, opcional) Id del Attachment de EspoCRM
//   - archivoName          (string, opcional — EspoCRM autogenera este nombre
//                                    para el campo "compañero" de un File/Link,
//                                    NO uses "archivoNombre": no se autocompletaría)
//   - registradoPor        (string)  Nombre de quien la registró
//   - anulada              (bool, opcional)   true si se anuló (ver voidProforma)
//   - motivoAnulacion      (text, opcional)   Obligatorio cuando anulada = true
//
// Campos esperados en CProformaDetalle:
//   - producto (string), cantidad (int), precioUnitario (float), subtotal (float)
//
// Adjuntos: se asume el endpoint estándar de EspoCRM `POST /Attachment` con
// body { name, type, role: "Attachment", relatedType, field, file: dataURL },
// que devuelve { id, name }. Ese id se guarda en `archivoId`. Si el backend no
// soporta esto todavía, la subida simplemente falla y la proforma se guarda
// sin adjunto (no bloquea el registro — ver createProforma).
// =============================================================================

import { Proforma, ProformaLine, ProformaValidity } from '../types';
import { EspoApiError as ApiError, getEspoErrorMessage, createEspoFetch, round2 } from './espoClient';

// --- CONFIGURACIÓN ----------------------------------------------------------

export const PROFORMAS_API_URL =
  import.meta.env.VITE_PROFORMAS_API_URL ?? 'http://local.grupoeldeber.com/api/v1';

// Debe coincidir con el mismo valor usado en purchaseRequestService.ts.
const REQUEST_ENTITY = import.meta.env.VITE_PURCHASE_REQUEST_ENTITY ?? 'CSolicitudCompra';
const PROFORMA_ENTITY = import.meta.env.VITE_PROFORMA_ENTITY ?? 'CProforma';
const PROFORMAS_SUBRESOURCE = import.meta.env.VITE_PROFORMAS_SUBRESOURCE ?? 'proformas';
const PROFORMA_LINES_SUBRESOURCE = import.meta.env.VITE_PROFORMA_LINES_SUBRESOURCE ?? 'lineas';

export const DEFAULT_PROFORMA_TAX_RATE_PERCENT = Number(
  import.meta.env.VITE_PROFORMA_TAX_RATE ?? 13,
);

// Días antes del vencimiento en que una proforma se considera "próxima a vencer".
export const PROFORMA_EXPIRY_WARNING_DAYS = Number(
  import.meta.env.VITE_PROFORMA_EXPIRY_WARNING_DAYS ?? 3,
);

const FIELDS = {
  PROVIDER_ID: 'proveedorId',
  PROVIDER_NAME: 'proveedorName',
  NUMBER: 'numero',
  ISSUE_DATE: 'fechaEmision',
  VALIDITY_DAYS: 'diasValidez',
  EXPIRY_DATE: 'fechaVencimiento',
  CURRENCY: 'moneda',
  DISCOUNT: 'descuento',
  TAX_RATE: 'impuestoPorcentaje',
  TAX_AMOUNT: 'impuestoMonto',
  SUBTOTAL: 'subtotal',
  TOTAL: 'total',
  PAYMENT_TERMS: 'condicionesPago',
  DELIVERY_TIME: 'tiempoEntrega',
  NOTES: 'observaciones',
  ATTACHMENT_ID: 'archivoId',
  ATTACHMENT_NAME: 'archivoName',
  REGISTERED_BY: 'registradoPor',
  VOIDED: 'anulada',
  VOID_REASON: 'motivoAnulacion',
} as const;

const LINE_FIELDS = {
  PRODUCT: 'producto',
  QUANTITY: 'cantidad',
  UNIT_PRICE: 'precioUnitario',
  SUBTOTAL: 'subtotal',
} as const;

// --- TIPOS DE ENTRADA --------------------------------------------------------

export interface ProformaLineInput {
  product: string;
  quantity: number;
  unitPrice: number;
}

export interface ProformaAttachmentInput {
  fileName: string;
  mimeType: string;
  /** Data URL completa (resultado de FileReader.readAsDataURL). */
  dataUrl: string;
}

export interface CreateProformaInput {
  providerId: string;
  number: string;
  issueDate: string;
  validityDays: number;
  currency: string;
  discount?: number;
  taxRate?: number;
  paymentTerms: string;
  deliveryTime: string;
  notes?: string;
  lines: ProformaLineInput[];
}

// --- MANEJO DE ERRORES Y FETCH (ver services/espoClient.ts) -----------------

export function getProformaErrorMessage(error: unknown, fallback: string): string {
  return getEspoErrorMessage(
    error,
    fallback,
    'Sin permiso sobre las proformas. Revisa el rol del usuario API en EspoCRM.',
  );
}

const espoFetch = createEspoFetch(PROFORMAS_API_URL);

// --- CÁLCULOS ----------------------------------------------------------------

export function calculateProformaLineSubtotal(quantity: number, unitPrice: number): number {
  return round2((quantity || 0) * (unitPrice || 0));
}

export function calculateProformaTotals(
  lines: { subtotal: number }[],
  discount: number,
  taxRatePercent: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = round2(lines.reduce((sum, l) => sum + (l.subtotal || 0), 0));
  const taxableBase = Math.max(0, round2(subtotal - (discount || 0)));
  const taxAmount = round2((taxableBase * (taxRatePercent || 0)) / 100);
  const total = round2(taxableBase + taxAmount);
  return { subtotal, taxAmount, total };
}

/** Fecha de vencimiento = fecha de emisión + días de validez. */
export function calculateExpiryDate(issueDate: string, validityDays: number): string {
  if (!issueDate || !Number.isFinite(validityDays)) return '';
  const d = new Date(`${issueDate}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Math.max(0, Math.trunc(validityDays)));
  return d.toISOString().slice(0, 10);
}

/** Vigencia de una proforma según su fecha de vencimiento, calculada en el cliente. */
/**
 * Límite conocido: "hoy" se toma del reloj del navegador, no de un servidor.
 * La app no tiene backend propio (habla directo con EspoCRM desde el
 * navegador), así que no hay una fuente de tiempo central contra la cual
 * comparar. Para usuarios todos en la misma zona horaria (el caso real hoy)
 * esto es exacto; si algún día se usa desde otro huso horario, la fecha
 * límite podría verse corrida un día para esa persona.
 */
export function getProformaValidity(
  expiryDate: string,
  warningDays: number = PROFORMA_EXPIRY_WARNING_DAYS,
): ProformaValidity {
  if (!expiryDate) return 'VIGENTE';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (isNaN(expiry.getTime())) return 'VIGENTE';
  const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'VENCIDA';
  if (diffDays <= warningDays) return 'PROXIMA_A_VENCER';
  return 'VIGENTE';
}

function validateProformaInput(input: CreateProformaInput): void {
  if (!input.providerId) throw new Error('Selecciona el proveedor de la proforma.');
  if (!input.number.trim()) throw new Error('El número de proforma/cotización es obligatorio.');
  if (!input.issueDate) throw new Error('La fecha de emisión es obligatoria.');
  if (!Number.isFinite(input.validityDays) || input.validityDays <= 0) {
    throw new Error('La validez debe ser una cantidad de días mayor a 0.');
  }
  if (input.lines.length === 0) {
    throw new Error('La proforma debe tener al menos un producto cotizado.');
  }
  for (const line of input.lines) {
    if (!line.product.trim()) throw new Error('Todos los productos cotizados deben tener descripción.');
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error(`La cantidad de "${line.product}" debe ser mayor a 0.`);
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new Error(`El precio unitario de "${line.product}" no puede ser negativo.`);
    }
  }
}

// --- MAPEO EspoCRM <-> Frontend ---------------------------------------------

function espoToIso(s?: string | null): string | undefined {
  if (!s) return undefined;
  return s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
}

function mapLine(raw: any): ProformaLine {
  const quantity = Number(raw[LINE_FIELDS.QUANTITY] ?? 0);
  const unitPrice = Number(raw[LINE_FIELDS.UNIT_PRICE] ?? 0);
  return {
    id: raw.id ?? '',
    product: raw[LINE_FIELDS.PRODUCT] ?? '',
    quantity,
    unitPrice,
    subtotal:
      raw[LINE_FIELDS.SUBTOTAL] !== undefined
        ? Number(raw[LINE_FIELDS.SUBTOTAL])
        : calculateProformaLineSubtotal(quantity, unitPrice),
  };
}

function mapProforma(raw: any, lines: ProformaLine[] = []): Proforma {
  const taxRate = Number(raw[FIELDS.TAX_RATE] ?? DEFAULT_PROFORMA_TAX_RATE_PERCENT);
  const discount = Number(raw[FIELDS.DISCOUNT] ?? 0);
  const totals = calculateProformaTotals(lines, discount, taxRate);
  return {
    id: raw.id ?? '',
    providerId: raw[FIELDS.PROVIDER_ID] ?? '',
    providerName: raw[FIELDS.PROVIDER_NAME] ?? undefined,
    number: raw[FIELDS.NUMBER] ?? '',
    issueDate: raw[FIELDS.ISSUE_DATE] ?? '',
    validityDays: Number(raw[FIELDS.VALIDITY_DAYS] ?? 0),
    expiryDate: raw[FIELDS.EXPIRY_DATE] ?? '',
    currency: raw[FIELDS.CURRENCY] ?? 'BOB',
    discount,
    taxRate,
    subtotal: raw[FIELDS.SUBTOTAL] !== undefined ? Number(raw[FIELDS.SUBTOTAL]) : totals.subtotal,
    taxAmount: raw[FIELDS.TAX_AMOUNT] !== undefined ? Number(raw[FIELDS.TAX_AMOUNT]) : totals.taxAmount,
    total: raw[FIELDS.TOTAL] !== undefined ? Number(raw[FIELDS.TOTAL]) : totals.total,
    paymentTerms: raw[FIELDS.PAYMENT_TERMS] ?? '',
    deliveryTime: raw[FIELDS.DELIVERY_TIME] ?? '',
    notes: raw[FIELDS.NOTES] ?? undefined,
    attachmentId: raw[FIELDS.ATTACHMENT_ID] ?? undefined,
    attachmentName: raw[FIELDS.ATTACHMENT_NAME] ?? undefined,
    registeredBy: raw[FIELDS.REGISTERED_BY] ?? '',
    voided: Boolean(raw[FIELDS.VOIDED]) || undefined,
    voidReason: raw[FIELDS.VOID_REASON] ?? undefined,
    lines,
    createdAt: espoToIso(raw.createdAt),
  };
}

function buildProformaPayload(input: {
  providerId: string;
  number: string;
  issueDate: string;
  validityDays: number;
  expiryDate: string;
  currency: string;
  discount: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentTerms: string;
  deliveryTime: string;
  notes?: string;
  registeredBy: string;
  attachmentId?: string;
  attachmentName?: string;
}): Record<string, unknown> {
  return {
    [FIELDS.PROVIDER_ID]: input.providerId,
    [FIELDS.NUMBER]: input.number,
    [FIELDS.ISSUE_DATE]: input.issueDate,
    [FIELDS.VALIDITY_DAYS]: input.validityDays,
    [FIELDS.EXPIRY_DATE]: input.expiryDate,
    [FIELDS.CURRENCY]: input.currency,
    [FIELDS.DISCOUNT]: input.discount,
    [FIELDS.TAX_RATE]: input.taxRate,
    [FIELDS.SUBTOTAL]: input.subtotal,
    [FIELDS.TAX_AMOUNT]: input.taxAmount,
    [FIELDS.TOTAL]: input.total,
    [FIELDS.PAYMENT_TERMS]: input.paymentTerms,
    [FIELDS.DELIVERY_TIME]: input.deliveryTime,
    [FIELDS.NOTES]: input.notes || null,
    [FIELDS.REGISTERED_BY]: input.registeredBy,
    [FIELDS.ATTACHMENT_ID]: input.attachmentId || null,
    [FIELDS.ATTACHMENT_NAME]: input.attachmentName || null,
  };
}

function buildLinePayload(line: { product: string; quantity: number; unitPrice: number; subtotal: number }) {
  return {
    [LINE_FIELDS.PRODUCT]: line.product,
    [LINE_FIELDS.QUANTITY]: line.quantity,
    [LINE_FIELDS.UNIT_PRICE]: line.unitPrice,
    [LINE_FIELDS.SUBTOTAL]: line.subtotal,
  };
}

// --- ADJUNTOS ----------------------------------------------------------------

/**
 * Sube el archivo de una proforma al Attachment genérico de EspoCRM.
 * NO bloquea el registro de la proforma si falla: devuelve null y quien llama
 * decide seguir sin adjunto (ver createProforma).
 */
async function uploadProformaAttachment(
  attachment: ProformaAttachmentInput,
): Promise<{ id: string; name: string } | null> {
  try {
    const res = await espoFetch('/Attachment', {
      method: 'POST',
      body: JSON.stringify({
        name: attachment.fileName,
        type: attachment.mimeType,
        role: 'Attachment',
        relatedType: PROFORMA_ENTITY,
        field: 'archivo',
        file: attachment.dataUrl,
      }),
    });
    const saved = await res.json();
    return { id: saved.id, name: saved.name ?? attachment.fileName };
  } catch (err) {
    console.warn('No se pudo subir el adjunto de la proforma; se continúa sin archivo.', err);
    return null;
  }
}

// --- PROFORMAS ---------------------------------------------------------------

export async function getProformaLines(proformaId: string): Promise<ProformaLine[]> {
  try {
    const res = await espoFetch(`/${PROFORMA_ENTITY}/${proformaId}/${PROFORMA_LINES_SUBRESOURCE}`);
    const data = await res.json();
    const rawLines = Array.isArray(data) ? data : (data.list ?? []);
    return rawLines.map(mapLine);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

/** Todas las proformas registradas para una solicitud, con sus líneas. */
export async function getProformas(requestId: string): Promise<Proforma[]> {
  const res = await espoFetch(`/${REQUEST_ENTITY}/${requestId}/${PROFORMAS_SUBRESOURCE}`);
  const data = await res.json();
  const rawList = Array.isArray(data) ? data : (data.list ?? []);
  // Las líneas de cada proforma se piden en paralelo (antes era un for..of
  // secuencial: N proformas = N round-trips uno detrás del otro).
  const linesByProforma = await Promise.all(rawList.map((raw: any) => getProformaLines(raw.id)));
  return rawList.map((raw: any, i: number) => mapProforma(raw, linesByProforma[i]));
}

export async function getProforma(requestId: string, proformaId: string): Promise<Proforma | null> {
  const all = await getProformas(requestId);
  return all.find((p) => p.id === proformaId) ?? null;
}

/**
 * Registra una nueva proforma para una solicitud. El adjunto es opcional y su
 * fallo no bloquea el registro (ver uploadProformaAttachment).
 */
export async function createProforma(
  requestId: string,
  input: CreateProformaInput,
  registeredBy: string,
  attachment?: ProformaAttachmentInput,
): Promise<Proforma> {
  validateProformaInput(input);

  const taxRate = input.taxRate ?? DEFAULT_PROFORMA_TAX_RATE_PERCENT;
  const discount = input.discount ?? 0;
  const lines = input.lines.map((l) => ({
    ...l,
    subtotal: calculateProformaLineSubtotal(l.quantity, l.unitPrice),
  }));
  const totals = calculateProformaTotals(lines, discount, taxRate);
  const expiryDate = calculateExpiryDate(input.issueDate, input.validityDays);

  let uploaded: { id: string; name: string } | null = null;
  if (attachment) {
    uploaded = await uploadProformaAttachment(attachment);
  }

  const headerPayload = buildProformaPayload({
    providerId: input.providerId,
    number: input.number,
    issueDate: input.issueDate,
    validityDays: input.validityDays,
    expiryDate,
    currency: input.currency,
    discount,
    taxRate,
    ...totals,
    paymentTerms: input.paymentTerms,
    deliveryTime: input.deliveryTime,
    notes: input.notes,
    registeredBy,
    attachmentId: uploaded?.id,
    attachmentName: uploaded?.name,
  });

  const res = await espoFetch(`/${REQUEST_ENTITY}/${requestId}/${PROFORMAS_SUBRESOURCE}`, {
    method: 'POST',
    body: JSON.stringify(headerPayload),
  });
  const savedHeader = await res.json();
  const proformaId = savedHeader.id;

  const savedLines: ProformaLine[] = [];
  for (const line of lines) {
    const lineRes = await espoFetch(`/${PROFORMA_ENTITY}/${proformaId}/${PROFORMA_LINES_SUBRESOURCE}`, {
      method: 'POST',
      body: JSON.stringify(buildLinePayload(line)),
    });
    savedLines.push(mapLine(await lineRes.json()));
  }

  return mapProforma(savedHeader, savedLines);
}

/**
 * Anula una proforma (no la borra ni cambia sus montos/líneas — solo la saca
 * de la comparación/selección). El motivo es obligatorio para que quede
 * constancia de por qué se descartó una cotización ya recibida.
 */
export async function voidProforma(proformaId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error('El motivo de anulación es obligatorio.');
  }
  await espoFetch(`/${PROFORMA_ENTITY}/${proformaId}`, {
    method: 'PUT',
    body: JSON.stringify({
      [FIELDS.VOIDED]: true,
      [FIELDS.VOID_REASON]: reason.trim(),
    }),
  });
}
