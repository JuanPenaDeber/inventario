// =============================================================================
// Acta de Asignación imprimible.
//
// Se dibuja solo al imprimir. Recibe la asignación y sus equipos ya cargados:
// no pide nada al servidor ni tiene estado, para que lo que sale en papel sea
// exactamente lo que se ve en el detalle.
// =============================================================================

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Assignment, InventoryItem } from '@/types';
import { getPhotoUrl } from '@/shared/api/photoServer';
import {
  PrintDocument,
  PrintHeader,
  PrintTable,
  PrintSignatures,
} from '@/shared/components/print/PrintDocument';

interface AssignmentPrintDocProps {
  assignment: Assignment;
  items: InventoryItem[];
}

export const AssignmentPrintDoc: React.FC<AssignmentPrintDocProps> = ({ assignment, items }) => (
  <PrintDocument>
    <PrintHeader
      title="Acta de Asignación"
      subtitle="Entrega de Equipamiento y Responsabilidad"
      meta={
        <>
          <p className="font-bold">
            Fecha: <span className="font-normal">{assignment.fecha}</span>
          </p>
          <p className="font-bold">
            Ref: <span className="font-normal">{assignment.id.toUpperCase()}</span>
          </p>
        </>
      }
    />

    {/* Caja de datos propia de esta acta: no es la PrintMetaGrid de los otros
        dos documentos, va sobre fondo gris y con el filete por fuera. */}
    <div className="bg-gray-50 p-4 border border-black mb-8">
      {assignment.name && (
        <div className="mb-4 pb-4 border-b border-gray-300">
          <p className="text-sm italic">{assignment.name}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-8">
        <div>
          <p className="font-bold text-xs uppercase text-gray-500 mb-1">Empleado Responsable</p>
          <p className="text-lg font-bold">{assignment.employeeName}</p>
        </div>
        <div>
          <p className="font-bold text-xs uppercase text-gray-500 mb-1">Departamento / Área</p>
          <p className="text-lg">{assignment.equipo}</p>
        </div>
      </div>
      {assignment.description && (
        <div className="mt-4 pt-4 border-t border-gray-300">
          <p className="font-bold text-xs uppercase text-gray-500">Descripción</p>
          <p className="text-sm italic">{assignment.description}</p>
        </div>
      )}
    </div>

    <div className="mb-8">
      <h3 className="font-bold mb-2 uppercase text-sm">Equipos Asignados</h3>
      <PrintTable
        className=""
        rows={items}
        getRowId={(item) => item.id}
        emptyMessage="No hay equipos asignados."
        columns={[
          {
            header: 'Nº',
            headerClassName: 'text-center w-12 font-bold',
            cellClassName: 'text-center',
            render: (_item, index) => index + 1,
          },
          {
            header: 'Foto',
            headerClassName: 'text-center w-20 font-bold',
            cellClassName: 'text-center',
            render: (item) =>
              item.foto ? (
                <img
                  src={getPhotoUrl(item.foto, 'pequena')}
                  alt=""
                  className="w-12 h-12 object-cover mx-auto border border-gray-300"
                />
              ) : (
                <div className="w-12 h-12 bg-gray-100 mx-auto flex items-center justify-center">
                  <ImageIcon size={16} className="text-gray-400" />
                </div>
              ),
          },
          { header: 'Equipo', headerClassName: 'font-bold', render: (item) => item.name },
          { header: 'Categoría', headerClassName: 'font-bold', render: (item) => item.category },
          {
            header: 'Serial / Código',
            headerClassName: 'font-bold',
            cellClassName: 'font-mono',
            render: (item) => item.serie,
          },
        ]}
      />
    </div>

    <div className="text-xs text-justify mb-24 leading-relaxed text-gray-700 mt-8">
      <p>
        Declaro recibir los equipos detallados en perfectas condiciones de uso y funcionamiento. Me
        comprometo a velar por su buen estado, utilizarlos únicamente para fines laborales y
        notificar de inmediato cualquier daño, pérdida o robo al departamento de Sistemas.
      </p>
    </div>

    <PrintSignatures
      variant="blank"
      gapClassName="gap-16"
      signers={[
        { name: assignment.employeeName, role: 'Recibí conforme' },
        { name: assignment.authorizerName, role: 'Entregué conforme' },
      ]}
    />
  </PrintDocument>
);

export default AssignmentPrintDoc;
