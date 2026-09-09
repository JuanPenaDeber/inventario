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

import { ProductSuggestion } from '@/types';
import { getEspoErrorMessage, createEspoFetch, createEspoList } from '@/shared/api/espoClient';
import { createListCache } from '@/shared/api/cache';

export const SUGGESTIONS_API_URL =
  import.meta.env.VITE_SUGGESTIONS_API_URL ?? 'http://local.grupoeldeber.com/api/v1';

const ENTITY = import.meta.env.VITE_SUGGESTION_ENTITY ?? 'CSugerenciaProducto';

const FIELDS = {
  AREA: 'area',
  POSITION: 'cargo',
  PRODUCT: 'producto',
} as const;

export function getSuggestionErrorMessage(error: unknown, fallback: string): string {
  return getEspoErrorMessage(
    error,
    fallback,
    'Sin permiso sobre las sugerencias. Revisa el rol del usuario API en EspoCRM.',
  );
}

const espoFetch = createEspoFetch(SUGGESTIONS_API_URL);
const listAll = createEspoList(espoFetch);

function mapSuggestion(raw: any): ProductSuggestion {
  return {
    id: raw.id ?? '',
    area: raw[FIELDS.AREA] ?? '',
    position: raw[FIELDS.POSITION] ?? '',
    product: raw[FIELDS.PRODUCT] ?? '',
  };
}

// --- CACHÉ EN MEMORIA (shared/api/cache.ts) --------------------------------

const listCache = createListCache<ProductSuggestion[]>();

export function invalidateSuggestionsCache(): void {
  listCache.invalidate();
}

const cachedList = (fetcher: () => Promise<ProductSuggestion[]>) => listCache.get(fetcher);

export async function getProductSuggestions(): Promise<ProductSuggestion[]> {
  return cachedList(async () => {
    const list = await listAll(`/${ENTITY}`);
    return list.map(mapSuggestion);
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
