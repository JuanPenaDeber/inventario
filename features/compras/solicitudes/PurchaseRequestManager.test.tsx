// =============================================================================
// Smoke test de PurchaseRequestManager.
//
// Es el manager con más estado: lista, detalle, histórico, formulario, panel de
// proformas y el selector "Actuando como" persistido en localStorage. Los tests
// cubren la lista y el detalle —lo que la fase 2 va a mover— más el rol activo,
// que es lo que decide qué botones de decisión aparecen.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeEmployee, makePurchaseRequest, makeRequestLine } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getPurchaseRequests: vi.fn(),
  getPurchaseRequest: vi.fn(),
  getPurchaseRequestHistory: vi.fn(),
  getEmployees: vi.fn(),
  getProviders: vi.fn(),
  getProformas: vi.fn(),
}));

vi.mock('@/features/compras/solicitudes/purchaseRequestService', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/features/compras/solicitudes/purchaseRequestService')>();
  return {
    ...real,
    getPurchaseRequests: mocks.getPurchaseRequests,
    getPurchaseRequest: mocks.getPurchaseRequest,
    getPurchaseRequestHistory: mocks.getPurchaseRequestHistory,
    createPurchaseRequest: vi.fn(),
    updatePurchaseRequest: vi.fn(),
  };
});

vi.mock('@/shared/api/inventoryService', () => ({
  getEmployees: mocks.getEmployees,
  getProviders: mocks.getProviders,
  getInventoryErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/features/compras/proformas/proformaService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/compras/proformas/proformaService')>();
  return { ...real, getProformas: mocks.getProformas };
});

import PurchaseRequestManager from '@/features/compras/solicitudes/PurchaseRequestManager';

/** Tabla de líneas en pantalla, anclada en una columna propia del detalle. */
const tablaDeLineas = async (): Promise<HTMLElement> =>
  (await screen.findByRole('columnheader', { name: 'Área destino' })).closest('table')!;

const solicitudBorrador = makePurchaseRequest({
  id: 'pr-borrador',
  code: 'SC-2025-001',
  requesterName: 'Ana Rojas',
  area: 'Redacción',
  status: 'BORRADOR',
});

const solicitudPendiente = makePurchaseRequest({
  id: 'pr-pendiente',
  code: 'SC-2025-002',
  requesterName: 'Beto Suárez',
  area: 'Sistemas',
  status: 'PENDIENTE_APROBACION',
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getPurchaseRequests.mockResolvedValue([solicitudBorrador, solicitudPendiente]);
  mocks.getEmployees.mockResolvedValue([
    makeEmployee({ id: 'emp-ana', name: 'Ana Rojas' }),
    makeEmployee({ id: 'emp-beto', name: 'Beto Suárez' }),
  ]);
  mocks.getProviders.mockResolvedValue([]);
  mocks.getProformas.mockResolvedValue([]);
  mocks.getPurchaseRequestHistory.mockResolvedValue([]);
  mocks.getPurchaseRequest.mockResolvedValue({
    ...solicitudBorrador,
    lines: [makeRequestLine({ product: 'Disco SSD 1TB', targetArea: 'Redacción' })],
  });
});

describe('PurchaseRequestManager', () => {
  it('monta y lista las solicitudes que devuelve el servicio', async () => {
    render(<PurchaseRequestManager />);

    expect(await screen.findByText('SC-2025-001')).toBeTruthy();
    expect(screen.getByText('SC-2025-002')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Solicitudes de Compra' })).toBeTruthy();
  });

  it('muestra el estado de cada solicitud con los guiones bajos ya traducidos', async () => {
    render(<PurchaseRequestManager />);
    await screen.findByText('SC-2025-001');

    // La fila muestra "PENDIENTE APROBACION", no "PENDIENTE_APROBACION".
    expect(screen.getByText('PENDIENTE APROBACION', { selector: 'span' })).toBeTruthy();
  });

  it('muestra el marcador de "sin selección" antes de elegir una solicitud', async () => {
    render(<PurchaseRequestManager />);

    expect(await screen.findByText('Selecciona una solicitud para ver el detalle')).toBeTruthy();
  });

  it('al seleccionar una solicitud pide su detalle e histórico y muestra las líneas', async () => {
    const user = userEvent.setup();
    render(<PurchaseRequestManager />);

    await user.click(await screen.findByText('SC-2025-001'));

    await waitFor(() => expect(mocks.getPurchaseRequest).toHaveBeenCalledWith('pr-borrador'));
    expect(mocks.getPurchaseRequestHistory).toHaveBeenCalledWith('pr-borrador');
    expect(within(await tablaDeLineas()).getByText('Disco SSD 1TB')).toBeTruthy();
  });

  it('el buscador filtra la lista maestra', async () => {
    const user = userEvent.setup();
    render(<PurchaseRequestManager />);
    await screen.findByText('SC-2025-001');

    await user.type(
      screen.getByPlaceholderText('Código, solicitante, área, cargo, jefe o producto...'),
      'Beto',
    );

    await waitFor(() => expect(screen.queryByText('SC-2025-001')).toBeNull());
    expect(screen.getByText('SC-2025-002')).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay solicitudes', async () => {
    mocks.getPurchaseRequests.mockResolvedValue([]);

    render(<PurchaseRequestManager />);

    expect(await screen.findByText('No hay solicitudes de compra registradas.')).toBeTruthy();
  });

  it('"Nueva Solicitud" abre el formulario', async () => {
    const user = userEvent.setup();
    render(<PurchaseRequestManager />);
    await screen.findByText('SC-2025-001');

    await user.click(screen.getByRole('button', { name: /Nueva Solicitud/i }));

    await waitFor(() => expect(screen.queryByText('SC-2025-002')).toBeNull());
  });

  it('preselecciona la solicitud que llega en initialRequestId', async () => {
    // Es la navegación desde el Dashboard de Compras. Sin esto, el usuario
    // aterriza en la lista sin nada seleccionado y no se entera de por qué.
    const onConsume = vi.fn();
    render(
      <PurchaseRequestManager initialRequestId="pr-borrador" onConsumeInitialRequest={onConsume} />,
    );

    await waitFor(() => expect(mocks.getPurchaseRequest).toHaveBeenCalledWith('pr-borrador'));
    expect(screen.queryByText('Selecciona una solicitud para ver el detalle')).toBeNull();
  });

  it('recuerda el rol "Actuando como" entre montajes', async () => {
    // El rol vive en sessionStorage (no localStorage: se olvida al cerrar la
    // pestaña, a propósito) y decide qué botones de decisión se ven. Si se
    // pierde al refactorizar, el usuario vuelve a SOLICITANTE en cada recarga
    // y deja de poder aprobar sin entender por qué.
    sessionStorage.setItem(
      'purchaseFlow.actingAs',
      JSON.stringify({ role: 'JEFE', employeeId: 'emp-beto' }),
    );

    render(<PurchaseRequestManager />);
    await screen.findByText('SC-2025-001');

    const selectorRol = screen.getByDisplayValue('JEFE') as HTMLSelectElement;
    expect(selectorRol.value).toBe('JEFE');
  });

  it('el rol JEFE habilita las acciones de decisión sobre una solicitud pendiente', async () => {
    // La regla real (línea `canDecide`): solo un JEFE decide, y solo sobre una
    // solicitud en PENDIENTE_APROBACION. Es la lógica de permisos del módulo.
    const user = userEvent.setup();
    sessionStorage.setItem(
      'purchaseFlow.actingAs',
      JSON.stringify({ role: 'JEFE', employeeId: 'emp-beto' }),
    );
    mocks.getPurchaseRequest.mockResolvedValue({
      ...solicitudPendiente,
      lines: [makeRequestLine({ product: 'Disco SSD 1TB', targetArea: 'Sistemas' })],
    });

    render(<PurchaseRequestManager />);
    await user.click(await screen.findByText('SC-2025-002'));

    expect(await screen.findByRole('button', { name: /Aprobar/i })).toBeTruthy();
  });

  it('un fallo de carga no deja la pantalla colgada en "Cargando solicitudes..."', async () => {
    mocks.getPurchaseRequests.mockRejectedValue(new Error('red caída'));

    render(<PurchaseRequestManager />);

    await waitFor(() => expect(screen.queryByText('Cargando solicitudes...')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Solicitudes de Compra' })).toBeTruthy();
  });
});
