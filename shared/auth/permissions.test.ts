// =============================================================================
// Tests de can() — fija la matriz de 28 operaciones × 6 roles entera.
//
// EXPECTED de abajo está escrito de forma independiente a permissions.ts (no
// se derivó copiando RULES): es la matriz tal como se diseñó en la revisión de
// permisos. Si alguien cambia una regla sin querer, este test dice
// exactamente qué operación y qué rol dejaron de coincidir con lo acordado —
// no sólo "algo falló".
// =============================================================================

import { describe, it, expect } from 'vitest';
import { can, Operation } from '@/shared/auth/permissions';
import { Role, ROLES } from '@/types';

/** Rol → puede hacerlo sobre cualquier registro | sólo sobre lo propio | no puede. */
type Expected = Partial<Record<Role, 'all' | 'own' | 'no'>>;

// Por operación, lo que cada uno de los 6 roles debería poder hacer. Un rol
// ausente de la lista se entiende como 'no' — así una fila corta no oculta
// un permiso de más que alguien agregó sin querer.
const EXPECTED: Record<Operation, Expected> = {
  'inventory.view': { CONSULTA: 'all', SISTEMAS: 'all', SOLICITANTE: 'all', JEFE: 'all', COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'inventory.create': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },
  'inventory.edit': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },
  'inventory.delete': { ADMINISTRADOR: 'all' },
  'inventory.unassign': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },

  'provider.manage': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'employee.create': { ADMINISTRADOR: 'all' },

  'loan.view': { CONSULTA: 'all', SISTEMAS: 'all', SOLICITANTE: 'all', JEFE: 'all', COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'loan.create': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },
  'loan.edit': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },
  'loan.return': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },

  'assignment.view': { CONSULTA: 'all', SISTEMAS: 'all', SOLICITANTE: 'all', JEFE: 'all', COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'assignment.create': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },
  'assignment.edit': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },

  'purchaseRequest.view': { CONSULTA: 'all', SISTEMAS: 'all', SOLICITANTE: 'own', JEFE: 'all', COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.create': { SISTEMAS: 'all', SOLICITANTE: 'all', JEFE: 'all', COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.editDraft': { SISTEMAS: 'own', SOLICITANTE: 'own', JEFE: 'own', COMPRAS: 'own', ADMINISTRADOR: 'all' },
  'purchaseRequest.submit': { SISTEMAS: 'own', SOLICITANTE: 'own', JEFE: 'own', COMPRAS: 'own', ADMINISTRADOR: 'all' },
  'purchaseRequest.cancel': { SISTEMAS: 'own', SOLICITANTE: 'own', JEFE: 'own', COMPRAS: 'own', ADMINISTRADOR: 'all' },
  'purchaseRequest.approve': { JEFE: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.reject': { JEFE: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.startQuotation': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.markQuoted': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.selectProforma': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.generateOrder': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'purchaseRequest.finalize': { COMPRAS: 'all', ADMINISTRADOR: 'all' },

  'proforma.manage': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'order.manage': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'order.cancel': { COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'order.receive': { SISTEMAS: 'all', COMPRAS: 'all', ADMINISTRADOR: 'all' },

  'incident.create': { CONSULTA: 'all', SISTEMAS: 'all', SOLICITANTE: 'all', JEFE: 'all', COMPRAS: 'all', ADMINISTRADOR: 'all' },
  'incident.manage': { SISTEMAS: 'all', ADMINISTRADOR: 'all' },
  'suggestions.manage': { ADMINISTRADOR: 'all' },
};

describe('can() — matriz completa', () => {
  for (const [operation, expected] of Object.entries(EXPECTED) as [Operation, Expected][]) {
    describe(operation, () => {
      for (const role of ROLES) {
        const wanted = expected[role] ?? 'no';

        if (wanted === 'all') {
          it(`${role} puede, sobre cualquier registro`, () => {
            expect(can(role, operation)).toBe(true);
            expect(can(role, operation, { isOwn: false })).toBe(true);
          });
        } else if (wanted === 'own') {
          it(`${role} sólo puede sobre lo propio`, () => {
            expect(can(role, operation, { isOwn: true })).toBe(true);
            expect(can(role, operation, { isOwn: false })).toBe(false);
            expect(can(role, operation)).toBe(false); // sin opts = no asume propiedad
          });
        } else {
          it(`${role} no puede, ni siquiera sobre lo propio`, () => {
            expect(can(role, operation)).toBe(false);
            expect(can(role, operation, { isOwn: true })).toBe(false);
          });
        }
      }
    });
  }
});

describe('can() — casos sueltos que conviene fijar aparte', () => {
  it('ADMINISTRADOR nunca depende de isOwn: pasa las dos formas', () => {
    expect(can('ADMINISTRADOR', 'purchaseRequest.cancel')).toBe(true);
    expect(can('ADMINISTRADOR', 'purchaseRequest.cancel', { isOwn: false })).toBe(true);
  });

  it('CONSULTA no puede escribir nada en ningún módulo', () => {
    const escrituras: Operation[] = [
      'inventory.create', 'inventory.edit', 'inventory.delete',
      'loan.create', 'loan.edit', 'assignment.create',
      'purchaseRequest.create', 'purchaseRequest.approve',
      'order.manage', 'incident.manage',
    ];
    for (const op of escrituras) {
      expect(can('CONSULTA', op)).toBe(false);
      expect(can('CONSULTA', op, { isOwn: true })).toBe(false);
    }
  });

  it('la vista de inventario, préstamos, asignaciones e incidencias(crear) es la misma lista de 6 roles', () => {
    // Estos cuatro módulos no tenían NINGÚN control antes de esta matriz —
    // el criterio elegido fue "todos ven/reportan, pocos escriben". Este
    // test lo deja explícito en vez de repetido cuatro veces con el mismo
    // resultado por casualidad.
    const vistaAbierta: Operation[] = ['inventory.view', 'loan.view', 'assignment.view', 'incident.create'];
    for (const op of vistaAbierta) {
      for (const role of ROLES) {
        expect(can(role, op)).toBe(true);
      }
    }
  });
});
