// =============================================================================
// Caché en memoria con TTL, deduplicación y descarte de lecturas obsoletas.
//
// Estaba copiada cuatro veces —inventoryService, purchaseOrderService,
// purchaseRequestService y suggestionService— idéntica salvo por el tipo de los
// datos. Pero las tres copias de Compras se hicieron a partir de una versión
// SIN la protección de generación que sí tenía inventoryService, así que en
// ellas era posible este orden de eventos:
//
//   1. sale una lectura;
//   2. alguien guarda algo e invalida la caché;
//   3. llega la lectura, que salió ANTES del guardado, y se cachea;
//   4. durante 60 segundos se sirven datos anteriores al cambio.
//
// La versión unificada es la que sí lo protege: cada lectura anota la
// "generación" en la que salió y, si al volver la generación ya cambió, se
// entrega a quien la pidió pero no se guarda.
//
// Qué hace cada pieza:
//   · TTL           — datos recientes se sirven al instante, sin ir a la red.
//   · deduplicación — dos componentes que piden lo mismo a la vez comparten
//                     una única petición en vuelo.
//   · generación    — lo descrito arriba.
// =============================================================================

export interface Cache<K extends string> {
  /** Devuelve el valor cacheado si sigue fresco; si no, llama a `fetcher`. */
  get<T>(key: K, fetcher: () => Promise<T>): Promise<T>;
  /** Invalida claves concretas; sin argumentos, vacía la caché entera. */
  invalidate(...keys: K[]): void;
  /** Sólo para tests: vacía todo y reinicia el contador de generación. */
  reset(): void;
}

interface Entry {
  data?: unknown;
  ts: number;
  inflight?: Promise<unknown>;
}

export const DEFAULT_TTL_MS = 60_000;

export function createCache<K extends string = string>(ttlMs: number = DEFAULT_TTL_MS): Cache<K> {
  const entries = new Map<K, Entry>();
  let generation = 0;

  return {
    async get<T>(key: K, fetcher: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const entry = entries.get(key);

      // 1) Hit fresco → respuesta instantánea.
      if (entry?.data !== undefined && now - entry.ts < ttlMs) {
        return entry.data as T;
      }
      // 2) Petición ya en vuelo → se comparte (deduplicación).
      if (entry?.inflight) {
        return entry.inflight as Promise<T>;
      }
      // 3) Pedir de nuevo, anotando la generación de salida.
      const gen = generation;
      const inflight = fetcher()
        .then((data) => {
          // Si hubo una invalidación mientras pedíamos, estos datos ya nacieron
          // viejos: se entregan a quien los pidió, pero NO se cachean.
          if (gen === generation) entries.set(key, { data, ts: Date.now() });
          else entries.delete(key);
          return data;
        })
        .catch((err) => {
          entries.delete(key);
          throw err;
        });

      // Se conserva `data` para que un fallo no borre lo que ya había servido.
      entries.set(key, { ts: now, inflight, data: entry?.data });
      return inflight;
    },

    invalidate(...keys: K[]): void {
      generation++;
      if (keys.length === 0) entries.clear();
      else keys.forEach((k) => entries.delete(k));
    },

    reset(): void {
      entries.clear();
      generation = 0;
    },
  };
}

/**
 * Caché de una sola lista, para los servicios que sólo cachean su listado
 * (Órdenes, Solicitudes, Sugerencias). Es `createCache` con la clave fija, para
 * que el sitio de uso no tenga que inventarse una.
 */
export function createListCache<T>(ttlMs: number = DEFAULT_TTL_MS) {
  const cache = createCache<'list'>(ttlMs);
  return {
    get: (fetcher: () => Promise<T>): Promise<T> => cache.get('list', fetcher),
    invalidate: (): void => cache.invalidate(),
    reset: (): void => cache.reset(),
  };
}
