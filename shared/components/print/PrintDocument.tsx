// =============================================================================
// Documentos imprimibles.
//
// Las tres actas del proyecto —comprobante de préstamo, acta de asignación y
// orden de compra— tienen la misma anatomía: cabecera con logo y título, una
// rejilla de datos, una tabla de líneas y un pie de firmas. Estaban escritas
// tres veces y ya habían divergido en detalles que nadie decidió:
//
//   · el logo iba `className="h-12"` en dos y `width="100"` en la tercera;
//   · el margen bajo la cabecera era mb-6 en dos y mb-8 en la tercera;
//   · la cabecera alineaba `items-center` en dos e `items-end` en la tercera.
//
// Al unificarlas hay que elegir una: se toma la de Préstamos y Órdenes (dos de
// tres), así que el acta de asignación cambia ligeramente de aspecto. Es el
// precio de que a partir de ahora los tres documentos se corrijan de una vez.
//
// Todo lo de aquí se dibuja SOLO al imprimir (`hidden-on-screen print-area`,
// ver shared/styles/index.css).
// =============================================================================

import React from 'react';
import { getLogoUrl } from '@/shared/api/photoServer';

interface PrintDocumentProps {
  children: React.ReactNode;
}

/** Hoja imprimible. Oculta en pantalla, visible en la impresión. */
export const PrintDocument: React.FC<PrintDocumentProps> = ({ children }) => (
  <div className="hidden-on-screen print-area bg-white text-black">{children}</div>
);

interface PrintHeaderProps {
  title: string;
  subtitle?: string;
  /** Línea corta en monoespaciada bajo el título: "ID: …", "Ref: …". */
  reference?: string;
  /** Columna derecha opcional (el acta de asignación pone ahí fecha y ref). */
  meta?: React.ReactNode;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({ title, subtitle, reference, meta }) => (
  <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-center">
    <img src={getLogoUrl()} className="h-12" alt="Logo" />
    <div className={meta ? '' : 'text-right'}>
      <h1 className="text-xl font-bold uppercase">{title}</h1>
      {subtitle && <p className="text-sm">{subtitle}</p>}
      {reference && <p className="text-xs font-mono mt-1">{reference}</p>}
    </div>
    {meta && <div className="text-right text-sm">{meta}</div>}
  </div>
);

export interface PrintField {
  label: string;
  value: React.ReactNode;
}

interface PrintMetaGridProps {
  /** Título grande sobre la rejilla (el nombre del préstamo, por ejemplo). */
  heading?: string;
  fields: PrintField[];
}

/**
 * Rejilla de datos a dos columnas, entre dos filetes negros. A partir del
 * tercer campo se agrega separación superior, que es lo que las tres copias
 * hacían a mano poniendo `mt-2` en unos `div` sí y en otros no.
 */
export const PrintMetaGrid: React.FC<PrintMetaGridProps> = ({ heading, fields }) => (
  <div className="mb-6">
    {heading && <h2 className="text-2xl font-bold uppercase mb-2">{heading}</h2>}
    <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm border-t border-b border-black py-4">
      {fields.map((f, i) => (
        <div key={f.label} className={i > 1 ? 'mt-2' : ''}>
          <span className="font-bold block text-gray-500 text-xs uppercase">{f.label}</span>
          <span className="text-lg">{f.value}</span>
        </div>
      ))}
    </div>
  </div>
);

interface PrintNoteProps {
  label: string;
  children: React.ReactNode;
}

/** Recuadro gris para observaciones. */
export const PrintNote: React.FC<PrintNoteProps> = ({ label, children }) => (
  <div className="mb-6 p-3 bg-gray-50 border border-gray-200 text-sm">
    <p className="font-bold text-xs uppercase text-gray-500 mb-1">{label}</p>
    <div>{children}</div>
  </div>
);

export interface PrintColumn<T> {
  header: string;
  /** Clases extra de la celda: ancho fijo, alineación a la derecha, monoespaciada. */
  cellClassName?: string;
  headerClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}

interface PrintTableProps<T> {
  columns: PrintColumn<T>[];
  rows: T[];
  getRowId: (row: T, index: number) => string;
  emptyMessage: string;
  className?: string;
}

/** Tabla con filetes negros, la de los tres documentos. */
export function PrintTable<T>({
  columns,
  rows,
  getRowId,
  emptyMessage,
  className = 'mb-8',
}: PrintTableProps<T>) {
  return (
    <table className={`w-full border-collapse border border-black text-sm ${className}`}>
      <thead>
        <tr className="bg-gray-100">
          {columns.map((c) => (
            <th key={c.header} className={`border border-black p-2 text-left ${c.headerClassName ?? ''}`}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="p-4 text-center">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={getRowId(row, i)}>
              {columns.map((c) => (
                <td key={c.header} className={`border border-black p-2 ${c.cellClassName ?? ''}`}>
                  {c.render(row, i)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export interface Signer {
  name: string;
  role: string;
}

interface PrintSignaturesProps {
  signers: Signer[];
  /**
   * `ruled` (Préstamos y Órdenes): un filete sobre el nombre, para documentos
   * que se archivan firmados digitalmente o se firman al margen.
   * `blank` (Acta de Asignación): deja un hueco de firma real sobre el filete,
   * porque esa acta se firma a mano en papel.
   *
   * Son dos convenciones distintas de verdad, no una divergencia accidental,
   * así que se elige explícitamente en vez de unificarlas.
   */
  variant?: 'ruled' | 'blank';
  /** Separación entre columnas. El acta de asignación usa una más amplia. */
  gapClassName?: string;
}

/** Pie de firmas. Una columna por firmante. */
export const PrintSignatures: React.FC<PrintSignaturesProps> = ({
  signers,
  variant = 'ruled',
  gapClassName = 'gap-8',
}) => (
  <div
    className={`mt-auto grid text-center pt-12 ${gapClassName} ${
      signers.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
    } ${variant === 'ruled' ? 'text-xs' : ''}`}
  >
    {signers.map((s) => (
      <div key={s.role} className={variant === 'blank' ? 'text-center' : undefined}>
        {variant === 'ruled' ? (
          <>
            <div className="border-t border-black pt-2 mx-4 mb-1"></div>
            <p className="font-bold uppercase">{s.name}</p>
            <p className="text-gray-500">{s.role}</p>
          </>
        ) : (
          <>
            <div className="border-b border-black mb-2 h-12"></div>
            <p className="font-bold text-sm">{s.name}</p>
            <p className="text-xs text-gray-500">{s.role}</p>
          </>
        )}
      </div>
    ))}
  </div>
);
