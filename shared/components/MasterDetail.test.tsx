// =============================================================================
// Tests de <MasterDetail>.
//
// Es la pieza que absorbe cuatro copias, así que su contrato tiene que quedar
// fijado antes de migrar a nadie: qué hace con la selección, con la lista
// vacía, con la carga, y cuándo dibuja o no el buscador.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MasterDetail } from '@/shared/components/MasterDetail';

interface Fila {
  id: string;
  titulo: string;
}

const FILAS: Fila[] = [
  { id: 'a', titulo: 'Primera' },
  { id: 'b', titulo: 'Segunda' },
];

const IconoVacio = () => <svg data-testid="icono-vacio" />;

const renderMD = (props: Partial<React.ComponentProps<typeof MasterDetail<Fila>>> = {}) =>
  render(
    <MasterDetail<Fila>
      items={FILAS}
      selectedId={null}
      onSelect={() => {}}
      accent="teal"
      emptyMessage="No hay nada registrado."
      renderRow={(item) => <h3>{item.titulo}</h3>}
      renderDetail={(item) => <div>Detalle de {item.titulo}</div>}
      emptyDetail={
        <div>
          <IconoVacio />
          <p>Selecciona algo</p>
        </div>
      }
      {...props}
    />,
  );

describe('MasterDetail', () => {
  it('dibuja una fila por elemento', () => {
    renderMD();

    expect(screen.getByText('Primera')).toBeTruthy();
    expect(screen.getByText('Segunda')).toBeTruthy();
  });

  it('sin selección muestra el marcador en el panel derecho', () => {
    renderMD();

    expect(screen.getByText('Selecciona algo')).toBeTruthy();
    expect(screen.queryByText(/^Detalle de/)).toBeNull();
  });

  it('avisa al padre con el id al hacer clic en una fila', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderMD({ onSelect });

    await user.click(screen.getByText('Segunda'));

    // Devuelve el id, no el objeto: el padre ya tiene la lista y así el
    // estado de selección se puede guardar/restaurar sin serializar nada.
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('con un id seleccionado muestra ese detalle', () => {
    renderMD({ selectedId: 'b' });

    expect(screen.getByText('Detalle de Segunda')).toBeTruthy();
    expect(screen.queryByText('Selecciona algo')).toBeNull();
  });

  it('un id que ya no existe en la lista se trata como "sin selección"', () => {
    // Pasa de verdad: borrás el registro abierto y el id queda colgado. Antes,
    // cada copia resolvía esto por su cuenta con un `find` y un `?.`.
    renderMD({ selectedId: 'no-existe' });

    expect(screen.getByText('Selecciona algo')).toBeTruthy();
  });

  it('marca visualmente la fila seleccionada con el acento del módulo', () => {
    renderMD({ selectedId: 'a' });

    const fila = screen.getByText('Primera').closest('div')!;
    expect(fila.className).toContain('border-l-teal-500');
  });

  it('pasa isSelected a renderRow', () => {
    renderMD({
      selectedId: 'a',
      renderRow: (item, isSelected) => (
        <h3>{isSelected ? `${item.titulo} (activa)` : item.titulo}</h3>
      ),
    });

    expect(screen.getByText('Primera (activa)')).toBeTruthy();
    expect(screen.getByText('Segunda')).toBeTruthy();
  });

  it('durante la carga muestra el mensaje de carga y ninguna fila', () => {
    renderMD({ loading: true, loadingMessage: 'Cargando órdenes...' });

    expect(screen.getByText('Cargando órdenes...')).toBeTruthy();
    expect(screen.queryByText('Primera')).toBeNull();
  });

  it('con la lista vacía muestra el mensaje de vacío', () => {
    renderMD({ items: [] });

    expect(screen.getByText('No hay nada registrado.')).toBeTruthy();
  });

  it('la carga tiene prioridad sobre el vacío', () => {
    // Si no, en el primer render (lista vacía + cargando) parpadea "no hay
    // nada" antes de que lleguen los datos.
    renderMD({ items: [], loading: true, loadingMessage: 'Cargando...' });

    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(screen.queryByText('No hay nada registrado.')).toBeNull();
  });

  it('sin props de búsqueda no dibuja el buscador', () => {
    // Órdenes y Solicitudes filtran desde una barra propia más arriba; dibujar
    // aquí una segunda caja de búsqueda sería confuso.
    renderMD();

    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('con props de búsqueda dibuja el buscador y notifica lo tecleado', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderMD({ search: '', onSearchChange, searchPlaceholder: 'Buscar préstamo...' });

    await user.type(screen.getByPlaceholderText('Buscar préstamo...'), 'x');

    expect(onSearchChange).toHaveBeenCalledWith('x');
  });

  it('el buscador toma el acento del módulo', () => {
    renderMD({ search: '', onSearchChange: () => {}, accent: 'orange' });

    expect((screen.getByRole('textbox') as HTMLElement).className).toContain('focus:ring-orange-500');
  });

  it('por defecto no se imprime: es la vista de pantalla, no el documento', () => {
    const { container } = renderMD();

    expect(container.querySelector('.no-print')).toBeTruthy();
  });

  it('con hideOnPrint={false} sí se imprime', () => {
    // Solicitudes de Compra no tiene acta imprimible propia: si esta vista se
    // ocultara al imprimir, la hoja saldría en blanco.
    const { container } = renderMD({ hideOnPrint: false });

    expect(container.querySelector('.no-print')).toBeNull();
  });

  it('renderDetail recibe el elemento completo, no solo el id', () => {
    renderMD({
      selectedId: 'b',
      renderDetail: (item) => <div>{`id=${item.id} titulo=${item.titulo}`}</div>,
    });

    expect(screen.getByText('id=b titulo=Segunda')).toBeTruthy();
  });

  it('las filas quedan dentro de un contenedor con scroll propio', () => {
    // La lista scrollea sola; si el scroll se fuera al contenedor externo, el
    // panel de detalle se iría con ella y el layout dejaría de ser fijo.
    const { container } = renderMD();
    const contenedor = screen.getByText('Primera').closest('.overflow-y-auto');

    expect(contenedor).toBeTruthy();
    expect(within(container).getAllByText(/Primera|Segunda/)).toHaveLength(2);
  });
});
