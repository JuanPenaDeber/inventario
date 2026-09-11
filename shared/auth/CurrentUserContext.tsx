// =============================================================================
// "Quién soy": identidad y rol, disponibles en toda la app.
//
// Sin login real todavía, "quién soy" sigue siendo una persona eligiéndose a
// sí misma de una lista — eso no cambia acá. Lo que SÍ cambia es que antes
// (sólo en Compras, con "Actuando como") la persona TAMBIÉN elegía su propio
// rol de un desplegable: cualquiera podía marcarse JEFE y aprobar cualquier
// solicitud. Ahora el rol se RESUELVE (resolveRole: EspoCRM, después la
// tabla local por nombre) — se elige la persona, no el poder que tiene.
//
// Es un Context deliberado, no el "no hay estado compartido" que rige el
// resto de la app (ver ARCHITECTURE.md): la identidad del que está usando el
// navegador es, por naturaleza, algo que necesita leerse desde cualquier
// punto del árbol sin pasarlo por props módulo por módulo. Es la única
// excepción, y es la categoría de estado para la que React Context existe.
//
// El día que haya login real, este archivo es el único que cambia: en vez de
// leer `currentEmployeeId` de una lista elegida a mano, lo tomaría de la
// sesión autenticada. Todo lo que consume `useCurrentUser()` — los 6 roles,
// `can()`, los formularios — sigue exactamente igual.
// =============================================================================

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ROLE, Employee, Role } from '@/types';
import { getEmployees } from '@/shared/api/inventoryService';
import { resolveRole } from '@/shared/auth/roleResolution';
import { can as checkPermission, Operation } from '@/shared/auth/permissions';

const STORAGE_KEY = 'app.currentEmployeeId';

interface CurrentUserContextValue {
  employees: Employee[];
  loadingEmployees: boolean;
  /** Id del empleado elegido como "quién soy". Cadena vacía = nadie elegido todavía. */
  currentEmployeeId: string;
  setCurrentEmployeeId: (id: string) => void;
  currentEmployee: Employee | null;
  /** Resuelto a partir de currentEmployee — ver shared/auth/roleResolution.ts. */
  role: Role;
  /** `can('inventory.delete')` — atado al rol actual, sin tener que pasarlo cada vez. */
  can: (operation: Operation, opts?: { isOwn?: boolean }) => boolean;
  /**
   * Vuelve a pedir la lista de empleados. `employees` se trae una sola vez al
   * montar la app — un empleado creado durante la sesión (ej. "Nuevo Empleado"
   * en Préstamos) no aparecía acá para elegirlo como "quién soy" hasta
   * recargar la página, aunque la caché de shared/api/cache.ts ya estuviera al
   * día. `CurrentUserBar` la llama al abrir el desplegable — barato: si nada
   * cambió, getEmployees() sirve desde la misma caché de 60s.
   */
  refreshEmployees: () => void;
  /**
   * Agrega un empleado recién creado a la lista, sin esperar un refetch.
   * Los módulos que crean un empleado "rápido" (ej. Préstamos, "Nuevo
   * Empleado") ya tienen el registro completo que devolvió EspoCRM — no hace
   * falta pedirlo de nuevo para que aparezca, ni en su propio desplegable ni
   * en el resto de la app que ahora comparte esta misma lista.
   */
  addEmployeeToList: (employee: Employee) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export const CurrentUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [currentEmployeeId, setCurrentEmployeeIdState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  // Un solo fetch AL MONTAR: getEmployees() ya cachea (shared/api/cache.ts),
  // así que esto no agrega una petición nueva si algún módulo ya la disparó —
  // comparte la misma caché de 60s. `refreshEmployees` (expuesta abajo) cubre
  // el resto de la sesión, para no quedar con una lista congelada en lo que
  // había al abrir la app.
  useEffect(() => {
    let cancelled = false;
    getEmployees()
      .then((list) => {
        if (!cancelled) setEmployees(list);
      })
      .finally(() => {
        if (!cancelled) setLoadingEmployees(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshEmployees = () => {
    getEmployees().then((list) => setEmployees(list));
  };

  const addEmployeeToList = (employee: Employee) => {
    setEmployees((prev) => [...prev, employee]);
  };

  const setCurrentEmployeeId = (id: string) => {
    setCurrentEmployeeIdState(id);
    try {
      // sessionStorage y no localStorage: "quién soy" se olvida al cerrar la
      // pestaña, a propósito — no es una sesión real (mismo criterio que
      // tenía el "Actuando como" que esto reemplaza).
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin persistencia si sessionStorage no está disponible; no es crítico.
    }
  };

  const currentEmployee = useMemo(
    () => employees.find((e) => e.id === currentEmployeeId) || null,
    [employees, currentEmployeeId],
  );

  const role = useMemo(
    () => (currentEmployee ? resolveRole(currentEmployee) : DEFAULT_ROLE),
    [currentEmployee],
  );

  const value = useMemo<CurrentUserContextValue>(
    () => ({
      employees,
      loadingEmployees,
      currentEmployeeId,
      setCurrentEmployeeId,
      currentEmployee,
      role,
      can: (operation, opts) => checkPermission(role, operation, opts),
      refreshEmployees,
      addEmployeeToList,
    }),
    [employees, loadingEmployees, currentEmployeeId, currentEmployee, role],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
};

/**
 * Lee la identidad y el rol actuales desde cualquier componente. Lanza si se
 * usa fuera de `<CurrentUserProvider>` — mejor un error claro al montar que
 * un `role` en `undefined` filtrándose en silencio hasta una pantalla.
 */
export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error(
      'useCurrentUser() se usó fuera de <CurrentUserProvider>. Verificá que index.tsx envuelva <App /> con el provider.',
    );
  }
  return ctx;
}
