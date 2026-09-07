
export interface MovementHistory {
  date: string;
  action: 'CREADO' | 'ACTUALIZADO' | 'ASIGNADO' | 'MANTENIMIENTO' | 'RETIRADO' | 'PRESTADO' | 'DESAPARECIDO' | 'DEVUELTO' | 'DEVOLUCION_PARCIAL' | 'DES_ASIGNADO';
  user: string;
  details: string;
}

export interface Provider {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
}

export interface Employee {
  id: string;
  name: string;
  equipo: string;
}

// --- LOAN (PAÑOL) ---
export interface LoanItemDetail {
  itemId: string;
  returned: boolean;
  returnedDate?: string;
}

export interface Loan {
  id: string;
  name: string; // Referencia
  solicitanteId?: string; // Link to employee
  entregadoporId: string; // Responsable
  area: string; 
  solicitante?: string; // Nuevo campo: Solicitante real
  // Items are now fetched async via sub-resource, but we keep this for legacy or if API returns it in list
  equipos?: LoanItemDetail[]; 
  fechaPrestamo: string;
  fechaHoraDevolucion: string; // Legacy/Actual return
  fechaEsperadaDevolucion?: string; // New field requested
  status: 'PRESTADO' | 'DEVUELTO' | 'DEVOLUCION_PARCIAL' | 'FINALIZADO'; 
  notes?: string;
  description?: string;
  responsableId?: string; // Name of employee authorizing the loan (Entregado Por)
}

// --- ASSIGNMENT (ASIGNACIÓN) - Permanent/Long Term ---
export interface Assignment {
  id: string;
  name: string; 
  employeeId?: string; // Link to employee
  employeeName: string;
  equipo: string;
  fecha: string;
  itemIds: string[];
  authorizerId?: string; // Link to employee
  authorizerName: string;
  description?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  serie: string;
  status: string;
  condition: string;
  location: string;
  foto?: string;
  fechaCompra: string;
  precio?: number;
  description?: string;
  providerId?: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  // New field to track individual item return date within a loan context
  fechaDevolucion?: string | null; 
  history: MovementHistory[];
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

// --- PURCHASE ORDER (ÓRDENES DE COMPRA) ---
export type PurchaseOrderStatus =
  | 'BORRADOR'
  | 'SOLICITADA'
  | 'APROBADA'
  | 'RECIBIDA'
  | 'CANCELADA';

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  'BORRADOR',
  'SOLICITADA',
  'APROBADA',
  'RECIBIDA',
  'CANCELADA',
];

export interface PurchaseOrderLine {
  // Vacío para líneas nuevas que aún no existen en el backend.
  id: string;
  description: string;
  category: string;
  quantityRequested: number;
  // Cantidad recibida hasta el momento. Se mantiene separada de la
  // solicitada para soportar recepciones parciales.
  quantityReceived: number;
  unitPrice: number;
  // quantityRequested * unitPrice, calculado (ver calculateLineSubtotal).
  subtotal: number;
  // Reservado para enlazar con el CEquipo creado al recibir esta línea.
  // No se usa todavía: la creación automática de equipos está pendiente
  // de confirmar el contrato con el backend (ver README.md).
  createdItemId?: string;
}

export interface PurchaseOrder {
  id: string;
  reference: string; // Número/referencia de la orden
  providerId: string;
  providerName?: string;
  requestDate: string; // Fecha de solicitud (YYYY-MM-DD)
  expectedDate?: string; // Fecha esperada de entrega (YYYY-MM-DD)
  requestedBy: string; // Solicitante
  currency: string; // Moneda (ej. BOB, USD)
  notes?: string; // Observaciones
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  taxRate: number; // % de impuesto aplicado sobre el subtotal
  subtotal: number;
  taxAmount: number;
  total: number;
  createdAt?: string;
  updatedAt?: string;
}

// --- PURCHASE REQUEST (SOLICITUD DE COMPRA) ---
// Flujo completo de 11 estados (ver services/purchaseRequestService.ts para
// las transiciones válidas). La Fase 1 solo implementa acciones hasta
// PENDIENTE_APROBACION/CANCELADA; el resto del flujo (aprobación, cotización,
// comparación, selección, orden de compra) se habilita en fases siguientes,
// pero el enum ya contempla todos los estados para no romper tipos después.
export type PurchaseRequestStatus =
  | 'BORRADOR'
  | 'PENDIENTE_APROBACION'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'EN_COTIZACION'
  | 'COTIZADA'
  | 'EN_EVALUACION'
  | 'APROBADA_PARA_COMPRA'
  | 'ORDEN_GENERADA'
  | 'FINALIZADA'
  | 'CANCELADA';

export const PURCHASE_REQUEST_STATUSES: PurchaseRequestStatus[] = [
  'BORRADOR',
  'PENDIENTE_APROBACION',
  'APROBADA',
  'RECHAZADA',
  'EN_COTIZACION',
  'COTIZADA',
  'EN_EVALUACION',
  'APROBADA_PARA_COMPRA',
  'ORDEN_GENERADA',
  'FINALIZADA',
  'CANCELADA',
];

export type PurchaseRequestPriority = 'BAJA' | 'MEDIA' | 'ALTA';

export interface PurchaseRequestLine {
  // Vacío para líneas nuevas que aún no existen en el backend.
  id: string;
  product: string;
  quantity: number;
  unit: string;
  targetArea?: string; // Área destino (opcional)
  notes?: string;
  priority?: PurchaseRequestPriority;
}

/** Entrada de histórico inmutable: el servicio solo expone creación (POST), nunca edición ni borrado. */
export interface PurchaseRequestHistoryEntry {
  id: string;
  date: string;
  actorName: string;
  action: string;
  status: PurchaseRequestStatus;
  details?: string;
}

// Roles del flujo de compras (sección 10 del pedido). SIN seguridad real: es
// un selector "actuando como" en la UI (ver PurchaseRequestManager.tsx), no
// un sistema de autenticación. Permisos reales quedan para la Fase 4.
export type PurchaseFlowRole = 'SOLICITANTE' | 'JEFE' | 'COMPRAS' | 'ADMINISTRADOR';

export const PURCHASE_FLOW_ROLES: PurchaseFlowRole[] = [
  'SOLICITANTE',
  'JEFE',
  'COMPRAS',
  'ADMINISTRADOR',
];

export interface PurchaseRequest {
  id: string;
  code: string; // Generado automáticamente (ver purchaseRequestService.ts)
  requestDate: string;
  requesterId: string;
  requesterName: string;
  area: string;
  position: string; // Cargo del solicitante
  supervisorId: string; // Jefe inmediato
  supervisorName: string;
  reason: string; // Motivo/justificación de la compra
  status: PurchaseRequestStatus;
  rejectionReason?: string; // Obligatorio cuando status = RECHAZADA (Fase 2)
  // --- Fase 3: selección de proforma y orden de compra generada ---
  selectedProformaId?: string;
  selectionJustification?: string;
  selectionNotes?: string;
  generatedOrderId?: string; // id de la PurchaseOrder generada (services/purchaseOrderService.ts)
  generatedOrderReference?: string;
  lines: PurchaseRequestLine[];
  createdAt?: string;
  updatedAt?: string;
}

// --- PROFORMA / COTIZACIÓN (Fase 3) -----------------------------------------
// Una solicitud puede tener varias proformas de distintos proveedores. Cada
// una es, en la práctica, "una cotización más" — no se edita después de
// creada (si hay un error, se registra una proforma corregida); así el
// histórico de cotizaciones recibidas queda íntegro.
export interface ProformaLine {
  id: string;
  product: string;
  quantity: number;
  unitPrice: number;
  subtotal: number; // quantity * unitPrice
}

/** Vigencia calculada en el cliente a partir de expiryDate. No se guarda. */
export type ProformaValidity = 'VIGENTE' | 'PROXIMA_A_VENCER' | 'VENCIDA';

export interface Proforma {
  id: string;
  providerId: string;
  providerName?: string;
  number: string; // Número de proforma/cotización del proveedor
  issueDate: string; // Fecha de emisión
  validityDays: number; // Tiempo de validez, en días
  expiryDate: string; // issueDate + validityDays (calculado, pero se guarda)
  currency: string;
  discount: number; // Monto de descuento sobre el subtotal
  taxRate: number; // % de impuesto
  subtotal: number; // Suma de subtotales de línea
  taxAmount: number;
  total: number; // subtotal - discount + taxAmount
  paymentTerms: string; // Condiciones de pago
  deliveryTime: string; // Tiempo de entrega
  notes?: string;
  attachmentId?: string; // Id del archivo adjunto en EspoCRM (Attachment), si se subió
  attachmentName?: string;
  registeredBy: string; // Nombre de quien la registró
  // Una proforma no se edita (ver proformaService.ts); si se cargó mal, se
  // anula (no se borra) y queda fuera de la comparación/selección.
  voided?: boolean;
  voidReason?: string;
  lines: ProformaLine[];
  createdAt?: string;
}

// --- SUGERENCIAS POR ÁREA Y CARGO (Fase 4) ----------------------------------
// Configurable por el rol ADMINISTRADOR (ver components/SuggestionManager.tsx).
export interface ProductSuggestion {
  id: string;
  area: string;
  position: string; // Cargo
  product: string;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  ADD_ITEM = 'ADD_ITEM',
  EDIT_ITEM = 'EDIT_ITEM',
  PROVIDERS = 'PROVIDERS',
  LOANS = 'LOANS',             // Pañol
  ASSIGNMENTS = 'ASSIGNMENTS', // Asignaciones
  INCIDENTS = 'INCIDENTS',     // Gestión de Incidencias
  PURCHASE_ORDERS = 'PURCHASE_ORDERS', // Órdenes de Compra
  PURCHASE_REQUESTS = 'PURCHASE_REQUESTS', // Solicitudes de Compra
  PURCHASE_DASHBOARD = 'PURCHASE_DASHBOARD', // Dashboard del flujo de compras
  PRODUCT_SUGGESTIONS = 'PRODUCT_SUGGESTIONS' // Sugerencias por área/cargo (admin)
}
