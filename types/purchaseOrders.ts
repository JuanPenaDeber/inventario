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
