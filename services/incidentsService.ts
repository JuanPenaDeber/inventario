// =============================================================================
// Servicio de Incidencias — apunta a EspoCRM (entidad CIncidencia).
// El navegador habla DIRECTO con EspoCRM (igual que inventoryService), así que
// el proyecto es 100% estático: basta `npm run build` + copiar dist/.
// =============================================================================
import { downloadXlsx } from './reportUtils';

// --- CONFIGURACIÓN ----------------------------------------------------------

// URL base de EspoCRM. Sobreescribible con VITE_INCIDENTS_API_URL en el .env.
export const INCIDENTS_API_URL =
  (import.meta as any).env?.VITE_INCIDENTS_API_URL ??
  'http://local.grupoeldeber.com/api/v1';

// Entidad personalizada de EspoCRM y API key del usuario "inventario".
const ENTITY = 'CIncidencia';
const API_KEY = '2b4fd11376a17549cba81c63a8840727';

const HEADERS = {
  'X-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

// Contraseña fija del panel administrativo (temporal, sin JWT).
export const ADMIN_PASSWORD =
  (import.meta as any).env?.VITE_ADMIN_PASSWORD ?? 'eldeber2026';

// Dominio corporativo obligatorio para el correo del usuario.
export const CORPORATE_DOMAIN = '@grupoeldeber.com';

// Días que se muestran por defecto en el dashboard.
export const DEFAULT_RANGE_DAYS = 7;

// Áreas sugeridas (el campo en EspoCRM es Varchar, así que son solo sugerencias).
export const AREAS = [
  'Redacción',
  'Comercial',
  'Marketing',
  'Administración',
  'Recursos Humanos',
  'Contabilidad',
  'Sistemas / TI',
  'Producción',
  'Distribución',
  'Gerencia',
] as const;

// Artículos sugeridos (campo Varchar → se pueden escribir artículos nuevos).
export const ARTICULOS = [
  'Computadora de escritorio',
  'Laptop',
  'Monitor',
  'Teclado',
  'Mouse',
  'Impresora',
  'Escáner',
  'Teléfono IP',
  'Proyector',
  'Router / Red',
  'UPS',
  'Otro',
] as const;

// Técnicos de Sistemas (responsables). Para el desplegable del panel admin.
export const TECNICOS = [
  'Remberto Añez',
  'Luis Montalvo',
  'Osvaldo',
  'Briggit Castillo',
] as const;

// Estados posibles (deben coincidir EXACTAMENTE con el enum de EspoCRM).
export const ESTADOS = ['Pendiente', 'En proceso', 'Solucionado'] as const;
export type Estado = (typeof ESTADOS)[number];

// Estado que marca la incidencia como resuelta (registra fechaResolucion).
const ESTADO_RESUELTO: Estado = 'Solucionado';

// Clases Tailwind del chip por estado.
export const ESTADO_CHIP: Record<Estado, string> = {
  Pendiente: 'text-amber-600 border-amber-300 bg-amber-50',
  'En proceso': 'text-blue-600 border-blue-300 bg-blue-50',
  Solucionado: 'text-green-600 border-green-300 bg-green-50',
};

// --- TIPOS ------------------------------------------------------------------

/** Incidencia normalizada para el frontend (mapeada desde EspoCRM). */
export interface Incident {
  _id: string; // = id de EspoCRM
  ticketId: string;
  usuario: string;
  correo: string;
  area: string;
  articulo: string;
  problema: string;
  estado: Estado;
  solucion?: string;
  tecnico?: string;
  fechaResolucion?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIncidentPayload {
  usuario: string;
  correo: string;
  area: string;
  articulo: string;
  problema: string;
  estado?: Estado;
}

export interface UpdateIncidentPayload {
  estado?: Estado;
  tecnico?: string;
  solucion?: string;
}

export interface IncidentFilters {
  usuario?: string;
  area?: string;
  articulo?: string;
  estado?: Estado;
}

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
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return 'Sin permiso sobre las incidencias. Revisa el rol del usuario API en EspoCRM.';
    if (error.reason) return error.reason;
    return fallback;
  }
  if (error instanceof TypeError) {
    // fetch lanza TypeError cuando no puede conectar.
    return 'No se pudo conectar con el servidor. Verifica la red o que EspoCRM esté activo.';
  }
  return fallback;
}

/** Wrapper de fetch con la API key de EspoCRM y errores normalizados. */
async function espoFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${INCIDENTS_API_URL}${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    // EspoCRM manda el motivo del error en el header X-Status-Reason.
    const reason = res.headers.get('X-Status-Reason') ?? '';
    throw new ApiError(res.status, reason);
  }
  return res;
}

// --- MAPEO EspoCRM <-> Frontend ---------------------------------------------

/** Convierte datetime de EspoCRM ("YYYY-MM-DD HH:mm:ss" UTC) a ISO. */
function espoToIso(s?: string | null): string | null {
  if (!s) return null;
  return s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
}

/** Datetime actual en el formato que espera EspoCRM (UTC). */
function nowEspo(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Mapea un registro de EspoCRM al tipo Incident del frontend. */
function mapIncident(r: any): Incident {
  return {
    _id: r.id,
    ticketId: r.ticketId ?? '',
    usuario: r.usuario ?? '',
    correo: r.correo ?? '',
    area: r.area ?? '',
    articulo: r.articulo ?? '',
    problema: r.problema ?? '',
    estado: (r.estado ?? 'Pendiente') as Estado,
    solucion: r.solucion ?? undefined,
    tecnico: r.tecnico ?? undefined,
    fechaResolucion: espoToIso(r.fechaResolucion),
    createdAt: espoToIso(r.createdAt) ?? '',
    updatedAt: espoToIso(r.modifiedAt) ?? '',
  };
}

// --- INCIDENCIAS ------------------------------------------------------------

/** Crea una nueva incidencia en EspoCRM. */
export async function createIncident(
  payload: CreateIncidentPayload,
): Promise<Incident> {
  const body = {
    // "name" es el campo principal de EspoCRM (cómo se ve el registro).
    name: `${payload.usuario} · ${payload.articulo}`,
    usuario: payload.usuario,
    correo: payload.correo,
    area: payload.area,
    articulo: payload.articulo,
    problema: payload.problema,
    estado: payload.estado ?? 'Pendiente',
  };
  const res = await espoFetch(`/${ENTITY}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return mapIncident(await res.json());
}

/**
 * Lista todas las incidencias (orden descendente por fecha).
 * El dashboard filtra en el cliente, así que traemos el listado completo.
 */
export async function getIncidents(
  _filters: IncidentFilters = {},
): Promise<Incident[]> {
  const params = new URLSearchParams({
    maxSize: '200',
    offset: '0',
    orderBy: 'createdAt',
    order: 'desc',
  });
  const res = await espoFetch(`/${ENTITY}?${params.toString()}`);
  const data = await res.json();
  return (data.list ?? []).map(mapIncident);
}

/** Actualiza estado, técnico y/o solución de una incidencia. */
export async function updateIncident(
  id: string,
  payload: UpdateIncidentPayload,
): Promise<Incident> {
  const body: Record<string, unknown> = { ...payload };

  // Registrar/limpiar la fecha de resolución según el estado.
  if (payload.estado !== undefined) {
    body.fechaResolucion = payload.estado === ESTADO_RESUELTO ? nowEspo() : null;
  }

  const res = await espoFetch(`/${ENTITY}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return mapIncident(await res.json());
}

// --- REPORTE (Excel generado en el navegador) -------------------------------

/** Descarga un Excel (.xlsx) con las incidencias del rango. */
export async function downloadExcelReport(
  startDate: string,
  endDate: string,
): Promise<void> {
  const all = await getIncidents();
  const inRange = all.filter((i) =>
    isWithinRange(i.createdAt, startDate, endDate),
  );

  const header = [
    'Ticket',
    'Fecha',
    'Usuario',
    'Correo',
    'Área',
    'Artículo',
    'Problema',
    'Estado',
    'Técnico',
    'Solución',
  ];
  const rows = inRange.map((i) => [
    i.ticketId,
    formatDateTime(i.createdAt),
    i.usuario,
    i.correo,
    i.area,
    i.articulo,
    i.problema,
    i.estado,
    i.tecnico ?? '',
    i.solucion ?? '',
  ]);

  downloadXlsx(
    `incidencias_${startDate}_a_${endDate}.xlsx`,
    'Incidencias',
    [header, ...rows],
    [14, 20, 25, 30, 20, 20, 40, 14, 20, 40],
  );
}

// --- UTILIDADES DE FECHA ----------------------------------------------------

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isWithinRange(
  iso: string,
  startDate: string,
  endDate: string,
): boolean {
  const value = new Date(iso).getTime();
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T23:59:59.999`).getTime();
  return value >= start && value <= end;
}
