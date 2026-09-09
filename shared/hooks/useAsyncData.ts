import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================================
// Hook de carga de datos asíncronos.
//
// Antes, cada módulo repetía a mano las mismas tres piezas de estado
// (loading / error / refresh) más el mismo try-catch-finally. Estaba escrito
// nueve veces con nombres de variable distintos, y por eso unos módulos
// mostraban un banner de error con "Reintentar" y otros no mostraban nada.
//
// El mensaje de error se arma con el `getErrorMessage` de cada servicio
// (getPurchaseOrderErrorMessage, getSuggestionErrorMessage, etc.), así que
// cada módulo conserva sus mensajes propios — lo que se unifica es el flujo,
// no el texto.
// =============================================================================

interface UseAsyncDataOptions {
  /** Mensaje por defecto si el servicio no aporta uno más específico. */
  errorMessage?: string;
  /** El `getXErrorMessage` del servicio correspondiente. */
  getErrorMessage?: (error: unknown, fallback: string) => string;
  /** Si es false, no carga al montar (útil cuando falta un id todavía). */
  enabled?: boolean;
}

export interface AsyncData<T> {
  data: T;
  /** Para actualizar la lista en memoria tras crear/borrar sin recargar todo. */
  setData: React.Dispatch<React.SetStateAction<T>>;
  loading: boolean;
  error: string | null;
  /** Permite mostrar errores de acciones (guardar, borrar) en el mismo banner. */
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  refresh: () => Promise<void>;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  initialData: T,
  options: UseAsyncDataOptions = {},
): AsyncData<T> {
  const { errorMessage = 'No se pudieron cargar los datos.', getErrorMessage, enabled = true } = options;

  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  // Se guardan en refs para que `refresh` sea estable: así el efecto de carga
  // no se vuelve a disparar en cada render aunque el componente pase una
  // función nueva (que es lo normal al escribirla en línea).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const errorRef = useRef({ errorMessage, getErrorMessage });
  errorRef.current = { errorMessage, getErrorMessage };

  // Descarta respuestas de peticiones viejas que lleguen después de una nueva
  // (dos refresh seguidos no pueden dejar los datos antiguos pisando a los nuevos).
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (requestId === requestIdRef.current) setData(result);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        const { errorMessage: fallback, getErrorMessage: translate } = errorRef.current;
        setError(translate ? translate(err, fallback) : fallback);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { data, setData, loading, error, setError, refresh };
}
