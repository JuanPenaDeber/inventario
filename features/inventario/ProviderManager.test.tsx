// =============================================================================
// Tests de permisos de ProviderManager.
//
// Antes, cualquier rol (incluido CONSULTA) podía agregar o borrar un
// proveedor — no había ningún control, pese a que permissions.ts ya definía
// provider.manage limitado a COMPRAS/ADMINISTRADOR. Este archivo cubre esa
// regresión, no un smoke test completo del módulo.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeEmployee, makeProvider } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getProviders: vi.fn(),
  getEmployees: vi.fn(),
  addProvider: vi.fn(),
  deleteProvider: vi.fn(),
}));

vi.mock('@/shared/api/inventoryService', () => ({
  getProviders: mocks.getProviders,
  getEmployees: mocks.getEmployees,
  addProvider: mocks.addProvider,
  deleteProvider: mocks.deleteProvider,
  getInventoryErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

import ProviderManager from '@/features/inventario/ProviderManager';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getProviders.mockResolvedValue([makeProvider({ name: 'Proveedor Uno' })]);
  mocks.getEmployees.mockResolvedValue([]);
});

const renderAs = (rawRole?: string) => {
  if (rawRole) {
    mocks.getEmployees.mockResolvedValue([
      makeEmployee({ id: 'emp-x', name: 'Quien Sea', rawRole }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-x');
  }
  return render(
    <CurrentUserProvider>
      <ProviderManager />
    </CurrentUserProvider>,
  );
};

describe('ProviderManager — permisos', () => {
  it('sin rol reconocido (CONSULTA), no se ve el formulario de nuevo proveedor', async () => {
    renderAs();
    await screen.findByText('Proveedor Uno');
    expect(screen.queryByText('Nuevo proveedor')).toBeNull();
  });

  it('sin rol reconocido, no se ve el botón de borrar en la lista', async () => {
    renderAs();
    await screen.findByText('Proveedor Uno');
    expect(screen.queryByTitle('Eliminar proveedor')).toBeNull();
  });

  it('con rol COMPRAS, sí aparece el botón de borrar en la lista', async () => {
    renderAs('Compras');
    await screen.findByText('Proveedor Uno');
    expect(screen.getByTitle('Eliminar proveedor')).toBeTruthy();
  });

  it('con rol COMPRAS, sí aparece el formulario de nuevo proveedor', async () => {
    renderAs('Compras');
    expect(await screen.findByText('Nuevo proveedor')).toBeTruthy();
  });

  it('con rol ADMINISTRADOR, sí aparece el formulario de nuevo proveedor', async () => {
    renderAs('Administrador');
    expect(await screen.findByText('Nuevo proveedor')).toBeTruthy();
  });

  it('con rol SISTEMAS, no aparece el formulario (provider.manage es solo COMPRAS/ADMINISTRADOR)', async () => {
    renderAs('Sistemas');
    await screen.findByText('Proveedor Uno');
    expect(screen.queryByText('Nuevo proveedor')).toBeNull();
  });
});
