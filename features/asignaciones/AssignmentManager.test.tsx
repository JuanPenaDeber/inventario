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
  unassignInventoryItem: vi.fn(),
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
    unassignInventoryItem: mocks.unassignInventoryItem,
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

  it('pide la lista de empleados una sola vez (la comparte con "Quién soy", no la duplica)', async () => {
    // Regresión real: useAssignmentManager tenía su propia copia de
    // empleados, pedida por separado de CurrentUserContext.
    renderManager();
    await screen.findByText('Ana Rojas');

    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
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

  it('si se cambia de selección antes de que responda la primera, no pisa el detalle de la segunda', async () => {
    // Regresión real: el efecto que trae los equipos de la asignación
    // seleccionada no tenía guarda contra respuestas fuera de orden. Si A
    // (Ana) se selecciona primero pero su respuesta llega DESPUÉS que la de
    // B (Beto, seleccionada después), el detalle terminaba mostrando los
    // equipos de A con B todavía seleccionada.
    const user = userEvent.setup();
    let resolveAna: (items: ReturnType<typeof makeItem>[]) => void;
    const anaPromise = new Promise<ReturnType<typeof makeItem>[]>((resolve) => {
      resolveAna = resolve;
    });
    mocks.getAssignmentItems.mockImplementation((id: string) => {
      if (id === 'asg-ana') return anaPromise;
      return Promise.resolve([makeItem({ name: 'Trípode Manfrotto', serie: 'TRI-1' })]);
    });

    renderManager();
    await user.click(await screen.findByText('Ana Rojas')); // dispara la petición de Ana, que queda pendiente
    await user.click(await screen.findByText('Beto Suárez')); // selecciona a Beto, cuya petición SÍ resuelve
    await waitFor(() =>
      expect(within(document.body).getAllByText('Trípode Manfrotto').length).toBeGreaterThan(0),
    );

    // Recién ahora "llega" la respuesta vieja de Ana.
    resolveAna!([makeItem({ name: 'Cámara Canon R6', serie: 'CAM-99' })]);
    await new Promise((r) => setTimeout(r, 0));

    // Beto sigue seleccionado: su equipo debe seguir en la tabla de pantalla,
    // no el de Ana (acotado a la tabla de detalle: el acta imprimible
    // también está en el DOM con los mismos equipos).
    const tabla = await tablaDeDetalle();
    expect(within(tabla).queryByText('Cámara Canon R6')).toBeNull();
    expect(within(tabla).getByText('Trípode Manfrotto')).toBeTruthy();
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

    // Regresión real: el campo de fecha tenía estilo de "bloqueado" pero era
    // editable y sin valor por defecto — quedaba vacío en silencio si nadie
    // lo tocaba. Ahora viene precargado con la fecha de hoy, como en Préstamos.
    const fechaInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(fechaInput.value).not.toBe('');
    expect(fechaInput.hasAttribute('readonly')).toBe(false);
    expect(fechaInput.disabled).toBe(false);
  });

  it('editar una asignación con fecha en formato datetime completo no deja el campo vacío', async () => {
    // Regresión real: handleEditStart asignaba `selectedAssignment.fecha` tal
    // cual, sin normalizar a YYYY-MM-DD (a diferencia de Préstamos). Si
    // EspoCRM devuelve un datetime completo en vez de solo fecha,
    // <input type="date"> queda vacío en el navegador aunque el estado de
    // React sí tenga un valor — y al ser `required`, bloquea guardar sin
    // ningún aviso visible de por qué.
    mocks.getEmployees.mockResolvedValue([
      ana,
      beto,
      makeEmployee({ id: 'emp-sistemas', name: 'Sofía Sistemas', rawRole: 'Sistemas' }),
    ]);
    mocks.getAssignments.mockResolvedValue([
      makeAssignment({
        id: 'asg-datetime',
        employeeId: 'emp-ana',
        employeeName: 'Ana Rojas',
        equipo: 'Redacción',
        fecha: '2025-03-14T15:30:00.000Z',
      }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-sistemas');

    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByText('Ana Rojas'));
    await user.click(await screen.findByTitle('Editar Asignación'));

    await screen.findByText('Seleccionar Equipos');
    const fechaInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(fechaInput.value).not.toBe('');
    expect(fechaInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  it('sin permiso de inventory.unassign, no se ve el botón de desasignar', async () => {
    // Antes no había NINGÚN botón que use este permiso — inventory.unassign
    // existía en permissions.ts pero no protegía nada real.
    const user = userEvent.setup();
    mocks.getAssignmentItems.mockResolvedValue([
      makeItem({ name: 'Cámara Canon R6', assignedEmployeeId: 'emp-ana', assignedEmployeeName: 'Ana Rojas' }),
    ]);

    renderManager();
    await user.click(await screen.findByText('Ana Rojas'));
    await tablaDeDetalle();

    expect(screen.queryByTitle('Desasignar equipo')).toBeNull();
  });

  it('con rol ADMINISTRADOR, desasignar un equipo llama a unassignInventoryItem y refresca el detalle', async () => {
    mocks.getEmployees.mockResolvedValue([
      ana,
      beto,
      makeEmployee({ id: 'emp-admin', name: 'Ana Admin', rawRole: 'Administrador' }),
    ]);
    sessionStorage.setItem('app.currentEmployeeId', 'emp-admin');
    mocks.getAssignmentItems.mockResolvedValue([
      makeItem({ id: 'item-1', name: 'Cámara Canon R6', assignedEmployeeId: 'emp-ana', assignedEmployeeName: 'Ana Rojas' }),
    ]);
    mocks.unassignInventoryItem.mockResolvedValue(null);

    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByText('Ana Rojas'));
    await tablaDeDetalle();

    await user.click(screen.getByTitle('Desasignar equipo'));
    expect(await screen.findByText(/Desasignar "Cámara Canon R6"/)).toBeTruthy();

    // Tras confirmar, el detalle se recarga — la segunda llamada a
    // getAssignmentItems ya sin el equipo devuelve la lista al día.
    mocks.getAssignmentItems.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Desasignar' }));

    await waitFor(() => expect(mocks.unassignInventoryItem).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(mocks.getAssignmentItems).toHaveBeenCalledTimes(2));
  });
});
