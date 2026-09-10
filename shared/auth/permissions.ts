// =============================================================================
// Quién puede qué.
//
// Es la matriz de 28 operaciones × 6 roles diseñada en la revisión de
// permisos, ahora como datos en vez de estar sólo en un documento. Antes de
// esto, Compras tenía 14 comprobaciones `canX` sueltas repetidas por los
// componentes, e Inventario, Préstamos, Asignaciones e Incidencias no tenían
// NINGUNA — cualquiera podía borrar un equipo o crear un empleado.
//
// Esta es la capa "blanda" (de interfaz) de la que habla el documento de
// permisos: EspoCRM sigue siendo la única protección real una vez que haya
// login por persona (ver ARCHITECTURE.md y shared/auth/roleResolution.ts).
// Lo de acá evita errores honestos y ordena qué se ve — no reemplaza la ACL
// del servidor.
// =============================================================================

import { Role } from '@/types';

export type Operation =
  // Inventario (CEquipo)
  | 'inventory.view'
  | 'inventory.create'
  | 'inventory.edit'
  | 'inventory.delete'
  | 'inventory.unassign'
  // Catálogos
  | 'provider.manage'
  | 'employee.create'
  // Pañol (CPrestamo)
  | 'loan.view'
  | 'loan.create'
  | 'loan.edit'
  | 'loan.return'
  // Asignaciones (CAsignacion)
  | 'assignment.view'
  | 'assignment.create'
  | 'assignment.edit'
  // Solicitudes de Compra (CSolicitudCompra)
  | 'purchaseRequest.view'
  | 'purchaseRequest.create'
  | 'purchaseRequest.editDraft'
  | 'purchaseRequest.submit'
  | 'purchaseRequest.cancel'
  | 'purchaseRequest.approve'
  | 'purchaseRequest.reject'
  | 'purchaseRequest.startQuotation'
  | 'purchaseRequest.markQuoted'
  | 'purchaseRequest.selectProforma'
  | 'purchaseRequest.generateOrder'
  | 'purchaseRequest.finalize'
  // Proformas y Órdenes de Compra
  | 'proforma.manage'
  | 'order.manage'
  | 'order.cancel'
  | 'order.receive'
  // Incidencias y ajustes
  | 'incident.create'
  | 'incident.manage'
  | 'suggestions.manage';

interface Rule {
  /** Roles que pueden hacer esto sobre CUALQUIER registro. */
  roles: Role[];
  /**
   * Roles que además pueden hacerlo, pero SOLO sobre lo que crearon ellos
   * mismos — típicamente el propio Solicitante sobre su solicitud en
   * BORRADOR. `can()` sólo los deja pasar si se le pasa `{ isOwn: true }`.
   */
  ownRoles?: Role[];
}

const ALL: Role[] = ['CONSULTA', 'SISTEMAS', 'SOLICITANTE', 'JEFE', 'COMPRAS', 'ADMINISTRADOR'];

const RULES: Record<Operation, Rule> = {
  // --- Inventario ---
  'inventory.view': { roles: ALL },
  'inventory.create': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },
  'inventory.edit': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },
  'inventory.delete': { roles: ['ADMINISTRADOR'] },
  'inventory.unassign': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },

  // --- Catálogos ---
  'provider.manage': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'employee.create': { roles: ['ADMINISTRADOR'] },

  // --- Pañol ---
  'loan.view': { roles: ALL },
  'loan.create': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },
  'loan.edit': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },
  'loan.return': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },

  // --- Asignaciones ---
  'assignment.view': { roles: ALL },
  'assignment.create': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },
  'assignment.edit': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },

  // --- Solicitudes de Compra ---
  // Ver: el Solicitante sólo ve las propias — no tiene sentido que un
  // empleado navegue las solicitudes de otro. El resto ve todas.
  'purchaseRequest.view': {
    roles: ['CONSULTA', 'SISTEMAS', 'JEFE', 'COMPRAS', 'ADMINISTRADOR'],
    ownRoles: ['SOLICITANTE'],
  },
  'purchaseRequest.create': {
    roles: ['SISTEMAS', 'SOLICITANTE', 'JEFE', 'COMPRAS', 'ADMINISTRADOR'],
  },
  // Editar/enviar/cancelar sólo aplica mientras la solicitud sigue en
  // BORRADOR y es la propia — eso ya lo valida el flujo de estados aparte
  // (ver purchaseRequestService.ts); acá sólo se decide QUIÉN puede tocarla.
  'purchaseRequest.editDraft': {
    roles: ['ADMINISTRADOR'],
    ownRoles: ['SISTEMAS', 'SOLICITANTE', 'JEFE', 'COMPRAS'],
  },
  'purchaseRequest.submit': {
    roles: ['ADMINISTRADOR'],
    ownRoles: ['SISTEMAS', 'SOLICITANTE', 'JEFE', 'COMPRAS'],
  },
  'purchaseRequest.cancel': {
    roles: ['ADMINISTRADOR'],
    ownRoles: ['SISTEMAS', 'SOLICITANTE', 'JEFE', 'COMPRAS'],
  },
  'purchaseRequest.approve': { roles: ['JEFE', 'ADMINISTRADOR'] },
  'purchaseRequest.reject': { roles: ['JEFE', 'ADMINISTRADOR'] },
  'purchaseRequest.startQuotation': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'purchaseRequest.markQuoted': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'purchaseRequest.selectProforma': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'purchaseRequest.generateOrder': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'purchaseRequest.finalize': { roles: ['COMPRAS', 'ADMINISTRADOR'] },

  // --- Proformas y Órdenes ---
  'proforma.manage': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'order.manage': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'order.cancel': { roles: ['COMPRAS', 'ADMINISTRADOR'] },
  'order.receive': { roles: ['SISTEMAS', 'COMPRAS', 'ADMINISTRADOR'] },

  // --- Incidencias y ajustes ---
  'incident.create': { roles: ALL },
  'incident.manage': { roles: ['SISTEMAS', 'ADMINISTRADOR'] },
  'suggestions.manage': { roles: ['ADMINISTRADOR'] },
};

/**
 * ¿Puede `role` hacer `operation`? Pasá `{ isOwn: true }` cuando el registro
 * en cuestión es del propio actor (por ejemplo, una solicitud que él mismo
 * creó) — sin eso, las operaciones con `ownRoles` se evalúan como si el
 * registro fuera de otra persona.
 */
export function can(role: Role, operation: Operation, opts?: { isOwn?: boolean }): boolean {
  const rule = RULES[operation];
  if (rule.roles.includes(role)) return true;
  if (opts?.isOwn && rule.ownRoles?.includes(role)) return true;
  return false;
}
