// =============================================================================
// Tests de permisos de IncidentsAdmin.
//
// El panel documentaba "solo lo usan administradores" en un comentario, pero
// no había ningún control real: cualquier rol que llegara a este panel podía
// editar el estado de una incidencia. Este archivo cubre esa regresión, no
// un smoke test completo del panel (filtros, exportación, paginación).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeEmployee } from '@/shared/test/fixtures';
import type { Incident } from '@/features/incidencias/incidentsService';

const mocks = vi.hoisted(() => ({
  getIncidents: vi.fn(),
  getEmployees: vi.fn(),
}));

vi.mock('@/features/incidencias/incidentsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/incidencias/incidentsService')>();
  return {
    ...actual,
    getIncidents: mocks.getIncidents,
    updateIncident: vi.fn(),
    downloadExcelReport: vi.fn(),
  };
});

vi.mock('@/shared/api/inventoryService', () => ({
  getEmployees: mocks.getEmployees,
}));

import IncidentsAdmin from '@/features/incidencias/IncidentsAdmin';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

const incidente: Incident = {
  _id: 'inc-1',
  ticketId: 'TCK-001',
  usuario: 'Ana Rojas',
  correo: 'ana@grupoeldeber.com',
  area: 'Redacción',
  articulo: 'Notebook',
  problema: 'No enciende',
  estado: 'Pendiente',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getIncidents.mockResolvedValue([incidente]);
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
      <IncidentsAdmin />
    </CurrentUserProvider>,
  );
};

describe('IncidentsAdmin — permisos', () => {
  it('sin rol reconocido (CONSULTA), no se ve el botón de editar', async () => {
    renderAs();
    await screen.findByText('TCK-001');
    expect(screen.queryByTitle('Editar')).toBeNull();
  });

  it('con rol SISTEMAS, sí aparece el botón de editar', async () => {
    renderAs('Sistemas');
    await screen.findByText('TCK-001');
    expect(screen.getByTitle('Editar')).toBeTruthy();
  });

  it('con rol ADMINISTRADOR, sí aparece el botón de editar', async () => {
    renderAs('Administrador');
    await screen.findByText('TCK-001');
    expect(screen.getByTitle('Editar')).toBeTruthy();
  });

  it('con rol SOLICITANTE, no aparece el botón de editar', async () => {
    renderAs('Solicitante');
    await screen.findByText('TCK-001');
    expect(screen.queryByTitle('Editar')).toBeNull();
  });
});
