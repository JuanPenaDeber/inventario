// =============================================================================
// Líneas de detalle de un registro de EspoCRM.
//
// Las tres entidades con detalle —órdenes de compra, solicitudes de compra y
// proformas— resolvían sus líneas con el mismo código escrito tres veces:
//
//   · leer las líneas de un padre, tratando el 404 como "todavía no tiene";
//   · sincronizarlas contra una lista nueva: altas (sin id), bajas (id que ya
//     no aparece) y cambios (id en ambas).
//
// El sincronizador estaba duplicado carácter por carácter entre órdenes y
// solicitudes; el lector, tres veces. Lo que NO se generaliza es el resto de
// cada servicio: el flujo de 11 estados de las solicitudes, la recepción
// parcial de las órdenes o la vigencia de las proformas son lógica de negocio
// distinta en cada caso, y meterla en una fábrica común habría hecho falta
// llenarla de condicionales.
//
// Por qué en serie y no con Promise.all: EspoCRM aplica las relaciones en
// orden, y lanzar los tres grupos a la vez producía carreras al borrar y
// recrear la misma línea.
// =============================================================================

import { EspoApiError, createEspoFetch } from '@/shared/api/espoClient';

type EspoFetch = ReturnType<typeof createEspoFetch>;

/** Toda línea tiene id; vacío significa "nueva, aún no existe en el backend". */
export interface ChildLine {
  id: string;
}

interface ReadOptions<T> {
  espoFetch: EspoFetch;
  /** Entidad del padre: `CSolicitudCompra`, `COrdenCompra`, … */
  parentEntity: string;
  parentId: string;
  /** Sub-recurso con las líneas: `detalles`, `lineas`, … */
  subresource: string;
  /** Convierte el JSON crudo de EspoCRM al tipo del dominio. */
  map: (raw: any) => T;
}

/**
 * Líneas de un registro. Un 404 devuelve lista vacía en vez de lanzar: en
 * EspoCRM un padre recién creado todavía no tiene el sub-recurso, y eso no es
 * un error sino "aún no hay líneas".
 */
export async function readChildLines<T>({
  espoFetch,
  parentEntity,
  parentId,
  subresource,
  map,
}: ReadOptions<T>): Promise<T[]> {
  try {
    const res = await espoFetch(`/${parentEntity}/${parentId}/${subresource}`);
    const data = await res.json();
    const rawLines = Array.isArray(data) ? data : (data.list ?? []);
    return rawLines.map(map);
  } catch (err) {
    if (err instanceof EspoApiError && err.status === 404) return [];
    throw err;
  }
}

interface SyncOptions<T extends ChildLine> {
  espoFetch: EspoFetch;
  /** Entidad de la línea: `CSolicitudCompraDetalle`, … */
  lineEntity: string;
  /** Campo de la línea que apunta al padre: `solicitudCompraId`, … */
  parentField: string;
  parentId: string;
  /** Líneas que existen hoy en el backend. */
  current: T[];
  /** Líneas que debe haber al terminar. Las que no traen id se crean. */
  next: T[];
  /** Convierte una línea del dominio al cuerpo que espera EspoCRM. */
  buildPayload: (line: T) => Record<string, unknown>;
}

/**
 * Deja las líneas del padre igual a `next`: borra las que sobran, actualiza las
 * que siguen y crea las nuevas. Es un diff, no un borrar-y-recrear: así una
 * línea que solo cambió de cantidad conserva su id y su historial.
 */
export async function syncChildLines<T extends ChildLine>({
  espoFetch,
  lineEntity,
  parentField,
  parentId,
  current,
  next,
  buildPayload,
}: SyncOptions<T>): Promise<void> {
  const nextIds = new Set(next.filter((l) => l.id).map((l) => l.id));

  const toDelete = current.filter((l) => l.id && !nextIds.has(l.id));
  const toUpdate = next.filter((l) => l.id);
  const toCreate = next.filter((l) => !l.id);

  for (const line of toDelete) {
    await espoFetch(`/${lineEntity}/${line.id}`, { method: 'DELETE' });
  }
  for (const line of toUpdate) {
    await espoFetch(`/${lineEntity}/${line.id}`, {
      method: 'PUT',
      body: JSON.stringify(buildPayload(line)),
    });
  }
  for (const line of toCreate) {
    await espoFetch(`/${lineEntity}`, {
      method: 'POST',
      body: JSON.stringify({ ...buildPayload(line), [parentField]: parentId }),
    });
  }
}
