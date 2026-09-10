// =============================================================================
// Smoke test de LoanManager (887 líneas, el componente más grande del proyecto).
//
// Mismo criterio que el resto de la suite: afirma sobre lo que ve el usuario,
// no sobre la estructura interna. Cuando este archivo se parta en LoanForm /
// LoanRow / LoanDetail / LoanPrintDoc, estos tests deben seguir pasando sin
// tocar una línea; si hay que editarlos, es señal de que la extracción cambió
// comportamiento y no solo de sitio.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeEmployee, makeItem, makeLoan } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getLoans: vi.fn(),
  getInventory: vi.fn(),
  getEmployees: vi.fn(),
  getLoanItems: vi.fn(),
  createLoan: vi.fn(),
  returnLoanItems: vi.fn(),
}));

vi.mock('@/shared/api/inventoryService', () => ({
  getLoans: mocks.getLoans,
  getInventory: mocks.getInventory,
  getEmployees: mocks.getEmployees,
  getLoanItems: mocks.getLoanItems,
  createLoan: mocks.createLoan,
  returnLoanItems: mocks.returnLoanItems,
  updateLoan: vi.fn(),
  addEmployee: vi.fn(),
  getInventoryErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/shared/api/photoServer', () => ({
  getLogoUrl: () => '/logo.png',
  getPhotoUrl: (f?: string) => (f ? `/fotos/${f}` : ''),
}));

import LoanManager from '@/features/prestamos/LoanManager';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

const renderManager = () =>
  render(
    <CurrentUserProvider>
      <LoanManager />
    </CurrentUserProvider>,
  );

/**
 * Tabla de equipos del detalle en pantalla. Igual que en Asignaciones, el
 * comprobante imprimible vive en el mismo DOM con los mismos equipos: hay que
 * acotar o cada nombre aparece dos veces. La columna "Estado" a secas solo
 * existe en pantalla (la del comprobante es "Observaciones / Estado").
 */
const tablaDeDetalle = async (): Promise<HTMLElement> =>
  (await screen.findByRole('columnheader', { name: 'Estado' })).closest('table')!;

const ana = makeEmployee({ id: 'emp-ana', name: 'Ana Rojas', equipo: 'Redacción' });
const beto = makeEmployee({ id: 'emp-beto', name: 'Beto Suárez', equipo: 'Sistemas' });

const prestamoActivo = makeLoan({
  id: 'loan-activo',
  name: 'Préstamo cámaras evento',
  solicitanteId: 'emp-ana',
  area: 'Redacción',
  status: 'PRESTADO',
  fechaEsperadaDevolucion: '2099-01-01', // lejos: no debe salir como vencido
});

const prestamoDevuelto = makeLoan({
  id: 'loan-devuelto',
  name: 'Préstamo trípodes',
  solicitanteId: 'emp-beto',
  area: 'Sistemas',
  status: 'DEVUELTO',
  fechaHoraDevolucion: '2025-03-18',
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getLoans.mockResolvedValue([prestamoActivo, prestamoDevuelto]);
  mocks.getEmployees.mockResolvedValue([ana, beto]);
  mocks.getInventory.mockResolvedValue([makeItem({ name: 'Notebook Dell Latitude' })]);
  mocks.getLoanItems.mockResolvedValue([]);
});

describe('LoanManager', () => {
  it('monta y lista los préstamos que devuelve el servicio', async () => {
    renderManager();

    expect(await screen.findByText('Préstamo cámaras evento')).toBeTruthy();
    expect(screen.getByText('Préstamo trípodes')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pañol / Préstamos' })).toBeTruthy();
  });

  it('distingue en la lista un préstamo activo de uno finalizado', async () => {
    renderManager();
    await screen.findByText('Préstamo cámaras evento');

    // El estado se lee de la fila, no de un campo oculto: es lo que decide el
    // usuario de un vistazo y lo que más fácil se rompe al mover la fila.
    expect(screen.getByText('ACTIVO')).toBeTruthy();
    expect(screen.getByText('FINALIZADO')).toBeTruthy();
  });

  it('marca como VENCIDO un préstamo activo pasado de fecha', async () => {
    mocks.getLoans.mockResolvedValue([
      makeLoan({ name: 'Préstamo vencido', status: 'PRESTADO', fechaEsperadaDevolucion: '2020-01-01' }),
    ]);

    renderManager();

    expect(await screen.findByText('VENCIDO')).toBeTruthy();
  });

  it('muestra el marcador de "sin selección" antes de elegir un préstamo', async () => {
    renderManager();

    expect(await screen.findByText('Seleccione un préstamo para ver detalles')).toBeTruthy();
  });

  it('al hacer clic en un préstamo carga y muestra sus equipos', async () => {
    const user = userEvent.setup();
    mocks.getLoanItems.mockResolvedValue([makeItem({ name: 'Cámara Canon R6', serie: 'CAM-99' })]);

    renderManager();
    await user.click(await screen.findByText('Préstamo cámaras evento'));

    await waitFor(() => expect(mocks.getLoanItems).toHaveBeenCalledWith('loan-activo'));
    expect(within(await tablaDeDetalle()).getByText('Cámara Canon R6')).toBeTruthy();
  });

  it('avisa cuando el préstamo seleccionado ya no tiene equipos pendientes', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByText('Préstamo cámaras evento'));

    expect(
      await screen.findByText('No hay equipos en este préstamo (Todos devueltos).'),
    ).toBeTruthy();
  });

  it('el buscador filtra la lista maestra', async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Préstamo cámaras evento');

    await user.type(screen.getByPlaceholderText('Buscar préstamo...'), 'trípodes');

    await waitFor(() => expect(screen.queryByText('Préstamo cámaras evento')).toBeNull());
    expect(screen.getByText('Préstamo trípodes')).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay préstamos', async () => {
    mocks.getLoans.mockResolvedValue([]);

    renderManager();

    expect(await screen.findByText('No hay préstamos registrados.')).toBeTruthy();
  });

  it('sin permiso de loan.create, no se ve "Nuevo Préstamo"', async () => {
    // Antes cualquier rol (incluido CONSULTA, el que se resuelve por
    // defecto cuando no hay nadie elegido como "quién soy") podía crear un
    // préstamo. loan.create en permissions.ts lo limita a SISTEMAS/
    // ADMINISTRADOR.
    renderManager();
    await screen.findByText('Préstamo cámaras evento');

    expect(screen.queryByRole('button', { name: /Nuevo Préstamo/i })).toBeNull();
  });

  it('con rol SISTEMAS, "Nuevo Préstamo" abre el formulario con el selector de equipos', async () => {
    mocks.getEmployees.mockResolvedValue([
      ana,
      beto,
      makeEmployee({ id: 'emp-sistemas', name: 'Sofía Sistemas', rawRole: 'Sistemas' }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-sistemas');

    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Préstamo cámaras evento');

    await user.click(screen.getByRole('button', { name: /Nuevo Préstamo/i }));

    expect(await screen.findByText('Seleccionar Equipos')).toBeTruthy();
    expect(screen.getByPlaceholderText('Ej: Préstamo Cámaras Evento X')).toBeTruthy();
  });

  it('con rol SISTEMAS (sin employee.create), el formulario no ofrece crear un empleado nuevo', async () => {
    // Antes cualquiera podía crear un empleado desde acá (prompt() sin
    // ningún control) — CRegistroEmpleados alimenta TODOS los desplegables
    // de la app, no sólo los de Préstamos. SISTEMAS puede crear préstamos
    // (loan.create) pero no empleados (employee.create es solo ADMINISTRADOR).
    mocks.getEmployees.mockResolvedValue([
      ana,
      beto,
      makeEmployee({ id: 'emp-sistemas', name: 'Sofía Sistemas', rawRole: 'Sistemas' }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-sistemas');

    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Préstamo cámaras evento');

    await user.click(screen.getByRole('button', { name: /Nuevo Préstamo/i }));
    await screen.findByText('Seleccionar Equipos');

    expect(screen.queryByTitle('Nuevo Empleado')).toBeNull();
  });

  it('con rol ADMINISTRADOR, sí aparece la opción de crear empleado', async () => {
    mocks.getEmployees.mockResolvedValue([
      ana,
      beto,
      makeEmployee({ id: 'emp-admin', name: 'Ana Admin', rawRole: 'Administrador' }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-admin');

    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Préstamo cámaras evento');

    await user.click(screen.getByRole('button', { name: /Nuevo Préstamo/i }));

    expect(await screen.findByTitle('Nuevo Empleado')).toBeTruthy();
  });

  it('un fallo de carga no deja la pantalla colgada en "Cargando datos..."', async () => {
    mocks.getLoans.mockRejectedValue(new Error('red caída'));

    renderManager();

    await waitFor(() => expect(screen.queryByText('Cargando datos...')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Pañol / Préstamos' })).toBeTruthy();
  });
});
