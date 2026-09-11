// =============================================================================
// Tests de CurrentUserContext.
//
// Cubre lo que reemplaza al viejo "Actuando como" de Compras: antes el rol se
// ELEGÍA de un desplegable (cualquiera podía marcarse JEFE); ahora se
// RESUELVE a partir de quién se elige como "quién soy". Estos tests fijan esa
// diferencia — que `role` sigue a `currentEmployeeId`, no al revés — y que la
// selección persiste entre montajes igual que lo hacía antes.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { makeEmployee } from '@/shared/test/fixtures';

const mocks = vi.hoisted(() => ({
  getEmployees: vi.fn(),
}));

vi.mock('@/shared/api/inventoryService', () => ({
  getEmployees: mocks.getEmployees,
}));

import { CurrentUserProvider, useCurrentUser } from '@/shared/auth/CurrentUserContext';

const ana = makeEmployee({ id: 'emp-ana', name: 'Ana Rojas' }); // sin rol → CONSULTA
const beto = makeEmployee({ id: 'emp-beto', name: 'Beto Suárez', rawRole: 'Jefe de Sistemas' }); // JEFE, vía EspoCRM

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CurrentUserProvider>{children}</CurrentUserProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.getEmployees.mockResolvedValue([ana, beto]);
});

describe('useCurrentUser', () => {
  it('lanza si se usa fuera del Provider', () => {
    // Mejor un error claro al montar que un `role` filtrándose en `undefined`
    // hasta una pantalla.
    const espiaConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCurrentUser())).toThrow(/CurrentUserProvider/);
    espiaConsola.mockRestore();
  });

  it('sin nadie elegido, el rol es CONSULTA (el de menor privilegio)', async () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    expect(result.current.currentEmployee).toBeNull();
    expect(result.current.role).toBe('CONSULTA');
  });

  it('trae la lista de empleados una sola vez, reusando la caché compartida', async () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.employees).toHaveLength(2));

    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
  });

  it('refreshEmployees() vuelve a pedir la lista y actualiza employees', async () => {
    // Regresión real: employees se traía una sola vez al montar y nunca se
    // volvía a pedir — un empleado creado durante la sesión no aparecía para
    // elegirlo como "quién soy" hasta recargar la página entera.
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    const carla = makeEmployee({ id: 'emp-carla', name: 'Carla Nueva' });
    mocks.getEmployees.mockResolvedValue([ana, beto, carla]);

    act(() => result.current.refreshEmployees());

    await waitFor(() => expect(result.current.employees).toHaveLength(3));
    expect(result.current.employees.map((e) => e.name)).toContain('Carla Nueva');
  });

  it('addEmployeeToList() agrega sin esperar un refetch (usado por "Nuevo Empleado" rápido)', async () => {
    // Los módulos que crean un empleado (ej. Préstamos) ya tienen el registro
    // completo que devolvió EspoCRM — addEmployeeToList lo suma de una, sin
    // depender de que el próximo getEmployees() ya lo incluya.
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    const dario = makeEmployee({ id: 'emp-dario', name: 'Darío Nuevo' });
    act(() => result.current.addEmployeeToList(dario));

    expect(result.current.employees).toHaveLength(3);
    expect(result.current.employees.map((e) => e.name)).toContain('Darío Nuevo');
    expect(mocks.getEmployees).toHaveBeenCalledTimes(1); // no hizo falta pedir nada de nuevo
  });

  it('al elegir a alguien, el rol se RESUELVE — no se elige aparte', async () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    act(() => result.current.setCurrentEmployeeId('emp-beto'));

    expect(result.current.currentEmployee?.name).toBe('Beto Suárez');
    // "Jefe de Sistemas" en EspoCRM se interpreta como JEFE — nadie lo eligió
    // de un desplegable, salió del dato.
    expect(result.current.role).toBe('JEFE');
  });

  it('cambiar de "quién soy" cambia el rol solo, sin acción aparte', async () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    act(() => result.current.setCurrentEmployeeId('emp-beto'));
    expect(result.current.role).toBe('JEFE');

    act(() => result.current.setCurrentEmployeeId('emp-ana'));
    expect(result.current.role).toBe('CONSULTA'); // Ana no tiene rawRole ni está en la tabla local
  });

  it('recuerda "quién soy" entre montajes (sessionStorage)', async () => {
    sessionStorage.setItem('app.currentEmployeeId', 'emp-beto');

    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    expect(result.current.currentEmployeeId).toBe('emp-beto');
    expect(result.current.role).toBe('JEFE');
  });

  it('can() queda atado al rol actual, sin tener que pasarlo en cada llamada', async () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    act(() => result.current.setCurrentEmployeeId('emp-beto')); // JEFE

    expect(result.current.can('purchaseRequest.approve')).toBe(true);
    expect(result.current.can('inventory.delete')).toBe(false);
  });

  it('un id que no está en la lista de empleados no rompe nada: queda "sin elegir"', async () => {
    // Puede pasar si sessionStorage tiene un id de un empleado que ya no
    // existe (se borró, o se cargó de otro entorno).
    sessionStorage.setItem('app.currentEmployeeId', 'emp-que-no-existe');

    const { result } = renderHook(() => useCurrentUser(), { wrapper });
    await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

    expect(result.current.currentEmployee).toBeNull();
    expect(result.current.role).toBe('CONSULTA');
  });
});
