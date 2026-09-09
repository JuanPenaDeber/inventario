// =============================================================================
// Tests de la caché compartida.
//
// Es infraestructura con comportamiento sutil: TTL, peticiones compartidas y
// descarte de lecturas obsoletas. Un fallo aquí no se ve como un error sino
// como "la pantalla muestra datos viejos", que es de lo más difícil de
// diagnosticar. Por eso se prueba cada regla por separado, incluida la carrera
// que las tres copias de Compras no cubrían.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache, createListCache } from '@/shared/api/cache';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createCache', () => {
  it('pide los datos la primera vez', async () => {
    const cache = createCache();
    const fetcher = vi.fn(async () => 'A');

    expect(await cache.get('k', fetcher)).toBe('A');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sirve de caché mientras los datos siguen frescos', async () => {
    const cache = createCache();
    const fetcher = vi.fn(async () => 'A');

    await cache.get('k', fetcher);
    vi.advanceTimersByTime(30_000);
    expect(await cache.get('k', fetcher)).toBe('A');

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('vuelve a pedir cuando venció el TTL', async () => {
    const cache = createCache();
    const fetcher = vi.fn(async () => 'A');

    await cache.get('k', fetcher);
    vi.advanceTimersByTime(61_000);
    await cache.get('k', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('respeta un TTL propio', async () => {
    const cache = createCache(1_000);
    const fetcher = vi.fn(async () => 'A');

    await cache.get('k', fetcher);
    vi.advanceTimersByTime(1_500);
    await cache.get('k', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('guarda cada clave por separado', async () => {
    const cache = createCache<'a' | 'b'>();

    expect(await cache.get('a', async () => 1)).toBe(1);
    expect(await cache.get('b', async () => 2)).toBe(2);
    expect(await cache.get('a', async () => 99)).toBe(1);
  });

  it('comparte una única petición entre llamadas simultáneas', async () => {
    // Dos componentes que montan a la vez y piden lo mismo: una sola petición.
    const cache = createCache();
    let resolver: (v: string) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<string>((res) => {
          resolver = res;
        }),
    );

    const p1 = cache.get('k', fetcher);
    const p2 = cache.get('k', fetcher);
    resolver('A');

    expect(await p1).toBe('A');
    expect(await p2).toBe('A');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidate obliga a volver a pedir', async () => {
    const cache = createCache();
    const fetcher = vi.fn(async () => 'A');

    await cache.get('k', fetcher);
    cache.invalidate();
    await cache.get('k', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidate con claves sólo borra esas', async () => {
    const cache = createCache<'a' | 'b'>();
    const fa = vi.fn(async () => 1);
    const fb = vi.fn(async () => 2);

    await cache.get('a', fa);
    await cache.get('b', fb);
    cache.invalidate('a');
    await cache.get('a', fa);
    await cache.get('b', fb);

    expect(fa).toHaveBeenCalledTimes(2);
    expect(fb).toHaveBeenCalledTimes(1);
  });

  it('no cachea una lectura que salió antes de una invalidación', async () => {
    // LA carrera que las tres copias de Compras no cubrían: la lectura sale,
    // alguien guarda e invalida, y la lectura llega con datos anteriores al
    // guardado. Se entrega a quien la pidió, pero no se guarda.
    const cache = createCache();
    let resolver: (v: string) => void = () => {};
    const lento = () =>
      new Promise<string>((res) => {
        resolver = res;
      });

    const enVuelo = cache.get('k', lento);
    cache.invalidate(); // ocurre una mutación mientras la lectura viaja
    resolver('VIEJO');

    expect(await enVuelo).toBe('VIEJO'); // quien lo pidió lo recibe

    // ...pero la siguiente lectura no se sirve de eso.
    const fresco = vi.fn(async () => 'NUEVO');
    expect(await cache.get('k', fresco)).toBe('NUEVO');
    expect(fresco).toHaveBeenCalledTimes(1);
  });

  it('un fallo no queda cacheado', async () => {
    const cache = createCache();
    const falla = vi.fn(async () => {
      throw new Error('red caída');
    });

    await expect(cache.get('k', falla)).rejects.toThrow('red caída');

    const ok = vi.fn(async () => 'A');
    expect(await cache.get('k', ok)).toBe('A');
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('un fallo se propaga a todos los que compartían la petición', async () => {
    const cache = createCache();
    let rechazar: (e: Error) => void = () => {};
    const falla = () =>
      new Promise<string>((_res, rej) => {
        rechazar = rej;
      });

    const p1 = cache.get('k', falla);
    const p2 = cache.get('k', falla);
    rechazar(new Error('red caída'));

    await expect(p1).rejects.toThrow('red caída');
    await expect(p2).rejects.toThrow('red caída');
  });

  it('cachea valores falsy sin volver a pedirlos', async () => {
    // El guard es `data !== undefined`, no `!data`: una lista vacía o un 0 son
    // respuestas válidas y no deben forzar otra petición.
    const cache = createCache();
    const fetcher = vi.fn(async () => [] as string[]);

    await cache.get('k', fetcher);
    await cache.get('k', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reset vacía todo', async () => {
    const cache = createCache();
    const fetcher = vi.fn(async () => 'A');

    await cache.get('k', fetcher);
    cache.reset();
    await cache.get('k', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('createListCache', () => {
  it('cachea una sola lista sin pedir clave', async () => {
    const cache = createListCache<string[]>();
    const fetcher = vi.fn(async () => ['a']);

    expect(await cache.get(fetcher)).toEqual(['a']);
    expect(await cache.get(fetcher)).toEqual(['a']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidate obliga a volver a pedir', async () => {
    const cache = createListCache<string[]>();
    const fetcher = vi.fn(async () => ['a']);

    await cache.get(fetcher);
    cache.invalidate();
    await cache.get(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
