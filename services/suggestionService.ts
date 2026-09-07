// =============================================================================
// Servicio de Sugerencias de productos por Área y Cargo — Fase 4.
// Configurable por el rol ADMINISTRADOR (components/SuggestionManager.tsx) y
// consumido por el formulario de solicitud (PurchaseRequestForm.tsx) para
// sugerir productos según el área/cargo elegidos.
//
// CONTRATO PENDIENTE DE CONFIRMAR CON EL BACKEND: entidad "CSugerenciaProducto"
// (configurable), con campos:
//   - area     (string)
//   - cargo    (string)
//   - producto (string)
// =============================================================================

import { ProductSuggestion } from '../types';

export const SUGGESTIONS_API_URL =
  (import.meta as any).env?.VITE_SUGGESTIONS_API_URL ?? 'http://local.grupoeldeber.com/api/v1';

const ENTITY = (import.meta as any).env?.VITE_SUGGESTION_ENTITY ?? 'CSugerenciaProducto';

const API_KEY = '2b4fd11376a17549cba81c63a8840727';

const HEADERS = {
  'X-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

const FIELDS = {
  AREA: 'area',
  POSITION: 'cargo',
  PRODUCT: 'producto',
} as const;

class ApiError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(reason || `HTTP ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

export function getSuggestionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Sin permiso sobre las sugerencias. Revisa el rol del usuario API en EspoCRM.';
    if (error.reason) return error.reason;
    return fallback;
  }
  if (error instanceof TypeError) {
    return 'No se pudo conectar con el servidor. Verifica la red o que EspoCRM esté activo.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function espoFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${SUGGESTIONS_API_URL}${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const reason = res.headers.get('X-Status-Reason') ?? '';
    throw new ApiError(res.status, reason);
  }
  return res;
}

function mapSuggestion(raw: any): ProductSuggestion {
  return {
    id: raw.id ?? '',
    area: raw[FIELDS.AREA] ?? '',
    position: raw[FIELDS.POSITION] ?? '',
    product: raw[FIELDS.PRODUCT] ?? '',
  };
}

// --- CACHÉ EN MEMORIA (mismo patrón que el resto de servicios) -------------

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  data?: ProductSuggestion[];
  ts: number;
  inflight?: Promise<ProductSuggestion[]>;
}

let cache: CacheEntry | null = null;

export function invalidateSuggestionsCache(): void {
  cache = null;
}

async function cachedList(fetcher: () => Promise<ProductSuggestion[]>): Promise<ProductSuggestion[]> {
  const now = Date.now();
  if (cache?.data !== undefined && now - cache.ts < CACHE_TTL_MS) return cache.data;
  if (cache?.inflight) return cache.inflight;
  const inflight = fetcher()
    .then((data) => {
      cache = { data, ts: Date.now() };
      return data;
    })
    .catch((err) => {
      cache = null;
      throw err;
    });
  cache = { ts: now, inflight, data: cache?.data };
  return inflight;
}

const LIST_PAGE_SIZE = 200;
const MAX_LIST_PAGES = 25; // 25 * 200 = 5000 sugerencias como máximo

export async function getProductSuggestions(): Promise<ProductSuggestion[]> {
  return cachedList(async () => {
    const all: any[] = [];
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const params = new URLSearchParams({
        maxSize: String(LIST_PAGE_SIZE),
        offset: String(page * LIST_PAGE_SIZE),
      });
      const res = await espoFetch(`/${ENTITY}?${params.toString()}`);
      const data = await res.json();
      const list = data.list ?? [];
      all.push(...list);
      if (list.length < LIST_PAGE_SIZE) break;
    }
    return all.map(mapSuggestion);
  });
}

/** Sugerencias que aplican a un área y cargo dados (comparación insensible a mayúsculas/espacios). */
export function matchSuggestions(
  all: ProductSuggestion[],
  area: string,
  position: string,
): ProductSuggestion[] {
  const a = area.trim().toLowerCase();
  const p = position.trim().toLowerCase();
  if (!a && !p) return [];
  return all.filter(
    (s) => (!a || s.area.trim().toLowerCase() === a) && (!p || s.position.trim().toLowerCase() === p),
  );
}

export async function createProductSuggestion(input: {
  area: string;
  position: string;
  product: string;
}): Promise<ProductSuggestion> {
  const res = await espoFetch(`/${ENTITY}`, {
    method: 'POST',
    body: JSON.stringify({
      [FIELDS.AREA]: input.area,
      [FIELDS.POSITION]: input.position,
      [FIELDS.PRODUCT]: input.product,
    }),
  });
  const saved = await res.json();
  invalidateSuggestionsCache();
  return mapSuggestion(saved);
}

export async function deleteProductSuggestion(id: string): Promise<void> {
  await espoFetch(`/${ENTITY}/${id}`, { method: 'DELETE' });
  invalidateSuggestionsCache();
}
