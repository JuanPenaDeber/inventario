// =============================================================================
// Servicio de Incidencias — apunta a EspoCRM (entidad CIncidencia).
// El navegador habla DIRECTO con EspoCRM (igual que inventoryService), así que
// el proyecto es 100% estático: basta `npm run build` + copiar dist/.
// =============================================================================
import { downloadXlsx, isWithinDateRange, formatDateTime } from '@/shared/utils/reportUtils';
import { getEspoErrorMessage, createEspoFetch, createEspoList } from '@/shared/api/espoClient';

// --- CONFIGURACIÓN ----------------------------------------------------------

// URL base de EspoCRM. Sobreescribible con VITE_INCIDENTS_API_URL en el .env.
export const INCIDENTS_API_URL =
  import.meta.env.VITE_INCIDENTS_API_URL ??
  'http://local.grupoeldeber.com/api/v1';

// Entidad personalizada de EspoCRM.
const ENTITY = 'CIncidencia';

// Contraseña del portal público de incidencias (hoy desactivado: ver
// ENABLE_USER_PORTAL en IncidentsModule.tsx).
//
// SIN valor por defecto a propósito. Antes caía a una contraseña fija escrita
// en el código; hoy el portal está apagado y el bundler la elimina, pero con
// solo activar el flag esa contraseña se habría publicado en el JS que
// descarga cualquiera. Si no se configura VITE_ADMIN_PASSWORD, el portal
// rechaza todos los intentos en vez de aceptar una contraseña conocida.
//
// Aclaración: esto es una compuerta de conveniencia en el navegador, no
// seguridad real — cualquiera puede saltarla. La protección real son los
// permisos del usuario API en EspoCRM.
export const ADMIN_PASSWORD: string | undefined = import.meta.env.VITE_ADMIN_PASSWORD;

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

/** Traduce el error a un mensaje legible para el usuario. */
export function getErrorMessage(error: unknown, fallback: string): string {
  return getEspoErrorMessage(
    error,
    fallback,
    'Sin permiso sobre las incidencias. Revisa el rol del usuario API en EspoCRM.',
  );
}

/** Wrapper de fetch con la API key de EspoCRM, timeout y errores normalizados. */
const espoFetch = createEspoFetch(INCIDENTS_API_URL);
const listAll = createEspoList(espoFetch);

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
  const list = await listAll(`/${ENTITY}`, { orderBy: 'createdAt', order: 'desc' });
  return list.map(mapIncident);
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
    isWithinDateRange(i.createdAt, startDate, endDate),
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

  await downloadXlsx(
    `incidencias_${startDate}_a_${endDate}.xlsx`,
    'Incidencias',
    [header, ...rows],
    [14, 20, 25, 30, 20, 20, 40, 14, 20, 40],
  );
}

// --- UTILIDADES DE FECHA ----------------------------------------------------
// Este archivo definía sus propias toISODate/today/daysAgo/formatDateTime/
// isWithinRange, casi idénticas a las de shared/utils/reportUtils.ts. Se
// eliminaron: los componentes de Incidencias ahora importan las compartidas.
// Además isWithinRange no tenía la protección contra el desfase de zona
// horaria que isWithinDateRange sí resuelve.
