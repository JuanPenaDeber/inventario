// =============================================================================
// Smoke test de PurchaseRequestManager.
//
// Es el manager con más estado: lista, detalle, histórico, formulario y panel
// de proformas. El "Actuando como" local que tenía se fue — el rol ahora es
// global (CurrentUserProvider) y se RESUELVE a partir de quién se eligió como
// "quién soy", no de un desplegable propio de este módulo. Estos tests
// envuelven el render en el Provider, igual que index.tsx lo hace en la app
// real, y verifican que el rol resuelto decide qué botones aparecen.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeEmployee, makePurchaseRequest, makeRequestLine } from '@/shared/test/fixtures';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

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

/**
 * Igual que `render(<PurchaseRequestManager .../>)`, pero envuelto en
 * `CurrentUserProvider` — exactamente como index.tsx lo hace en la app real.
 * Sin esto, `useCurrentUser()` (que el hook del manager ya usa) lanza.
 */
const renderManager = (props: React.ComponentProps<typeof PurchaseRequestManager> = {}) =>
  render(
    <CurrentUserProvider>
      <PurchaseRequestManager {...props} />
    </CurrentUserProvider>,
  );

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
    makeEmployee({ id: 'emp-ana', name: 'Ana Rojas' }), // sin rol asignado → CONSULTA
    makeEmployee({ id: 'emp-beto', name: 'Beto Suárez', rawRole: 'Jefe de Sistemas' }), // → JEFE
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
    renderManager();

    expect(await screen.findByText('SC-2025-001')).toBeTruthy();
    expect(screen.getByText('SC-2025-002')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Solicitudes de Compra' })).toBeTruthy();
  });

  it('muestra el estado de cada solicitud con los guiones bajos ya traducidos', async () => {
    renderManager();
    await screen.findByText('SC-2025-001');

    // La fila muestra "PENDIENTE APROBACION", no "PENDIENTE_APROBACION".
    expect(screen.getByText('PENDIENTE APROBACION', { selector: 'span' })).toBeTruthy();
  });

  it('muestra el marcador de "sin selección" antes de elegir una solicitud', async () => {
    renderManager();

    expect(await screen.findByText('Selecciona una solicitud para ver el detalle')).toBeTruthy();
  });

  it('al seleccionar una solicitud pide su detalle e histórico y muestra las líneas', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByText('SC-2025-001'));

    await waitFor(() => expect(mocks.getPurchaseRequest).toHaveBeenCalledWith('pr-borrador'));
    expect(mocks.getPurchaseRequestHistory).toHaveBeenCalledWith('pr-borrador');
    expect(within(await tablaDeLineas()).getByText('Disco SSD 1TB')).toBeTruthy();
  });

  it('el buscador filtra la lista maestra', async () => {
    const user = userEvent.setup();
    renderManager();
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

    renderManager();

    expect(await screen.findByText('No hay solicitudes de compra registradas.')).toBeTruthy();
  });

  it('"Nueva Solicitud" abre el formulario', async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('SC-2025-001');

    await user.click(screen.getByRole('button', { name: /Nueva Solicitud/i }));

    await waitFor(() => expect(screen.queryByText('SC-2025-002')).toBeNull());
  });

  it('preselecciona la solicitud que llega en initialRequestId', async () => {
    // Es la navegación desde el Dashboard de Compras. Sin esto, el usuario
    // aterriza en la lista sin nada seleccionado y no se entera de por qué.
    const onConsume = vi.fn();
    renderManager({ initialRequestId: 'pr-borrador', onConsumeInitialRequest: onConsume });

    await waitFor(() => expect(mocks.getPurchaseRequest).toHaveBeenCalledWith('pr-borrador'));
    expect(screen.queryByText('Selecciona una solicitud para ver el detalle')).toBeNull();
  });

  it('sin nadie elegido como "quién soy", no aparecen los botones de decisión', async () => {
    // Por defecto nadie está elegido y el rol resuelto es CONSULTA — el de
    // menor privilegio. Ni siquiera sobre una solicitud PENDIENTE_APROBACION
    // debería verse "Aprobar"/"Rechazar".
    const user = userEvent.setup();
    mocks.getPurchaseRequest.mockResolvedValue({
      ...solicitudPendiente,
      lines: [makeRequestLine({ product: 'Disco SSD 1TB', targetArea: 'Sistemas' })],
    });

    renderManager();
    await user.click(await screen.findByText('SC-2025-002'));
    await screen.findByText('Disco SSD 1TB');

    expect(screen.queryByRole('button', { name: /Aprobar/i })).toBeNull();
  });

  it('el rol JEFE (resuelto vía EspoCRM) habilita decidir sobre una solicitud pendiente', async () => {
    // "Quién soy" es global y persiste en sessionStorage bajo la clave del
    // CurrentUserProvider — no se elige acá dentro, se recupera de ahí. El
    // rol JEFE sale de interpretar rawRole ("Jefe de Sistemas"), no de un
    // desplegable propio del módulo (ver beforeEach).
    const user = userEvent.setup();
    sessionStorage.setItem('app.currentEmployeeId', 'emp-beto');
    mocks.getPurchaseRequest.mockResolvedValue({
      ...solicitudPendiente,
      lines: [makeRequestLine({ product: 'Disco SSD 1TB', targetArea: 'Sistemas' })],
    });

    renderManager();
    await user.click(await screen.findByText('SC-2025-002'));

    expect(await screen.findByRole('button', { name: /Aprobar/i })).toBeTruthy();
  });

  it('quien resuelve a CONSULTA (sin rol reconocido) ve todas, no sólo las propias', async () => {
    // "emp-ana" no tiene rawRole ni está en la tabla local: resuelve a
    // CONSULTA, que en la matriz SÍ ve todo (a diferencia de SOLICITANTE, que
    // sólo ve lo propio — ver el test de abajo). El default seguro no debe
    // confundirse con "restringido a lo propio".
    sessionStorage.setItem('app.currentEmployeeId', 'emp-ana');

    renderManager();

    expect(await screen.findByText('SC-2025-001')).toBeTruthy();
    expect(screen.getByText('SC-2025-002')).toBeTruthy();
  });

  it('un SOLICITANTE sólo ve las solicitudes que él mismo creó', async () => {
    // Es la restricción real de purchaseRequest.view (permissions.ts): a
    // diferencia de CONSULTA, SOLICITANTE es "own" — no tiene sentido que
    // navegue las solicitudes de otro empleado.
    const solicitante = makeEmployee({
      id: 'emp-carla',
      name: 'Carla Gómez',
      rawRole: 'Solicitante',
    });
    mocks.getEmployees.mockResolvedValue([solicitante]);
    mocks.getPurchaseRequests.mockResolvedValue([
      makePurchaseRequest({ id: 'pr-propia', code: 'SC-2025-010', requesterId: 'emp-carla' }),
      makePurchaseRequest({ id: 'pr-ajena', code: 'SC-2025-011', requesterId: 'emp-otro' }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-carla');

    renderManager();

    expect(await screen.findByText('SC-2025-010')).toBeTruthy();
    expect(screen.queryByText('SC-2025-011')).toBeNull();
  });

  it('un fallo de carga no deja la pantalla colgada en "Cargando solicitudes..."', async () => {
    mocks.getPurchaseRequests.mockRejectedValue(new Error('red caída'));

    renderManager();

    await waitFor(() => expect(screen.queryByText('Cargando solicitudes...')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Solicitudes de Compra' })).toBeTruthy();
  });
});
