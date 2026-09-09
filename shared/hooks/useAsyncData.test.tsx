import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAsyncData } from '@/shared/hooks/useAsyncData';

describe('useAsyncData', () => {
  it('carga al montar y expone los datos', async () => {
    const { result } = renderHook(() => useAsyncData(async () => ['a', 'b'], [] as string[]));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(['a', 'b']);
    expect(result.current.error).toBeNull();
  });

  it('traduce el error con el getErrorMessage del servicio', async () => {
    const { result } = renderHook(() =>
      useAsyncData(
        async () => {
          throw new Error('boom');
        },
        [] as string[],
        {
          errorMessage: 'No se pudo cargar.',
          getErrorMessage: (_e, fallback) => `${fallback} Reintenta.`,
        },
      ),
    );

    await waitFor(() => expect(result.current.error).toBe('No se pudo cargar. Reintenta.'));
    expect(result.current.loading).toBe(false);
  });

  it('no carga nada si enabled es false', async () => {
    const fetcher = vi.fn(async () => ['x']);
    const { result } = renderHook(() => useAsyncData(fetcher, [] as string[], { enabled: false }));

    expect(result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('descarta la respuesta de una petición vieja que llega tarde', async () => {
    // La razón de ser del guard: dos refresh seguidos donde el primero tarda
    // más. Sin él, la respuesta antigua pisaba a la nueva y la pantalla
    // quedaba mostrando datos desactualizados sin ninguna señal.
    let call = 0;
    const fetcher = vi.fn(async () => {
      call++;
      if (call === 1) {
        await new Promise((r) => setTimeout(r, 50));
        return ['VIEJO'];
      }
      return ['NUEVO'];
    });

    const { result } = renderHook(() => useAsyncData(fetcher, [] as string[]));

    await act(async () => {
      result.current.refresh();      // segunda llamada, responde enseguida
      await new Promise((r) => setTimeout(r, 100)); // deja llegar a la primera
    });

    expect(result.current.data).toEqual(['NUEVO']);
  });

  it('permite actualizar los datos en memoria sin volver a pedirlos', async () => {
    const fetcher = vi.fn(async () => ['a']);
    const { result } = renderHook(() => useAsyncData(fetcher, [] as string[]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setData((prev) => [...prev, 'b']));

    expect(result.current.data).toEqual(['a', 'b']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
