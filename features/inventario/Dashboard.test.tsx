// =============================================================================
// Smoke test de Dashboard (inventario).
//
// El más barato de todos: recibe los equipos por props, así que no hay red que
// simular. Cubre sobre todo la paginación y el orden, que es lo que la fase 5
// va a extraer a usePagination() / <TablePagination>, y el orden por categoría
// —que ya estuvo roto una vez: la opción existía en el desplegable pero no en
// el comparador, y caía en silencio al orden por fecha.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeItem } from '@/shared/test/fixtures';

vi.mock('@/shared/api/photoServer', () => ({
  getPhotoUrl: (f?: string) => (f ? `/fotos/${f}` : ''),
  getLogoUrl: () => '/logo.png',
}));

import Dashboard from '@/features/inventario/Dashboard';

const noop = () => {};

const renderDashboard = (items = [makeItem()]) =>
  render(
    <Dashboard items={items} onAddItem={noop} onEditItem={noop} onDeleteItem={noop} />,
  );

/** Filas de datos de la tabla (excluye la fila de cabecera). */
const filas = (): HTMLElement[] =>
  within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('Dashboard', () => {
  it('lista los equipos que recibe por props', () => {
    renderDashboard([
      makeItem({ name: 'Notebook Dell Latitude', serie: 'SN-1' }),
      makeItem({ name: 'Cámara Canon R6', serie: 'SN-2' }),
    ]);

    expect(screen.getByText('Notebook Dell Latitude')).toBeTruthy();
    expect(screen.getByText('Cámara Canon R6')).toBeTruthy();
  });

  it('el buscador filtra por nombre, categoría o serie', async () => {
    const user = userEvent.setup();
    renderDashboard([
      makeItem({ name: 'Notebook Dell', serie: 'SN-AAA', category: 'Computadoras' }),
      makeItem({ name: 'Cámara Canon', serie: 'SN-BBB', category: 'Fotografía' }),
    ]);

    await user.type(
      screen.getByPlaceholderText(/Buscar por nombre, categoría, Serie o descripción/i),
      'SN-BBB',
    );

    expect(screen.queryByText('Notebook Dell')).toBeNull();
    expect(screen.getByText('Cámara Canon')).toBeTruthy();
  });

  it('pagina a 25 filas y no dibuja las demás', () => {
    // La razón de ser de la paginación: con 429 equipos se dibujaban las 429
    // filas de una vez. Si alguien la quita al refactorizar, este test lo dice.
    const muchos = Array.from({ length: 60 }, (_, i) =>
      makeItem({ name: `Equipo ${String(i).padStart(2, '0')}`, serie: `SN-${i}` }),
    );

    renderDashboard(muchos);

    expect(filas()).toHaveLength(25);
    expect(screen.getByText('1–25 de 60')).toBeTruthy();
  });

  it('el botón de página siguiente avanza el rango mostrado', async () => {
    const user = userEvent.setup();
    const muchos = Array.from({ length: 60 }, (_, i) =>
      makeItem({ name: `Equipo ${String(i).padStart(2, '0')}`, serie: `SN-${i}` }),
    );

    renderDashboard(muchos);
    await user.click(screen.getByLabelText('Página siguiente'));

    expect(screen.getByText('26–50 de 60')).toBeTruthy();
    expect(filas()).toHaveLength(25);
  });

  it('en la primera página el botón de anterior está deshabilitado', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => makeItem({ serie: `SN-${i}` }));

    renderDashboard(muchos);

    expect((screen.getByLabelText('Página anterior') as HTMLButtonElement).disabled).toBe(true);
  });

  it('cambiar las filas por página vuelve a la primera página', async () => {
    const user = userEvent.setup();
    const muchos = Array.from({ length: 60 }, (_, i) =>
      makeItem({ name: `Equipo ${String(i).padStart(2, '0')}`, serie: `SN-${i}` }),
    );

    renderDashboard(muchos);
    await user.click(screen.getByLabelText('Página siguiente'));
    await user.selectOptions(screen.getByLabelText('Filas por página'), '50');

    // Sin el reset, quedarse en la página 2 con 50 filas mostraría un rango
    // vacío en una lista de 60.
    expect(screen.getByText('1–50 de 60')).toBeTruthy();
  });

  it('ordena por categoría cuando se elige esa opción', async () => {
    // Regresión conocida: "Categoría (A-Z)" existía en el desplegable pero no
    // en el comparador, y caía en silencio al orden por fecha.
    const user = userEvent.setup();
    renderDashboard([
      makeItem({ name: 'Zeta', category: 'Zapatería', serie: 'SN-1' }),
      makeItem({ name: 'Alfa', category: 'Audio', serie: 'SN-2' }),
    ]);

    await user.selectOptions(screen.getByDisplayValue('Nuevos primero'), 'category');

    expect(within(filas()[0]).getByText('Alfa')).toBeTruthy();
  });

  it('ordena alfabéticamente por nombre', async () => {
    const user = userEvent.setup();
    renderDashboard([
      makeItem({ name: 'Zeta', serie: 'SN-1' }),
      makeItem({ name: 'Alfa', serie: 'SN-2' }),
    ]);

    await user.selectOptions(screen.getByDisplayValue('Nuevos primero'), 'name');

    expect(within(filas()[0]).getByText('Alfa')).toBeTruthy();
  });

  it('no muestra la barra de paginación cuando no hay resultados', async () => {
    const user = userEvent.setup();
    renderDashboard([makeItem({ name: 'Notebook Dell', serie: 'SN-1' })]);

    await user.type(
      screen.getByPlaceholderText(/Buscar por nombre, categoría, Serie o descripción/i),
      'no-existe-nada',
    );

    expect(screen.queryByLabelText('Filas por página')).toBeNull();
  });
});
