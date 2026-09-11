import { describe, it, expect, vi } from 'vitest';
import { createEspoList, ESPO_PAGE_SIZE, getEspoErrorMessage, EspoApiError, round2 } from '@/shared/api/espoClient';

// Estos tests existen por un fallo real: el inventario mostraba 200 de 429
// equipos porque no recorría las páginas, y no daba ningún error — la cifra
// simplemente se veía plausible. Es el tipo de bug que solo se nota tarde.

/** Simula un espoFetch que devuelve `total` registros repartidos en páginas de 200. */
function fakeFetchWith(total: number) {
  return vi.fn(async (path: string) => {
    const offset = Number(new URL(`http://x${path}`).searchParams.get('offset') ?? 0);
    const list = Array.from(
      { length: Math.max(0, Math.min(ESPO_PAGE_SIZE, total - offset)) },
      (_, i) => ({ id: `id-${offset + i}` }),
    );
    return { json: async () => ({ total, list }) } as Response;
  });
}

describe('listado paginado de EspoCRM', () => {
  it('trae TODOS los registros cuando hay más de una página', async () => {
    const espoFetch = fakeFetchWith(429);
    const listAll = createEspoList(espoFetch as never);

    const result = await listAll('/CEquipo');

    expect(result).toHaveLength(429);
    expect(espoFetch).toHaveBeenCalledTimes(3); // 200 + 200 + 29
  });

  it('no hace una segunda petición si todo entra en una página', async () => {
    const espoFetch = fakeFetchWith(15);
    const listAll = createEspoList(espoFetch as never);

    const result = await listAll('/CIncidencia');

    expect(result).toHaveLength(15);
    expect(espoFetch).toHaveBeenCalledTimes(1);
  });

  it('para exactamente en el límite de página sin pedir una página vacía de más', async () => {
    const espoFetch = fakeFetchWith(ESPO_PAGE_SIZE);
    const listAll = createEspoList(espoFetch as never);

    const result = await listAll('/CEquipo');

    expect(result).toHaveLength(ESPO_PAGE_SIZE);
    // Pide la 2ª página para saber que no hay más, pero se detiene ahí.
    expect(espoFetch.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('devuelve lista vacía si la entidad no tiene registros', async () => {
    const espoFetch = fakeFetchWith(0);
    const listAll = createEspoList(espoFetch as never);

    expect(await listAll('/CProforma')).toEqual([]);
  });

  it('conserva los parámetros propios (orden, filtros) en cada página', async () => {
    const espoFetch = fakeFetchWith(250);
    const listAll = createEspoList(espoFetch as never);

    await listAll('/CCOrdenCompra', { orderBy: 'createdAt', order: 'desc' });

    for (const [path] of espoFetch.mock.calls) {
      expect(path).toContain('orderBy=createdAt');
      expect(path).toContain('order=desc');
    }
  });

  it('avisa por consola si se agotan las páginas sin terminar la lista', async () => {
    // Fetch que SIEMPRE devuelve una página llena y nunca reporta `total`:
    // fuerza a que el loop agote las MAX_PAGES páginas sin ninguna razón
    // legítima para parar. Es la miniatura del bug real: una lista de más de
    // 10.000 registros se cortaría exactamente así, en silencio, si nadie
    // avisara.
    const espoFetch = vi.fn(
      async () =>
        ({
          json: async () => ({
            list: Array.from({ length: ESPO_PAGE_SIZE }, (_, i) => ({ id: `id-${i}` })),
          }),
        }) as Response,
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listAll = createEspoList(espoFetch as never);

    const result = await listAll('/CEquipo');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('límite de'));
    expect(result.length).toBeGreaterThan(0);
    errorSpy.mockRestore();
  });

  it('no avisa nada cuando la lista termina de forma normal', async () => {
    const espoFetch = fakeFetchWith(429);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listAll = createEspoList(espoFetch as never);

    await listAll('/CEquipo');

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('con `total` conocido, pide las páginas restantes en paralelo (no una por una)', async () => {
    // Antes cada página se pedía en serie. Con `total` ya conocido desde la
    // primera respuesta, el resto se pide de una — esto verifica que de
    // verdad salgan juntas, no solo que el resultado final sea correcto.
    let inFlightAtOnce = 0;
    let maxInFlight = 0;
    const espoFetch = vi.fn(async (path: string) => {
      inFlightAtOnce++;
      maxInFlight = Math.max(maxInFlight, inFlightAtOnce);
      await new Promise((r) => setTimeout(r, 0));
      inFlightAtOnce--;
      const offset = Number(new URL(`http://x${path}`).searchParams.get('offset') ?? 0);
      const total = ESPO_PAGE_SIZE * 3;
      const list = Array.from(
        { length: Math.max(0, Math.min(ESPO_PAGE_SIZE, total - offset)) },
        (_, i) => ({ id: `id-${offset + i}` }),
      );
      return { json: async () => ({ total, list }) } as Response;
    });
    const listAll = createEspoList(espoFetch as never);

    const result = await listAll('/CEquipo');

    expect(result).toHaveLength(ESPO_PAGE_SIZE * 3);
    expect(maxInFlight).toBeGreaterThan(1); // las páginas 2 y 3 salieron en simultáneo
  });

  it('si una página falla, listAll entero rechaza (contrato "siempre lanza")', async () => {
    const espoFetch = vi.fn(async (path: string) => {
      const offset = Number(new URL(`http://x${path}`).searchParams.get('offset') ?? 0);
      if (offset > 0) throw new EspoApiError(500, 'falla de red en una página posterior');
      return {
        json: async () => ({
          total: ESPO_PAGE_SIZE * 3,
          list: Array.from({ length: ESPO_PAGE_SIZE }, (_, i) => ({ id: `id-${i}` })),
        }),
      } as Response;
    });
    const listAll = createEspoList(espoFetch as never);

    await expect(listAll('/CEquipo')).rejects.toThrow('falla de red en una página posterior');
  });
});

describe('mensajes de error', () => {
  it('explica el 403 mencionando el rol del usuario API', () => {
    const msg = getEspoErrorMessage(new EspoApiError(403, ''), 'falló');
    expect(msg).toMatch(/permiso/i);
  });

  it('usa el motivo que envía EspoCRM cuando existe', () => {
    const msg = getEspoErrorMessage(new EspoApiError(400, 'field: name, type: required'), 'falló');
    expect(msg).toContain('required');
  });

  it('ante un 404 explica que la entidad puede no existir', () => {
    expect(getEspoErrorMessage(new EspoApiError(404, ''), 'falló')).toMatch(/no existe/i);
  });
});

describe('redondeo de importes', () => {
  it('corrige el error clásico de coma flotante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});
