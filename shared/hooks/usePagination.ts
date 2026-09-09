// =============================================================================
// Paginación de tabla en cliente.
//
// La del Dashboard nació copiando la del panel de Incidencias, y en la copia
// las dos divergieron en algo que importa: el Dashboard acota la página al
// rango válido (`Math.min(page, totalPages - 1)`) y el de Incidencias no, así
// que allí una página que se queda fuera de rango muestra una tabla vacía hasta
// que algo dispare el reset. Aquí se unifica con la versión que acota.
//
// La página no se guarda "corregida" en el estado a propósito: `page` es lo que
// pidió el usuario y `currentPage` es lo que se puede mostrar. Si la lista
// vuelve a crecer —se borra un filtro— la página pedida sigue ahí y se
// recupera, en vez de haberse perdido al encogerse la lista.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';

export interface Pagination<T> {
  /** Los elementos de la página actual. */
  pageItems: T[];
  /** Página mostrada, ya acotada al rango válido (0-based). */
  currentPage: number;
  totalPages: number;
  rowsPerPage: number;
  setRowsPerPage: (n: number) => void;
  /** Ir a una página concreta (0-based). */
  setPage: (n: number) => void;
  /** Volver a la primera página: al cambiar un filtro. */
  resetPage: () => void;
  next: () => void;
  prev: () => void;
  canPrev: boolean;
  canNext: boolean;
  /** Primer y último número de fila mostrados, 1-based, para "12–25 de 60". */
  from: number;
  to: number;
  total: number;
}

export function usePagination<T>(items: T[], filasPorPaginaInicial = 25): Pagination<T> {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPageState] = useState(filasPorPaginaInicial);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const currentPage = Math.min(page, totalPages - 1);

  const pageItems = useMemo(
    () => items.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage),
    [items, currentPage, rowsPerPage],
  );

  // Cambiar el tamaño de página manda al inicio: quedarse en la página 3 al
  // pasar de 25 a 100 filas dejaría al usuario en un tramo que ya no existe.
  const setRowsPerPage = useCallback((n: number) => {
    setRowsPerPageState(n);
    setPage(0);
  }, []);

  const resetPage = useCallback(() => setPage(0), []);
  const next = useCallback(() => setPage((p) => p + 1), []);
  const prev = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);

  return {
    pageItems,
    currentPage,
    totalPages,
    rowsPerPage,
    setRowsPerPage,
    setPage,
    resetPage,
    next,
    prev,
    canPrev: currentPage > 0,
    canNext: currentPage < totalPages - 1,
    from: total === 0 ? 0 : currentPage * rowsPerPage + 1,
    to: Math.min(total, (currentPage + 1) * rowsPerPage),
    total,
  };
}
