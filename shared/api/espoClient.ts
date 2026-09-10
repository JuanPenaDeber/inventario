// =============================================================================
// Cliente HTTP compartido para los servicios que hablan DIRECTO con EspoCRM:
// purchaseOrderService.ts, purchaseRequestService.ts, proformaService.ts,
// suggestionService.ts e incidentsService.ts. Centraliza tres cosas que antes
// estaban duplicadas casi idénticas en cada uno de esos archivos:
//
//   1. La API key (una sola constante en vez de N literales repetidos).
//   2. El wrapper de fetch: encabezados + timeout + errores normalizados.
//   3. El helper de redondeo usado en los cálculos de totales.
//
// A propósito NO se usa en inventoryService.ts: es el módulo de mayor uso
// diario y su `apiRequest` atrapa cualquier fallo de red devolviendo datos de
// respaldo en vez de lanzar una excepción (ver cabecera de ese archivo) — un
// contrato de errores opuesto al de espoFetch, que SIEMPRE lanza. Unificarlos
// cambiaría ese comportamiento intencional, así que inventoryService sigue
// con su propio wrapper.
// =============================================================================

// API key del usuario "inventario" en EspoCRM. Antes vivía repetida como
// literal en cada uno de los 4 servicios; ahora es un solo lugar para
// rotarla si hace falta. Sigue viajando en el bundle del navegador porque la
// arquitectura completa de la app es "el navegador habla directo con
// EspoCRM" — eso no cambia con esto, solo deja de estar copiado 4 veces.
//
// SIN valor por defecto a propósito. Antes había uno embebido acá mismo, y
// ese literal terminaba compilado en cada `dist/` sin que hiciera falta ni
// un .env — es decir, viajaba igual aunque nadie configurara nada. Faltar la
// variable ahora es un error explícito, pero recién al hacer la primera
// petición (no al importar el módulo): evaluar esto al cargar rompía
// cualquier entorno sin .env local —tests, CI, un clon nuevo— aunque esa
// petición nunca fuera a dispararse.
let cachedApiKey: string | undefined;

export function getEspoApiKey(): string {
  if (cachedApiKey === undefined) {
    const raw = import.meta.env.VITE_ESPOCRM_API_KEY;
    if (!raw) {
      throw new Error(
        'Falta VITE_ESPOCRM_API_KEY. Configurala en tu .env local (no se versiona — ' +
        'ver .env.example) antes de hacer peticiones a EspoCRM.',
      );
    }
    cachedApiKey = raw;
  }
  return cachedApiKey;
}

// Tiempo máximo de espera por petición. Sin esto, una petición colgada dejaba
// el spinner de carga girando para siempre en vez de mostrar un error.
const DEFAULT_TIMEOUT_MS = 10_000;

export class EspoApiError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(reason || `HTTP ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

/**
 * Traduce un error de red/EspoCRM a un mensaje legible para el usuario.
 * `forbiddenMessage` deja personalizar el aviso de permisos (403) mencionando
 * el módulo correspondiente ("órdenes de compra", "proformas", etc.).
 */
export function getEspoErrorMessage(error: unknown, fallback: string, forbiddenMessage?: string): string {
  if (error instanceof EspoApiError) {
    if (error.status === 403) {
      return forbiddenMessage ?? 'Sin permiso para esta operación. Revisa el rol del usuario API en EspoCRM.';
    }
    if (error.reason) return error.reason;
    if (error.status === 404) {
      // EspoCRM sí manda el motivo real (ej. "Controller 'X' does not exist")
      // en la cabecera X-Status-Reason, pero si su configuración de CORS no
      // la expone (Access-Control-Expose-Headers), el navegador no deja
      // leerla desde fetch() aunque viaje en la respuesta — por eso no
      // siempre llega a `error.reason`. Este mensaje cubre ese caso.
      return 'La entidad todavía no existe en EspoCRM, o la URL configurada es incorrecta.';
    }
    return fallback;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'La solicitud tardó demasiado y se canceló. Verifica tu conexión o que EspoCRM esté activo.';
  }
  if (error instanceof TypeError) {
    return 'No se pudo conectar con el servidor. Verifica la red o que EspoCRM esté activo.';
  }
  // Errores de validación propios de cada servicio (transiciones de estado,
  // cantidades inválidas, etc.) ya llevan su mensaje listo para el usuario.
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/**
 * Crea la función `espoFetch` de un servicio, atada a su propia URL base.
 * Agrega la API key, un timeout con AbortController, y normaliza errores
 * HTTP como EspoApiError.
 */
export function createEspoFetch(baseUrl: string) {
  return async function espoFetch(
    path: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          'X-Api-Key': getEspoApiKey(),
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const reason = res.headers.get('X-Status-Reason') ?? '';
        throw new EspoApiError(res.status, reason);
      }
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

// --- LISTADOS PAGINADOS -----------------------------------------------------
// EspoCRM devuelve como máximo 200 registros por petición y pedirle más
// responde vacío, así que toda lista necesita recorrer páginas. Antes cada
// servicio escribía su propio bucle (tres copias idénticas) y el inventario
// directamente no paginaba: mostraba 200 de 429 equipos sin avisar.

/** Máximo que acepta EspoCRM por petición. */
export const ESPO_PAGE_SIZE = 200;
/** Tope de seguridad: 50 * 200 = 10.000 registros. Garantiza que el bucle termine. */
const MAX_PAGES = 50;

/**
 * Crea la función `listAll` de un servicio a partir de su `espoFetch`.
 * Recorre todas las páginas y devuelve los registros crudos concatenados.
 * Propaga los errores igual que espoFetch (contrato "siempre lanza").
 */
export function createEspoList(espoFetch: ReturnType<typeof createEspoFetch>) {
  return async function listAll(
    path: string,
    params: Record<string, string> = {},
  ): Promise<any[]> {
    const all: any[] = [];
    // Ver la nota equivalente en fetchAllPages() (inventoryClient.ts): si
    // esto sigue en `true` después del for, se acabaron las MAX_PAGES
    // páginas sin que la lista terminara — hay más registros de los que se
    // trajeron y esta lectura los está descartando en silencio.
    let hitPageCeiling = true;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({
        ...params,
        maxSize: String(ESPO_PAGE_SIZE),
        offset: String(page * ESPO_PAGE_SIZE),
      });
      const res = await espoFetch(`${path}?${query.toString()}`);
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : (data.list ?? []);
      all.push(...list);
      if (list.length < ESPO_PAGE_SIZE) { hitPageCeiling = false; break; }
      if (typeof data.total === 'number' && all.length >= data.total) { hitPageCeiling = false; break; }
    }
    if (hitPageCeiling) {
      console.error(
        `Se alcanzó el límite de ${MAX_PAGES} páginas en ${path} sin terminar de traer la lista ` +
        `completa: hay MÁS de ${all.length} registros y esta lectura los está descartando en ` +
        `silencio. Subí MAX_PAGES acá, o —mejor, si esto empieza a pasar de verdad— filtrá del lado ` +
        `del servidor en vez de traer todo.`,
      );
    }
    return all;
  };
}

/** Redondeo a 2 decimales, usado en todos los cálculos de subtotal/impuesto/total. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
