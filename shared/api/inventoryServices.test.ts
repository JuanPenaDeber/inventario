// =============================================================================
// Tests de la capa de servicios de inventario, préstamos y asignaciones.
//
// Lo que se prueba aquí es el CONTRATO DE ERRORES, que es la decisión más
// consecuente de este lado de la aplicación y la que más fácil se revierte sin
// querer al refactorizar:
//
//   · las LECTURAS caen a datos de respaldo cuando la red falla;
//   · las ESCRITURAS siempre lanzan.
//
// Y la regla que lo hace seguro: una escritura fallida NO debe devolver un id
// inventado. Ese fue el bug que perdía datos en silencio, y es exactamente lo
// que un `catch` mal puesto reintroduce.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // El servicio avisa por consola cuando cae al respaldo; en los tests solo
  // ensucia la salida.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Respuesta HTTP correcta con el cuerpo dado. */
const ok = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

/** Respuesta de error del servidor. */
const fail = (status = 500) =>
  ({
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => '',
  }) as unknown as Response;

describe('contrato de errores en LECTURAS', () => {
  it('getInventory devuelve datos de respaldo si la red falla', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { getInventory } = await import('@/shared/api/catalogService');

    const items = await getInventory();

    // Una pantalla de inventario en blanco es peor que una con datos de
    // ejemplo: la lectura no lanza (ver cabecera de inventoryClient.ts).
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('getEmployees y getProviders también caen al respaldo', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { getEmployees, getProviders } = await import('@/shared/api/catalogService');

    await expect(getEmployees()).resolves.toBeInstanceOf(Array);
    await expect(getProviders()).resolves.toBeInstanceOf(Array);
  });

  it('getLoans devuelve lista vacía si la red falla, no lanza', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { getLoans } = await import('@/shared/api/loanService');

    await expect(getLoans()).resolves.toEqual([]);
  });

  it('getAssignments devuelve lista vacía si la red falla, no lanza', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { getAssignments } = await import('@/shared/api/assignmentService');

    await expect(getAssignments()).resolves.toEqual([]);
  });
});

describe('contrato de errores en ESCRITURAS', () => {
  it('addInventoryItem lanza cuando el servidor responde 500', async () => {
    fetchMock.mockResolvedValue(fail(500));
    const { addInventoryItem } = await import('@/shared/api/catalogService');

    await expect(
      addInventoryItem({
        name: 'Notebook',
        category: 'Computadoras',
        serie: 'SN-1',
        status: 'Activo',
        condition: 'Bueno',
        location: 'Redacción',
        fechaCompra: '2025-03-14',
      }),
    ).rejects.toThrow();
  });

  it('addInventoryItem NO devuelve un id inventado al fallar', async () => {
    // Este es el bug que perdía datos: la escritura fallaba, el servicio
    // devolvía un objeto con un id tipo `local-…`, y la pantalla mostraba el
    // registro como guardado. Nunca debe volver a devolver un valor aquí.
    fetchMock.mockResolvedValue(fail(500));
    const { addInventoryItem } = await import('@/shared/api/catalogService');

    const resultado = await addInventoryItem({
      name: 'Notebook',
      category: 'Computadoras',
      serie: 'SN-1',
      status: 'Activo',
      condition: 'Bueno',
      location: 'Redacción',
      fechaCompra: '2025-03-14',
    }).catch((e) => e);

    expect(resultado).toBeInstanceOf(Error);
  });

  it('addEmployee lanza cuando el servidor responde 500', async () => {
    fetchMock.mockResolvedValue(fail(500));
    const { addEmployee } = await import('@/shared/api/catalogService');

    await expect(addEmployee('Ana Rojas', 'Redacción')).rejects.toThrow();
  });

  it('addProvider lanza cuando el servidor responde 500', async () => {
    fetchMock.mockResolvedValue(fail(500));
    const { addProvider } = await import('@/shared/api/catalogService');

    await expect(
      addProvider({ name: 'Importadora', contactPerson: 'Luis', email: 'a@b.test', phone: '777' }),
    ).rejects.toThrow();
  });

  it('createLoan lanza y no devuelve un préstamo falso', async () => {
    fetchMock.mockResolvedValue(fail(500));
    const { createLoan } = await import('@/shared/api/loanService');

    await expect(createLoan({ name: 'Préstamo X', itemIds: [] })).rejects.toThrow();
  });

  it('createAssignment lanza y no devuelve una asignación falsa', async () => {
    fetchMock.mockResolvedValue(fail(500));
    const { createAssignment } = await import('@/shared/api/assignmentService');

    await expect(createAssignment({ employeeName: 'Ana', itemIds: [] })).rejects.toThrow();
  });
});

describe('getInventoryErrorMessage', () => {
  it('explica un 403 mencionando el rol del usuario API', async () => {
    const { getInventoryErrorMessage, InventoryApiError } = await import(
      '@/shared/api/inventoryClient'
    );

    const msg = getInventoryErrorMessage(new InventoryApiError('Forbidden', 403), 'Falló.');

    expect(msg).toMatch(/permiso/i);
    expect(msg).toMatch(/EspoCRM/);
  });

  it('explica un 404 diciendo que el registro ya no existe', async () => {
    const { getInventoryErrorMessage, InventoryApiError } = await import(
      '@/shared/api/inventoryClient'
    );

    expect(getInventoryErrorMessage(new InventoryApiError('Not Found', 404), 'Falló.')).toMatch(
      /ya no existe/i,
    );
  });

  it('explica un timeout, que es distinto de un error del servidor', async () => {
    const { getInventoryErrorMessage } = await import('@/shared/api/inventoryClient');
    const abort = new DOMException('The operation was aborted.', 'AbortError');

    expect(getInventoryErrorMessage(abort, 'Falló.')).toMatch(/tardó demasiado/i);
  });

  it('un fallo de red suelto se queda con el mensaje de respaldo del llamador', async () => {
    // A propósito: el llamador conoce mejor el contexto ("No se pudo guardar
    // el préstamo") que un mensaje genérico de red puesto aquí.
    const { getInventoryErrorMessage } = await import('@/shared/api/inventoryClient');

    expect(getInventoryErrorMessage(new TypeError('Failed to fetch'), 'No se pudo guardar.')).toBe(
      'No se pudo guardar.',
    );
  });

  it('usa el mensaje de respaldo cuando el error no dice nada útil', async () => {
    const { getInventoryErrorMessage } = await import('@/shared/api/inventoryClient');

    expect(getInventoryErrorMessage({}, 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });
});

describe('caché compartida entre lecturas', () => {
  it('dos lecturas seguidas del inventario hacen una sola petición', async () => {
    fetchMock.mockResolvedValue(ok({ list: [], total: 0 }));
    const { getInventory } = await import('@/shared/api/catalogService');

    await getInventory();
    const llamadasTrasLaPrimera = fetchMock.mock.calls.length;
    await getInventory();

    expect(fetchMock.mock.calls.length).toBe(llamadasTrasLaPrimera);
  });

  it('una escritura invalida la caché y la siguiente lectura vuelve a pedir', async () => {
    // La invalidación vive en `rawRequest`: cualquier método distinto de GET
    // la dispara. Si eso se pierde, la pantalla sigue mostrando datos previos
    // al guardado durante 60 segundos.
    fetchMock.mockResolvedValue(ok({ list: [], total: 0 }));
    const { getInventory, deleteInventoryItem } = await import('@/shared/api/catalogService');

    await getInventory();
    const antes = fetchMock.mock.calls.length;

    await deleteInventoryItem('item-1');
    await getInventory();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(antes + 1);
  });
});
