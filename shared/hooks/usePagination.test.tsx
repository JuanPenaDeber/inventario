// =============================================================================
// Tests de usePagination() y <TablePagination>.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePagination } from '@/shared/hooks/usePagination';
import { TablePagination } from '@/shared/components/TablePagination';

const lista = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);

describe('usePagination', () => {
  it('devuelve solo la primera página', () => {
    const { result } = renderHook(() => usePagination(lista(60), 25));

    expect(result.current.pageItems).toHaveLength(25);
    expect(result.current.pageItems[0]).toBe('f0');
    expect(result.current.totalPages).toBe(3);
  });

  it('next avanza y recalcula el rango mostrado', () => {
    const { result } = renderHook(() => usePagination(lista(60), 25));

    act(() => result.current.next());

    expect(result.current.pageItems[0]).toBe('f25');
    expect(result.current.from).toBe(26);
    expect(result.current.to).toBe(50);
  });

  it('la última página puede quedar incompleta', () => {
    const { result } = renderHook(() => usePagination(lista(60), 25));

    act(() => result.current.setPage(2));

    expect(result.current.pageItems).toHaveLength(10);
    expect(result.current.to).toBe(60);
  });

  it('canPrev y canNext marcan los extremos', () => {
    const { result } = renderHook(() => usePagination(lista(60), 25));
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(true);

    act(() => result.current.setPage(2));
    expect(result.current.canPrev).toBe(true);
    expect(result.current.canNext).toBe(false);
  });

  it('acota una página fuera de rango en vez de mostrar una tabla vacía', () => {
    // Es la divergencia que había entre las dos copias: el panel de Incidencias
    // no acotaba, así que una página fuera de rango dejaba la tabla en blanco.
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 25), {
      initialProps: { items: lista(60) },
    });

    act(() => result.current.setPage(2));
    rerender({ items: lista(10) }); // un filtro reduce la lista

    expect(result.current.currentPage).toBe(0);
    expect(result.current.pageItems).toHaveLength(10);
  });

  it('recupera la página pedida si la lista vuelve a crecer', () => {
    // `page` guarda lo que pidió el usuario; `currentPage` es lo que se puede
    // mostrar. Al quitar el filtro, vuelve donde estaba.
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 25), {
      initialProps: { items: lista(60) },
    });

    act(() => result.current.setPage(2));
    rerender({ items: lista(10) });
    rerender({ items: lista(60) });

    expect(result.current.currentPage).toBe(2);
  });

  it('cambiar las filas por página vuelve al inicio', () => {
    const { result } = renderHook(() => usePagination(lista(200), 25));

    act(() => result.current.setPage(3));
    act(() => result.current.setRowsPerPage(100));

    expect(result.current.currentPage).toBe(0);
    expect(result.current.pageItems).toHaveLength(100);
  });

  it('con la lista vacía el rango es 0–0 y hay una sola página', () => {
    const { result } = renderHook(() => usePagination([], 25));

    expect(result.current.from).toBe(0);
    expect(result.current.to).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.canNext).toBe(false);
  });

  it('resetPage vuelve a la primera página', () => {
    const { result } = renderHook(() => usePagination(lista(60), 25));

    act(() => result.current.setPage(2));
    act(() => result.current.resetPage());

    expect(result.current.currentPage).toBe(0);
  });
});

function Tabla({ n }: { n: number }) {
  const pagination = usePagination(lista(n), 25);
  return (
    <>
      <ul>
        {pagination.pageItems.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <TablePagination pagination={pagination} />
    </>
  );
}

describe('TablePagination', () => {
  it('muestra el rango y navega entre páginas', async () => {
    const user = userEvent.setup();
    render(<Tabla n={60} />);

    expect(screen.getByText('1–25 de 60')).toBeTruthy();

    await user.click(screen.getByLabelText('Página siguiente'));

    expect(screen.getByText('26–50 de 60')).toBeTruthy();
  });

  it('deshabilita los botones en los extremos', async () => {
    const user = userEvent.setup();
    render(<Tabla n={60} />);

    expect((screen.getByLabelText('Página anterior') as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByLabelText('Página siguiente'));
    await user.click(screen.getByLabelText('Página siguiente'));

    expect((screen.getByLabelText('Página siguiente') as HTMLButtonElement).disabled).toBe(true);
  });

  it('el desplegable cambia el tamaño de página', async () => {
    const user = userEvent.setup();
    render(<Tabla n={60} />);

    await user.selectOptions(screen.getByLabelText('Filas por página'), '50');

    expect(screen.getByText('1–50 de 60')).toBeTruthy();
  });
});
