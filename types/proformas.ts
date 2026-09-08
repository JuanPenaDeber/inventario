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
