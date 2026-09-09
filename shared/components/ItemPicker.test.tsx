// =============================================================================
// Tests de <ItemPicker>, useItemSelection() y matchesItemSearch().
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemPicker, matchesItemSearch } from '@/shared/components/ItemPicker';
import { useItemSelection } from '@/shared/hooks/useItemSelection';
import { makeItem } from '@/shared/test/fixtures';

const notebook = makeItem({ id: 'i1', name: 'Notebook Dell', serie: 'SN-AAA', category: 'Computadoras' });
const camara = makeItem({ id: 'i2', name: 'Cámara Canon', serie: 'SN-BBB', category: 'Fotografía' });

const renderPicker = (props: Partial<React.ComponentProps<typeof ItemPicker>> = {}) =>
  render(
    <ItemPicker
      items={[notebook, camara]}
      selectedIds={new Set()}
      onToggle={() => {}}
      accent="orange"
      search=""
      onSearchChange={() => {}}
      {...props}
    />,
  );

describe('matchesItemSearch', () => {
  it('busca en nombre, serie y categoría', () => {
    expect(matchesItemSearch(notebook, 'notebook')).toBe(true);
    expect(matchesItemSearch(notebook, 'SN-AAA')).toBe(true);
    expect(matchesItemSearch(notebook, 'computadoras')).toBe(true);
    expect(matchesItemSearch(notebook, 'canon')).toBe(false);
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(matchesItemSearch(camara, '  CANON  ')).toBe(true);
  });

  it('una búsqueda vacía deja pasar todo', () => {
    expect(matchesItemSearch(camara, '')).toBe(true);
    expect(matchesItemSearch(camara, '   ')).toBe(true);
  });

  it('no falla con un equipo sin número de serie', () => {
    // `serie` es obligatorio en el tipo pero llega vacío desde EspoCRM en
    // equipos viejos; la copia original hacía `i.serie && ...` por esto mismo.
    const sinSerie = makeItem({ name: 'Trípode', serie: '' });
    expect(matchesItemSearch(sinSerie, 'trípode')).toBe(true);
    expect(matchesItemSearch(sinSerie, 'SN')).toBe(false);
  });
});

describe('useItemSelection', () => {
  it('agrega y quita ids con el mismo toggle', () => {
    const { result } = renderHook(() => useItemSelection());

    act(() => result.current.toggle('a'));
    expect(result.current.has('a')).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle('a'));
    expect(result.current.has('a')).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('crea un Set nuevo en cada cambio', () => {
    // Si mutara el Set existente, React no volvería a dibujar: la casilla se
    // quedaría sin marcar aunque el estado hubiera cambiado.
    const { result } = renderHook(() => useItemSelection(['a']));
    const antes = result.current.selectedIds;

    act(() => result.current.toggle('b'));

    expect(result.current.selectedIds).not.toBe(antes);
    expect(antes.has('b')).toBe(false);
  });

  it('replace reemplaza la selección entera', () => {
    const { result } = renderHook(() => useItemSelection(['a']));

    act(() => result.current.replace(['x', 'y']));

    expect(result.current.has('a')).toBe(false);
    expect(result.current.count).toBe(2);
  });

  it('clear la vacía', () => {
    const { result } = renderHook(() => useItemSelection(['a', 'b']));

    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
  });

  it('acepta una selección inicial', () => {
    const { result } = renderHook(() => useItemSelection(['a', 'b']));

    expect(result.current.count).toBe(2);
  });
});

describe('ItemPicker', () => {
  it('dibuja una tarjeta por equipo con nombre, serie y categoría', () => {
    renderPicker();

    expect(screen.getByText('Notebook Dell')).toBeTruthy();
    expect(screen.getByText('SN-AAA')).toBeTruthy();
    expect(screen.getByText('Computadoras')).toBeTruthy();
  });

  it('avisa con el id al hacer clic en una tarjeta', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderPicker({ onToggle });

    await user.click(screen.getByText('Cámara Canon'));

    expect(onToggle).toHaveBeenCalledWith('i2');
  });

  it('resalta las tarjetas elegidas con el acento del módulo', () => {
    renderPicker({ selectedIds: new Set(['i1']), accent: 'indigo' });

    const elegida = screen.getByText('Notebook Dell').closest('.p-3')!;
    const noElegida = screen.getByText('Cámara Canon').closest('.p-3')!;

    expect(elegida.className).toContain('border-indigo-300');
    expect(noElegida.className).toContain('bg-white');
  });

  it('el buscador notifica lo tecleado', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPicker({ onSearchChange, searchPlaceholder: 'Buscar equipos...' });

    await user.type(screen.getByPlaceholderText('Buscar equipos...'), 'z');

    expect(onSearchChange).toHaveBeenCalledWith('z');
  });

  it('renderBadge decide la insignia de cada equipo', () => {
    // Es la única parte del selector que sabe de negocio: Préstamos marca
    // "ASIGNADO", Asignaciones marca "Reasignar".
    renderPicker({
      renderBadge: (item) => (item.id === 'i1' ? <span>ASIGNADO</span> : null),
    });

    const tarjeta = screen.getByText('Notebook Dell').closest('.p-3') as HTMLElement;
    expect(within(tarjeta).getByText('ASIGNADO')).toBeTruthy();
    expect(screen.getAllByText('ASIGNADO')).toHaveLength(1);
  });

  it('sin renderBadge no dibuja ninguna insignia', () => {
    renderPicker();

    expect(screen.queryByText('ASIGNADO')).toBeNull();
  });

  it('muestra un aviso cuando el filtro no deja ningún equipo', () => {
    renderPicker({ items: [], emptyMessage: 'No hay equipos disponibles.' });

    expect(screen.getByText('No hay equipos disponibles.')).toBeTruthy();
  });
});
