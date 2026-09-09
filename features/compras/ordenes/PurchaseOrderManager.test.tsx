// =============================================================================
// Smoke test de PurchaseOrderManager.
//
// Cubre además el detalle bajo demanda: la lista trae órdenes sin líneas y al
// seleccionar una se pide `getPurchaseOrder(id)` con el detalle completo. Ese
// doble viaje es fácil de romper al extraer <MasterDetail>, porque la carga
// del detalle está atada a la selección.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeOrderLine, makePurchaseOrder } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
}));

vi.mock('@/features/compras/ordenes/purchaseOrderService', async (importOriginal) => {
  // Se conserva el módulo real y solo se doblan las funciones de red: el
  // componente también importa constantes (CURRENCIES) y cálculos puros que
  // no tiene sentido simular.
  const real = await importOriginal<typeof import('@/features/compras/ordenes/purchaseOrderService')>();
  return {
    ...real,
    getPurchaseOrders: mocks.getPurchaseOrders,
    getPurchaseOrder: mocks.getPurchaseOrder,
    createPurchaseOrder: vi.fn(),
    updatePurchaseOrder: vi.fn(),
    cancelPurchaseOrder: vi.fn(),
    receivePurchaseOrder: vi.fn(),
  };
});

vi.mock('@/shared/api/photoServer', () => ({
  getLogoUrl: () => '/logo.png',
  getPhotoUrl: (f?: string) => (f ? `/fotos/${f}` : ''),
}));

import PurchaseOrderManager from '@/features/compras/ordenes/PurchaseOrderManager';

/** Tabla de líneas en pantalla: "Solicitado" no existe en la orden imprimible. */
const tablaDeLineas = async (): Promise<HTMLElement> =>
  (await screen.findByRole('columnheader', { name: 'Solicitado' })).closest('table')!;

const ordenBorrador = makePurchaseOrder({
  id: 'po-borrador',
  reference: 'OC-2025-001',
  providerName: 'Importadora Central',
  status: 'BORRADOR',
  lines: [],
});

const ordenAprobada = makePurchaseOrder({
  id: 'po-aprobada',
  reference: 'OC-2025-002',
  providerName: 'Tecno Bolivia',
  status: 'APROBADA',
  lines: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPurchaseOrders.mockResolvedValue([ordenBorrador, ordenAprobada]);
  mocks.getPurchaseOrder.mockResolvedValue({
    ...ordenBorrador,
    lines: [makeOrderLine({ description: 'Monitor 24 pulgadas', category: 'Computadoras' })],
  });
});

describe('PurchaseOrderManager', () => {
  it('monta y lista las órdenes que devuelve el servicio', async () => {
    render(<PurchaseOrderManager />);

    expect(await screen.findByText('OC-2025-001')).toBeTruthy();
    expect(screen.getByText('OC-2025-002')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Órdenes de Compra' })).toBeTruthy();
  });

  it('muestra el estado de cada orden en su fila', async () => {
    render(<PurchaseOrderManager />);
    await screen.findByText('OC-2025-001');

    // Acotado a `span`: cada estado aparece también como <option> del filtro
    // por estado, y sin acotar la búsqueda encuentra los dos.
    expect(screen.getByText('BORRADOR', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('APROBADA', { selector: 'span' })).toBeTruthy();
  });

  it('muestra el marcador de "sin selección" antes de elegir una orden', async () => {
    render(<PurchaseOrderManager />);

    expect(await screen.findByText('Selecciona una orden para ver el detalle')).toBeTruthy();
  });

  it('al seleccionar una orden pide su detalle completo y muestra las líneas', async () => {
    const user = userEvent.setup();
    render(<PurchaseOrderManager />);

    await user.click(await screen.findByText('OC-2025-001'));

    // La lista no trae líneas: el detalle es un segundo viaje al servicio.
    await waitFor(() => expect(mocks.getPurchaseOrder).toHaveBeenCalledWith('po-borrador'));
    expect(within(await tablaDeLineas()).getByText('Monitor 24 pulgadas')).toBeTruthy();
  });

  it('el buscador filtra la lista maestra', async () => {
    const user = userEvent.setup();
    render(<PurchaseOrderManager />);
    await screen.findByText('OC-2025-001');

    await user.type(
      screen.getByPlaceholderText('Referencia, proveedor o solicitante...'),
      'Tecno',
    );

    await waitFor(() => expect(screen.queryByText('OC-2025-001')).toBeNull());
    expect(screen.getByText('OC-2025-002')).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay órdenes', async () => {
    mocks.getPurchaseOrders.mockResolvedValue([]);

    render(<PurchaseOrderManager />);

    expect(await screen.findByText('No hay órdenes de compra registradas.')).toBeTruthy();
  });

  it('"Nueva Orden" abre el formulario', async () => {
    const user = userEvent.setup();
    render(<PurchaseOrderManager />);
    await screen.findByText('OC-2025-001');

    await user.click(screen.getByRole('button', { name: /Nueva Orden/i }));

    // El formulario reemplaza a la lista maestro-detalle.
    await waitFor(() => expect(screen.queryByText('OC-2025-002')).toBeNull());
  });

  it('aplica initialSearch al montar y avisa que ya lo consumió', async () => {
    // Es cómo llega el usuario desde Solicitudes de Compra: "abre la orden
    // OC-2025-002". Si se pierde al refactorizar, esa navegación entre módulos
    // deja de funcionar sin que nada falle a la vista.
    const onConsume = vi.fn();
    render(<PurchaseOrderManager initialSearch="OC-2025-002" onConsumeInitialSearch={onConsume} />);

    expect(await screen.findByText('OC-2025-002')).toBeTruthy();
    expect(screen.queryByText('OC-2025-001')).toBeNull();
    await waitFor(() => expect(onConsume).toHaveBeenCalled());
  });

  it('un fallo de carga muestra el aviso y no deja la pantalla cargando', async () => {
    mocks.getPurchaseOrders.mockRejectedValue(new Error('red caída'));

    render(<PurchaseOrderManager />);

    await waitFor(() => expect(screen.queryByText('Cargando órdenes...')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Órdenes de Compra' })).toBeTruthy();
  });
});
