// =============================================================================
// Tests de permisos de SuggestionManager.
//
// El propio archivo documentaba (en un comentario) que esta pantalla no
// estaba bloqueada por rol — cualquiera con acceso al menú Ajustes podía
// agregar o borrar sugerencias. suggestions.manage en permissions.ts la
// limita a ADMINISTRADOR; este archivo cubre esa regresión.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeEmployee } from '@/shared/test/fixtures';
import type { ProductSuggestion } from '@/types';

const mocks = vi.hoisted(() => ({
  getProductSuggestions: vi.fn(),
  getEmployees: vi.fn(),
}));

vi.mock('@/features/compras/sugerencias/suggestionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/compras/sugerencias/suggestionService')>();
  return {
    ...actual,
    getProductSuggestions: mocks.getProductSuggestions,
    createProductSuggestion: vi.fn(),
    deleteProductSuggestion: vi.fn(),
  };
});

vi.mock('@/shared/api/inventoryService', () => ({
  getEmployees: mocks.getEmployees,
}));

import SuggestionManager from '@/features/compras/sugerencias/SuggestionManager';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

const sugerencia: ProductSuggestion = {
  id: 'sug-1',
  area: 'Sistemas',
  position: 'Desarrollador',
  product: 'Laptop',
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getProductSuggestions.mockResolvedValue([sugerencia]);
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
      <SuggestionManager />
    </CurrentUserProvider>,
  );
};

describe('SuggestionManager — permisos', () => {
  it('sin rol reconocido (CONSULTA), no se ve el formulario de nueva sugerencia', async () => {
    renderAs();
    await screen.findByText('Laptop');
    expect(screen.queryByText('Nueva sugerencia')).toBeNull();
  });

  it('sin rol reconocido, no se ve el botón de borrar en la lista', async () => {
    renderAs();
    await screen.findByText('Laptop');
    expect(screen.queryByTitle('Eliminar sugerencia')).toBeNull();
  });

  it('con rol COMPRAS, no aparece el formulario (suggestions.manage es solo ADMINISTRADOR)', async () => {
    renderAs('Compras');
    await screen.findByText('Laptop');
    expect(screen.queryByText('Nueva sugerencia')).toBeNull();
  });

  it('con rol ADMINISTRADOR, sí aparece el formulario y el botón de borrar', async () => {
    renderAs('Administrador');
    expect(await screen.findByText('Nueva sugerencia')).toBeTruthy();
    await screen.findByText('Laptop');
    expect(screen.getByTitle('Eliminar sugerencia')).toBeTruthy();
  });
});
