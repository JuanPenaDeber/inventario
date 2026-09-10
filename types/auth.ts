// =============================================================================
// Roles de la aplicación entera.
//
// Antes de esto, el único rol que existía era `PurchaseFlowRole` (en
// purchaseRequests.ts), y sólo dentro de Compras: Inventario, Préstamos,
// Asignaciones e Incidencias no tenían ningún concepto de rol, y cualquiera
// podía hacer cualquier cosa. `Role` cubre la aplicación entera; los cuatro
// valores que ya existían quedan igual, para no romper nada de Compras.
// =============================================================================

export type Role = 'CONSULTA' | 'SISTEMAS' | 'SOLICITANTE' | 'JEFE' | 'COMPRAS' | 'ADMINISTRADOR';

export const ROLES: Role[] = ['CONSULTA', 'SISTEMAS', 'SOLICITANTE', 'JEFE', 'COMPRAS', 'ADMINISTRADOR'];

/** Nombre para mostrar en la interfaz — "Encargado de Sistemas" en vez de "SISTEMAS". */
export const ROLE_LABEL: Record<Role, string> = {
  CONSULTA: 'Consulta',
  SISTEMAS: 'Sistemas',
  SOLICITANTE: 'Solicitante',
  JEFE: 'Jefe',
  COMPRAS: 'Compras',
  ADMINISTRADOR: 'Administrador',
};

/**
 * Rol por defecto para un empleado que no se pudo resolver por ningún medio
 * (ni EspoCRM, ni la tabla local por nombre). CONSULTA y no SOLICITANTE:
 * ante la duda, ver sin poder tocar nada es el error más barato de los dos.
 */
export const DEFAULT_ROLE: Role = 'CONSULTA';
