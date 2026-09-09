// =============================================================================
// Barra de paginación bajo una tabla.
//
// Acompaña a usePagination(). Se le pasa el objeto que devuelve el hook entero
// en vez de diez props sueltas: son piezas de una misma cosa y separarlas solo
// daba ocasión de pasar `from` de una lista y `total` de otra.
// =============================================================================

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination } from '@/shared/hooks/usePagination';

interface TablePaginationProps {
  // `any` a propósito: la barra no lee los elementos, solo los contadores.
  // (el proyecto tiene no-explicit-any apagado — ver eslint.config.js)
  pagination: Pagination<any>;
  /** Opciones del desplegable de filas por página. */
  options?: number[];
  /** Id del <select>, por si hay dos tablas paginadas en la misma pantalla. */
  selectId?: string;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  pagination,
  options = [25, 50, 100],
  selectId = 'rows-per-page',
  className = '',
}) => {
  const { rowsPerPage, setRowsPerPage, prev, next, canPrev, canNext, from, to, total } = pagination;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 ${className}`}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={selectId}>Filas por página</label>
        <select
          id={selectId}
          value={rowsPerPage}
          onChange={(e) => setRowsPerPage(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1"
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {from}–{to} de {total}
        </span>
        <button
          onClick={prev}
          disabled={!canPrev}
          aria-label="Página anterior"
          className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40 hover:bg-slate-50"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={next}
          disabled={!canNext}
          aria-label="Página siguiente"
          className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40 hover:bg-slate-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
