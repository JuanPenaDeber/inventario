// =============================================================================
// Orden de Compra imprimible.
//
// Recibe la orden ya con sus líneas (el detalle completo, no el de la lista) y
// no tiene estado: lo que sale en papel es exactamente lo que se ve en pantalla.
// =============================================================================

import React from 'react';
import { PurchaseOrder } from '@/types';
import { formatDate } from '@/shared/utils/reportUtils';
import {
  PrintDocument,
  PrintHeader,
  PrintMetaGrid,
  PrintNote,
  PrintTable,
  PrintSignatures,
} from '@/shared/components/print/PrintDocument';

interface PurchaseOrderPrintDocProps {
  order: PurchaseOrder;
}

export const PurchaseOrderPrintDoc: React.FC<PurchaseOrderPrintDocProps> = ({ order }) => (
  <PrintDocument>
    <PrintHeader title="Orden de Compra" reference={`Ref: ${order.reference}`} />

    <PrintMetaGrid
      fields={[
        { label: 'Proveedor', value: order.providerName || order.providerId },
        { label: 'Solicitante', value: order.requestedBy },
        { label: 'Fecha de Solicitud', value: formatDate(order.requestDate) },
        {
          label: 'Fecha Esperada',
          value: order.expectedDate ? formatDate(order.expectedDate) : 'Indefinido',
        },
      ]}
    />

    {order.notes && <PrintNote label="Observaciones">{order.notes}</PrintNote>}

    <PrintTable
      className="mb-4"
      rows={order.lines}
      getRowId={(line) => line.id || line.description}
      emptyMessage="Esta orden no tiene productos."
      columns={[
        { header: 'Producto', render: (line) => line.description },
        { header: 'Categoría', render: (line) => line.category },
        {
          header: 'Cant.',
          headerClassName: 'text-right',
          cellClassName: 'text-right',
          render: (line) => line.quantityRequested,
        },
        {
          header: 'P. Unit.',
          headerClassName: 'text-right',
          cellClassName: 'text-right',
          render: (line) => line.unitPrice.toFixed(2),
        },
        {
          header: 'Subtotal',
          headerClassName: 'text-right',
          cellClassName: 'text-right',
          render: (line) => line.subtotal.toFixed(2),
        },
      ]}
    />

    <div className="flex justify-end mb-12">
      <div className="w-64 text-sm space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>
            {order.currency} {order.subtotal.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Impuesto ({order.taxRate}%)</span>
          <span>
            {order.currency} {order.taxAmount.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between font-bold text-base border-t border-black pt-1">
          <span>Total</span>
          <span>
            {order.currency} {order.total.toFixed(2)}
          </span>
        </div>
      </div>
    </div>

    <PrintSignatures
      signers={[
        { name: order.requestedBy, role: 'Solicitante' },
        { name: order.providerName || order.providerId, role: 'Proveedor' },
      ]}
    />
  </PrintDocument>
);

export default PurchaseOrderPrintDoc;
