// =============================================================================
// Tests de readChildLines() y syncChildLines().
//
// El sincronizador es la pieza con más riesgo real de toda la capa de
// servicios: si el diff se equivoca, una edición borra líneas que debía
// conservar. Por eso se comprueban las tres operaciones por separado y, sobre
// todo, el ORDEN en que se aplican.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { EspoApiError } from '@/shared/api/espoClient';
import { readChildLines, syncChildLines } from '@/shared/api/espoChildLines';

interface Linea {
  id: string;
  producto: string;
}

const mapLinea = (raw: any): Linea => ({ id: raw.id, producto: raw.name });

/** Doble de espoFetch que registra las llamadas y devuelve lo que se le diga. */
const makeFetch = (respuesta?: unknown) => {
  const calls: Array<{ path: string; method: string; body?: any }> = [];
  const fn = vi.fn(async (path: string, options: RequestInit = {}) => {
    calls.push({
      path,
      method: (options.method as string) || 'GET',
      body: options.body ? JSON.parse(options.body as string) : undefined,
    });
    return { json: async () => respuesta } as Response;
  });
  return { fn: fn as any, calls };
};

describe('readChildLines', () => {
  it('mapea las líneas que devuelve EspoCRM', async () => {
    const { fn } = makeFetch({ list: [{ id: 'l1', name: 'Disco SSD' }] });

    const lineas = await readChildLines<Linea>({
      espoFetch: fn,
      parentEntity: 'CSolicitudCompra',
      parentId: 'sc-1',
      subresource: 'detalles',
      map: mapLinea,
    });

    expect(lineas).toEqual([{ id: 'l1', producto: 'Disco SSD' }]);
    expect(fn).toHaveBeenCalledWith('/CSolicitudCompra/sc-1/detalles');
  });

  it('acepta también un array pelado, sin envoltorio `list`', async () => {
    // EspoCRM devuelve una u otra forma según la versión y el endpoint.
    const { fn } = makeFetch([{ id: 'l1', name: 'Disco SSD' }]);

    const lineas = await readChildLines<Linea>({
      espoFetch: fn,
      parentEntity: 'E',
      parentId: 'p',
      subresource: 's',
      map: mapLinea,
    });

    expect(lineas).toHaveLength(1);
  });

  it('un 404 devuelve lista vacía, no un error', async () => {
    // Un padre recién creado todavía no tiene el sub-recurso: eso es "aún no
    // hay líneas", no un fallo.
    const fn = vi.fn(async () => {
      throw new EspoApiError(404, 'Not Found');
    });

    await expect(
      readChildLines<Linea>({
        espoFetch: fn as any,
        parentEntity: 'E',
        parentId: 'p',
        subresource: 's',
        map: mapLinea,
      }),
    ).resolves.toEqual([]);
  });

  it('cualquier otro error sí se propaga', async () => {
    const fn = vi.fn(async () => {
      throw new EspoApiError(500, 'Server Error');
    });

    await expect(
      readChildLines<Linea>({
        espoFetch: fn as any,
        parentEntity: 'E',
        parentId: 'p',
        subresource: 's',
        map: mapLinea,
      }),
    ).rejects.toBeInstanceOf(EspoApiError);
  });
});

const sync = (current: Linea[], next: Linea[]) => {
  const { fn, calls } = makeFetch();
  return syncChildLines<Linea>({
    espoFetch: fn,
    lineEntity: 'CDetalle',
    parentField: 'solicitudId',
    parentId: 'sc-1',
    current,
    next,
    buildPayload: (l) => ({ name: l.producto }),
  }).then(() => calls);
};

describe('syncChildLines', () => {
  it('crea las líneas sin id, atándolas al padre', async () => {
    const calls = await sync([], [{ id: '', producto: 'Disco SSD' }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/CDetalle');
    expect(calls[0].body).toEqual({ name: 'Disco SSD', solicitudId: 'sc-1' });
  });

  it('actualiza las líneas que conservan su id', async () => {
    const calls = await sync([{ id: 'l1', producto: 'Viejo' }], [{ id: 'l1', producto: 'Nuevo' }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].path).toBe('/CDetalle/l1');
    expect(calls[0].body).toEqual({ name: 'Nuevo' });
  });

  it('borra las líneas que ya no están en la lista nueva', async () => {
    const calls = await sync([{ id: 'l1', producto: 'Sobra' }], []);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].path).toBe('/CDetalle/l1');
  });

  it('una línea que solo cambia conserva su id: es un diff, no un recrear', async () => {
    // Si esto se rompiera y pasara a borrar-y-recrear, cada edición generaría
    // ids nuevos y se perdería la trazabilidad de la línea.
    const calls = await sync([{ id: 'l1', producto: 'Viejo' }], [{ id: 'l1', producto: 'Nuevo' }]);

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('aplica bajas, cambios y altas en ese orden', async () => {
    // El orden importa: EspoCRM aplica las relaciones secuencialmente, y crear
    // antes de borrar puede chocar con una restricción de unicidad.
    const calls = await sync(
      [
        { id: 'l1', producto: 'Se queda' },
        { id: 'l2', producto: 'Se va' },
      ],
      [
        { id: 'l1', producto: 'Se queda editada' },
        { id: '', producto: 'Nueva' },
      ],
    );

    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'PUT', 'POST']);
  });

  it('sin cambios no hace ninguna llamada', async () => {
    const calls = await sync([], []);

    expect(calls).toHaveLength(0);
  });
});
