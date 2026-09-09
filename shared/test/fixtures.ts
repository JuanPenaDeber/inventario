// =============================================================================
// Fábricas de datos de prueba.
//
// Existen para que un test diga solo lo que le importa. Si un smoke test
// necesita "un equipo prestado", escribe `makeItem({ status: 'prestado' })` y
// no veinte campos irrelevantes; cuando un tipo de dominio gane un campo
// obligatorio, se agrega aquí una vez y no en cada test.
//
// Todas las fechas son fijas a propósito: un fixture con `new Date()` hace que
// el test pase hoy y falle en enero, o que dos ejecuciones del mismo test
// comparen cadenas distintas.
// =============================================================================

import type {
  Assignment,
  Employee,
  InventoryItem,
  Loan,
  Provider,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  PurchaseRequestLine,
} from '@/types';

/** Fecha base de todos los fixtures. Ver cabecera: nunca `new Date()`. */
export const FIXTURE_DATE = '2025-03-14';

let seq = 0;
/** Id único y legible dentro de una misma ejecución (`item-1`, `item-2`, …). */
const nextId = (prefix: string): string => `${prefix}-${++seq}`;

export function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: nextId('item'),
    name: 'Notebook Dell Latitude',
    category: 'Computadoras',
    serie: 'SN-00123',
    status: 'Activo',
    condition: 'Bueno',
    location: 'Redacción',
    fechaCompra: FIXTURE_DATE,
    precio: 1200,
    history: [],
    ...overrides,
  };
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: nextId('emp'),
    name: 'Ana Rojas',
    equipo: 'Redacción',
    ...overrides,
  };
}

export function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: nextId('prov'),
    name: 'Importadora Central',
    contactPerson: 'Luis Vaca',
    email: 'ventas@importadora.test',
    phone: '77712345',
    ...overrides,
  };
}

export function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: nextId('loan'),
    name: 'Préstamo cámaras evento',
    solicitanteId: 'emp-1',
    entregadoporId: 'emp-2',
    responsableId: 'emp-2',
    area: 'Redacción',
    fechaPrestamo: FIXTURE_DATE,
    fechaHoraDevolucion: '',
    fechaEsperadaDevolucion: '2025-03-20',
    status: 'PRESTADO',
    ...overrides,
  };
}

export function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: nextId('asg'),
    name: 'Entrega de equipo de trabajo',
    employeeId: 'emp-1',
    employeeName: 'Ana Rojas',
    equipo: 'Redacción',
    fecha: FIXTURE_DATE,
    itemIds: [],
    authorizerId: 'emp-2',
    authorizerName: 'Carlos Méndez',
    ...overrides,
  };
}

export function makeOrderLine(overrides: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
  return {
    id: nextId('oline'),
    description: 'Monitor 24 pulgadas',
    category: 'Computadoras',
    quantityRequested: 2,
    quantityReceived: 0,
    unitPrice: 900,
    subtotal: 1800,
    ...overrides,
  };
}

export function makePurchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const lines = overrides.lines ?? [makeOrderLine()];
  const subtotal = lines.reduce((acc, l) => acc + l.subtotal, 0);
  return {
    id: nextId('po'),
    reference: 'OC-2025-001',
    providerId: 'prov-1',
    providerName: 'Importadora Central',
    requestDate: FIXTURE_DATE,
    expectedDate: '2025-03-28',
    requestedBy: 'Ana Rojas',
    currency: 'BOB',
    status: 'BORRADOR',
    taxRate: 13,
    subtotal,
    taxAmount: subtotal * 0.13,
    total: subtotal * 1.13,
    ...overrides,
    lines,
  };
}

export function makeRequestLine(overrides: Partial<PurchaseRequestLine> = {}): PurchaseRequestLine {
  return {
    id: nextId('rline'),
    product: 'Disco SSD 1TB',
    quantity: 3,
    unit: 'unidad',
    priority: 'MEDIA',
    ...overrides,
  };
}

export function makePurchaseRequest(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: nextId('pr'),
    code: 'SC-2025-001',
    requestDate: FIXTURE_DATE,
    requesterId: 'emp-1',
    requesterName: 'Ana Rojas',
    area: 'Redacción',
    position: 'Editora',
    supervisorId: 'emp-2',
    supervisorName: 'Carlos Méndez',
    reason: 'Reposición de equipos con falla',
    status: 'BORRADOR',
    lines: [makeRequestLine()],
    ...overrides,
  };
}
