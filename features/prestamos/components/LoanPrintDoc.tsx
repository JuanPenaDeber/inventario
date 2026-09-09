// =============================================================================
// Comprobante de Préstamo imprimible.
//
// Es el documento más completo de los tres: además de los datos y la tabla de
// equipos lleva el texto del compromiso de cuidado y tres firmas (quien
// entrega, quien recibe y el responsable). Sin estado propio: recibe el
// préstamo y sus equipos ya cargados.
// =============================================================================

import React from 'react';
import { InventoryItem, Loan } from '@/types';
import {
  PrintDocument,
  PrintHeader,
  PrintMetaGrid,
  PrintNote,
  PrintTable,
  PrintSignatures,
} from '@/shared/components/print/PrintDocument';

interface LoanPrintDocProps {
  loan: Loan;
  items: InventoryItem[];
  /** Resuelve el id de un empleado a su nombre (los firmantes van por id). */
  getEmployeeName: (id?: string) => string;
}

export const LoanPrintDoc: React.FC<LoanPrintDocProps> = ({ loan, items, getEmployeeName }) => (
  <PrintDocument>
      <PrintHeader
          title="Comprobante de Préstamo"
          subtitle="Control de Salida Temporal"
          reference={`ID: ${loan.id}`}
      />

      <PrintMetaGrid
          heading={loan.name}
          fields={[
              { label: 'Solicitante', value: getEmployeeName(loan.solicitanteId) },
              { label: 'Área / Departamento', value: loan.area },
              {
                  label: 'Fecha de Salida',
                  value: new Date(loan.fechaPrestamo).toISOString().split('T')[0],
              },
              {
                  label: 'Devolución Esperada',
                  value: loan.fechaEsperadaDevolucion
                      ? new Date(loan.fechaEsperadaDevolucion).toISOString().split('T')[0]
                      : 'Indefinido',
              },
          ]}
      />

      {loan.description && (
          <PrintNote label="Observaciones Generales">{loan.description}</PrintNote>
      )}

      <PrintTable
          rows={items}
          getRowId={(item) => item.id}
          emptyMessage="No hay equipos registrados."
          columns={[
              {
                  header: 'Equipo',
                  render: (item) => (
                      <>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-gray-500">{item.category}</div>
                      </>
                  ),
              },
              {
                  header: 'Código',
                  headerClassName: 'w-32',
                  cellClassName: 'font-mono',
                  render: (item) => item.serie,
              },
              {
                  header: 'Observaciones / Estado',
                  render: (item) => (
                      <>
                          {item.condition}
                          {item.description && (
                              <span className="text-xs block text-gray-500">{item.description}</span>
                          )}
                      </>
                  ),
              },
          ]}
      />

      <div className="mb-12 text-xs text-justify leading-relaxed">
          <p className="font-bold mb-1">COMPROMISO DE CUIDADO Y USO:</p>
          <p>El solicitante declara recibir los equipos descritos en las condiciones detalladas anteriormente, comprometiéndose a:</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li>Utilizar los equipos exclusivamente para los fines laborales asignados.</li>
              <li>Mantener los equipos bajo su custodia y cuidado, evitando daños por negligencia.</li>
              <li>Reportar inmediatamente cualquier incidente, pérdida o falla técnica.</li>
              <li>Devolver los equipos en la fecha esperada o cuando sean requeridos.</li>
          </ul>
          <p className="mt-2">En caso de pérdida o daño por negligencia comprobada, el responsable asumirá los costos de reposición o reparación según normativa interna.</p>
      </div>

      <PrintSignatures
          signers={[
              { name: getEmployeeName(loan.entregadoporId), role: 'Entregado Por' },
              { name: getEmployeeName(loan.solicitanteId), role: 'Recibí Conforme (Solicitante)' },
              { name: getEmployeeName(loan.responsableId), role: 'Responsable / Supervisor' },
          ]}
      />
  </PrintDocument>
);

export default LoanPrintDoc;
