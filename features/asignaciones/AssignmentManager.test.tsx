// =============================================================================
// Smoke test de AssignmentManager.
//
// No busca bugs: es la red que avisa si una refactorización rompe algo. Por eso
// afirma sobre lo que el usuario ve —filas de la lista, detalle, estado vacío,
// aviso de error— y nunca sobre estructura interna (nombres de estado, clases
// de Tailwind, orden de los divs). Todo eso va a cambiar cuando el layout
// maestro-detalle se extraiga a <MasterDetail>, y el test debe seguir pasando.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeAssignment, makeEmployee, makeItem } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getAssignments: vi.fn(),
  getInventory: vi.fn(),
  getEmployees: vi.fn(),
  getAssignmentItems: vi.fn(),
}));

vi.mock('@/shared/api/inventoryService', async (importOriginal) => {
  // PartialWriteError se re-exporta real (no mockeada): useAssignmentManager.ts
  // hace `new PartialWriteError(...)` en sus catch de guardado parcial, y si
  // el mock no la exporta queda `undefined` ahí adentro — cualquier test que
  // fuerce esa ruta crashearía con "is not a constructor" en vez de probar el
  // manejo real.
  const actual = await importOriginal<typeof import('@/shared/api/inventoryService')>();
  return {
    ...actual,
    getAssignments: mocks.getAssignments,
    getInventory: mocks.getInventory,
    getEmployees: mocks.getEmployees,
    getAssignmentItems: mocks.getAssignmentItems,
    createAssignment: vi.fn(),
    createAssignmentWithItems: vi.fn(),
    updateAssignment: vi.fn(),
    createAssignmentEquipo: vi.fn(),
    updateInventoryItem: vi.fn(),
    getInventoryErrorMessage: (_e: unknown, fallback: string) => fallback,
  };
});

vi.mock('@/shared/api/photoServer', () => ({
  getLogoUrl: () => '/logo.png',
  getPhotoUrl: (f?: string) => (f ? `/fotos/${f}` : ''),
}));

import AssignmentManager from '@/features/asignaciones/AssignmentManager';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

const renderManager = () =>
  render(
    <CurrentUserProvider>
      <AssignmentManager />
    </CurrentUserProvider>,
  );

/**
 * La tabla de equipos que se ve en pantalla. Hace falta acotar porque el módulo
 * renderiza a la vez el acta imprimible (oculta con CSS, pero presente en el
 * DOM) con los mismos equipos, así que buscar por nombre suelto encuentra dos.
 * Se ancla en "Estado Actual", columna que solo existe en la tabla de pantalla.
 */
const tablaDeDetalle = async (): Promise<HTMLElement> =>
  (await screen.findByRole('columnheader', { name: 'Estado Actual' })).closest('table')!;

const ana = makeEmployee({ id: 'emp-ana', name: 'Ana Rojas', equipo: 'Redacción' });
const beto = makeEmployee({ id: 'emp-beto', name: 'Beto Suárez', equipo: 'Sistemas' });

const asigAna = makeAssignment({
  id: 'asg-ana',
  employeeId: 'emp-ana',
  employeeName: 'Ana Rojas',
  equipo: 'Redacción',
});
const asigBeto = makeAssignment({
  id: 'asg-beto',
  employeeId: 'emp-beto',
  employeeName: 'Beto Suárez',
  equipo: 'Sistemas',
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getAssignments.mockResolvedValue([asigAna, asigBeto]);
  mocks.getEmployees.mockResolvedValue([ana, beto]);
  mocks.getInventory.mockResolvedValue([makeItem({ name: 'Notebook Dell Latitude' })]);
  mocks.getAssignmentItems.mockResolvedValue([]);
});

describe('AssignmentManager', () => {
  it('monta y lista las asignaciones que devuelve el servicio', async () => {
    renderManager();

    expect(await screen.findByText('Ana Rojas')).toBeTruthy();
    expect(screen.getByText('Beto Suárez')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Asignaciones' })).toBeTruthy();
  });

  it('muestra el marcador de "sin selección" antes de elegir una asignación', async () => {
    renderManager();

    expect(await screen.findByText('Seleccione una asignación')).toBeTruthy();
  });

  it('al hacer clic en una asignación carga y muestra su detalle', async () => {
    const user = userEvent.setup();
    mocks.getAssignmentItems.mockResolvedValue([
      makeItem({ name: 'Cámara Canon R6', serie: 'CAM-99', assignedEmployeeId: 'emp-ana' }),
    ]);

    renderManager();
    await user.click(await screen.findByText('Ana Rojas'));

    // El detalle pide los equipos de esa asignación concreta, no de otra.
    await waitFor(() => expect(mocks.getAssignmentItems).toHaveBeenCalledWith('asg-ana'));
    expect(within(await tablaDeDetalle()).getByText('Cámara Canon R6')).toBeTruthy();
    expect(screen.queryByText('Seleccione una asignación')).toBeNull();
  });

  it('avisa cuando la asignación seleccionada no tiene equipos', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByText('Ana Rojas'));

    expect(await screen.findByText('No hay equipos asociados.')).toBeTruthy();
  });

  it('el buscador filtra la lista maestra', async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Ana Rojas');

    await user.type(screen.getByPlaceholderText('Buscar empleado...'), 'Beto');

    await waitFor(() => expect(screen.queryByText('Ana Rojas')).toBeNull());
    expect(screen.getByText('Beto Suárez')).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay asignaciones', async () => {
    mocks.getAssignments.mockResolvedValue([]);

    renderManager();

    expect(await screen.findByText('No hay asignaciones.')).toBeTruthy();
  });

  it('sin permiso de assignment.create, no se ve "Nueva Asignación"', async () => {
    // Antes cualquier rol (incluido CONSULTA, el que se resuelve por
    // defecto cuando no hay nadie elegido como "quién soy") podía crear una
    // asignación. assignment.create en permissions.ts lo limita a SISTEMAS/
    // ADMINISTRADOR.
    renderManager();
    await screen.findByText('Ana Rojas');

    expect(screen.queryByRole('button', { name: /Nueva Asignación/i })).toBeNull();
  });

  it('con rol SISTEMAS, "Nueva Asignación" abre el formulario con el selector de equipos', async () => {
    mocks.getEmployees.mockResolvedValue([
      ana,
      beto,
      makeEmployee({ id: 'emp-sistemas', name: 'Sofía Sistemas', rawRole: 'Sistemas' }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-sistemas');

    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Ana Rojas');

    await user.click(screen.getByRole('button', { name: /Nueva Asignación/i }));

    expect(await screen.findByText('Seleccionar Equipos')).toBeTruthy();
    // El equipo del inventario aparece como opción seleccionable.
    expect(screen.getByText('Notebook Dell Latitude')).toBeTruthy();
  });

  it('el acta imprimible lleva los datos y las dos firmas', async () => {
    const user = userEvent.setup();
    mocks.getAssignmentItems.mockResolvedValue([
      makeItem({ name: 'Cámara Canon R6', serie: 'CAM-99', assignedEmployeeId: 'emp-ana' }),
    ]);

    const { container } = renderManager();
    await user.click(await screen.findByText('Ana Rojas'));
    await tablaDeDetalle();

    const hoja = container.querySelector('.print-area') as HTMLElement;
    expect(within(hoja).getByRole('heading', { name: 'Acta de Asignación' })).toBeTruthy();
    expect(within(hoja).getByText('Cámara Canon R6')).toBeTruthy();
    expect(within(hoja).getByText('Recibí conforme')).toBeTruthy();
    expect(within(hoja).getByText('Entregué conforme')).toBeTruthy();
    // La numeración de filas la pone la tabla, no el módulo.
    expect(within(hoja).getByText('1')).toBeTruthy();
  });

  it('un fallo de carga no deja la pantalla colgada en "Cargando"', async () => {
    mocks.getAssignments.mockRejectedValue(new Error('red caída'));

    renderManager();

    await waitFor(() => expect(screen.queryByText('Cargando...')).toBeNull());
    // La cabecera sigue en pie: el módulo no se rompe entero por un fallo de red.
    expect(screen.getByRole('heading', { name: 'Asignaciones' })).toBeTruthy();
  });

  it('la tabla de detalle marca los equipos reasignados a otra persona', async () => {
    const user = userEvent.setup();
    mocks.getAssignmentItems.mockResolvedValue([
      makeItem({
        name: 'Trípode Manfrotto',
        assignedEmployeeId: 'emp-beto',
        assignedEmployeeName: 'Beto Suárez',
      }),
    ]);

    renderManager();
    await user.click(await screen.findByText('Ana Rojas'));

    const fila = within(await tablaDeDetalle()).getByText('Trípode Manfrotto').closest('tr')!;
    expect(within(fila).getByText(/Reasignado a Beto Suárez/)).toBeTruthy();
  });
});
