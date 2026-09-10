// =============================================================================
// Tests de permisos de ProformaPanel.
//
// No es un smoke test del panel entero (689 líneas, sin dividir todavía) —
// cubre específicamente la regresión que arregló esta pasada: los botones de
// cotización/orden comparaban `actingRole === 'COMPRAS'` a mano, así que un
// ADMINISTRADOR (que permissions.ts sí lista junto a COMPRAS en cada una de
// estas operaciones) no podía cargar una proforma ni iniciar cotización, y
// CONSULTA/SOLICITANTE no tenían ningún control encima.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makePurchaseRequest } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getProformas: vi.fn(),
  getProviders: vi.fn(),
}));

vi.mock('@/shared/api/inventoryService', () => ({
  getProviders: mocks.getProviders,
}));

vi.mock('@/features/compras/proformas/proformaService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/compras/proformas/proformaService')>();
  return {
    ...actual,
    getProformas: mocks.getProformas,
    createProforma: vi.fn(),
    voidProforma: vi.fn(),
  };
});

vi.mock('@/features/compras/solicitudes/purchaseRequestService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/compras/solicitudes/purchaseRequestService')>();
  return {
    ...actual,
    logPurchaseRequestEvent: vi.fn(),
    startQuotation: vi.fn(),
    markAsQuoted: vi.fn(),
    selectProforma: vi.fn(),
    generatePurchaseOrder: vi.fn(),
    finalizeRequest: vi.fn(),
  };
});

import ProformaPanel from '@/features/compras/proformas/ProformaPanel';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProformas.mockResolvedValue([]);
  mocks.getProviders.mockResolvedValue([]);
});

const renderPanel = (role: Parameters<typeof ProformaPanel>[0]['actingRole'], status: string) =>
  render(
    <ProformaPanel
      request={makePurchaseRequest({ status: status as any })}
      actingRole={role}
      actingEmployeeName="Ana Rojas"
      onRequestUpdated={() => {}}
    />,
  );

describe('ProformaPanel — permisos', () => {
  it('COMPRAS ve "Iniciar cotización" en una solicitud APROBADA', async () => {
    renderPanel('COMPRAS', 'APROBADA');
    expect(await screen.findByText('Iniciar cotización')).toBeTruthy();
  });

  it('ADMINISTRADOR también ve "Iniciar cotización" (antes solo se comparaba con COMPRAS)', async () => {
    renderPanel('ADMINISTRADOR', 'APROBADA');
    expect(await screen.findByText('Iniciar cotización')).toBeTruthy();
  });

  it('SOLICITANTE no ve "Iniciar cotización" aunque la solicitud esté APROBADA', async () => {
    renderPanel('SOLICITANTE', 'APROBADA');
    await screen.findByText('Aún no se registraron proformas para esta solicitud.');
    expect(screen.queryByText('Iniciar cotización')).toBeNull();
  });

  it('CONSULTA no ve "Generar orden de compra" en una solicitud APROBADA_PARA_COMPRA', async () => {
    renderPanel('CONSULTA', 'APROBADA_PARA_COMPRA');
    await screen.findByText('Aún no se registraron proformas para esta solicitud.');
    expect(screen.queryByText('Generar orden de compra')).toBeNull();
  });

  it('ADMINISTRADOR ve "Generar orden de compra" en una solicitud APROBADA_PARA_COMPRA', async () => {
    renderPanel('ADMINISTRADOR', 'APROBADA_PARA_COMPRA');
    expect(await screen.findByText('Generar orden de compra')).toBeTruthy();
  });

  it('COMPRAS y ADMINISTRADOR ven "Marcar como finalizada" en una solicitud con ORDEN_GENERADA', async () => {
    renderPanel('COMPRAS', 'ORDEN_GENERADA');
    expect(await screen.findByText('Marcar como finalizada')).toBeTruthy();
  });
});
